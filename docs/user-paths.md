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

1. Authenticated user enters a canvas name in the dashboard.
2. Frontend calls `POST /api/canvases`.
3. Backend validates the name, inserts `canvases` row with empty state, inserts owner into `canvas_members`, and returns summary.
4. Frontend prepends the new canvas to local dashboard state and opens it.

## Open Canvas

1. User clicks a canvas in the dashboard.
2. `Whiteboard` mounts and opens:
   - HTTP `GET /api/canvases/{canvas_id}` for name/owner metadata.
   - WebSocket `/ws/canvases/{canvas_id}` for realtime state.
3. Backend verifies session and membership.
4. WebSocket sends `snapshot` with current canvas state, revision, active users, and history status.

## Draw Shape

1. User chooses `Rect`, `Ellipse`, or `Line`.
2. Pointer down creates a local draft.
3. Pointer move mutates the local draft only.
4. Pointer up sends a `create_shape` history entry.
5. Backend validates the operation, locks the canvas row, applies it, derives inverse operation, inserts `canvas_ops` and `canvas_history`, increments revision, and broadcasts `op_applied`.

## Move Or Resize Shape

1. User selects a shape.
2. Pointer down on shape starts move; pointer down on handle starts resize.
3. Pointer move applies local updates immediately for smoothness and sends throttled `preview_op` messages.
4. Remote users apply previews transiently.
5. Pointer up sends one durable `update_shape` history entry.
6. Backend persists that single operation and increments revision once.

## Edit Text

1. User creates or double-clicks a text shape.
2. Inline `<textarea>` appears inside the SVG via `foreignObject`.
3. Text is local while typing.
4. Blur, Escape, Tab, or Cmd/Ctrl+Enter commits a single `update_shape` operation.
5. Backend treats the text update as one undoable operation.

## Change Style

1. User selects a shape.
2. Toolbar syncs to selected shape values.
3. Color input changes commit immediately.
4. Opacity, stroke width, and text size sliders update toolbar state while dragging and commit on pointer/key release.
5. Style updates are `update_shape` history entries.

## Reorder Or Delete

1. User right-clicks a shape.
2. Context menu offers:
   - Bring to front
   - Bring forward
   - Send backward
   - Send to back
   - Delete
3. Reorder sends `reorder_shape`; delete sends `delete_shape`.
4. Both are undoable server-history entries.

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
