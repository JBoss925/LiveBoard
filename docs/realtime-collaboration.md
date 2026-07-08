# Realtime Collaboration

Realtime collaboration is implemented in `server/app/ws.py` and `client/src/hooks/useCanvasSocket.ts`.

## Connection

Frontend opens:

```text
/ws/canvases/{canvas_id}
```

No token is in the URL. Browser sends the `liveboard_session` httpOnly cookie as part of the WebSocket handshake.

Backend accepts only when:

- session exists and is not expired
- user is a member of the canvas
- canvas exists

On accept, backend sends:

```json
{
  "type": "snapshot",
  "canvasId": "canvas-id",
  "revision": 12,
  "state": { "shapes": [] },
  "users": [],
  "history": { "canUndo": true, "canRedo": false }
}
```

## Room Manager And Cluster Fanout

`CanvasRoomManager` holds local in-memory state:

- `rooms: canvas_id -> set[WebSocket]`
- `users: WebSocket -> user dict`
- `connection_ids: WebSocket -> connection id`

It handles:

- accept socket
- presence join broadcast
- disconnect cleanup
- presence leave broadcast
- generic broadcast
- forced access removal
- active user list

When `REDIS_URL` is configured, the manager also:

- publishes canvas events to `liveboard:canvas:{canvas_id}:events`
- subscribes to `liveboard:canvas:*:events` and forwards messages from other backend instances to local sockets
- stores presence in `liveboard:presence:{canvas_id}:connections` plus `liveboard:presence:conn:{connection_id}` TTL records
- delays final presence-leave broadcasts briefly to avoid flicker during reconnects

Redis Pub/Sub is treated as best-effort transport. Durable state remains in PostgreSQL, and every durable operation message includes a revision. Clients that observe a revision gap refresh the canvas snapshot through `GET /api/canvases/{canvas_id}`.

## Message Types

### Client -> Server

```json
{ "type": "cursor", "x": 120, "y": 200, "selectedShapeId": "shape-id" }
```

Cursor `x` and `y` are canvas-world coordinates. They may be negative or large because the viewport is functionally infinite; the server only requires finite numeric values.

Durable shape positions follow the same model: moved shapes may use large negative or positive finite world coordinates. The backend validates them against a broad operational range rather than the initial viewport size.

```json
{ "type": "preview_op", "op": { "id": "...", "kind": "update_shape", "shapeId": "...", "patch": {} } }
```

Group drag previews use the same message type with `kind: "batch"` and child `update_shape` operations. Previews are broadcast to other editors and are not written to PostgreSQL.

```json
{ "type": "op", "op": { "id": "...", "kind": "create_shape", "shape": {} }, "history": { "inverse": {} } }
```

The backend no longer trusts the client-provided inverse, but the presence of `history.inverse` marks the operation as undoable. The server derives the true inverse from locked canvas state.

Multi-shape user actions use `kind: "batch"` with child operations applied in order. The backend derives a single inverse batch, so grouping, ungrouping, multi-style edits, and group moves share one undo/redo step for every connected editor.

```json
{ "type": "undo" }
```

```json
{ "type": "redo" }
```

### Server -> Client

```json
{ "type": "op_applied", "canvasId": "...", "revision": 13, "userId": "...", "op": {}, "history": {} }
```

```json
{ "type": "preview_applied", "canvasId": "...", "userId": "...", "op": {} }
```

```json
{ "type": "cursor", "user": { "id": "...", "username": "alice" }, "x": 10, "y": 20, "selectedShapeId": null }
```

```json
{ "type": "canvas_renamed", "canvasId": "...", "name": "Planning Board" }
```

```json
{ "type": "presence_join", "user": { "id": "...", "username": "alice", "email": "alice@example.com" } }
```

```json
{ "type": "presence_leave", "userId": "..." }
```

```json
{ "type": "access_removed", "message": "Your access to this canvas has been removed." }
```

```json
{ "type": "session_expired", "message": "Your session has expired. Please sign in again." }
```

```json
{ "type": "history_status", "history": { "canUndo": false, "canRedo": true } }
```

## Durable Operation Flow

```mermaid
sequenceDiagram
  participant Client
  participant WS
  participant DB

  Client->>WS: type=op
  WS->>WS: validate message and rate limit
  WS->>DB: SELECT canvas FOR UPDATE
  WS->>WS: validate operation and shape count
  WS->>WS: derive inverse from current state
  WS->>DB: UPDATE canvases.state/revision
  WS->>DB: INSERT canvas_ops
  WS->>DB: INSERT canvas_history
  WS->>WS: commit transaction
  WS->>Client: local and Redis fanout op_applied
```

## Undo Flow

1. Server locks canvas row.
2. Selects latest `canvas_history` row where `undone_at IS NULL`.
3. Applies `inverse_op`.
4. Inserts applied inverse into `canvas_ops`.
5. Sets `undone_at = NOW()` and `undone_revision` to the resulting revision.
6. Broadcasts `op_applied`.

## Redo Flow

1. Server locks canvas row.
2. Selects latest `canvas_history` row where `undone_at IS NOT NULL`, ordered by `undone_revision DESC`.
3. Applies `forward_op` with a new operation id.
4. Inserts redo op into `canvas_ops`.
5. Sets `undone_at = NULL`, clears `undone_revision`, and updates `applied_revision`.
6. Broadcasts `op_applied`.

## Session And Membership Rechecks

Open sockets re-check:

- before every incoming message
- every 30 seconds while idle

If session is expired/deleted, server sends `session_expired` and closes with code `1008`.

If membership is removed, server sends `access_removed` and closes with code `1008`.

Redis access-removal and canvas-deletion messages close affected sockets quickly across backend instances. The periodic and per-message database rechecks remain the correctness layer if a Redis message is missed.
