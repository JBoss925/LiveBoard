import os

import redis.asyncio as redis
from redis.asyncio import Redis

REDIS_URL = os.environ.get("REDIS_URL")

client: Redis | None = None


async def get_redis() -> Redis | None:
    global client
    if not REDIS_URL:
        return None
    if client is None:
        client = redis.from_url(REDIS_URL, decode_responses=True)
        await client.ping()
    return client


async def close_redis() -> None:
    global client
    if client is not None:
        await client.aclose()
        client = None
