# LiveBoard

LiveBoard is a real-time collaborative whiteboard for small teams working through ideas together. It supports shared canvases, account-based access, live cursor presence, shape editing, text editing, undo/redo, and persistent canvas state.

The application is designed for synchronous design reviews and working sessions where a small group, typically two to five people, edits a shared canvas while discussing decisions on a call. Teams can return to a canvas later to review what changed and continue from the saved state.

## Product Overview

LiveBoard provides:

- User accounts with signup, login, logout, and session persistence
- Canvas creation and a dashboard of owned and shared canvases a user can access
- Nested dashboard folders with drag-and-drop organization and sibling reordering
- Invitations by username or email
- Access removal for collaborators
- Real-time collaboration over WebSockets
- Presence indicators and remote cursors
- Rectangles, ellipses, lines, and text elements
- A functionally infinite canvas viewport with zoom, pan, box selection, and remote cursor scaling
- Selection, multi-selection, grouping, nested grouping, movement, resizing, rotation, deletion, color editing, opacity, stroke width, and text size controls
- Inline text editing with wrapping inside text boxes
- Right-click ordering controls for bringing objects forward or sending them backward, plus contextual delete/group actions
- Shared server-backed undo and redo for canvas operations
- Persisted canvas state across sessions

## Deployment Context

LiveBoard is optimized for focused design conversations rather than large public whiteboards. A typical session involves a small group editing at the same time, sometimes working on the same objects while comparing alternatives. The canvas viewport can pan and zoom across an unbounded coordinate space, while persisted canvas state remains a compact set of shapes, groups, background color, and metadata. The system treats text changes as a single completed operation and keeps collaboration centered on the shared canvas state.

## Scope

The application intentionally keeps the core experience focused. It does not include:

- Collaborative character-by-character text editing inside a text box
- Viewer/editor/owner role tiers
- Share-with-link access
- Rich text editing
- Image or file uploads
- Export to PNG, SVG, or PDF
- Version history or named snapshots
- Dedicated mobile or touch-first workflows

## Architecture At A Glance

The project uses a React frontend, FastAPI backend instances, PostgreSQL for durable storage, Redis for cross-server coordination, and WebSockets for real-time canvas updates.

```text
├── client/             # React frontend
├── server/             # FastAPI backend
├── docker-compose.yml  # Local PostgreSQL, Redis, backend, proxy, and frontend services
├── SETUP.md            # Setup and run instructions
└── docs/               # Source-of-truth system documentation
```

See `SETUP.md` for local development instructions and `docs/README.md` for the complete system documentation index.
