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
    CanvasFolderSummary,
    CanvasMembersResponse,
    CanvasMoveFolderRequest,
    CanvasRenameRequest,
    CanvasSummary,
    DashboardReorderRequest,
    FolderCreateRequest,
    FolderMoveRequest,
    FolderRenameRequest,
    InviteRequest,
    InviteResponse,
)
from app.validation import validate_canvas_name
from app.ws import manager

router = APIRouter()


async def ensure_folder_owner(conn, folder_id: str, owner_id: str):
    folder = await conn.fetchrow(
        """
        SELECT id, name, parent_id, updated_at
        FROM canvas_folders
        WHERE id = $1 AND owner_id = $2
        """,
        folder_id,
        owner_id,
    )
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


async def ensure_folder_can_move(conn, folder_id: str, parent_id: str | None, owner_id: str):
    if parent_id is None:
        return
    if parent_id == folder_id:
        raise HTTPException(status_code=400, detail="A folder cannot contain itself")

    current = await ensure_folder_owner(conn, parent_id, owner_id)
    while current is not None:
        if current["id"] == folder_id:
            raise HTTPException(status_code=400, detail="A folder cannot move inside itself")
        parent = current["parent_id"]
        if parent is None:
            return
        current = await conn.fetchrow(
            """
            SELECT id, parent_id
            FROM canvas_folders
            WHERE id = $1 AND owner_id = $2
            """,
            parent,
            owner_id,
        )


async def next_canvas_sort_order(conn, owner_id: str, folder_id: str | None) -> int:
    return int(
        await conn.fetchval(
            """
            SELECT COALESCE(MAX(sort_order), 0) + 1024
            FROM canvases
            WHERE owner_id = $1 AND folder_id IS NOT DISTINCT FROM $2
            """,
            owner_id,
            folder_id,
        )
    )


async def next_folder_sort_order(conn, owner_id: str, parent_id: str | None) -> int:
    return int(
        await conn.fetchval(
            """
            SELECT COALESCE(MAX(sort_order), 0) + 1024
            FROM canvas_folders
            WHERE owner_id = $1 AND parent_id IS NOT DISTINCT FROM $2
            """,
            owner_id,
            parent_id,
        )
    )


def folder_summary(row) -> CanvasFolderSummary:
    return CanvasFolderSummary(
        id=row["id"],
        name=row["name"],
        parentId=row["parent_id"],
        sortOrder=int(row["sort_order"]),
        updatedAt=row["updated_at"].isoformat(),
    )


@router.get("/api/canvases", response_model=list[CanvasSummary])
async def list_canvases(user: CurrentUser) -> list[CanvasSummary]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT canvases.id, canvases.name, canvases.owner_id, users.username AS owner_username,
                   canvases.folder_id, canvases.sort_order, canvases.revision, canvases.updated_at
            FROM canvases
            JOIN canvas_members ON canvas_members.canvas_id = canvases.id
            JOIN users ON users.id = canvases.owner_id
            WHERE canvas_members.user_id = $1
            ORDER BY canvases.folder_id NULLS FIRST, canvases.sort_order ASC, canvases.updated_at DESC
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
            sort_order = await next_canvas_sort_order(conn, user["id"], None)
            row = await conn.fetchrow(
                """
                INSERT INTO canvases (id, name, owner_id, state, sort_order)
                VALUES ($1, $2, $3, $4::jsonb, $5)
                RETURNING id, name, owner_id, $6::text AS owner_username, folder_id, sort_order, revision, updated_at
                """,
                canvas_id,
                validate_canvas_name(payload.name),
                user["id"],
                json.dumps({"backgroundColor": "#eff5f5", "shapes": []}),
                sort_order,
                user["username"],
            )
            await conn.execute(
                "INSERT INTO canvas_members (canvas_id, user_id) VALUES ($1, $2)",
                canvas_id,
                user["id"],
            )
    return canvas_summary(row)


@router.get("/api/folders", response_model=list[CanvasFolderSummary])
async def list_folders(user: CurrentUser) -> list[CanvasFolderSummary]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, parent_id, sort_order, updated_at
            FROM canvas_folders
            WHERE owner_id = $1
            ORDER BY parent_id NULLS FIRST, sort_order ASC, name ASC
            """,
            user["id"],
        )
    return [folder_summary(row) for row in rows]


@router.post("/api/folders", response_model=CanvasFolderSummary)
async def create_folder(payload: FolderCreateRequest, user: CurrentUser) -> CanvasFolderSummary:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if payload.parentId is not None:
            parent_owner = await conn.fetchval(
                "SELECT owner_id FROM canvas_folders WHERE id = $1",
                payload.parentId,
            )
            if parent_owner != user["id"]:
                raise HTTPException(status_code=404, detail="Folder not found")
        sort_order = await next_folder_sort_order(conn, user["id"], payload.parentId)
        row = await conn.fetchrow(
            """
            INSERT INTO canvas_folders (id, owner_id, parent_id, name, sort_order)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, parent_id, sort_order, updated_at
            """,
            str(uuid4()),
            user["id"],
            payload.parentId,
            validate_canvas_name(payload.name),
            sort_order,
        )
    return folder_summary(row)


@router.patch("/api/folders/{folder_id}", response_model=CanvasFolderSummary)
async def rename_folder(
    folder_id: str, payload: FolderRenameRequest, user: CurrentUser
) -> CanvasFolderSummary:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE canvas_folders
            SET name = $1, updated_at = NOW()
            WHERE id = $2 AND owner_id = $3
            RETURNING id, name, parent_id, sort_order, updated_at
            """,
            validate_canvas_name(payload.name),
            folder_id,
            user["id"],
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder_summary(row)


