# Multi-Server Backend Implementation Plan

Temporary reference plan for implementing multi-server LiveBoard backends.

## Target Architecture

- PostgreSQL remains authoritative for sessions, memberships, canvas state, revisions, operation log, and undo/redo history.
- Redis is coordination-only for WebSocket fanout, presence, shared rate limiting, and fast socket invalidation.
- Backend instances stay stateless except for currently connected local WebSockets.
- Clients tolerate missed durable realtime messages by detecting revision gaps and refreshing the canvas snapshot.

## Guardrails

1. Persist durable operations to PostgreSQL first, commit, then publish `op_applied` through Redis.
2. Every durable event includes `canvasId` and `revision`.
3. If a client receives a durable event with revision greater than the next expected revision, it refreshes the canvas snapshot before continuing.
4. Presence uses per-canvas connection sets and per-connection TTL records. Avoid global key scans.
5. Presence join/leave broadcasts are based on user-level transitions, with delayed leave checks to avoid reconnect flicker.
6. Redis invalidation closes sockets quickly, but database checks remain authoritative before every WebSocket message and during idle rechecks.
7. Rate limits use Redis atomic counters when Redis is configured; authenticated traffic is keyed by user id when available.
8. Docker Compose scaling routes through a backend proxy. Scaled `server` containers do not publish host port `3001` directly.

## Implementation Order

1. Add Redis client lifecycle and health coverage.
2. Replace in-memory rate limits with Redis-backed counters, preserving an in-memory fallback for local non-Redis runs.
3. Add a cluster broadcaster that combines local WebSocket fanout with Redis Pub/Sub.
4. Add client revision-gap recovery.
5. Add Redis-backed presence.
6. Route canvas rename, access removal, and canvas deletion through cluster-wide notifications.
7. Update Docker Compose with Redis and a backend load-balancing proxy compatible with `docker compose up --build --scale server=N`.
8. Update docs and setup instructions.
9. Run backend compile, frontend build, and practical Docker/config checks.
