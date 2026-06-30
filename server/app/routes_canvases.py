import json
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.auth import CurrentUser, normalize_identifier
from app.db import get_pool
from app.http_helpers import canvas_summary, decode_state, require_canvas_member, user_out
from app.schemas import (
    CanvasCreateRequest,
    CanvasDetail,
    CanvasSummary,
    InviteRequest,
    InviteResponse,
)

router = APIRouter()


@router.get("/api/canvases", response_model=list[CanvasSummary])
async def list_canvases(user: CurrentUser) -> list[CanvasSummary]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT canvases.id, canvases.name, canvases.owner_id,
                   canvases.revision, canvases.updated_at
            FROM canvases
            JOIN canvas_members ON canvas_members.canvas_id = canvases.id
            WHERE canvas_members.user_id = $1
            ORDER BY canvases.updated_at DESC
            """,
            user["id"],
        )
    return [canvas_summary(row) for row in rows]


@router.post("/api/canvases", response_model=CanvasSummary)
async def create_canvas(payload: CanvasCreateRequest, user: CurrentUser) -> CanvasSummary:
    canvas_id = str(uuid4())
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO canvases (id, name, owner_id, state)
                VALUES ($1, $2, $3, $4::jsonb)
                RETURNING id, name, owner_id, revision, updated_at
                """,
                canvas_id,
                payload.name.strip(),
                user["id"],
                json.dumps({"shapes": []}),
            )
            await conn.execute(
                "INSERT INTO canvas_members (canvas_id, user_id) VALUES ($1, $2)",
                canvas_id,
                user["id"],
            )
    return canvas_summary(row)


@router.get("/api/canvases/{canvas_id}", response_model=CanvasDetail)
async def get_canvas(canvas_id: str, user: CurrentUser) -> CanvasDetail:
    row = await require_canvas_member(canvas_id, user["id"])
    summary = canvas_summary(row)
    return CanvasDetail(**summary.model_dump(), state=decode_state(row["state"]))


@router.post("/api/canvases/{canvas_id}/invite", response_model=InviteResponse)
async def invite_user(
    canvas_id: str, payload: InviteRequest, user: CurrentUser
) -> InviteResponse:
    await require_canvas_member(canvas_id, user["id"])
    identifier = normalize_identifier(payload.identifier)
    pool = await get_pool()
    async with pool.acquire() as conn:
        invited = await conn.fetchrow(
            """
            SELECT id, username, email
            FROM users
            WHERE username = $1 OR email = $1
            """,
            identifier,
        )
        if invited is None:
            raise HTTPException(status_code=404, detail="No user found for that username or email")
        await conn.execute(
            """
            INSERT INTO canvas_members (canvas_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            canvas_id,
            invited["id"],
        )
    return InviteResponse(user=user_out(invited))
