# o-MATIC Server Copilot MCP package — structure citations

**o-MATIC name: connector.** Microsoft admin UI / upload docs still say
“plugin,” and the app-manifest array is still `agentConnectors` (Microsoft:
that schema id stays even though the installable package is called a plugin).
This package is a **remote MCP connector**, not a declarative agent.
No `copilotAgents`, no `declarativeAgent.json`, no `instructions.txt`, no
conversation starters, no persona.

## Portability (works across supported Copilot hosts)

Not a Cowork-only package:

- `OAuthPluginVault` — Copilot Chat requires OAuth; `None` works in Cowork only
  and is refused by our validator
- **Dynamic tool discovery** (0.1.7+, Jimmy) — omit `mcpToolDescription` so the
  host calls live `tools/list`; ai-plugin source uses `functions: []` and
  `run_for_functions: ["*"]`
- Connector-only (`agentConnectors`, no `copilotAgents`, no `agentSkills`) — any
  host that can use a governed connector can attach it; it is not locked to one
  declarative-agent persona

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

## Package shape (connector-only, dynamic discovery)

Per
[Build plugins for Copilot Cowork](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-plugin-development)
— **Connector only (no custom skills)** — and
[Dynamic tool discovery](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery):

```
omatic-server-<version>-mcp.zip
├── manifest.json      # agentConnectors only — no mcpToolDescription, no agentSkills
├── color.png          # 192×192
└── outline.png        # 32×32
```

`mcp-tools.json` is **not** shipped. `ai-plugin.json` stays in-repo as build/validation
source (`functions: []`, `run_for_functions: ["*"]`) and is not in the zip.

## Remote MCP registration

Per
[Configure remote MCP servers for Microsoft 365 Copilot plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/configure-plugin-mcp-servers):

- Register the server in root-level `agentConnectors[]`
- Use `toolSource.remoteMcpServer` (this is the Microsoft 365 app manifest
  path, **not** the MCP plugin manifest used for declarative-agent actions)
- `mcpServerUrl` must be HTTPS
- Auth: `OAuthPluginVault` with `referenceId` (Entra SSO registration id;
  secrets never in the package)
- **Omit** `mcpToolDescription` so the host resolves tools from live `tools/list`

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
| `spec.mcp_tool_description` | **omitted** (dynamic discovery) |
| `functions: []` + `run_for_functions: ["*"]` | no packaged tool file; host uses `tools/list` |
| `namespace: omaticserver` | connector `id: omaticserver` |

`package/ai-plugin.json` is retained in-repo as the RemoteMCPServer source of
truth for apply-config / validate. It is **not** referenced by a declarative
agent and is **not** in the upload zip.

## Real-validator lint (hard-won)

Offline `atk validate --manifest-file` and required-field checks can pass
packages that Microsoft's upload validator still rejects. This repo also lints:

1. Dynamic discovery shape: empty `functions`, `run_for_functions: ["*"]`, no
   `mcpToolDescription` / `mcp_tool_description`
2. Naming / description length limits and “MCP Connector” rename
3. No `.svg` files inside the upload zip (SVG suspected; unproven — we keep
   SVGs as sources, render PNGs into the zip)

## Icons

Backbone mark (Jimmy approved 2026-11-06, Brandy + Monet). SVG sources in
`icons/`; build renders `color.png` (192×192) and `outline.png` (32×32).
