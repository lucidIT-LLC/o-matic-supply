# o-MATIC Server — Microsoft 365 Copilot MCP connector

**This is a connector**, not an agent and not a persona. Product name:
**o-MATIC Server**. Connector id / namespace: `omaticserver`. Never branded
Probot (Probot is already a separate marketplace listing).

Microsoft's admin center still calls the uploadable zip a “plugin,” and the
app-manifest schema field is still named `agentConnectors` — Microsoft's own
docs say that name stays even though the installable package is called a
plugin. In o-MATIC language: **connector**. What ships is connection config to
a remote MCP server; no declarative agent, no instructions, no conversation
starters.

This Supply package builds the zip an M365 admin uploads so any supported
Microsoft 365 Copilot experience can call eight pinned read-only tools on
`https://factory.o-matic.ai/mcp` with Entra SSO.

## What ships

| Item | Value |
|---|---|
| App id | `6799c907-19f2-49a8-826c-4473bc645d59` |
| Connector id / namespace | `omaticserver` |
| MCP URL | `https://factory.o-matic.ai/mcp` |
| Auth | `OAuthPluginVault` (Entra SSO registration `referenceId`, byte-identical to the hand-built package) |
| Tools | `connections_list`, `omatic_guide`, `search`, `task_relationships`, `task_duplicate_check`, `slate_entity_search`, `slate_entity_verify`, `module_status` |
| Mark | **Backbone** (Jimmy approved 2026-11-06; Brandy + Monet) |

## Works across Copilot hosts (not Cowork-only)

Portability choices, from Microsoft's connector docs:

| Choice | Why |
|---|---|
| `agentConnectors[].toolSource.remoteMcpServer` | Documented connector registration for hosts that support remote MCP — not a declarative-agent action |
| `authorization.type: OAuthPluginVault` | Required for Copilot Chat; Cowork alone also allows `None`, which we deliberately reject |
| Packaged `mcp-tools.json` via `mcpToolDescription.file` | Copilot Cowork still requires a tool-description file even on manifest 1.29+; pinning also keeps the eight read-only tools stable everywhere |
| Manifest `1.30` | Current Teams/M365 app schema that carries `agentConnectors` |
| No `copilotAgents` / no skills | Connector-only package — usable wherever connectors are governed, not locked to one agent persona |

Doc:
[Configure remote MCP servers for Microsoft 365 Copilot plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/configure-plugin-mcp-servers)
·
[Build plugins for Copilot Cowork](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-plugin-development)
(connector-only shape).

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
