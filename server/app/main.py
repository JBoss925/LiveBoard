from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket

from app.db import close_pool, get_pool, init_db
from app.rate_limit import RateLimitMiddleware
from app.redis_client import close_redis, get_redis
from app.routes_auth import router as auth_router
from app.routes_canvases import router as canvases_router
from app.security import SameOriginMiddleware
from app.ws import canvas_ws, manager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await init_db()
    await manager.start()
    try:
        yield
    finally:
        await manager.stop()
        await close_redis()
        await close_pool()


app = FastAPI(lifespan=lifespan)
app.add_middleware(SameOriginMiddleware)
app.add_middleware(RateLimitMiddleware)
app.include_router(auth_router)
app.include_router(canvases_router)


@app.get("/health")
async def health() -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    redis_client = await get_redis()
    if redis_client is not None:
        await redis_client.ping()
    return {"ok": True, "postgres": True, "redis": redis_client is not None}


@app.websocket("/ws/canvases/{canvas_id}")
async def websocket_endpoint(ws: WebSocket, canvas_id: str) -> None:
    await canvas_ws(ws, canvas_id)
