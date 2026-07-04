# Implementation Blueprint

This is the recommended build order for recreating LiveBoard from scratch.

## 1. Scaffold Runtime

Create:

- React + TypeScript + Vite frontend in `client/`.
- FastAPI backend in `server/`.
- PostgreSQL service in `docker-compose.yml`.
- Vite proxy for:
  - `/api -> backend`
  - `/ws -> backend`

The browser should talk to one origin during development: `http://localhost:5173`.

## 2. Build Database Schema

Create tables in this order:

1. `users`
2. `sessions`
3. `canvases`
4. `canvas_members`
5. `canvas_ops`
6. `canvas_history`

Use idempotent schema execution so startup can safely apply missing columns/indexes. See [Database](./database.md) for fields and formats.

## 3. Build Auth

Backend:

- Normalize usernames/emails to lowercase trimmed strings.
- Hash passwords as PBKDF2 SHA-256 with random salt.
- Create 12-hour session rows.
- Set `liveboard_session` as httpOnly, SameSite=Lax cookie.
- Read session from cookie in `get_current_user`.
- Clear cookie on logout even if DB session is stale.

Frontend:

- Never read session token.
- Use `fetch(..., { credentials: "same-origin" })`.
- Bootstrap with `GET /api/me`.

## 4. Build Canvas HTTP API

Implement:

- list canvases by membership
- create canvas and owner membership
- get canvas detail by membership
- list members by membership
- invite user by owner only
- remove member by owner only

Keep ownership and membership helpers separate:

- `require_canvas_member`
- `require_canvas_owner`

## 5. Build Shape Model

Use a top-level canvas state:

```json
{ "shapes": [] }
```

Shape kinds:

- `rect`: x/y/width/height
- `ellipse`: x/y/width/height
- `line`: x1/y1/x2/y2
- `text`: x/y/width/height plus text fields

Every shape carries:

- `id`
- `type`
- stroke/fill color
- stroke/fill opacity
- stroke width
- `createdBy`
- `updatedAt`

Text also carries:

- `text`
- `textColor`
- `textOpacity`
- `fontSize`

## 6. Build Operation Reducer

Implement operation kinds:

- `create_shape`
- `update_shape`
- `delete_shape`
- `reorder_shape`

Both frontend and backend need equivalent apply behavior. Backend is authoritative.

Backend also needs `invert_operation(state_before, op)` to derive undo operations from locked server state.

## 7. Build WebSocket Collaboration

On connect:

1. Read cookie.
2. Validate session.
3. Validate membership.
4. Add socket to in-memory room.
5. Send `snapshot`.

Implement incoming messages:

- `cursor`
- `preview_op`
- `op`
- `undo`
- `redo`

Implement outgoing messages:

- `snapshot`
- `op_applied`
- `preview_applied`
- `cursor`
- `presence_join`
- `presence_leave`
- `access_removed`
- `session_expired`
- `history_status`

## 8. Build Server-Side History

For undoable operations:

1. Lock canvas row.
2. Validate operation.
3. Derive inverse from current state.
4. Apply forward operation.
5. Increment canvas revision.
6. Insert `canvas_ops`.
7. Insert `canvas_history`.
8. Clear redo rows.
9. Broadcast `op_applied`.

For undo:

1. Select latest active history row.
2. Apply `inverse_op`.
3. Mark row undone.
4. Broadcast applied inverse.

For redo:

1. Select latest undone history row.
2. Apply `forward_op`.
3. Mark row active.
4. Broadcast applied forward operation.

## 9. Build Frontend Screens

Screens:

- loading
- auth
- dashboard
- whiteboard

Do not introduce a router unless product navigation grows.

## 10. Build Whiteboard UI

Whiteboard should compose:

- board header
- toolbar
- canvas SVG
- share modal
- context menu
- inline text editor

Keep interaction state in hooks, not render components.

Use `lucide-react` for semantic icons in toolbars, headers, modals, and context menus. Icon-only controls should expose accessible labels and tooltips; avoid text-only buttons for standard actions like undo, redo, delete, refresh, back, close, share, and drawing tools.

## 11. Build Pointer Interactions

Use an interaction state machine:

- idle
- draw
- move
- resize

Apply local updates immediately. Send preview updates during drag/resize. Send one durable operation on pointer up.

## 12. Build Security And Runtime Guards

Add:

- same-origin write middleware
- rate limits
- operation validation
- WebSocket message size limit
- session rechecks on open sockets
- owner-only sharing
- configurable runtime env vars

## 13. Verify

Minimum checks:

```bash
cd client && npm run build
python3 -m compileall server/app
docker compose up --build
curl http://localhost:3001/health
```

Then smoke test:

- signup
- login
- create canvas
- draw/move/resize/delete
- undo/redo from two browser sessions
- invite/remove member
- logout
