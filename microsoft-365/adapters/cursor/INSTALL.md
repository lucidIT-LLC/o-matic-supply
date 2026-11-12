# Cursor 4.7 — install o-MATIC Supply (Microsoft 365 / Team Assistant)

Supply is **tools, not people**. This plugin ships the Team Assistant MCP connector only.

## Primary path (marketplace plugin)

1. Add this repository as a Cursor plugin marketplace (GitHub: `lucidIT-LLC/o-matic-supply`).
2. Install the `microsoft-365` plugin at **User** scope, not project scope. User scope is what loads it in any chat and any project. A project install only exists inside that one repo.
3. Open **Configure** and set `TEAM_ASSISTANT_TENANT_ID` (Directory tenant ID) and `TEAM_ASSISTANT_CLIENT_ID` (Application client ID). Those are not secrets. One user-level Configure applies everywhere. Until both are set, the server stays up and publishes `team_assistant_setup` instead of exiting before tool discovery.
4. Sign-in is **delegated device-code** only — every call acts as the signed-in user; credentials never leave the host. Start a new chat after Configure so the host reloads the server.
4. Prefer live MCP tools. Fall back to `adapters/cursor/team-assistant.md` for the condensed method card and Cursor host rules.

## Prompt substitutes (Claude hooks are absent on Cursor)

The method card repeats: discover tools live, never invent Claude tool names, fan-out ≤3 specialists, `startup` + `conversation_key` when o-MATIC Server MCP is present, GrokBot undefined.

## MCP launch (Cursor)

Cursor expands `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` in `mcp.json` (`command`, `args`, `env`, `cwd`). It does **not** expand Agent Plugins `${PLUGIN_ROOT}` — a literal cwd makes the host report `spawn … ENOENT`. This pack's Cursor `mcp.json` uses `${CURSOR_PLUGIN_ROOT}` and runs `bin/*-launch.sh` directly (GUI-safe Node resolution).

## Compatibility

**MCP-host full operation only** (rule #284). Premium Planner / Dataverse ("Project") is deliberately out of scope — a separate plugin.
