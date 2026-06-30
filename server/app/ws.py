import json
from collections import defaultdict
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.auth import get_user_by_token
from app.canvas_ops import apply_operation, normalize_state
from app.db import get_pool


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


async def apply_and_persist_operation(
    canvas_id: str, user_id: str, op: dict[str, Any]
) -> tuple[int, dict[str, Any], bool]:
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
                return int(existing_revision), decode_state(state_value), False

            row = await conn.fetchrow(
                "SELECT state, revision FROM canvases WHERE id = $1 FOR UPDATE",
                canvas_id,
            )
            if row is None:
                raise ValueError("Canvas not found")
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
            await conn.execute(
                """
                INSERT INTO canvas_ops (id, canvas_id, user_id, revision, op)
                VALUES ($1, $2, $3, $4, $5::jsonb)
                """,
                op.get("id"),
                canvas_id,
                user_id,
                next_revision,
                json.dumps(op),
            )
            return next_revision, next_state, True


async def canvas_ws(ws: WebSocket, canvas_id: str) -> None:
    token = ws.query_params.get("token", "")
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
        }
    )

    try:
        while True:
            message = json.loads(await ws.receive_text())
            if not await is_canvas_member(canvas_id, user["id"]):
                await ws.send_json(
                    {
                        "type": "access_removed",
                        "message": "Your access to this canvas has been removed.",
                    }
                )
                await ws.close(code=1008)
                return
            if message.get("type") == "cursor":
                await manager.broadcast(
                    canvas_id,
                    {
                        "type": "cursor",
                        "user": {"id": user["id"], "username": user["username"]},
                        "x": message.get("x"),
                        "y": message.get("y"),
                        "selectedShapeId": message.get("selectedShapeId"),
                    },
                    exclude=ws,
                )
            elif message.get("type") == "preview_op":
                op = message.get("op")
                if not isinstance(op, dict) or not isinstance(op.get("id"), str):
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
            elif message.get("type") == "op":
                op = message.get("op")
                if not isinstance(op, dict) or not isinstance(op.get("id"), str):
                    await ws.send_json({"type": "error", "message": "Invalid operation"})
                    continue
                revision, _state, _changed = await apply_and_persist_operation(
                    canvas_id, user["id"], op
                )
                await manager.broadcast(
                    canvas_id,
                    {
                        "type": "op_applied",
                        "canvasId": canvas_id,
                        "revision": revision,
                        "userId": user["id"],
                        "op": op,
                    },
                )
    except (WebSocketDisconnect, json.JSONDecodeError):
        pass
    finally:
        await manager.disconnect(canvas_id, ws)
