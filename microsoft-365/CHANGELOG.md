# Changelog

## 0.3.2 — 2026-11-06

### Fixed

- **Tools never appeared when Entra IDs were unset.** The server exited 78 before the MCP handshake, so Cursor reported a failed discovery and the chat had no Team Assistant tools. `bin/launch.sh` now stays up in advisory mode and publishes `team_assistant_setup` until `TEAM_ASSISTANT_TENANT_ID` and `TEAM_ASSISTANT_CLIENT_ID` are set. An unexpanded `${...}` placeholder is treated as unset.
- **One Configure for every chat.** `.cursor-plugin/plugin.json` declares those two IDs as plugin variables. Set them once at user scope. Cursor passes them into `mcp.json`, `.mcp.json`, and the Claude manifest, which is the block cloud agents actually launch.

## 0.3.1 — 2026-11-05

### Fixed

- **Cursor MCP spawn `ENOENT`.** Same root as wordpress 1.4.1: `${PLUGIN_ROOT}` cwd was not expanded by Cursor, so `command: "/bin/sh"` failed with `spawn /bin/sh ENOENT`. `mcp.json` now uses `${CURSOR_PLUGIN_ROOT}/bin/launch.sh` with `cwd: "${CURSOR_PLUGIN_ROOT}"`.


## 0.3.0 — 2026-10-25

### Added

- **Cursor 4.7 host packaging.** `.cursor-plugin/plugin.json` (version-aligned with Claude/Codex), Cursor `mcp.json` launching Team Assistant via `bin/launch.sh`, and `adapters/cursor/` (INSTALL + `team-assistant.md` method card).
- Listed in root `.cursor-plugin/marketplace.json` alongside `wordpress`.

### Notes

- Claude and Codex packaging unchanged in behavior; Cursor surface is additive.
- Ships in pack release `supply--v1.4.0` with wordpress `1.4.0`.

## 0.2.2 — prior

See git history / marketplace tip `c66274c` for the previous Team Assistant ship (Planner Goals, Teams, SharePoint, OneNote; delegated device-code).
