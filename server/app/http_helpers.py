import json
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from app.db import get_pool
from app.schemas import CanvasSummary, UserOut


def decode_state(value: Any) -> dict[str, Any]:
    """Normalize asyncpg JSON/JSONB values into the canvas state shape."""
    if isinstance(value, str):
        value = json.loads(value)
    if isinstance(value, dict) and isinstance(value.get("shapes"), list):
        return value
    return {"shapes": []}


def user_out(row: asyncpg.Record) -> UserOut:
    return UserOut(id=row["id"], username=row["username"], email=row["email"])


def canvas_summary(row: asyncpg.Record) -> CanvasSummary:
    return CanvasSummary(
        id=row["id"],
        name=row["name"],
        ownerId=row["owner_id"],
        revision=int(row["revision"]),
        updatedAt=row["updated_at"].isoformat(),
    )


async def require_canvas_member(canvas_id: str, user_id: str) -> asyncpg.Record:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT canvases.*
            FROM canvases
            JOIN canvas_members ON canvas_members.canvas_id = canvases.id
            WHERE canvases.id = $1 AND canvas_members.user_id = $2
            """,
            canvas_id,
            user_id,
        )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found")
    return row


async def require_canvas_owner(canvas_id: str, user_id: str) -> asyncpg.Record:
    row = await require_canvas_member(canvas_id, user_id)
    if row["owner_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the canvas owner can manage access",
        )
    return row
