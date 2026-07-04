# Backend

## Module Map

| File | Responsibility |
|---|---|
| `main.py` | FastAPI app, middleware registration, startup/shutdown, health, WebSocket route |
| `db.py` | asyncpg pool and schema initialization |
| `auth.py` | password hashing, session creation, session lookup, current-user dependency |
| `routes_auth.py` | signup, login, logout, `/api/me` |
| `routes_canvases.py` | canvas list/create/get, member list, invite, remove access |
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
