# Setup

This document explains how to run LiveBoard locally with Docker Compose or with local frontend and backend processes.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) 22+ for the frontend
- [Python](https://www.python.org/) 3.12+ for the backend

## Running With Docker Compose

From the repository root:

```bash
docker compose up --build
```

This starts:

- **PostgreSQL** on port `5432`
- **Redis** on port `6379`
- **Backend proxy** on port `3001`
- **Backend (FastAPI)** containers behind the proxy
- **Frontend (React/Vite)** on port `5173`

Open http://localhost:5173 in your browser.

Docker Compose uses local-development defaults for PostgreSQL. Override them with environment variables when needed:

```bash
POSTGRES_USER=liveboard \
POSTGRES_PASSWORD='replace-me' \
POSTGRES_DB=liveboard \
SESSION_COOKIE_SECURE=true \
docker compose up --build
```

To run multiple backend instances locally:

```bash
docker compose up --build --scale server=3
```

The `server` containers do not publish host ports directly. The `backend` proxy exposes `localhost:3001` and load-balances HTTP and WebSocket traffic to the scaled backend service.

Rate limits can be lowered from the command line for manual testing. To test durable write limiting without making cursor, preview, or undo/redo interactions noisy, lower only `WS_WRITE_RATE_LIMIT`:

```bash
WS_WRITE_RATE_LIMIT=3 \
docker compose up --build --scale server=3
```

See `docs/multi-server-support.md` for the Redis coordination design, tradeoffs, and operational requirements.

## Running Locally

You need a running PostgreSQL instance. The default connection string is:

```text
postgres://whiteboard:whiteboard@localhost:5432/whiteboard
```

Start PostgreSQL with Docker Compose:

```bash
docker compose up db
```

For multi-server behavior or shared local rate limits, also start Redis:

```bash
docker compose up redis
```

Initialize the database schema:

```bash
psql postgres://whiteboard:whiteboard@localhost:5432/whiteboard -f server/schema.sql
```

Install and start the backend:

```bash
cd server
pip install -e .
REDIS_URL=redis://localhost:6379/0 uvicorn app.main:app --reload --port 3001
```

If `REDIS_URL` is unset, the backend runs in single-process fallback mode with local-only rate limits, presence, and WebSocket fanout.

In another terminal, install and start the frontend:

```bash
cd client
npm install
npm run dev
```

The frontend dev server proxies `/api` and `/ws` requests to the backend at `localhost:3001`.

## Project Structure

```text
├── client/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   └── vite.config.ts
├── server/
│   ├── app/
│   │   ├── auth.py
│   │   ├── canvas_ops.py
│   │   ├── db.py
│   │   ├── redis_client.py
│   │   ├── main.py
│   │   ├── routes_auth.py
│   │   ├── routes_canvases.py
│   │   ├── schemas.py
│   │   └── ws.py
│   └── schema.sql
├── Caddyfile
└── docker-compose.yml
```

`Caddyfile` configures the local backend proxy used by Docker Compose. See `docs/multi-server-support.md` for the multi-server runtime shape.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | FastAPI, Python 3.12, uvicorn |
| Database | PostgreSQL 16 |
| Coordination | Redis 7 |
| WebSocket | FastAPI via Starlette |

## Useful Commands

Run the frontend build:

```bash
cd client
npm run build
```

Run the backend directly:

```bash
cd server
uvicorn app.main:app --reload --port 3001
```

Check repository status:

```bash
git status --short
```
