import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Awaitable

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

WINDOW_SECONDS = 60


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


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        client = request.client.host if request.client else "unknown"
        route_key = f"{request.method}:{request.url.path}"
        limit = route_limit(request)
        if limit is not None and not limiter.allow(f"http:{client}:{route_key}", limit):
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests. Please try again shortly."},
            )
        return await call_next(request)


def route_limit(request: Request) -> int | None:
    path = request.url.path
    if path in {"/api/auth/login", "/api/auth/signup"}:
        return 10
    if path.startswith("/api/"):
        return 120
    return None


def check_socket_rate(user_id: str, canvas_id: str, message_type: str) -> bool:
    if message_type == "cursor":
        return limiter.allow(f"ws:{canvas_id}:{user_id}:cursor", 180)
    if message_type == "preview_op":
        return limiter.allow(f"ws:{canvas_id}:{user_id}:preview", 120)
    return limiter.allow(f"ws:{canvas_id}:{user_id}:write", 90)
