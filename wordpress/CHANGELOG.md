# Changelog

## 1.2.1 — 2026-08-07

- Both connectors' plugin.json `mcpServers` return to `command: "node"` with direct `server/*.mjs` entries. The `/bin/sh` + `bin/omatic-wp-launch.sh` form is refused by the claude.ai marketplace ingest (same class as omatic-server-connection 3.5.1), which silently pinned Claude Desktop at 1.1.1. The shell launcher remains in `bin/` for `.mcpb`-style packaging.

All notable changes to the O-Matic WordPress Factory plugin are documented here.

## 1.2.0 - 2026-08-04

### Fixed
- **The Codex manifest registered zero servers.** `.mcp.json` declared its
  servers under `mcp_servers`; hosts read `mcpServers`. The wrong key is not an
  error — it is an empty object, so both connectors were silently absent with
  nothing in any log to say so. This is why installing the plugin produced
  nothing a desktop host could use.

- **Both connectors declared `"command": "node"`**, which works in every
  terminal-launched host and fails in every GUI-launched one: a GUI app inherits
  the minimal system PATH, so a bare interpreter name is unresolvable and the
  server is never spawned (KB-0418 defect A). The manifests now spawn
  `/bin/sh bin/omatic-wp-launch.sh <entry> <label>`. The launcher resolves an
  interpreter from `OMATIC_NODE`, PATH, and the absolute locations a GUI host
  cannot see, then execs the real connector unchanged.

### Added
- `bin/omatic-wp-launch.sh` and `bin/omatic-wp-degraded-server.sh`, ported from
  omatic-server-connection 3.3.0. With no usable runtime the launcher execs a
  dependency-free POSIX-sh MCP server that completes the handshake and publishes
  `omatic_wp_runtime_status`, whose description names the cause. A connector that
  cannot start now says so instead of appearing unconfigured.
- `OMATIC_FORCE_NO_RUNTIME=1` exercises advisory mode on a working machine.

### Verified
- `version-align` exit 0 across 7 declared sources and 3 catalogs.
- Both connectors boot through the launcher and report 1.2.0.
- Both fall back to advisory mode under `OMATIC_FORCE_NO_RUNTIME=1`, returning
  `1.2.0-advisory` and exactly one tool.

### Known gaps
- POSIX hosts only. Windows has no `/bin/sh` and is not claimed (rule #284).
- The desktop host does not expose arbitrary env to plugin servers, so
  `OMATIC_WP_*` overrides stay unexpanded there. Not fatal — the connectors read
  `.omatic/wordpress-factory.json` — but env-only configuration will not work on
  that host.
- No `.mcpb` bundle yet; desktop-extension packaging remains open.


## 1.1.1 — 2026-08-02

### Fixed
- **Codex operators were shown version 1.0.2 while the catalog said 1.1.0.**
  `.codex-plugin/plugin.json` and `agent-pack.json` were never bumped with the
  1.1.0 release, and the rule #287 alignment gate reported `aligned ✅` because
  neither file was declared in `scripts/version-sources.json` — a gate only
  checks what someone remembered to list. The Codex plugin page read 1.0.2
  accurately; the metadata was wrong, not the display. Both files now carry the
  real version, and all six version sources agree.

### Changed
- **The alignment gate now fails on undeclared version sources (check `g`).** Any
  file matching a well-known manifest name that carries a `version` key but is
  absent from `version-sources.json` is a hard failure. This is what closes the
  hole rather than the value: four other plugins carried an undeclared
  `.codex-plugin/plugin.json` that happened to be correct, which is luck, not a
  control. All are now declared.

## 1.0.1 — 2026-06-15

### Fixed
- **MCP protocol version handshake.** The WordPress and Elementor connectors
  announced MCP protocol version `2025-03-26`, which current WordPress/Elementor
  MCP adapters reject with `HTTP 400 Unsupported protocol version` (supported:
  `2025-11-25`, `2025-06-18`, `2024-11-05`). Forwarded `wp__` / `elementor__`
  tools could not enumerate as a result; REST authentication was unaffected.
  The default is now `2025-06-18`, a server-supported revision. Changed in:
  - `server/lib/mcp-connector.mjs` — `DEFAULT_PROTOCOL_VERSION`
  - `.claude-plugin/plugin.json` — `MCP_PROTOCOL_VERSION` env for both connectors
  - `MCP_PROTOCOL_VERSION` env still overrides the default for site-specific needs.

## 1.0.0

- Initial release: bundled brand, build, writing, and visual skills plus
  configurable WordPress and Elementor MCP connectors.
