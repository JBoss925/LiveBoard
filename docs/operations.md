# Operations

## Local Development

Recommended:

```bash
docker compose up --build
```

URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Health: `http://localhost:3001/health`
- PostgreSQL: `localhost:5432`

## Docker Compose Environment

Defaults are development-friendly and overrideable:

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_USER` | `whiteboard` | database user |
| `POSTGRES_PASSWORD` | `whiteboard` | database password |
| `POSTGRES_DB` | `whiteboard` | database name |
| `SESSION_COOKIE_SECURE` | `false` | set `Secure` cookie attribute |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | comma-separated origins allowed for unsafe API writes |

## Manual Local Run

Start database:

```bash
docker compose up db
```

Start backend:

```bash
cd server
pip install -e .
uvicorn app.main:app --reload --port 3001
```

Start frontend:

```bash
cd client
npm install
npm run dev
```

## Verification

Frontend build:

```bash
cd client
npm run build
```

Backend syntax check:

```bash
python3 -m compileall server/app
```

Health check:

```bash
curl http://localhost:3001/health
```

Cookie auth smoke test through Vite proxy:

```bash
tmp=$(mktemp)
user="smoke$(date +%s)"
curl -i -c "$tmp" \
  -X POST http://localhost:5173/api/auth/signup \
  -H 'Content-Type: application/json' \
  --data "{\"username\":\"$user\",\"email\":\"$user@example.com\",\"password\":\"password123\"}"

curl -i -b "$tmp" http://localhost:5173/api/me
rm -f "$tmp"
```

Cross-site write guard:

```bash
curl -i \
  -X POST http://localhost:5173/api/auth/login \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  --data '{"identifier":"nobody","password":"badpass"}'
```

Expected status: `403`.

## Common Troubleshooting

### Login says cross-site requests are not allowed

When running through Docker/Vite, backend must allow `http://localhost:5173` because Vite proxies from browser origin to backend service host.

Check `ALLOWED_ORIGINS` in `docker-compose.yml`.

### Frontend proxy returns 500

Inside Docker, Vite must proxy to service names:

- `VITE_API_URL=http://server:3001`
- `VITE_WS_URL=ws://server:3001`

Do not use `localhost:3001` inside the client container.

### WebSocket closes immediately

Check:

- browser has valid `liveboard_session` cookie
- user is a `canvas_members` row for that canvas
- session row has not expired
- server logs for code `1008`

### Undo/redo buttons disabled unexpectedly

`canUndo` and `canRedo` come from `canvas_history` status sent over WebSocket. Verify socket snapshot includes `history`.

## Deployment Notes

- Set `SESSION_COOKIE_SECURE=true` behind HTTPS.
- Set real database credentials.
- Set `ALLOWED_ORIGINS` to deployed frontend origin(s).
- Current realtime architecture is single-server only.
