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
- **Backend (FastAPI)** on port `3001`
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

## Running Locally

You need a running PostgreSQL instance. The default connection string is:

```text
postgres://whiteboard:whiteboard@localhost:5432/whiteboard
```

Start PostgreSQL with Docker Compose:

```bash
docker compose up db
```

Initialize the database schema:

```bash
psql postgres://whiteboard:whiteboard@localhost:5432/whiteboard -f server/schema.sql
```

Install and start the backend:

```bash
cd server
pip install -e .
uvicorn app.main:app --reload --port 3001
```

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
│   │   ├── main.py
│   │   ├── routes_auth.py
│   │   ├── routes_canvases.py
│   │   ├── schemas.py
│   │   └── ws.py
│   └── schema.sql
└── docker-compose.yml
```

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | FastAPI, Python 3.12, uvicorn |
| Database | PostgreSQL 16 |
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
