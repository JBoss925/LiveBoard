import time
from collections import defaultdict, deque
from collections.abc import Callable
import os
from typing import Awaitable

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.auth import SESSION_COOKIE_NAME, get_user_by_token
from app.redis_client import get_redis

WINDOW_SECONDS = 60


def env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


HTTP_AUTH_LIMIT = env_int("HTTP_AUTH_RATE_LIMIT", 10)
HTTP_API_LIMIT = env_int("HTTP_API_RATE_LIMIT", 120)
WS_CURSOR_LIMIT = env_int("WS_CURSOR_RATE_LIMIT", 1500)
WS_PREVIEW_LIMIT = env_int("WS_PREVIEW_RATE_LIMIT", 1500)
WS_HISTORY_LIMIT = env_int("WS_HISTORY_RATE_LIMIT", 300)
WS_WRITE_LIMIT = env_int("WS_WRITE_RATE_LIMIT", 90)

RATE_LIMIT_SCRIPT = """
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current
"""


class FixedWindowRateLimiter:
    def __init__(self) -> None:
        self.events: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int, window_seconds: int = WINDOW_SECONDS) -> bool:
        now = time.monotonic()
        events = self.events[key]
        cutoff = now - window_seconds
        while events and events[0] < cutoff:
            events.popleft()
        if len(events) >= limit:
            return False
        events.append(now)
        return True


limiter = FixedWindowRateLimiter()


async def allow_rate(key: str, limit: int, window_seconds: int = WINDOW_SECONDS) -> bool:
    redis_client = await get_redis()
    if redis_client is None:
        return limiter.allow(key, limit, window_seconds)
    window = int(time.time() // window_seconds)
    redis_key = f"liveboard:rate:{key}:{window}"
    current = await redis_client.eval(RATE_LIMIT_SCRIPT, 1, redis_key, window_seconds + 5)
    return int(current) <= limit


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        client = request.client.host if request.client else "unknown"
        route_key = f"{request.method}:{request.url.path}"
        limit = route_limit(request)
        identity = await request_identity(request, client)
        if limit is not None and not await allow_rate(f"http:{identity}:{route_key}", limit):
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests. Please try again shortly."},
            )
        return await call_next(request)


def route_limit(request: Request) -> int | None:
    path = request.url.path
    if path in {"/api/auth/login", "/api/auth/signup"}:
        return HTTP_AUTH_LIMIT
    if path.startswith("/api/"):
        return HTTP_API_LIMIT
    return None


async def request_identity(request: Request, client: str) -> str:
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    if token:
        user = await get_user_by_token(token)
        if user is not None:
            return f"user:{user['id']}"
    return f"ip:{client}"


async def check_socket_rate(user_id: str, canvas_id: str, message_type: str) -> bool:
    if message_type == "cursor":
        return await allow_rate(f"ws:{canvas_id}:{user_id}:cursor", WS_CURSOR_LIMIT)
    if message_type == "preview_op":
        return await allow_rate(f"ws:{canvas_id}:{user_id}:preview", WS_PREVIEW_LIMIT)
    if message_type in {"undo", "redo"}:
        return await allow_rate(f"ws:{canvas_id}:{user_id}:history", WS_HISTORY_LIMIT)
    return await allow_rate(f"ws:{canvas_id}:{user_id}:write", WS_WRITE_LIMIT)
