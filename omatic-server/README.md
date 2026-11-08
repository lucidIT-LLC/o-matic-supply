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

**0.1.6** defaults to plug-and-play on `https://factory.o-matic.ai/mcp` with
Entra SSO and the **full** live MCP tool surface. Custom factory / MCP URLs are
first-class at **build** time (`OMATIC_MCP_URL` — see
[`docs/CUSTOM-MCP.md`](docs/CUSTOM-MCP.md)); Microsoft's schema pins
`mcpServerUrl` in the zip (no runtime URL field).

## What ships

| Item | Value |
|---|---|
| Version | **0.1.6** |
| Display name | **o-MATIC Server MCP Connector** |
| App id | `6799c907-19f2-49a8-826c-4473bc645d59` |
| Connector id / namespace | `omaticserver` |
| Default MCP URL | `https://factory.o-matic.ai/mcp` |
| Custom MCP | Rebuild with `OMATIC_MCP_URL` + `OMATIC_OAUTH_REFERENCE_ID` ([`docs/CUSTOM-MCP.md`](docs/CUSTOM-MCP.md)) |
| Auth | `OAuthPluginVault` (Entra SSO registration `referenceId`). Scope is **not** in the zip — Teams Portal **Microsoft Entra SSO client ID registration**; see [`docs/OAUTH-SCOPE-FIX.md`](docs/OAUTH-SCOPE-FIX.md). |
| Tools | **Full** live o-MATIC Server MCP surface (**68** tools pinned — not a curated subset). Writes use `capabilities.confirmation.type=AdaptiveCard`; reads omit confirmation. See [`docs/TOOL-CLASSIFICATION.md`](docs/TOOL-CLASSIFICATION.md). |
| Mark | **Backbone** (Jimmy approved 2026-11-06; Brandy + Monet) |
| Guidelines | [`docs/GUIDELINES-CHECKLIST-0.1.6.md`](docs/GUIDELINES-CHECKLIST-0.1.6.md) |

## Works across Copilot hosts (not Cowork-only)

Portability choices, from Microsoft's connector docs:

| Choice | Why |
|---|---|
| `agentConnectors[].toolSource.remoteMcpServer` | Documented connector registration for hosts that support remote MCP — not a declarative-agent action |
| `authorization.type: OAuthPluginVault` | Required for Copilot Chat; Cowork alone also allows `None`, which we deliberately reject |
| Packaged `mcp-tools.json` via `mcpToolDescription.file` | Copilot Cowork still requires a tool-description file even on manifest 1.29+; pinning keeps the full tool surface stable across hosts |
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

## Admin-center Upload / Update

Jimmy already has **0.1.5** installed as Available:

1. Sign in to the Microsoft 365 admin center
2. **Agents → Tools → Registry** (search **o-MATIC Server MCP Connector** / `omaticserver`)
3. Open the package → **Update** (or **Upload** if replacing)
4. Choose `dist/omatic-server-0.1.6-mcp.zip`
5. Review components (MCP URL + full tool list) → scope users → finish

First-time install: Registry → **Upload** → Install / scope users.

Doc:
https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-plugins-skills-mcp-servers

**Do not merge this Supply PR until Jimmy approves after trying Update.**

Structural citations: [`docs/STRUCTURE.md`](docs/STRUCTURE.md). Changelog: [`docs/CHANGELOG-0.1.6.md`](docs/CHANGELOG-0.1.6.md).

## Layout

```
omatic-server/
├── package/
│   ├── config.json        # defaults (URL, names, referenceId) — env overrides at build
│   ├── manifest.json      # Teams/M365 app manifest 1.30 + agentConnectors.remoteMcpServer
│   ├── ai-plugin.json     # RemoteMCPServer + run_for_functions source of truth (not an agent)
│   └── mcp-tools.json     # full pinned tools/list descriptions
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
