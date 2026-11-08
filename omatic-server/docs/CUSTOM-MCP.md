# Custom MCP URL (first-class, build-time)

## What Microsoft’s format allows

The Copilot connector zip uses Microsoft 365 app manifest **`agentConnectors[].toolSource.remoteMcpServer`** ([Configure remote MCP servers](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/configure-plugin-mcp-servers)).

| Field | Runtime-editable in Registry UI? | Notes |
|---|---|---|
| `mcpServerUrl` | **No** | Static `https://…` string in the uploaded zip (schema 1.30). |
| `authorization.referenceId` | **No** | Points at a Teams Developer Portal Entra SSO / OAuth registration. |
| Tool list | Packaged file | `mcpToolDescription.file` pins tools; Cowork still requires the file even when dynamic discovery exists on 1.29+. |

There is **no** schema field for an end-user “enter your MCP URL” setting inside this package type. Custom MCP is therefore first-class at **build / re-upload** time (or via Microsoft’s separate admin-published / BYO MCP registration flows, which ask for a tenant-specific URL outside this zip).

## Default (plug-and-play)

Shipped zip defaults:

- URL: `https://factory.o-matic.ai/mcp`
- Auth: `OAuthPluginVault` + Foundry Entra SSO `referenceId`
- Tools: **full** live surface (`mcp-tools.json`, currently **68** tools — not a curated subset)

Install/Update in **Agents → Tools → Registry** — no manual MCP wiring.

## Custom factory / custom HTTPS MCP

Rebuild the zip so `mcpServerUrl` and `referenceId` match **that** server’s Entra SSO registration (Base URL in Teams Portal must match the MCP URL).

```bash
cd omatic-server
OMATIC_MCP_URL='https://YOUR-FACTORY-HOST/mcp' \
OMATIC_OAUTH_REFERENCE_ID='YOUR_TEAMS_SSO_REGISTRATION_ID' \
npm run build
```

Optional: `OMATIC_VERSION=0.1.6` (or next) if you need a distinct version for Update.

Then **Agents → Tools → Registry → Update** (or Upload) the new `dist/omatic-server-<version>-mcp.zip`.

### Also required for a custom host

1. Entra app Web redirects include  
   `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`  
   (and usually `…/oAuthConsentRedirect`).
2. Teams Developer Portal **Microsoft Entra SSO client ID registration** Scope / App ID URI / Base URL match that server.
3. Re-pin tools if that server’s `tools/list` differs from the Foundry 68 — replace `package/mcp-tools.json` and the matching `ai-plugin.json` `functions` / `run_for_functions` before build (validator requires full surface parity across those three).

## Not invented URLs

This repo only ships the measured Foundry URL `https://factory.o-matic.ai/mcp` as the default. Any other URL must be supplied by the operator via `OMATIC_MCP_URL`.
