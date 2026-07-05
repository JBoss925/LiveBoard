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
| `Dashboard` | List owned canvases by folder, list/search shared canvases, create folders/canvases, manage multi-selection, open row context menus, share canvases, rename owned canvases, and delete owned canvases |
| `CanvasList` | Selectable canvas rows and loading skeleton |
| `ConfirmModal` | Reusable modal for destructive or high-impact confirmations |
| `FolderModal` | Creates owner-scoped dashboard folders |
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
- dashboard actions: refresh, logout, create dropdown
- dashboard list actions: select all, delete selected, create canvas/folder, context-menu folder creation, context-menu open/share/rename/move/delete
- context menu actions: bring/send ordering, group/ungroup, and delete

Icon-only buttons must include:

- `aria-label`
- `title`
- `.icon-button`

Icon+text buttons should use `.inline-icon-button` or existing primary button styling with an icon and text span.

Toolbar color swatches use native `<input type="color">` controls through `ColorInput`. The wrapper keeps the native swatch UI and suppresses the follow-up click when an already-open picker is pressed again.

## Whiteboard State

`Whiteboard` owns UI-local state:

- selected tool
- selected shape ids
- transient box-selection bounds
- current toolbar style values
- context menu position
- share modal open/closed
- inline text edit state
- canvas name/owner metadata

Live canvas state comes from `useCanvasSocket`.

Canvas state includes an optional `backgroundColor`. New canvases default to `#eff5f5`, and older canvases without the field render with the same fallback. The paint bucket tool writes this field when the user clicks the canvas background.

## Dashboard Loading

Dashboard canvas refreshes keep the skeleton list visible for at least 450ms. This prevents fast local responses from flashing the loading state too quickly to read as intentional UI feedback.

Dashboard organization:

- owned canvases appear under `Your canvases`
- folders are owner-scoped and only organize canvases the current user owns
- folders render as collapsible inline rows inside `Your canvases`
- folder rows select on single click, support mixed ctrl/cmd selection with canvases and other folders, and toggle open/closed from the chevron or a double-click
- folders can be nested under other folders
- nested folder and canvas rows compute static tree rail segments per indent level: straight rails for continuing ancestors, T rails for rows with following siblings, and L rails for final siblings
- owned canvases with no `folderId` appear in the implicit root next to root folders
- folders and owned canvases render as one mixed sibling list ordered by `sortOrder`
- root canvases and folders are created from the `+` dropdown
- root folders can also be created from the `Your canvases` empty-space context menu
- nested folders are created from a folder row context menu
- owned canvases and folders are moved by drag/drop
- insertion drop zones before every item and after the final item support beginning/end reordering, including one-item lists
- insertion drop zones become visible when a dragged dashboard item is directly over that slot
- dropping an item into an insertion zone rewrites sibling order through `PATCH /api/dashboard/order`
- dropping on the center of a folder row moves the item into that folder
- empty list levels render no placeholder card or copy
- deleting a folder is destructive for the entire folder subtree and uses the app confirmation modal
- shared canvases appear under `Shared with You`
- shared canvases can be searched by canvas name or owner username and filtered by owner through the app-styled owner menu

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
- box-selecting
- drawing
- moving unlocked shapes, multi-selections, and grouped shapes
- resizing single shapes, unlocked multi-selections, and selected groups

It converts pointer events into local optimistic updates, transient previews, selection changes, and final durable history entries. Grouping, ungrouping, multi-style edits, multi-select transforms, and group transforms are sent as `batch` operations so they undo and redo as one shared history entry.

### `useLiveShapeUpdates`

Throttles drag/resize previews to roughly one every 45ms. Single-shape previews are sent as `update_shape`; multi-select and group transform previews are sent as `batch` operations containing per-shape `update_shape` patches. These previews are sent as `preview_op` and are not persisted.

### `useCanvasHistory`

Small adapter over server history:

- `canUndo`/`canRedo` come from WebSocket state.
- `undo()` sends `{ type: "undo" }`.
- `redo()` sends `{ type: "redo" }`.
- `sendWithHistory()` sends durable op payload marked as undoable.

`useCanvasSocket` allows only one undo/redo request in flight at a time. The in-flight flag clears when the server returns `op_applied`, `history_status`, `snapshot`, or `error`.

### `useWhiteboardKeyboard`

Keyboard shortcuts:

- Delete/Backspace deletes selected unlocked shapes.
- Cmd/Ctrl+Z undo.
- Cmd/Ctrl+Shift+Z redo.
- Cmd/Ctrl+Y redo.
- Escape clears selection and interaction.

Ignores shortcuts while typing in inputs, textareas, or contenteditable elements.

## Shape Rendering

Canvas is an SVG viewport into shared canvas coordinates. The viewport fills the available space to the right of the toolbar and below the board header.

Viewport controls:

- mouse wheel zooms around the cursor
- zoom is clamped between `0.15x` and `6x`
- middle-button drag pans from any canvas point
- with the select tool active, left-dragging the background draws a box selection

Remote cursors are positioned in canvas coordinates but inverse-scaled by the current zoom so they keep a consistent on-screen size.

Shape rendering:

- `rect`: `<rect>`
- `ellipse`: `<ellipse>`
- `line`: `<line>`
- `text`: `<g>` with background `<rect>` and `foreignObject` text content

Text wraps inside its box via `shape-text-content` CSS and clips to the `foreignObject`.

## Local Optimism

The frontend applies outgoing durable operations locally before server acknowledgement. To avoid double-apply, `useCanvasSocket` tracks `seenOpIds`. When the server broadcasts the same operation id back, the sender updates revision/history but skips reapplying the shape mutation.

## Toolbar Synchronization

When selection changes, `Whiteboard` copies shared selected-shape style values into toolbar state. A value is copied only when every relevant selected shape shares it. This makes controls reflect single-object selections and homogeneous multi-selections:

- stroke color/opacity/width
- fill color/opacity
- text color/opacity/size for text shapes

Grouped shapes are locked for member-level editing. Shapes may carry a `groupIds` nesting stack; the last id is the active/top group for selection and movement. Selecting a grouped object selects every shape in that top group, shows one combined selection box with transform handles, and allows movement or scaling only as a grouped unit. Toolbar style controls remain editable as drawing defaults, but their changes do not apply to grouped members. Any selection that contains a grouped shape is blocked from style, text, bucket, and delete mutations; mixed selections of grouped and unlocked units exist so the user can transform them together or create a parent group. The combined selection box itself is a pointer target, so dragging empty space inside the group bounds moves the group instead of starting background box selection. Multi-selected unlocked shapes use the same combined selection box: dragging any selected member moves every selected shape, and dragging a combined handle scales every selected shape as one undoable batch. Grouping an existing group with another shape appends a new parent id to the stack, and ungrouping removes only the active/top id so child groups remain intact. After every local or remote canvas state change, `Whiteboard` reconciles the selected ids against the current group graph. If a selected shape was added to a group by undo, redo, or another editor, selection expands to the new top group instead of leaving the child editable by itself.

Middle-button canvas panning is local viewport state. While panning is active, the SVG uses a grabbing cursor.
