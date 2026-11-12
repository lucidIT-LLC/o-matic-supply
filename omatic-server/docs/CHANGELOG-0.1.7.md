# 0.1.7 — 2026-11-07

- **Rename:** display name **o-MATIC Server MCP Connector** (unchanged from 0.1.6 naming).
- **Version:** `0.1.6` → `0.1.7`.
- **Default MCP:** `https://factory.o-matic.ai/mcp` + Entra `OAuthPluginVault` (plug-and-play Install/Update).
- **Custom MCP:** first-class **build-time** via `OMATIC_MCP_URL` + `OMATIC_OAUTH_REFERENCE_ID` (`docs/CUSTOM-MCP.md`). Schema has no runtime URL field.
- **Tools: dynamic discovery** (Jimmy confirmed) — omit `mcpToolDescription` / `mcp_tool_description`; zip ships `manifest.json` + icons only; ai-plugin source uses `functions: []` and `run_for_functions: ["*"]` so Copilot uses live `tools/list` for **all** tools (not a curated subset, not the 0.1.6 pin).
- **Guidelines checklist:** `docs/GUIDELINES-CHECKLIST-0.1.7.md`.
- Jimmy Registry **Update** completed and 0.1.7 is in use (2026-11).

## Prior

See `docs/CHANGELOG-0.1.6.md` for the short-lived full-pin build that preceded this.
