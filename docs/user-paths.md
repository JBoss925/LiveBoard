# User Paths

## First-Time Signup

1. User opens the app at `http://localhost:5173`.
2. `App.tsx` calls `GET /api/me`.
3. If no valid session exists, the app shows `AuthScreen`.
4. User switches to `Sign up`, enters username, email, and password.
5. Frontend calls `POST /api/auth/signup`.
6. Backend normalizes username/email, validates password length, hashes the password, inserts the user, creates a session, and sets an httpOnly cookie.
7. Frontend receives `{ user }`, stores the user in React state, and moves to the dashboard.

## Login

1. User enters username/email and password.
2. Frontend calls `POST /api/auth/login`.
3. Backend normalizes the identifier, looks up user by username or email, verifies PBKDF2 password hash, creates a session, and sets the cookie.
4. Frontend enters dashboard with the returned user.

## Existing Session Bootstrap

1. App starts in `loading`.
2. Frontend calls `GET /api/me` with same-origin credentials.
3. Backend reads `liveboard_session`, rejects missing/expired/deleted sessions, and updates `last_seen_at` for valid sessions.
4. If valid, frontend shows dashboard. If invalid, frontend shows auth.

## Create Canvas

1. Authenticated user clicks the plus button in the dashboard canvas-list header and chooses `Canvas`.
2. Frontend calls `POST /api/canvases` with the default name `Untitled canvas`.
3. Backend validates the name, inserts `canvases` row with empty state, inserts owner into `canvas_members`, and returns summary.
4. Frontend prepends the new canvas to local dashboard state, selects it, and opens the rename modal instead of entering the canvas.
5. Owner enters a name and frontend calls `PATCH /api/canvases/{canvas_id}`.
6. Backend validates ownership and name, updates `canvases.name`, and returns the updated summary.

## Organize Owned Canvases

1. User clicks the plus button and chooses `Folder`, or right-clicks empty space in `Your canvases` or an existing folder row and chooses `New folder`.
2. Frontend opens a folder modal and submits `POST /api/folders` with `parentId` set to null for root folders or to the selected folder for nested folders.
3. Backend creates a `canvas_folders` row owned by the current user.
4. Dashboard renders folders and canvases as siblings inside the implicit root, and nested folders render under their parent when expanded.
5. User single-clicks a folder row to select it, Ctrl/Cmd-clicks to combine folders and canvases in one mixed selection, double-clicks the row to collapse or expand it, or clicks the chevron to collapse or expand it directly.
6. User drags an owned canvas onto a folder row or root list area.
7. Frontend calls `PATCH /api/canvases/{canvas_id}/folder`.
8. Backend verifies the current user owns both the canvas and destination folder, then updates `canvases.folder_id`.
9. User drags a folder onto another folder or root list area.
10. Frontend calls `PATCH /api/folders/{folder_id}/parent`.
11. Backend verifies ownership and rejects self/descendant moves before updating `canvas_folders.parent_id`.
12. User drags a canvas or folder into an insertion zone before the first item, between items, or after the final item to reorder siblings.
13. Frontend calls `PATCH /api/dashboard/order` with the complete mixed folder/canvas order for that parent.
14. Backend updates `sort_order` on each listed sibling.
15. User right-clicks a folder and chooses `Delete folder`, or selects folders/canvases together and clicks the delete toolbar button.
16. Backend deletes every owned canvas and nested folder in selected folder subtrees, then closes live sockets for any deleted canvases.

## Select And Delete Canvases

1. User selects canvases and folders from the dashboard list:
   - single click selects one canvas
   - single click selects one folder
   - Ctrl/Cmd-click toggles individual canvases and folders into one mixed selection
   - Shift-click selects a contiguous block from the last selected anchor
   - Ctrl/Cmd+A selects all owned canvases and folders
2. Frontend tracks selected canvas ids and selected folder ids in dashboard-local React state.
3. User clicks the delete button in the list header.
4. Frontend only allows canvas deletion when every selected canvas is owned by the current user; folders are owner-scoped.
5. Frontend opens the reusable `ConfirmModal` for the destructive action.
6. If the user confirms, frontend calls `DELETE /api/canvases/{canvas_id}` for selected owned canvases and `DELETE /api/folders/{folder_id}` for top-level selected folders.
7. Backend requires owner, deletes the canvas or folder subtree, database cascades dependent rows, and live sockets for deleted canvases receive a deletion message before closing.
8. Frontend removes deleted canvases/folders from the list and clears selection.

## Dashboard Canvas Context Menu

1. User right-clicks a canvas row.
2. Frontend selects that row if it was not already selected and opens a compact context menu at the pointer.
3. User can open the canvas, open the sharing modal for access management, rename the canvas, move the canvas to a folder, or delete the canvas.
4. Rename and delete remain owner-only. Rename uses `PATCH /api/canvases/{canvas_id}` and delete uses `DELETE /api/canvases/{canvas_id}`. Folder moves are handled by dashboard drag/drop.

## Search Shared Canvases

1. User reviews the `Shared with You` section.
2. Frontend only includes canvases where `ownerId` is not the current user.
3. User searches by canvas name or owner username.
4. User can filter the shared list to a specific owner.

## Open Canvas

1. User double-clicks a canvas in the dashboard.
   User can also click the right-side arrow button on a canvas row.
2. `Whiteboard` mounts and opens:
   - HTTP `GET /api/canvases/{canvas_id}` for name/owner metadata.
   - WebSocket `/ws/canvases/{canvas_id}` for realtime state.
3. Backend verifies session and membership.
4. WebSocket sends `snapshot` with current canvas state, revision, active users, and history status.

## Navigate Canvas

