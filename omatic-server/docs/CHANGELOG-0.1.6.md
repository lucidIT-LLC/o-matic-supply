# 0.1.6 — 2026-11-07

- **Rename:** display name **o-MATIC Server MCP Connector** (app `name.short` / `name.full`, connector `displayName`, `ai-plugin` `name_for_human`).
- **Version:** `0.1.5` → `0.1.6`.
- **Default MCP:** still `https://factory.o-matic.ai/mcp` + Entra `OAuthPluginVault` (plug-and-play Install/Update).
- **Custom MCP:** first-class **build-time** via `OMATIC_MCP_URL` + `OMATIC_OAUTH_REFERENCE_ID` (`docs/CUSTOM-MCP.md`). Schema has no runtime URL field.
- **Tools:** full live surface retained (**68** tools in `mcp-tools.json` / `ai-plugin` / `run_for_functions`) — not a curated subset (Jimmy 2026-11-07).
- **Guidelines checklist:** `docs/GUIDELINES-CHECKLIST-0.1.6.md`.
- **Do not merge** until Jimmy tries Registry **Update** and approves.
