# Backend

## Module Map

| File | Responsibility |
|---|---|
| `main.py` | FastAPI app, middleware registration, startup/shutdown, health, WebSocket route |
| `db.py` | asyncpg pool and schema initialization |
| `auth.py` | password hashing, session creation, session lookup, current-user dependency |
| `routes_auth.py` | signup, login, logout, `/api/me` |
| `routes_canvases.py` | canvas list/create/get, folder organization, member list, invite, remove access |
| `http_helpers.py` | response mapping, state decoding, membership/owner guards |
| `schemas.py` | Pydantic request/response models |
| `canvas_ops.py` | operation application and server-derived inverse operations |
| `ws.py` | WebSocket rooms, presence, cursor, previews, durable operations, undo/redo |
| `validation.py` | operation, shape, message, and canvas-name validation |
| `security.py` | same-origin write protection |
| `rate_limit.py` | in-memory HTTP and WebSocket rate limits |

## HTTP Middleware

Middleware order is registered in `main.py`.

`SameOriginMiddleware` rejects unsafe `/api/*` requests when an `Origin` header is present and not allowed. Allowed if:

- `Origin` host matches request `Host`.
- Full origin is listed in `ALLOWED_ORIGINS`.

`RateLimitMiddleware` applies:

- `10/min` for `/api/auth/login` and `/api/auth/signup`.
- `120/min` for other `/api/*` routes.

## Auth Routes

### `POST /api/auth/signup`

Input:

```json
{ "username": "alice", "email": "alice@example.com", "password": "password123" }
```

Behavior:

- Lowercases/strips username and email.
- Requires non-empty username, `@` in email, and password length >= 6.
- Hashes password with PBKDF2 SHA-256.
- Inserts user.
- Creates session.
- Sets `liveboard_session` httpOnly cookie.
- Returns `{ "user": ... }`.

### `POST /api/auth/login`

Input:

```json
{ "identifier": "alice", "password": "password123" }
```

Behavior:

- Looks up by username or email.
- Verifies password with constant-time digest comparison.
- Creates session and sets cookie.
- Returns `{ "user": ... }`.

### `POST /api/auth/logout`

Behavior:

- Reads session cookie if present.
- Deletes matching session row.
- Clears browser cookie.
- Does not require an already-valid session, so stale cookies can be cleared.

### `GET /api/me`

Requires valid session and returns current user.

## Canvas Routes

All canvas routes require authenticated user.

### `GET /api/canvases`

Returns canvases where current user appears in `canvas_members`.

### `POST /api/canvases`

Creates canvas with empty state and inserts creator as member/owner.

### `GET /api/folders`, `POST /api/folders`, `PATCH /api/folders/{folder_id}`, `PATCH /api/folders/{folder_id}/parent`, `DELETE /api/folders/{folder_id}`

Manage owner-scoped dashboard folders. Folders organize only canvases owned by the current user; they do not grant access.

Folder parent moves validate owner access and reject cycles. Folder deletion is recursive at the application layer: canvases inside the folder subtree are deleted before the folder row is removed, and active sockets for those canvases are closed.

### `PATCH /api/dashboard/order`

Requires ownership of every listed item. Rewrites `sort_order` for one mixed folder/canvas sibling list under the supplied `parentId`.

### `PATCH /api/canvases/{canvas_id}/folder`

Requires owner. Moves an owned canvas into one of the owner’s folders or clears `folder_id` to return it to the implicit root list.

### `PATCH /api/canvases/{canvas_id}`

Requires owner. Validates and updates the canvas name, then returns the updated summary.

### `DELETE /api/canvases/{canvas_id}`

Requires owner. Deletes the canvas row, relies on database cascades for memberships, operations, and history, and disconnects live sockets for that canvas with a deletion message.

### `GET /api/canvases/{canvas_id}`

Requires membership and returns summary plus durable canvas state.

### `GET /api/canvases/{canvas_id}/members`

Requires membership and returns users with access.

### `POST /api/canvases/{canvas_id}/invite`

Requires owner. Looks up invitee by username/email and inserts membership.

### `DELETE /api/canvases/{canvas_id}/members/{member_id}`

Requires owner. Cannot remove owner. Deletes membership and disconnects live sockets for removed user.

## Error Style

Backend errors generally use FastAPI `HTTPException` with JSON:

```json
{ "detail": "Message" }
```

Frontend `api.ts` formats string, object, and Pydantic validation-array details into user-readable messages.

## Canvas Operation Rules

`validation.py` accepts `create_shape`, `update_canvas`, `update_shape`, `delete_shape`, `reorder_shape`, and non-nested `batch` operations. `batch` operations may contain up to 100 child operations and are used for one user action that touches multiple shapes.

Shape patches may include optional `rotation`, `groupId`, and `groupIds`. `rotation` stores degrees for rect-like shapes; line rotation is represented by endpoint updates. `groupIds` is the ordered nesting stack for shape groups, with the last id treated as the active/top group. `groupId` is retained as a compatibility field for older flat groups and stores the first group id in the stack. Setting either group field to `null` removes that field during operation application. `canvas_ops.py` applies batch children in order and derives inverse batch operations from the locked authoritative canvas state.
