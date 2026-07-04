# LiveBoard Knowledge Base

This folder is the source of truth for LiveBoard system behavior. It is written for developers and AI agents that need to understand or change the application without rediscovering every contract from source code.

## Reading Order

1. [System Overview](./system-overview.md)
2. [User Paths](./user-paths.md)
3. [Architecture](./architecture.md)
4. [Backend](./backend.md)
5. [Database](./database.md)
6. [Realtime Collaboration](./realtime-collaboration.md)
7. [Frontend](./frontend.md)
8. [Security](./security.md)
9. [API and WebSocket Contracts](./api-and-websocket-contracts.md)
10. [Operations](./operations.md)
11. [Implementation Blueprint](./implementation-blueprint.md)
12. [Documentation Maintenance](./documentation-maintenance.md)

## Source Ownership

- Product/user-path truth lives in [User Paths](./user-paths.md).
- System shape and dependency direction live in [Architecture](./architecture.md).
- Durable data contracts live in [Database](./database.md).
- HTTP/WebSocket message contracts live in [API and WebSocket Contracts](./api-and-websocket-contracts.md).
- Security invariants live in [Security](./security.md).

When changing code, update the docs in the same change set. The repo includes a Codex skill at `.codex/skills/liveboard-docs` for that workflow.
