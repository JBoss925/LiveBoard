import json
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.auth import CurrentUser, normalize_identifier
from app.db import get_pool
from app.http_helpers import (
    canvas_summary,
    decode_state,
    require_canvas_member,
    require_canvas_owner,
    user_out,
)
from app.schemas import (
    CanvasCreateRequest,
    CanvasDetail,
    CanvasMembersResponse,
    CanvasRenameRequest,
    CanvasSummary,
    InviteRequest,
    InviteResponse,
)
from app.validation import validate_canvas_name
from app.ws import manager

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
                validate_canvas_name(payload.name),
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


@router.patch("/api/canvases/{canvas_id}", response_model=CanvasSummary)
async def rename_canvas(
    canvas_id: str, payload: CanvasRenameRequest, user: CurrentUser
) -> CanvasSummary:
    await require_canvas_owner(canvas_id, user["id"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE canvases
            SET name = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING id, name, owner_id, revision, updated_at
            """,
            validate_canvas_name(payload.name),
            canvas_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Canvas not found")
    return canvas_summary(row)


@router.delete("/api/canvases/{canvas_id}")
async def delete_canvas(canvas_id: str, user: CurrentUser) -> dict[str, bool]:
    await require_canvas_owner(canvas_id, user["id"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM canvases WHERE id = $1", canvas_id)

    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Canvas not found")
    await manager.close_canvas(canvas_id, "This canvas has been deleted.")
    return {"ok": True}


@router.get("/api/canvases/{canvas_id}/members", response_model=CanvasMembersResponse)
async def list_canvas_members(canvas_id: str, user: CurrentUser) -> CanvasMembersResponse:
    await require_canvas_member(canvas_id, user["id"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT users.id, users.username, users.email
            FROM canvas_members
            JOIN users ON users.id = canvas_members.user_id
            WHERE canvas_members.canvas_id = $1
            ORDER BY users.username ASC
            """,
            canvas_id,
        )
    return CanvasMembersResponse(users=[user_out(row) for row in rows])


@router.post("/api/canvases/{canvas_id}/invite", response_model=InviteResponse)
async def invite_user(
    canvas_id: str, payload: InviteRequest, user: CurrentUser
) -> InviteResponse:
    await require_canvas_owner(canvas_id, user["id"])
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


@router.delete("/api/canvases/{canvas_id}/members/{member_id}")
async def remove_canvas_member(
    canvas_id: str, member_id: str, user: CurrentUser
) -> dict[str, bool]:
    canvas = await require_canvas_owner(canvas_id, user["id"])
    if member_id == canvas["owner_id"]:
        raise HTTPException(status_code=400, detail="The canvas owner cannot be removed")

    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            DELETE FROM canvas_members
            WHERE canvas_id = $1 AND user_id = $2
            """,
            canvas_id,
            member_id,
        )

    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Canvas member not found")
    await manager.remove_user_access(
        canvas_id,
        member_id,
        "Your access to this canvas has been removed.",
    )
    return {"ok": True}
