import asyncpg
from fastapi import HTTPException, status

from app.db import get_pool
from app.schemas import CanvasSummary, UserOut


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