@router.delete("/api/folders/{folder_id}")
async def delete_folder(folder_id: str, user: CurrentUser) -> dict[str, bool]:
    pool = await get_pool()
    deleted_canvas_ids: list[str] = []
    async with pool.acquire() as conn:
        async with conn.transaction():
            await ensure_folder_owner(conn, folder_id, user["id"])
            rows = await conn.fetch(
                """
                WITH RECURSIVE folder_tree AS (
                    SELECT id
                    FROM canvas_folders
                    WHERE id = $1 AND owner_id = $2
                    UNION ALL
                    SELECT child.id
                    FROM canvas_folders child
                    JOIN folder_tree parent ON parent.id = child.parent_id
                    WHERE child.owner_id = $2
                )
                SELECT id
                FROM canvases
                WHERE owner_id = $2 AND folder_id IN (SELECT id FROM folder_tree)
                """,
                folder_id,
                user["id"],
            )
            deleted_canvas_ids = [row["id"] for row in rows]
            await conn.execute(
                """
                WITH RECURSIVE folder_tree AS (
                    SELECT id
                    FROM canvas_folders
                    WHERE id = $1 AND owner_id = $2
                    UNION ALL
                    SELECT child.id
                    FROM canvas_folders child
                    JOIN folder_tree parent ON parent.id = child.parent_id
                    WHERE child.owner_id = $2
                )
                DELETE FROM canvases
                WHERE owner_id = $2 AND folder_id IN (SELECT id FROM folder_tree)
                """,
                folder_id,
                user["id"],
            )
            await conn.execute(
                "DELETE FROM canvas_folders WHERE id = $1 AND owner_id = $2",
                folder_id,
                user["id"],
            )
    for canvas_id in deleted_canvas_ids:
        await manager.close_canvas(canvas_id, "This canvas has been deleted.")
    return {"ok": True}


@router.patch("/api/folders/{folder_id}/parent", response_model=CanvasFolderSummary)
async def move_folder(
    folder_id: str, payload: FolderMoveRequest, user: CurrentUser
) -> CanvasFolderSummary:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await ensure_folder_owner(conn, folder_id, user["id"])
        await ensure_folder_can_move(conn, folder_id, payload.parentId, user["id"])
        sort_order = await next_folder_sort_order(conn, user["id"], payload.parentId)
        row = await conn.fetchrow(
            """
            UPDATE canvas_folders
            SET parent_id = $1, sort_order = $2, updated_at = NOW()
            WHERE id = $3 AND owner_id = $4
            RETURNING id, name, parent_id, sort_order, updated_at
            """,
            payload.parentId,
            sort_order,
            folder_id,
            user["id"],
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder_summary(row)


@router.patch("/api/dashboard/order")
async def reorder_dashboard_items(
    payload: DashboardReorderRequest, user: CurrentUser
) -> dict[str, bool]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if payload.parentId is not None:
                await ensure_folder_owner(conn, payload.parentId, user["id"])

            for index, item in enumerate(payload.items):
                sort_order = (index + 1) * 1024
                if item.type == "folder":
                    await ensure_folder_can_move(conn, item.id, payload.parentId, user["id"])
                    result = await conn.execute(
                        """
                        UPDATE canvas_folders
                        SET parent_id = $1, sort_order = $2, updated_at = NOW()
                        WHERE id = $3 AND owner_id = $4
                        """,
                        payload.parentId,
                        sort_order,
                        item.id,
                        user["id"],
                    )
                elif item.type == "canvas":
                    result = await conn.execute(
                        """
                        UPDATE canvases
                        SET folder_id = $1, sort_order = $2, updated_at = NOW()
                        WHERE id = $3 AND owner_id = $4
                        """,
                        payload.parentId,
                        sort_order,
                        item.id,
                        user["id"],
                    )
                else:
                    raise HTTPException(status_code=400, detail="Unknown dashboard item type")
                if result == "UPDATE 0":
                    raise HTTPException(status_code=404, detail="Dashboard item not found")
    return {"ok": True}


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
            RETURNING id, name, owner_id, $3::text AS owner_username, folder_id, sort_order, revision, updated_at
            """,
            validate_canvas_name(payload.name),
            canvas_id,
            user["username"],
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Canvas not found")
    await manager.broadcast(
        canvas_id,
        {"type": "canvas_renamed", "canvasId": canvas_id, "name": row["name"]},
    )
    return canvas_summary(row)


@router.patch("/api/canvases/{canvas_id}/folder", response_model=CanvasSummary)
async def move_canvas_to_folder(
    canvas_id: str, payload: CanvasMoveFolderRequest, user: CurrentUser
) -> CanvasSummary:
    await require_canvas_owner(canvas_id, user["id"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        if payload.folderId is not None:
            folder_owner = await conn.fetchval(
                "SELECT owner_id FROM canvas_folders WHERE id = $1",
                payload.folderId,
            )
            if folder_owner != user["id"]:
                raise HTTPException(status_code=404, detail="Folder not found")

        sort_order = await next_canvas_sort_order(conn, user["id"], payload.folderId)
        row = await conn.fetchrow(
            """
            UPDATE canvases
            SET folder_id = $1, sort_order = $2, updated_at = NOW()
            WHERE id = $3 AND owner_id = $4
            RETURNING id, name, owner_id, $5::text AS owner_username, folder_id, sort_order, revision, updated_at
            """,
            payload.folderId,
            sort_order,
            canvas_id,
            user["id"],
            user["username"],
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
