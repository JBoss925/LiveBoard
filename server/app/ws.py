import asyncio
import json
import math
from collections import defaultdict
from contextlib import suppress
from typing import Any
from uuid import uuid4

import asyncpg
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.auth import SESSION_COOKIE_NAME, get_user_by_token
from app.canvas_ops import apply_operation, invert_operation, normalize_state
from app.db import get_pool
from app.rate_limit import check_socket_rate
from app.validation import MAX_WS_MESSAGE_BYTES, validate_operation, validate_shape_count

SESSION_RECHECK_SECONDS = 30


class CanvasRoomManager:
    """Tracks active WebSocket clients by canvas and broadcasts small JSON events."""

    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self.users: dict[WebSocket, dict[str, str]] = {}

    async def connect(self, canvas_id: str, ws: WebSocket, user: dict[str, str]) -> None:
        await ws.accept()
        was_active = self.has_active_user(canvas_id, user["id"])
        self.rooms[canvas_id].add(ws)
        self.users[ws] = user
        if not was_active:
            await self.broadcast(
                canvas_id,
                {"type": "presence_join", "user": user},
                exclude=ws,
            )

    async def disconnect(self, canvas_id: str, ws: WebSocket) -> None:
        self.rooms[canvas_id].discard(ws)
        user = self.users.pop(ws, None)
        if not self.rooms[canvas_id]:
            self.rooms.pop(canvas_id, None)
        if user is not None and not self.has_active_user(canvas_id, user["id"]):
            await self.broadcast(
                canvas_id,
                {"type": "presence_leave", "userId": user["id"]},
                exclude=ws,
            )

    async def broadcast(
        self, canvas_id: str, message: dict[str, Any], exclude: WebSocket | None = None
    ) -> None:
        stale: list[WebSocket] = []
        for client in list(self.rooms.get(canvas_id, set())):
            if client is exclude:
                continue
            try:
                if client.client_state == WebSocketState.CONNECTED:
                    await client.send_json(message)
                else:
                    stale.append(client)
            except (RuntimeError, WebSocketDisconnect):
                stale.append(client)
        for client in stale:
            await self.disconnect(canvas_id, client)

    async def remove_user_access(
        self, canvas_id: str, user_id: str, message: str
    ) -> None:
        """Notify and disconnect every live socket for a user removed from a canvas."""
        removed_clients = [
            client
            for client in list(self.rooms.get(canvas_id, set()))
            if self.users.get(client, {}).get("id") == user_id
        ]
        for client in removed_clients:
            try:
                if client.client_state == WebSocketState.CONNECTED:
                    await client.send_json({"type": "access_removed", "message": message})
                    await client.close(code=1008)
            except (RuntimeError, WebSocketDisconnect):
                pass
            finally:
                await self.disconnect(canvas_id, client)

    async def close_canvas(self, canvas_id: str, message: str) -> None:
        """Notify and disconnect every live socket for a canvas that no longer exists."""
        clients = list(self.rooms.get(canvas_id, set()))
        for client in clients:
            try:
                if client.client_state == WebSocketState.CONNECTED:
                    await client.send_json({"type": "access_removed", "message": message})
                    await client.close(code=1008)
            except (RuntimeError, WebSocketDisconnect):
                pass
            finally:
                await self.disconnect(canvas_id, client)

    def active_users(self, canvas_id: str) -> list[dict[str, str]]:
        seen: set[str] = set()
        users: list[dict[str, str]] = []
        for client in self.rooms.get(canvas_id, set()):
            user = self.users.get(client)
            if user and user["id"] not in seen:
                seen.add(user["id"])
                users.append(user)
        return users

    def has_active_user(self, canvas_id: str, user_id: str) -> bool:
        return any(
            self.users.get(client, {}).get("id") == user_id
            for client in self.rooms.get(canvas_id, set())
        )


manager = CanvasRoomManager()


