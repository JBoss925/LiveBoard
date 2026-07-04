import hashlib
import hmac
import os
import secrets
from typing import Annotated

import asyncpg
from fastapi import Depends, Header, HTTPException, status

from app.db import get_pool

HASH_ALGORITHM = "pbkdf2_sha256"
HASH_ITERATIONS = 260_000
SESSION_TTL_HOURS = 12


def normalize_identifier(value: str) -> str:
    return value.strip().lower()


def hash_password(password: str) -> str:
    """Hash a password with PBKDF2 using only Python standard library tools."""
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, HASH_ITERATIONS
    )
    return f"{HASH_ALGORITHM}${HASH_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = password_hash.split("$", 3)
        if algorithm != HASH_ALGORITHM:
            return False
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await delete_expired_sessions(conn)
        await conn.execute(
            """
            INSERT INTO sessions (token, user_id, expires_at)
            VALUES ($1, $2, NOW() + ($3::text || ' hours')::interval)
            """,
            token,
            user_id,
            str(SESSION_TTL_HOURS),
        )
    return token


async def delete_expired_sessions(conn: asyncpg.Connection | None = None) -> None:
    """Remove tokens that can no longer authenticate a request."""
    if conn is not None:
        await conn.execute("DELETE FROM sessions WHERE expires_at <= NOW()")
        return

    pool = await get_pool()
    async with pool.acquire() as pooled_conn:
        await pooled_conn.execute("DELETE FROM sessions WHERE expires_at <= NOW()")


async def get_user_by_token(token: str) -> asyncpg.Record | None:
    if not token:
        return None
    pool = await get_pool()
    async with pool.acquire() as conn:
        await delete_expired_sessions(conn)
        row = await conn.fetchrow(
            """
            SELECT users.id, users.username, users.email
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = $1
              AND sessions.expires_at > NOW()
            """,
            token,
        )
        if row is not None:
            await conn.execute(
                "UPDATE sessions SET last_seen_at = NOW() WHERE token = $1",
                token,
            )
        return row


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> asyncpg.Record:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    user = await get_user_by_token(authorization.removeprefix("Bearer ").strip())
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    return user


CurrentUser = Annotated[asyncpg.Record, Depends(get_current_user)]
