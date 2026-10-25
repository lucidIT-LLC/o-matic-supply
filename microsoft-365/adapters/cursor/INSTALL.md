# Cursor 4.7 — install o-MATIC Supply (Microsoft 365 / Team Assistant)

Supply is **tools, not people**. This plugin ships the Team Assistant MCP connector only.

## Primary path (marketplace plugin)

1. Add this repository as a Cursor plugin marketplace (GitHub: `lucidIT-LLC/o-matic-supply`).
2. Install the `microsoft-365` plugin. It declares `.cursor-plugin/plugin.json` with `"mcpServers": "./mcp.json"` — stdio server `team-assistant` via `bin/launch.sh`.
3. Provide an Entra app registration the operator controls (tenant ID + client ID). Sign-in is **delegated device-code** only — every call acts as the signed-in user; credentials never leave the host.
4. Prefer live MCP tools. Fall back to `adapters/cursor/team-assistant.md` for the condensed method card and Cursor host rules.

## Prompt substitutes (Claude hooks are absent on Cursor)

The method card repeats: discover tools live, never invent Claude tool names, fan-out ≤3 specialists, `startup` + `conversation_key` when o-MATIC Server MCP is present, GrokBot undefined.

## Compatibility

**MCP-host full operation only** (rule #284). Premium Planner / Dataverse ("Project") is deliberately out of scope — a separate plugin.
