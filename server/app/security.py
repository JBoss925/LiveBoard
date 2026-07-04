import os
from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class SameOriginMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if request.method in SAFE_METHODS or not request.url.path.startswith("/api/"):
            return await call_next(request)

        origin = request.headers.get("origin")
        if origin and not is_allowed_origin(origin, request.headers.get("host", "")):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Cross-site requests are not allowed"},
            )
        return await call_next(request)


def is_allowed_origin(origin: str, host: str) -> bool:
    parsed_origin = urlparse(origin)
    origin_host = parsed_origin.netloc
    if origin_host == host:
        return True

    allowed_origins = {
        value.strip()
        for value in os.environ.get("ALLOWED_ORIGINS", "").split(",")
        if value.strip()
    }
    return origin.rstrip("/") in allowed_origins
