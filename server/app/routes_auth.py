from typing import Annotated
from uuid import uuid4

import asyncpg
from fastapi import APIRouter, Header, HTTPException

from app.auth import (
    CurrentUser,
    create_session,
    hash_password,
    normalize_identifier,
    verify_password,
)
from app.db import get_pool
from app.http_helpers import user_out
from app.schemas import AuthResponse, LoginRequest, SignupRequest, UserOut

router = APIRouter()


@router.post("/api/auth/signup", response_model=AuthResponse)
async def signup(payload: SignupRequest) -> AuthResponse:
    username = normalize_identifier(payload.username)
    email = normalize_identifier(payload.email)
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user_id = str(uuid4())
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO users (id, username, email, password_hash)
                VALUES ($1, $2, $3, $4)
                RETURNING id, username, email
                """,
                user_id,
                username,
                email,
                hash_password(payload.password),
            )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="Username or email already exists")

    token = await create_session(user_id)
    return AuthResponse(token=token, user=user_out(row))


@router.post("/api/auth/login", response_model=AuthResponse)
async def login(payload: LoginRequest) -> AuthResponse:
    identifier = normalize_identifier(payload.identifier)
    if not identifier or not payload.password:
        raise HTTPException(status_code=400, detail="Username/email and password are required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, username, email, password_hash
            FROM users
            WHERE username = $1 OR email = $1
            """,
            identifier,
        )
    if row is None or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username/email or password")

    token = await create_session(row["id"])
    return AuthResponse(token=token, user=user_out(row))


@router.post("/api/auth/logout")
async def logout(
    user: CurrentUser, authorization: Annotated[str, Header()]
) -> dict:
    token = authorization.removeprefix("Bearer ").strip()
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sessions WHERE token = $1", token)
    return {"ok": True}


@router.get("/api/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return user_out(user)
