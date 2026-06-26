# LiveBoard

LiveBoard is a real-time collaborative whiteboard for small teams working through ideas together. It supports shared canvases, account-based access, live cursor presence, shape editing, text editing, undo/redo, and persistent canvas state.

The application is designed for synchronous design reviews and working sessions where a small group, typically two to five people, edits a shared canvas while discussing decisions on a call. Teams can return to a canvas later to review what changed and continue from the saved state.

## Product Overview

LiveBoard provides:

- User accounts with signup, login, logout, and session persistence
- Canvas creation and a dashboard of canvases a user can access
- Invitations by username or email
- Access removal for collaborators
- Real-time collaboration over WebSockets
- Presence indicators and remote cursors
- Rectangles, ellipses, lines, freehand paths, and text elements
- Selection, movement, resizing, deletion, color editing, opacity, stroke width, and text size controls
- Right-click ordering controls for bringing objects forward or sending them backward
- Undo and redo for canvas operations
- Persisted canvas state across sessions

## Deployment Context

LiveBoard is optimized for focused design conversations rather than large public whiteboards. A typical session involves a small group editing at the same time, sometimes working on the same objects while comparing alternatives. The system treats text changes as a single completed operation and keeps collaboration centered on the shared canvas state.

## Scope

The application intentionally keeps the core experience focused. It does not include:

- Collaborative character-by-character text editing inside a text box
- Viewer/editor/owner role tiers
- Share-with-link access
- Rich text editing
- Image or file uploads
- Canvas zoom, pan, or infinite canvas
- Export to PNG, SVG, or PDF
- Version history or named snapshots
- Dedicated mobile or touch-first workflows

## Architecture At A Glance

The project uses a React frontend, a FastAPI backend, PostgreSQL for durable storage, and WebSockets for real-time canvas updates.

```text
├── client/             # React frontend
├── server/             # FastAPI backend
├── docker-compose.yml  # Local PostgreSQL, backend, and frontend services
├── SETUP.md            # Setup and run instructions
├── Architecture.md     # Detailed architecture notes
└── QandA.md            # Codebase comprehension questions and answers
```

See `SETUP.md` for local development instructions.
