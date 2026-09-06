# o-MATIC Supply — Slate API

This package is the narrow MCP adapter for a **deployed** O-Matic Server that
publishes Slate Phase 1. It exposes only six server-owned operations:

- create and open a canvas;
- append a revision with optimistic concurrency;
- restore a prior revision by creating a new head;
- upload or read one bounded asset (5 MiB maximum).

The adapter is intentionally not a second canvas database. The O-Matic Server
remains the only authority for authentication, factory grants, tenant isolation,
history, assets, and audit records. The bearer token is read from the launching
host's environment and is never written to a project file, browser bundle, log,
or response.

## Requirements

- Node.js 20 or newer;
- an O-Matic Server updated with the Slate Phase 1 migration and tool release;
- an authenticated server token whose client was granted the selected factory.

## Host configuration

| Variable | Required | Meaning |
|---|---:|---|
| `OMATIC_SERVER_URL` | yes | O-Matic Server HTTPS MCP endpoint, normally ending in `/mcp`. HTTP is accepted only for loopback development. |
| `OMATIC_SERVER_TOKEN` | yes | Host-held bearer token. Do not place this in a repository, browser app, or canvas. |
| `OMATIC_SLATE_CONNECTION` | yes | Exact granted O-Matic Server connection name. The connector refuses caller substitution. |

After installation, call `slate_api_status`. It confirms the remote server has
published the complete Slate tool set without revealing the token.

## Browser boundary

This is an LLM/MCP connector. A browser must use a separate authenticated
application session or a server-side adapter; it must never call this connector
with a copied server token. Local-only Slate documents remain local until an
explicit server-side save path is enabled.

## License

Business Source License 1.1 (BUSL). See the repository root [LICENSE.md](../LICENSE.md). Converts to Apache License, Version 2.0 on 2030-09-05.
