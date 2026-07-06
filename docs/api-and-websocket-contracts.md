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
    "ownerUsername": "alice",
    "folderId": "folder-id",
    "sortOrder": 1024,
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

#### `GET /api/folders`

Returns folders owned by the current user.

```json
[
  { "id": "folder-id", "name": "Q3 Planning", "parentId": null, "sortOrder": 1024, "updatedAt": "2026-07-04T19:00:00+00:00" }
]
```

#### `POST /api/folders`

Creates an owned folder.

Request:

```json
{ "name": "Q3 Planning", "parentId": null }
```

#### `PATCH /api/folders/{folder_id}`

Renames an owned folder.

#### `DELETE /api/folders/{folder_id}`

Deletes an owned folder, every nested child folder, and every owned canvas inside that folder subtree. Live sockets for deleted canvases are closed with the same deletion message used by direct canvas deletion.

#### `PATCH /api/folders/{folder_id}/parent`

Owner-only. Moves an owned folder under another owned folder or clears its parent to move it to the implicit root. The backend rejects moves into the folder itself or any descendant folder.

Request:

```json
{ "parentId": "destination-folder-id" }
```

Use `{ "parentId": null }` to move the folder to the root.

#### `PATCH /api/dashboard/order`

Owner-only. Rewrites the mixed folder/canvas order for one sibling list. `parentId` is null for the implicit root or a folder id for that folder's children. Every item in `items` is assigned a new `sort_order` based on its array position.

Request:

```json
{
  "parentId": null,
  "items": [
    { "type": "folder", "id": "folder-id" },
    { "type": "canvas", "id": "canvas-id" }
  ]
}
```

#### `PATCH /api/canvases/{canvas_id}`

Owner-only. Renames a canvas.

Request:

```json
{ "name": "Planning Board" }
```

Response is one `CanvasSummary`.

#### `PATCH /api/canvases/{canvas_id}/folder`

Owner-only. Moves an owned canvas into an owned folder or clears its folder.

Request:

```json
{ "folderId": "folder-id" }
```

Use `{ "folderId": null }` to move the canvas to the implicit root list.

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
  "ownerUsername": "alice",
  "folderId": "folder-id",
  "sortOrder": 1024,
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
  | { id: string; kind: "batch"; ops: CanvasOperation[] }
  | { id: string; kind: "create_shape"; shape: Shape }
  | { id: string; kind: "update_canvas"; patch: Partial<CanvasState> }
  | { id: string; kind: "update_shape"; shapeId: string; patch: Partial<Shape> }
  | { id: string; kind: "delete_shape"; shapeId: string }
  | { id: string; kind: "reorder_shape"; shapeId: string; toIndex: number };
```

Shape objects may include optional `rotation: number`, `groupId: string`, and `groupIds: string[]`. `rotation` stores degrees for rect-like shapes; line rotation is represented by endpoint updates. `groupIds` is the ordered nesting stack for groups; the frontend treats the last id in the array as the active/top group. `groupId` remains supported for flat legacy shapes and mirrors the first id in the stack. `update_shape` can set `rotation`, can set `groupIds` to append or remove a nesting level, and can set `groupId` or `groupIds` to `null` to remove those fields.

`batch` applies child operations in order and is used when one user action must affect multiple shapes as one undoable operation. Nested `batch` operations are rejected.

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

Canvas rename:

```json
{ "type": "canvas_renamed", "canvasId": "canvas-id", "name": "Planning Board" }
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
