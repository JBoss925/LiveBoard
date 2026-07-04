---
name: liveboard-docs
description: Keep LiveBoard's docs/ knowledge base synchronized with code changes. Use after any code, schema, API, WebSocket, security, Docker/runtime, frontend user-flow, or architecture change in this repository; also use when asked to explain or update LiveBoard system documentation.
---

# LiveBoard Docs

Use this skill to keep `docs/` accurate as a source of truth for developers and AI agents.

## Default Workflow After Code Changes

1. Run `git diff --stat` and inspect the actual diff.
2. Map changed files to docs:
   - backend/auth/security: `docs/backend.md`, `docs/security.md`, `docs/api-and-websocket-contracts.md`
   - database/schema/state: `docs/database.md`, `docs/backend.md`
   - WebSocket/history/presence: `docs/realtime-collaboration.md`, `docs/api-and-websocket-contracts.md`
   - frontend components/hooks/user flows: `docs/frontend.md`, `docs/user-paths.md`
   - Docker/runtime/deploy: `docs/operations.md`, `docs/system-overview.md`
   - architecture/invariants: `docs/architecture.md`, `docs/system-overview.md`
3. Update the smallest accurate set of docs.
4. If a new system area appears, add it to `docs/README.md`.
5. Run relevant validation:
   - frontend changes: `cd client && npm run build`
   - backend changes: `python3 -m compileall server/app`
   - auth/runtime/WebSocket changes: run an HTTP/WebSocket or Docker smoke check when practical
6. In the final response, mention which docs were updated and which validations ran.

## Documentation Standards

- Treat docs as contracts, not commentary.
- Prefer exact field names, route names, message names, env vars, and file paths.
- Document durable state ownership: what lives in PostgreSQL, what lives in React state, and what is transient.
- Keep diagrams in Mermaid when they clarify flow.
- Avoid stale implementation guesses; re-read source before changing docs.
- Do not document aspirational behavior as current behavior.

## Required Source Checks

When updating docs, inspect these files when relevant:

- `server/schema.sql`
- `server/app/routes_auth.py`
- `server/app/routes_canvases.py`
- `server/app/ws.py`
- `server/app/canvas_ops.py`
- `server/app/auth.py`
- `server/app/security.py`
- `server/app/rate_limit.py`
- `server/app/validation.py`
- `client/src/types.ts`
- `client/src/api.ts`
- `client/src/components/Whiteboard.tsx`
- `client/src/hooks/useCanvasSocket.ts`
- `client/src/hooks/useWhiteboardInteractions.ts`
- `docker-compose.yml`

## Commit Hygiene

If the user asks for commits, keep docs changes near the code changes they describe. If this skill was run as a docs-only cleanup, use a docs-focused commit message.
