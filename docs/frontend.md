# Frontend

## App Structure

The frontend is a React SPA without a router library. `App.tsx` holds screen state:

```ts
loading | auth | dashboard | canvas
```

## API Client

`client/src/api.ts` wraps `fetch`:

- Adds JSON `Content-Type` when body is present.
- Uses `credentials: "same-origin"` so the session cookie is sent.
- Parses FastAPI/Pydantic error responses into readable strings.

The frontend does not read or write session tokens.

## Components

| Component | Responsibility |
|---|---|
| `AuthScreen` | Login/signup form |
| `Dashboard` | List accessible canvases, create canvases, manage multi-selection, open row context menus, share canvases, rename owned canvases, and delete owned canvases |
| `CanvasList` | Selectable canvas rows and loading skeleton |
| `ConfirmModal` | Reusable modal for destructive or high-impact confirmations |
| `RenameCanvasModal` | Google Drive style canvas rename dialog |
| `Whiteboard` | Main board orchestrator |
| `Toolbar` | Tool and style controls |
| `ShareModal` | Member list, invite, remove access |
| `BoardHeader` | Canvas metadata, revision, presence, share button |
| `CanvasSvg` | SVG canvas shell |
| `ShapeRenderer` | SVG rendering per shape type |
| `SelectionOverlay` | Selection bounds and resize handles |
| `RemoteCursorLayer` | Remote cursor rendering |

## Icon System

The frontend uses `lucide-react` for semantic UI icons. Prefer Lucide icons over hand-written SVGs for common actions and tools.

Current icon usage includes:

- toolbar drawing tools: select, rectangle, ellipse, line, text, paint bucket
- edit actions: undo, redo, delete
- navigation/sharing: back, share/collaborators, close
- dashboard actions: refresh, logout, create
- dashboard list actions: select all, delete selected, context-menu open/share/rename/delete
- context menu actions: bring/send ordering and delete

Icon-only buttons must include:

- `aria-label`
- `title`
- `.icon-button`

Icon+text buttons should use `.inline-icon-button` or existing primary button styling with an icon and text span.

## Whiteboard State

`Whiteboard` owns UI-local state:

- selected tool
- selected shape id
- current toolbar style values
- context menu position
- share modal open/closed
- inline text edit state
- canvas name/owner metadata

Live canvas state comes from `useCanvasSocket`.

Canvas state includes an optional `backgroundColor`. The paint bucket tool writes this field when the user clicks the canvas background.

## Dashboard Loading

Dashboard canvas refreshes keep the skeleton list visible for at least 450ms. This prevents fast local responses from flashing the loading state too quickly to read as intentional UI feedback.

## Hooks

### `useCanvasSocket`

Owns:

- WebSocket lifecycle
- live canvas state
- revision
- active users
- remote cursors
- access/session messages
- shared history status
- pending optimistic operation queue

Sends:

- durable operations
- undo/redo requests
- preview operations
- cursor messages

Receives and applies:

- snapshots
- applied operations
- previews
- presence
- cursors
- history status
- access/session invalidation

### `useWhiteboardInteractions`

Owns pointer interaction state:

- idle
- drawing
- moving
- resizing

It converts pointer events into local optimistic updates, transient previews, and final durable history entries.

### `useLiveShapeUpdates`

Throttles drag/resize previews to roughly one every 45ms. These previews are sent as `preview_op` and are not persisted.

### `useCanvasHistory`

Small adapter over server history:

- `canUndo`/`canRedo` come from WebSocket state.
- `undo()` sends `{ type: "undo" }`.
- `redo()` sends `{ type: "redo" }`.
- `sendWithHistory()` sends durable op payload marked as undoable.

### `useWhiteboardKeyboard`

Keyboard shortcuts:

- Delete/Backspace deletes selected shape.
- Cmd/Ctrl+Z undo.
- Cmd/Ctrl+Shift+Z redo.
- Cmd/Ctrl+Y redo.
- Escape clears selection and interaction.

Ignores shortcuts while typing in inputs, textareas, or contenteditable elements.

## Shape Rendering

Canvas is an SVG with fixed logical dimensions:

- `CANVAS_WIDTH = 1200`
- `CANVAS_HEIGHT = 800`

Shape rendering:

- `rect`: `<rect>`
- `ellipse`: `<ellipse>`
- `line`: `<line>`
- `text`: `<g>` with background `<rect>` and `foreignObject` text content

Text wraps inside its box via `shape-text-content` CSS and clips to the `foreignObject`.

## Local Optimism

The frontend applies outgoing durable operations locally before server acknowledgement. To avoid double-apply, `useCanvasSocket` tracks `seenOpIds`. When the server broadcasts the same operation id back, the sender updates revision/history but skips reapplying the shape mutation.

## Toolbar Synchronization

When selection changes, `Whiteboard` copies selected shape style values into toolbar state. This makes the controls reflect the selected object:

- stroke color/opacity/width
- fill color/opacity
- text color/opacity/size for text shapes
