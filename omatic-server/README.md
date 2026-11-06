# o-MATIC Server — Microsoft 365 Copilot MCP connector

**Plugin / MCP connection only.** Not a declarative agent, not a persona, not
Probot. Product name: **o-MATIC Server**. Namespace: `omaticserver`.

This Supply package builds the zip an M365 admin uploads so Copilot can call
eight pinned read-only tools on `https://factory.o-matic.ai/mcp` with Entra SSO.

## What ships

| Item | Value |
|---|---|
| App id | `6799c907-19f2-49a8-826c-4473bc645d59` |
| Connector id / namespace | `omaticserver` |
| MCP URL | `https://factory.o-matic.ai/mcp` |
| Auth | `OAuthPluginVault` (Entra SSO registration `referenceId`, byte-identical to the hand-built package) |
| Tools | `connections_list`, `omatic_guide`, `search`, `task_relationships`, `task_duplicate_check`, `slate_entity_search`, `slate_entity_verify`, `module_status` |
| Mark | **Backbone** (Jimmy approved 2026-11-06; Brandy + Monet) |

No `declarativeAgent`, no instructions, no conversation starters.

## Build

Requires Node 20+ and `rsvg-convert` (`librsvg2-bin`).

```bash
cd omatic-server
npm run build
```

Produces:

- `dist/omatic-server-<version>-mcp.zip`
- `dist/omatic-server-<version>-mcp.zip.sha256`
- `dist/omatic-server-<version>-mcp.zip.json` (sidecar with hashes)

`npm run validate` runs schema checks, `atk validate --manifest-file`, and the
real-validator lint (function descriptions required; no `confirmation.type:
None`; no `.svg` in the zip).

Icons are rendered from committed SVG sources on every build:

- `icons/source.svg` → `icons/color.png` (192×192)
- `icons/outline-source.svg` → `icons/outline.png` (32×32)

## Admin-center upload

1. Sign in to the Microsoft 365 admin center
2. **Agents → Tools → Registry**
3. **Upload** the zip from `dist/`
4. Review components → **Next**
5. Scope users → **Install**

Doc:
https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-plugins-skills-mcp-servers

Structural citations: [`docs/STRUCTURE.md`](docs/STRUCTURE.md).

## Layout

```
omatic-server/
├── package/
│   ├── manifest.json      # Teams/M365 app manifest 1.30 + agentConnectors.remoteMcpServer
│   ├── ai-plugin.json     # RemoteMCPServer + run_for_functions source of truth (not an agent)
│   └── mcp-tools.json     # pinned tools/list descriptions
├── icons/
│   ├── source.svg         # Backbone color (canonical)
│   ├── outline-source.svg # Backbone outline (canonical)
│   ├── color.png          # rendered 192×192
│   ├── outline.png        # rendered 32×32
│   └── NOTE.md            # Brandy concept note
├── scripts/
│   ├── render-icons.mjs
│   ├── validate.mjs
│   └── build.mjs
├── docs/STRUCTURE.md
└── dist/                  # built zip + sha256
```