def decode_state(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        return normalize_state(json.loads(value))
    return normalize_state(value)


def decode_op(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        return json.loads(value)
    if isinstance(value, dict):
        return dict(value)
    return {}


def history_status_from_counts(undo_count: int, redo_count: int) -> dict[str, bool]:
    return {"canUndo": undo_count > 0, "canRedo": redo_count > 0}


async def is_canvas_member(canvas_id: str, user_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        value = await conn.fetchval(
            """
            SELECT 1
            FROM canvas_members
            WHERE canvas_id = $1 AND user_id = $2
            """,
            canvas_id,
            user_id,
        )
    return value == 1


async def get_history_status(canvas_id: str) -> dict[str, bool]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await get_history_status_for_conn(conn, canvas_id)


async def get_history_status_for_conn(
    conn: asyncpg.Connection, canvas_id: str
) -> dict[str, bool]:
    row = await conn.fetchrow(
        """
        SELECT
          COUNT(*) FILTER (WHERE undone_at IS NULL) AS undo_count,
          COUNT(*) FILTER (WHERE undone_at IS NOT NULL) AS redo_count
        FROM canvas_history
        WHERE canvas_id = $1
        """,
        canvas_id,
    )
    if row is None:
        return history_status_from_counts(0, 0)
    return history_status_from_counts(int(row["undo_count"]), int(row["redo_count"]))


async def insert_canvas_op(
    conn: asyncpg.Connection,
    canvas_id: str,
    user_id: str,
    revision: int,
    op: dict[str, Any],
) -> None:
    await conn.execute(
        """
        INSERT INTO canvas_ops (id, canvas_id, user_id, revision, op)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        """,
        op.get("id"),
        canvas_id,
        user_id,
        revision,
        json.dumps(op),
    )


async def apply_and_persist_operation(
    canvas_id: str, user_id: str, op: dict[str, Any]
) -> tuple[int, dict[str, Any], bool, dict[str, bool]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing_revision = await conn.fetchval(
                "SELECT revision FROM canvas_ops WHERE id = $1 AND canvas_id = $2",
                op.get("id"),
                canvas_id,
            )
            if existing_revision is not None:
                state_value = await conn.fetchval(
                    "SELECT state FROM canvases WHERE id = $1", canvas_id
                )
                return (
                    int(existing_revision),
                    decode_state(state_value),
                    False,
                    await get_history_status_for_conn(conn, canvas_id),
                )

            row = await conn.fetchrow(
                "SELECT state, revision FROM canvases WHERE id = $1 FOR UPDATE",
                canvas_id,
            )
            if row is None:
                raise ValueError("Canvas not found")
            state = decode_state(row["state"])
            validate_operation(op)
            validate_shape_count(state, op)
            next_state = apply_operation(state, op)
            next_revision = int(row["revision"]) + 1
            await conn.execute(
                """
                UPDATE canvases
                SET state = $1::jsonb, revision = $2, updated_at = NOW()
                WHERE id = $3
                """,
                json.dumps(next_state),
                next_revision,
                canvas_id,
            )
            await insert_canvas_op(conn, canvas_id, user_id, next_revision, op)
            return (
                next_revision,
                next_state,
                True,
                await get_history_status_for_conn(conn, canvas_id),
            )


async def apply_and_record_history(
    canvas_id: str,
    user_id: str,
    forward_op: dict[str, Any],
) -> tuple[int, dict[str, Any], dict[str, bool]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing_revision = await conn.fetchval(
                "SELECT revision FROM canvas_ops WHERE id = $1 AND canvas_id = $2",
                forward_op.get("id"),
                canvas_id,
            )
            if existing_revision is not None:
                state_value = await conn.fetchval(
                    "SELECT state FROM canvases WHERE id = $1", canvas_id
                )
                return (
                    int(existing_revision),
                    decode_state(state_value),
                    await get_history_status_for_conn(conn, canvas_id),
                )

            row = await conn.fetchrow(
                "SELECT state, revision FROM canvases WHERE id = $1 FOR UPDATE",
                canvas_id,
            )
            if row is None:
                raise ValueError("Canvas not found")

            state = decode_state(row["state"])
            validate_operation(forward_op)
            validate_shape_count(state, forward_op)
            inverse_op = invert_operation(state, forward_op)
            if inverse_op is None:
                raise ValueError("Invalid operation")
            next_state = apply_operation(state, forward_op)
            next_revision = int(row["revision"]) + 1
            await conn.execute(
                """
                UPDATE canvases
                SET state = $1::jsonb, revision = $2, updated_at = NOW()
                WHERE id = $3
                """,
                json.dumps(next_state),
                next_revision,
                canvas_id,
            )
            await conn.execute(
                "DELETE FROM canvas_history WHERE canvas_id = $1 AND undone_at IS NOT NULL",
                canvas_id,
            )
            await insert_canvas_op(conn, canvas_id, user_id, next_revision, forward_op)
            await conn.execute(
                """
                INSERT INTO canvas_history
                  (id, canvas_id, user_id, forward_op, inverse_op, applied_revision)
                VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
                """,
                str(uuid4()),
                canvas_id,
                user_id,
                json.dumps(forward_op),
                json.dumps(inverse_op),
                next_revision,
            )
            return next_revision, next_state, await get_history_status_for_conn(conn, canvas_id)


async def apply_history_action(
    canvas_id: str, user_id: str, action: str
) -> tuple[int, dict[str, Any], dict[str, Any] | None, dict[str, bool]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT state, revision FROM canvases WHERE id = $1 FOR UPDATE",
                canvas_id,
            )
            if row is None:
                raise ValueError("Canvas not found")

            if action == "undo":
                history_row = await conn.fetchrow(
                    """
                    SELECT id, inverse_op AS op
                    FROM canvas_history
                    WHERE canvas_id = $1 AND undone_at IS NULL
                    ORDER BY applied_revision DESC
                    LIMIT 1
                    FOR UPDATE
                    """,
                    canvas_id,
                )
            else:
                history_row = await conn.fetchrow(
                    """
                    SELECT id, forward_op AS op
                    FROM canvas_history
                    WHERE canvas_id = $1 AND undone_at IS NOT NULL
                    ORDER BY undone_at DESC
                    LIMIT 1
                    FOR UPDATE
                    """,
                    canvas_id,
                )

            if history_row is None:
                return (
                    int(row["revision"]),
                    decode_state(row["state"]),
                    None,
                    await get_history_status_for_conn(conn, canvas_id),
                )

            op = decode_op(history_row["op"])
            op["id"] = str(uuid4())
            state = decode_state(row["state"])
            next_state = apply_operation(state, op)
            next_revision = int(row["revision"]) + 1
            await conn.execute(
                """
                UPDATE canvases
                SET state = $1::jsonb, revision = $2, updated_at = NOW()
                WHERE id = $3
                """,
                json.dumps(next_state),
                next_revision,
                canvas_id,
            )
            await insert_canvas_op(conn, canvas_id, user_id, next_revision, op)

            if action == "undo":
                await conn.execute(
                    "UPDATE canvas_history SET undone_at = NOW() WHERE id = $1",
                    history_row["id"],
                )
            else:
                await conn.execute(
                    """
                    UPDATE canvas_history
                    SET undone_at = NULL, applied_revision = $2
                    WHERE id = $1
                    """,
                    history_row["id"],
                    next_revision,
                )

            return next_revision, next_state, op, await get_history_status_for_conn(
                conn, canvas_id
            )


async def close_if_session_invalid(
    ws: WebSocket, canvas_id: str, user_id: str, token: str
) -> bool:
    if await get_user_by_token(token) is None:
        await ws.send_json(
            {
                "type": "session_expired",
                "message": "Your session has expired. Please sign in again.",
            }
        )
        await ws.close(code=1008)
        return True
    if not await is_canvas_member(canvas_id, user_id):
        await ws.send_json(
            {
                "type": "access_removed",
                "message": "Your access to this canvas has been removed.",
            }
        )
        await ws.close(code=1008)
        return True
    return False


async def canvas_ws(ws: WebSocket, canvas_id: str) -> None:
    token = ws.cookies.get(SESSION_COOKIE_NAME, "")
    user_row = await get_user_by_token(token)
    if user_row is None or not await is_canvas_member(canvas_id, user_row["id"]):
        await ws.close(code=1008)
        return

    user = {
        "id": user_row["id"],
        "username": user_row["username"],
        "email": user_row["email"],
    }
    pool = await get_pool()
    async with pool.acquire() as conn:
        canvas = await conn.fetchrow(
            "SELECT state, revision FROM canvases WHERE id = $1", canvas_id
        )
    if canvas is None:
        await ws.close(code=1008)
        return

    await manager.connect(canvas_id, ws, user)
    await ws.send_json(
        {
            "type": "snapshot",
            "canvasId": canvas_id,
            "revision": int(canvas["revision"]),
            "state": decode_state(canvas["state"]),
            "users": manager.active_users(canvas_id),
            "history": await get_history_status(canvas_id),
        }
    )

    try:
        while True:
            receive_task = asyncio.create_task(ws.receive_text())
            _done, pending = await asyncio.wait(
                {receive_task},
                timeout=SESSION_RECHECK_SECONDS,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if receive_task in pending:
                receive_task.cancel()
                with suppress(asyncio.CancelledError):
                    await receive_task
                if await close_if_session_invalid(ws, canvas_id, user["id"], token):
                    return
                continue

            message_text = receive_task.result()
            if len(message_text.encode("utf-8")) > MAX_WS_MESSAGE_BYTES:
                await ws.send_json({"type": "error", "message": "Message is too large"})
                continue
            message = json.loads(message_text)
            message_type = message.get("type")
            if not isinstance(message_type, str):
                await ws.send_json({"type": "error", "message": "Invalid message"})
                continue
            if not check_socket_rate(user["id"], canvas_id, message_type):
                await ws.send_json({"type": "error", "message": "Too many requests"})
                continue
            if await close_if_session_invalid(ws, canvas_id, user["id"], token):
                return
            if message_type == "cursor":
                x = message.get("x")
                y = message.get("y")
                if (
                    not isinstance(x, (int, float))
                    or not isinstance(y, (int, float))
                    or not math.isfinite(x)
                    or not math.isfinite(y)
                ):
                    await ws.send_json({"type": "error", "message": "Invalid cursor"})
                    continue
                await manager.broadcast(
                    canvas_id,
                    {
                        "type": "cursor",
                        "user": {"id": user["id"], "username": user["username"]},
                        "x": x,
                        "y": y,
                        "selectedShapeId": message.get("selectedShapeId"),
                    },
                    exclude=ws,
                )
            elif message_type == "preview_op":
                op = message.get("op")
                if not isinstance(op, dict) or not isinstance(op.get("id"), str):
                    await ws.send_json({"type": "error", "message": "Invalid preview"})
                    continue
                try:
                    validate_operation(op)
                except ValueError:
                    await ws.send_json({"type": "error", "message": "Invalid preview"})
                    continue
                await manager.broadcast(
                    canvas_id,
                    {
                        "type": "preview_applied",
                        "canvasId": canvas_id,
                        "userId": user["id"],
                        "op": op,
                    },
                    exclude=ws,
                )
            elif message_type == "op":
                op = message.get("op")
                if not isinstance(op, dict) or not isinstance(op.get("id"), str):
                    await ws.send_json({"type": "error", "message": "Invalid operation"})
                    continue
                history = message.get("history")
                try:
                    if isinstance(history, dict) and isinstance(history.get("inverse"), dict):
                        revision, _state, history_status = await apply_and_record_history(
                            canvas_id, user["id"], op
                        )
                    else:
                        revision, _state, _changed, history_status = (
                            await apply_and_persist_operation(canvas_id, user["id"], op)
                        )
                except ValueError:
                    await ws.send_json({"type": "error", "message": "Invalid operation"})
                    continue
                await manager.broadcast(
                    canvas_id,
                    {
                        "type": "op_applied",
                        "canvasId": canvas_id,
                        "revision": revision,
                        "userId": user["id"],
                        "op": op,
                        "history": history_status,
                    },
                )
            elif message_type in {"undo", "redo"}:
                revision, _state, op, history_status = await apply_history_action(
                    canvas_id, user["id"], message_type
                )
                if op is None:
                    await ws.send_json({"type": "history_status", "history": history_status})
                    continue
                await manager.broadcast(
                    canvas_id,
                    {
                        "type": "op_applied",
                        "canvasId": canvas_id,
                        "revision": revision,
                        "userId": user["id"],
                        "op": op,
                        "history": history_status,
                    },
                )
    except (WebSocketDisconnect, json.JSONDecodeError):
        pass
    finally:
        await manager.disconnect(canvas_id, ws)
