# Microsoft design / schema checklist — 0.1.7

Checked 2026-11-07 against Microsoft Learn (agentConnectors remote MCP, Teams manifest 1.30, plugin validation guidelines, admin Registry upload, **dynamic tool discovery**).

Jimmy confirmed **dynamic discovery** (not pinned curated subset): omit `mcpToolDescription`; `functions: []`; `run_for_functions: ["*"]`.

| # | Requirement | Source | Result |
|---|---|---|---|
| 1 | Register remote MCP under root `agentConnectors[]` with `toolSource.remoteMcpServer` | [Configure remote MCP](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/configure-plugin-mcp-servers) | **PASS** — one connector `omaticserver` |
| 2 | `mcpServerUrl` HTTPS, ≤2048 | Schema `remoteMcpServer` | **PASS** — `https://factory.o-matic.ai/mcp` |
| 3 | Auth `OAuthPluginVault` + `referenceId` (no secrets in zip) | Same + OAuth docs | **PASS** |
| 4 | Teams redirect `…/oAuthRedirect` registered in IdP | [Auth troubleshooting](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-troubleshooting) | **PENDING Jimmy** — portal click, not in zip |
| 5 | Auth-config Base URL matches `mcpServerUrl` | Same | **Operator** — Teams SSO registration |
| 6 | Dynamic discovery: omit `mcpToolDescription` / `mcp_tool_description` | [Dynamic tool discovery](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery) | **PASS** — omitted; zip has no `mcp-tools.json` |
| 7 | Dynamic discovery: `functions: []` + `run_for_functions: ["*"]` | Same | **PASS** — apply-config + validate |
| 8 | Expose **all** tools (Jimmy) — not curated subset | Operator + soft ~10 quality note | **PASS** — live `tools/list` for every tool the server exposes |
| 9 | Soft quality note ~10 tools | Microsoft plugin overview (soft) | **NOTED** — reported in LIMITS; tools kept via discovery |
| 10 | `name.short` ≤30, `name.full` ≤100 | [root.name](https://learn.microsoft.com/en-us/microsoft-365/extensibility/schema/root-name) | **PASS** — short/full include “MCP Connector” |
| 11 | `description.short` ≤80, ≠ full, no URLs in short | [root.description](https://learn.microsoft.com/en-us/microsoft-365/extensibility/schema/root-description) + [validation guidelines](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines) | **PASS** |
| 12 | Connector `displayName` ≤128 | agentConnectors schema | **PASS** — `o-MATIC Server MCP Connector` |
| 13 | Icons color 192×192, outline 32×32, alpha | Cowork / Teams packaging | **PASS** — Backbone (#848) |
| 14 | No declarative agent / no skills in connector-only zip | STRUCTURE.md / Cowork connector-only | **PASS** |
| 15 | Registry Upload/Update path | [Manage plugins / MCP](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-plugins-skills-mcp-servers) | **PASS** — documented |
| 16 | Runtime user-configurable MCP URL in zip | Schema 1.30 | **N/A / GAP** — not in schema; **PASS via build-time** `OMATIC_MCP_URL` (docs/CUSTOM-MCP.md) |
| 17 | `validDomains` includes MCP host | Teams manifest practice | **PASS** — derived from URL host |
| 18 | Avoid instructional / marketing fluff in short descriptions | Validation guidelines | **PASS** — factual short copy |
| 19 | Display name includes **MCP Connector** | Operator rename | **PASS** |

## Gaps (honest)

1. **Entra `oAuthRedirect`** — still a Jimmy portal step; zip cannot fix `RoutingAdded`.
2. **No in-product URL picker** — Microsoft format pins `mcpServerUrl`; custom MCP = rebuild+Update or separate BYO/FCC admin flow.
3. **Cowork vs Chat** — Learn notes Cowork historically wanted a packaged tool file; 0.1.7 follows Jimmy’s dynamic-discovery order. If a specific host still rejects empty functions, capture evidence on Update and decide then.
