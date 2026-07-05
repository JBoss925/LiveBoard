# API And WebSocket Contracts

## HTTP API

All HTTP API paths are rooted at `/api`.

### Auth

#### `POST /api/auth/signup`

Request:

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "username": "alice",
    "email": "alice@example.com"
  }
}
```

Also sets `liveboard_session` cookie.

#### `POST /api/auth/login`

Request:

```json
{
  "identifier": "alice",
  "password": "password123"
}
```

Response is same as signup and sets session cookie.

#### `POST /api/auth/logout`

Response:

```json
{ "ok": true }
```

Also clears session cookie.

#### `GET /api/me`

Response:

```json
{ "id": "uuid", "username": "alice", "email": "alice@example.com" }
```

### Canvases

#### `GET /api/canvases`

Response:

```json
[
  {
    "id": "canvas-id",
    "name": "Design Review",
    "ownerId": "user-id",
    "revision": 3,
    "updatedAt": "2026-07-04T19:00:00+00:00"
  }
]
```

#### `POST /api/canvases`

Request:

```json
{ "name": "Design Review" }
```

Response is one `CanvasSummary`.

#### `PATCH /api/canvases/{canvas_id}`

Owner-only. Renames a canvas.

Request:

```json
{ "name": "Planning Board" }
```

Response is one `CanvasSummary`.

#### `DELETE /api/canvases/{canvas_id}`

Owner-only. Deletes the canvas and cascades dependent memberships, operations, and history rows.

Response:

```json
{ "ok": true }
```

#### `GET /api/canvases/{canvas_id}`

Response:

```json
{
  "id": "canvas-id",
  "name": "Design Review",
  "ownerId": "user-id",
  "revision": 3,
  "updatedAt": "2026-07-04T19:00:00+00:00",
  "state": { "shapes": [] }
}
```

#### `GET /api/canvases/{canvas_id}/members`

Response:

```json
{ "users": [{ "id": "uuid", "username": "alice", "email": "alice@example.com" }] }
```

#### `POST /api/canvases/{canvas_id}/invite`

Owner-only.

Request:

```json
{ "identifier": "alice@example.com" }
```

Response:

```json
{ "user": { "id": "uuid", "username": "alice", "email": "alice@example.com" } }
```

#### `DELETE /api/canvases/{canvas_id}/members/{member_id}`

Owner-only. Cannot remove owner.

Response:

```json
{ "ok": true }
```

## Canvas Operations

```ts
type CanvasOperation =
  | { id: string; kind: "create_shape"; shape: Shape }
  | { id: string; kind: "update_shape"; shapeId: string; patch: Partial<Shape> }
  | { id: string; kind: "delete_shape"; shapeId: string }
  | { id: string; kind: "reorder_shape"; shapeId: string; toIndex: number };
```

## WebSocket API

Connect to:

```text
/ws/canvases/{canvas_id}
```

The session cookie authenticates the connection.

### Client Messages

Cursor:

```json
{ "type": "cursor", "x": 100, "y": 200, "selectedShapeId": null }
```

Preview:

```json
{
  "type": "preview_op",
  "op": { "id": "op-id", "kind": "update_shape", "shapeId": "shape-id", "patch": { "x": 10 } }
}
```

Durable operation:

```json
{
  "type": "op",
  "op": { "id": "op-id", "kind": "delete_shape", "shapeId": "shape-id" },
  "history": { "inverse": {} }
}
```

Undo/redo:

```json
{ "type": "undo" }
```

```json
{ "type": "redo" }
```

### Server Messages

Snapshot:

```json
{
  "type": "snapshot",
  "canvasId": "canvas-id",
  "revision": 1,
  "state": { "shapes": [] },
  "users": [],
  "history": { "canUndo": false, "canRedo": false }
}
```

Applied operation:

```json
{
  "type": "op_applied",
  "canvasId": "canvas-id",
  "revision": 2,
  "userId": "user-id",
  "op": {},
  "history": { "canUndo": true, "canRedo": false }
}
```

Preview:

```json
{ "type": "preview_applied", "canvasId": "canvas-id", "userId": "user-id", "op": {} }
```

Presence:

```json
{ "type": "presence_join", "user": { "id": "user-id", "username": "alice" } }
```

```json
{ "type": "presence_leave", "userId": "user-id" }
```

Cursor:

```json
{ "type": "cursor", "user": { "id": "user-id", "username": "alice" }, "x": 100, "y": 200, "selectedShapeId": null }
```

Invalidation:

```json
{ "type": "access_removed", "message": "Your access to this canvas has been removed." }
```

```json
{ "type": "session_expired", "message": "Your session has expired. Please sign in again." }
```

Error:

```json
{ "type": "error", "message": "Invalid operation" }
```
