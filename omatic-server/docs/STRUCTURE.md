# o-MATIC Server Copilot MCP package — structure citations

This package is a **plugin / MCP connector**, not a declarative agent.
No `copilotAgents`, no `declarativeAgent.json`, no `instructions.txt`, no
conversation starters, no persona.

## Upload path (admin center)

Documented click path:

1. Sign in to the Microsoft 365 admin center
2. **Agents → Tools → Registry**
3. **Upload**
4. Upload the built `.zip`
5. Review components (MCP server / tools) → **Next**
6. Scope users → **Install**

Source:
[Manage plugins, skills, and MCP servers in Microsoft 365 admin center](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-plugins-skills-mcp-servers)

That page points packaging authors to Cowork plugin development for the
manifest shape used by Registry upload.

## Package shape (connector-only)

Per
[Build plugins for Copilot Cowork](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-plugin-development)
— **Connector only (no custom skills)**:

```
omatic-server-<version>-mcp.zip
├── manifest.json      # agentConnectors only — no agentSkills, no declarativeAgents
├── color.png          # 192×192
├── outline.png        # 32×32
└── mcp-tools.json     # static tool descriptions for mcpToolDescription.file
```

## Remote MCP registration

Per
[Configure remote MCP servers for Microsoft 365 Copilot plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/configure-plugin-mcp-servers):

- Register the server in root-level `agentConnectors[]`
- Use `toolSource.remoteMcpServer` (this is the Microsoft 365 app manifest
  path, **not** the MCP plugin manifest used for declarative-agent actions)
- `mcpServerUrl` must be HTTPS
- Auth: `OAuthPluginVault` with `referenceId` (Entra SSO registration id;
  secrets never in the package)
- Static pinned tools: `mcpToolDescription.file` → `mcp-tools.json`
  (`tools/list`-shaped JSON)

App manifest schema:
`https://developer.microsoft.com/json-schemas/teams/v1.30/MicrosoftTeams.schema.json`
([schema reference](https://learn.microsoft.com/en-us/microsoft-365/extensibility/schema/?view=m365-app-1.30))

## `ai-plugin.json` (source of truth, not an agent)

The hand-built 0.1.3 package used a declarative-agent + `ai-plugin.json`
`RemoteMCPServer` runtime. This package **removes the agent** and maps the
same runtime facts into `agentConnectors.remoteMcpServer`:

| Hand-built (`ai-plugin.json`) | This package (`manifest.json`) |
|---|---|
| `runtimes[].type: RemoteMCPServer` | `agentConnectors[].toolSource.remoteMcpServer` |
| `auth.type: OAuthPluginVault` | `authorization.type: OAuthPluginVault` |
| `auth.reference_id` (byte-identical) | `authorization.referenceId` (same bytes) |
| `spec.url` | `mcpServerUrl` |
| `spec.mcp_tool_description.file` | `mcpToolDescription.file` |
| `run_for_functions` + `functions[]` | pinned names in `mcp-tools.json` (+ kept in source `ai-plugin.json`) |
| `namespace: omaticserver` | connector `id: omaticserver` |

`package/ai-plugin.json` is retained in-repo as the pinned-function /
`RemoteMCPServer` source of truth and is validated by the real-validator lint
(every function has a description; no `capabilities.confirmation.type: None`).
It is **not** referenced by a declarative agent and is **not** required in the
upload zip for the connector-only shape.

## Real-validator lint (hard-won)

Offline `atk validate --manifest-file` and JSON Schema can pass packages that
Microsoft's upload validator still rejects. This repo also lints:

1. Every `ai-plugin.json` function has a non-empty `description`
2. No `capabilities.confirmation.type` of `None` (omit confirmation for
   read-only tools; only `AdaptiveCard` is allowed when present)
3. No `.svg` files inside the upload zip (SVG suspected; unproven — we keep
   SVGs as sources, render PNGs into the zip)

## Icons

Backbone mark (Jimmy approved 2026-11-06, Brandy + Monet). SVG sources in
`icons/`; build renders `color.png` (192×192) and `outline.png` (32×32).