1. Whiteboard renders an SVG viewport centered on canvas coordinate `0,0`.
2. User scrolls over the canvas to zoom in or out around the cursor.
3. User middle-button drags anywhere to pan the viewport.
4. Pan and zoom are local viewport state only; they do not create canvas history entries or affect other editors.

## Rename Canvas In Whiteboard

1. Owner clicks the canvas title in the whiteboard header.
2. Title becomes an inline text input styled as the header title.
3. Blur or Enter commits the new name through `PATCH /api/canvases/{canvas_id}`.
4. Escape cancels local edits.
5. Non-owners see the title but cannot edit it.

## Draw Shape

1. User chooses `Rect`, `Ellipse`, or `Line`.
2. Pointer down creates a local draft.
3. Pointer move mutates the local draft only.
4. Pointer up sends a `create_shape` history entry.
5. Backend validates the operation, locks the canvas row, applies it, derives inverse operation, inserts `canvas_ops` and `canvas_history`, increments revision, and broadcasts `op_applied`.

## Select, Move, Or Resize Shapes

1. With the select tool active, user left-drags on the canvas background to draw a selection rectangle.
2. Pointer up selects every intersecting unlocked shape. If any grouped shape intersects, all shapes in that shape's active/top group are selected together.
3. A single unlocked selected shape shows resize handles. Pointer down on a handle starts resize.
4. Background left-drag is reserved for box selection; left-dragging an unlocked shape moves that shape.
5. A selected group can be dragged as a unit by pointer down on one of its grouped shapes or on empty space inside the combined group bounding box.
6. During resize or group drag, frontend applies optimistic local preview and sends throttled `preview_op` messages. Group drag previews use a `batch` operation so remote editors see every grouped member move together before pointer up.
7. Revision does not increment during previews.
8. Pointer up sends one durable history entry. Single resize uses `update_shape`; group move uses `batch`.
9. Backend persists that operation and increments revision once.

## Edit Text

1. User creates or double-clicks a text shape.
2. Inline `<textarea>` appears inside the SVG via `foreignObject`.
3. Text is local while typing.
4. Blur, Escape, Tab, or Cmd/Ctrl+Enter commits a single `update_shape` operation.
5. Backend treats the text update as one undoable operation.

## Change Style

1. User selects one or more unlocked shapes.
2. Toolbar syncs only values shared by every relevant selected shape.
3. Color input changes commit immediately.
4. Opacity, stroke width, and text size sliders update toolbar state while dragging and commit on pointer/key release.
5. Style updates apply to every selected unlocked shape. One shape uses `update_shape`; multiple shapes use `batch`.
6. Selecting a grouped shape leaves style controls editable as future drawing defaults, but does not apply style changes to grouped members because groups are locked.

## Paint Bucket

1. User chooses the paint bucket tool.
2. User clicks a shape to apply the current fill color and fill opacity to that shape.
3. User clicks the canvas background to set `canvas.state.backgroundColor` to the current fill color.
4. Bucket actions are undoable history entries and do not switch back to the select tool or select the clicked shape.

## Reorder Or Delete

1. User right-clicks a shape.
2. Context menu offers:
   - Bring to front
   - Bring forward
   - Send backward
   - Send to back
   - Group or Ungroup when applicable
   - Delete
3. Reorder sends `reorder_shape`; delete sends `delete_shape`.
4. Both are undoable server-history entries.

## Group Or Ungroup Shapes

1. User box-selects two or more selection units. A unit can be one unlocked shape or one already grouped object.
2. User right-clicks one selected shape, or empty space inside the combined selection bounds, and chooses Group.
3. Frontend sends one undoable `batch` operation that appends a new parent id to each selected shape's `groupIds` stack. Existing child groups keep their earlier stack entries, so groups can be nested.
4. The group shows one combined bounding box. Individual members cannot be selected, resized, text-edited, bucket-filled, or styled while grouped.
5. After grouping, selection resolves to the new top group. The same reconciliation runs after remote operations and undo/redo, so a shape another editor just grouped cannot remain selected as an editable child.
6. User can drag a selected group as one unit from any grouped shape or from empty space inside the combined group bounding box.
7. User right-clicks the selected group and chooses Ungroup.
8. Frontend sends one undoable `batch` operation that removes only the active/top id from each selected shape's `groupIds` stack. Any child group underneath remains grouped.
9. Mixed selections that include a grouped unit can be used to create a parent group, but grouped members remain locked from style, text, bucket, resize, and delete operations.

## Undo And Redo

1. User clicks toolbar undo/redo or uses keyboard shortcuts.
2. Frontend sends WebSocket message `{ type: "undo" }` or `{ type: "redo" }`.
3. Backend selects the latest active/undone row in `canvas_history`, applies its inverse/forward op, updates history state, inserts `canvas_ops`, increments revision, and broadcasts `op_applied`.
4. Every connected editor receives the same undo/redo result.

## Share Canvas

1. User opens share modal from board header.
2. Frontend loads `GET /api/canvases/{canvas_id}/members`.
3. Owner enters username or email and submits.
4. Backend requires owner, finds user, inserts `canvas_members`.
5. Modal updates member list.

## Remove Access

1. Owner clicks `Remove` for a member.
2. Backend requires owner and prevents removing owner.
3. Backend deletes `canvas_members` row.
4. `CanvasRoomManager.remove_user_access` sends `access_removed` to live sockets for that user and closes them.
5. Removed user sees access message and no longer receives updates.

## Logout

1. User clicks `Log out`.
2. Frontend calls `POST /api/auth/logout`.
3. Backend deletes the session if present and clears the cookie even if the session row is already gone.
4. Frontend clears user state and returns to auth.
