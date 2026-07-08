# Security

## Session Storage

Session tokens are stored only in PostgreSQL and an httpOnly browser cookie named `liveboard_session`.

Cookie attributes:

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Max-Age=43200`
- `Secure` controlled by `SESSION_COOKIE_SECURE`

Frontend code does not read the token.

## Session Lifetime

Sessions expire after 12 hours.

Validation checks:

- token exists
- `expires_at > NOW()`

Expired rows are deleted opportunistically on:

- session creation
- session lookup

Valid lookups update `last_seen_at`.

## WebSocket Auth

WebSockets authenticate using the same httpOnly cookie. Tokens are not passed in the URL.

After connection:

- every message re-checks session validity
- idle sockets re-check every 30 seconds
- deleted/expired sessions close socket with `session_expired`
- removed memberships close socket with `access_removed`

## Password Hashing

Password format:

```text
pbkdf2_sha256$260000$salt_hex$digest_hex
```

Verification uses `hmac.compare_digest`.

## Same-Origin Write Protection

`SameOriginMiddleware` protects unsafe `/api/*` methods. It rejects requests with an `Origin` that is neither:

- same host as request `Host`
- explicitly included in `ALLOWED_ORIGINS`

Docker development sets default `ALLOWED_ORIGINS=http://localhost:5173`.

## Rate Limits

Redis-backed rate limits when `REDIS_URL` is configured:

- login/signup: `10/min` per client IP, override with `HTTP_AUTH_RATE_LIMIT`
- authenticated HTTP API routes: `120/min` per user/method/path, override with `HTTP_API_RATE_LIMIT`
- unauthenticated HTTP API routes: `120/min` per client/method/path, override with `HTTP_API_RATE_LIMIT`
- WebSocket cursor: `1500/min` per user/canvas, override with `WS_CURSOR_RATE_LIMIT`
- WebSocket preview: `1500/min` per user/canvas, override with `WS_PREVIEW_RATE_LIMIT`
- WebSocket undo/redo: `300/min` per user/canvas, override with `WS_HISTORY_RATE_LIMIT`
- WebSocket writes: `90/min` per user/canvas, override with `WS_WRITE_RATE_LIMIT`

When Redis is not configured, the same limits use in-memory counters and are single-process only.

## Authorization Rules

- Any member can list/open a canvas and see members.
- Only owner can invite users.
- Only owner can remove access.
- Owner cannot be removed.
- WebSocket requires canvas membership.

## Validation Boundaries

Backend validates:

- operation kind
- operation id and shape id shape
- shape types
- shape geometry ranges
- colors as `#rgb` or `#rrggbb`
- opacity ranges
- stroke width
- text size and length
- max shape count
- max WebSocket message byte size

Frontend validation is convenience only; backend validation is authoritative.

## Remaining Security Tradeoffs

- No password reset or email verification.
- No role tiers beyond owner/member.
- No audit UI, though `canvas_ops` persists operation history.
