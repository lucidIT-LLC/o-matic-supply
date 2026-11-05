# Changelog

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
