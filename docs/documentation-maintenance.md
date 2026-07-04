# Documentation Maintenance

Docs are part of the implementation contract. Every code change should update docs when it changes behavior, data, architecture, security, or operations.

## When To Update Docs

Update docs when changing:

- database schema
- HTTP routes
- WebSocket messages
- auth/session lifecycle
- security middleware or rate limits
- canvas operation semantics
- undo/redo behavior
- frontend user paths
- Docker/runtime environment
- component responsibilities
- important invariants

## File Ownership

| Change Type | Docs To Check |
|---|---|
| Product flow | `user-paths.md`, `system-overview.md` |
| Schema/data | `database.md`, `backend.md` |
| HTTP/WebSocket contracts | `api-and-websocket-contracts.md`, `realtime-collaboration.md` |
| Auth/security | `security.md`, `backend.md`, `api-and-websocket-contracts.md` |
| Canvas collaboration | `realtime-collaboration.md`, `frontend.md`, `database.md` |
| Frontend UI/state | `frontend.md`, `user-paths.md` |
| Runtime/deploy | `operations.md`, `system-overview.md` |

## Required Doc Maintenance Workflow

1. Inspect `git diff --stat` and `git diff`.
2. Identify which public contracts changed.
3. Update relevant docs in `docs/`.
4. If adding a new system area, add it to `docs/README.md`.
5. Run relevant checks:
   - frontend build if frontend changed
   - Python compile if backend changed
   - smoke tests if auth/WebSocket/runtime changed
6. Mention docs updated in the final response.

## Codex Skill

The repo includes `.codex/skills/liveboard-docs`. Future Codex agents should use it after code changes to keep this folder synchronized.
