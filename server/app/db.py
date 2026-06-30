import os
import asyncio
from pathlib import Path

import asyncpg

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://whiteboard:whiteboard@localhost:5432/whiteboard",
)

pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        last_error: Exception | None = None
        for _ in range(20):
            try:
                pool = await asyncpg.create_pool(DATABASE_URL)
                break
            except (OSError, asyncpg.PostgresError) as exc:
                last_error = exc
                await asyncio.sleep(0.5)
        if pool is None and last_error is not None:
            raise last_error
    return pool


async def init_db() -> None:
    """Run the idempotent SQL schema against the configured database."""
    schema_path = Path(__file__).resolve().parents[1] / "schema.sql"
    schema_sql = schema_path.read_text(encoding="utf-8")
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(schema_sql)


async def close_pool() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None
