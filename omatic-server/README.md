# o-MATIC Server MCP Connector — Microsoft 365 Copilot

**This is a connector**, not an agent and not a persona. Display name:
**o-MATIC Server MCP Connector**. Connector id / namespace: `omaticserver`.
Never branded Probot (Probot is already a separate marketplace listing).

Microsoft's admin center still calls the uploadable zip a “plugin,” and the
app-manifest schema field is still named `agentConnectors` — Microsoft's own
docs say that name stays even though the installable package is called a
plugin. In o-MATIC language: **connector**. What ships is connection config to
a remote MCP server; no declarative agent, no instructions, no conversation
starters.

**0.1.7** defaults to plug-and-play on `https://factory.o-matic.ai/mcp` with
Entra SSO and **dynamic tool discovery** (live `tools/list` — Jimmy confirmed
2026-11-07; not a curated subset, not a pinned `mcp-tools.json` zip). Custom
factory / MCP URLs are first-class at **build** time (`OMATIC_MCP_URL` — see
[`docs/CUSTOM-MCP.md`](docs/CUSTOM-MCP.md)); Microsoft's schema pins
`mcpServerUrl` in the zip (no runtime URL field).

## What ships

| Item | Value |
|---|---|
| Version | **0.1.7** |
| Display name | **o-MATIC Server MCP Connector** |
| App id | `6799c907-19f2-49a8-826c-4473bc645d59` |
| Connector id / namespace | `omaticserver` |
| Default MCP URL | `https://factory.o-matic.ai/mcp` |
| Custom MCP | Rebuild with `OMATIC_MCP_URL` + `OMATIC_OAUTH_REFERENCE_ID` ([`docs/CUSTOM-MCP.md`](docs/CUSTOM-MCP.md)) |
| Auth | `OAuthPluginVault` (Entra SSO registration `referenceId`). Scope is **not** in the zip — Teams Portal **Microsoft Entra SSO client ID registration**; see [`docs/OAUTH-SCOPE-FIX.md`](docs/OAUTH-SCOPE-FIX.md). |
| Tools | **Dynamic discovery** — omit `mcpToolDescription`; ai-plugin `functions: []` + `run_for_functions: ["*"]` so Copilot uses live `tools/list` for **all** tools. See [dynamic tool discovery](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery). |
| Mark | **Backbone** (Jimmy approved 2026-11-06; Brandy + Monet) |
| Guidelines | [`docs/GUIDELINES-CHECKLIST-0.1.7.md`](docs/GUIDELINES-CHECKLIST-0.1.7.md) |

## Works across Copilot hosts (not Cowork-only)

Portability choices, from Microsoft's connector docs:

| Choice | Why |
|---|---|
| `agentConnectors[].toolSource.remoteMcpServer` | Documented connector registration for hosts that support remote MCP — not a declarative-agent action |
| `authorization.type: OAuthPluginVault` | Required for Copilot Chat; Cowork alone also allows `None`, which we deliberately reject |
| Dynamic discovery (omit `mcpToolDescription`) | Host calls live `tools/list` so every tool the server exposes is available (Jimmy 2026-11-07) |
| Manifest `1.30` | Current Teams/M365 app schema that carries `agentConnectors` |
| No `copilotAgents` / no skills | Connector-only package — usable wherever connectors are governed, not locked to one agent persona |

Docs:
[Configure remote MCP servers for Microsoft 365 Copilot plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/configure-plugin-mcp-servers)
·
[Dynamic tool discovery for plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery)
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

`npm run validate` checks Teams/plugin required fields, dynamic-discovery
shape (`functions: []`, `run_for_functions: ["*"]`, no `mcpToolDescription`),
`atk validate --manifest-file`, and icons.

Icons are rendered from committed SVG sources on every build:

- `icons/source.svg` → `icons/color.png` (192×192)
- `icons/outline-source.svg` → `icons/outline.png` (32×32)

## Admin-center Upload / Update

Jimmy already has **0.1.5** installed as Available:

1. Sign in to the Microsoft 365 admin center
2. **Agents → Tools → Registry** (search **o-MATIC Server MCP Connector** / `omaticserver`)
3. Open the package → **Update** (or **Upload** if replacing)
4. Choose `dist/omatic-server-0.1.7-mcp.zip`
5. Review components (MCP URL; tools resolve from live `tools/list`) → scope users → finish

First-time install: Registry → **Upload** → Install / scope users.

Doc:
https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-plugins-skills-mcp-servers

**Do not merge this Supply PR until Jimmy approves after trying Update.**

Structural citations: [`docs/STRUCTURE.md`](docs/STRUCTURE.md). Changelog: [`docs/CHANGELOG-0.1.7.md`](docs/CHANGELOG-0.1.7.md).

## Layout

```
omatic-server/
├── package/
│   ├── config.json        # defaults (URL, names, referenceId, discoveryMode) — env overrides at build
│   ├── manifest.json      # Teams/M365 app manifest 1.30 + agentConnectors.remoteMcpServer (no mcpToolDescription)
│   ├── ai-plugin.json     # RemoteMCPServer: functions=[], run_for_functions=["*"] (build-time source; not in zip)
│   └── mcp-tools.json     # historical pin only — NOT shipped in 0.1.7+ zip
├── icons/
│   ├── source.svg         # Backbone color (canonical)
│   ├── outline-source.svg # Backbone outline (canonical)
│   ├── color.png          # rendered 192×192
│   ├── outline.png        # rendered 32×32
│   └── NOTE.md            # Brandy concept note
├── scripts/
│   ├── apply-config.mjs
│   ├── render-icons.mjs
│   ├── validate.mjs
│   └── build.mjs
├── docs/
└── dist/                  # built zip + sha256
```
