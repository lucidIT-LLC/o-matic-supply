# Cursor 4.7 — install o-MATIC Supply (Microsoft 365 / Team Assistant)

Supply is **tools, not people**. This plugin ships the Team Assistant MCP connector only.

## Primary path (marketplace plugin)

1. Add this repository as a Cursor plugin marketplace (GitHub: `lucidIT-LLC/o-matic-supply`).
2. Install the `microsoft-365` plugin. It declares `.cursor-plugin/plugin.json` with `"mcpServers": "./mcp.json"` — stdio server `team-assistant` via `bin/launch.sh`.
3. Provide an Entra app registration the operator controls (tenant ID + client ID). Sign-in is **delegated device-code** only — every call acts as the signed-in user; credentials never leave the host.
4. Prefer live MCP tools. Fall back to `adapters/cursor/team-assistant.md` for the condensed method card and Cursor host rules.

## Prompt substitutes (Claude hooks are absent on Cursor)

The method card repeats: discover tools live, never invent Claude tool names, fan-out ≤3 specialists, `startup` + `conversation_key` when o-MATIC Server MCP is present, GrokBot undefined.

## MCP launch (Cursor)

Cursor expands `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` in `mcp.json` (`command`, `args`, `env`, `cwd`). It does **not** expand Agent Plugins `${PLUGIN_ROOT}` — a literal cwd makes the host report `spawn … ENOENT`. This pack's Cursor `mcp.json` uses `${CURSOR_PLUGIN_ROOT}` and runs `bin/*-launch.sh` directly (GUI-safe Node resolution).

## Compatibility

**MCP-host full operation only** (rule #284). Premium Planner / Dataverse ("Project") is deliberately out of scope — a separate plugin.
