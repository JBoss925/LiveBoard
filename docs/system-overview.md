# System Overview

LiveBoard is a real-time collaborative whiteboard for small design-review sessions. The product assumes a small group of authenticated users editing a shared canvas synchronously, with persisted state so the same canvas can be reopened later.

## Core Capabilities

- Account signup, login, logout, and session persistence.
- Dashboard of canvases the current user can access.
- Canvas creation by authenticated users.
- Owner-managed canvas sharing by username or email.
- Owner-managed access removal.
- Realtime collaborative editing over WebSockets.
- Presence list and remote cursors.
- Shape creation for rectangles, ellipses, lines, and text.
- Shape selection, movement, resize, deletion, z-ordering, color, opacity, stroke width, and text size controls.
- Inline text editing on the canvas.
- Server-backed undo and redo shared across all editors.
- Durable canvas state in PostgreSQL.

## Intentional Scope

LiveBoard is not a general-purpose infinite whiteboard. It does not implement:

- Multi-server WebSocket fanout.
- Character-by-character collaborative text editing.
- Viewer/editor/owner role tiers beyond owner-only access management.
- Share links.
- File/image uploads.
- Rich text.
- Export.
- Canvas zoom/pan.
- Mobile-first touch workflows.

## Runtime Stack

| Layer | Technology | Role |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, lucide-react | SPA, dashboard, whiteboard UI |
| Backend | FastAPI, Python 3.12, asyncpg | HTTP API, WebSocket API, auth, persistence |
| Database | PostgreSQL 16 | Users, sessions, canvases, memberships, operations, history |
| Dev Runtime | Docker Compose | Local db/server/client services |

## Top-Level Request Flow

```mermaid
flowchart LR
  Browser["Browser / React SPA"]
  Vite["Vite dev server"]
  API["FastAPI backend"]
  DB["PostgreSQL"]

  Browser -->|"HTTP /api, cookie auth"| Vite
  Browser -->|"WebSocket /ws, cookie auth"| Vite
  Vite -->|"proxy /api"| API
  Vite -->|"proxy /ws"| API
  API -->|"asyncpg"| DB
```

In Docker, Vite proxies to `http://server:3001` and `ws://server:3001`. From the browser, all calls are same-origin against `localhost:5173`.

## Important Invariants

- The durable canvas state is `canvases.state`.
- `canvases.revision` increments only for persisted operations, undo, and redo.
- Drag and resize previews are transient WebSocket messages and do not increment revision.
- Undo/redo state is server-side in `canvas_history`.
- WebSocket authentication uses the `liveboard_session` httpOnly cookie, not query-string tokens.
- Open WebSockets re-check session validity every 30 seconds and before processing each incoming message.
- Only canvas owners can invite or remove members.
