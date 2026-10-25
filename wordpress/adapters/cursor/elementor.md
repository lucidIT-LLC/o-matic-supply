# Elementor connector (Cursor method card)

Equipment, not staff. This card is the condensed Cursor method for the **Elementor** MCP connector inside `wordpress@o-matic-supply`. Elementor is **not** a separate marketplace plugin — it is the second stdio server in `wordpress`.

## What it is

- MCP server id: `o-matic-elementor-connector`
- Bundle: `dist/elementor.mjs` (launched via `bin/omatic-wp-launch.sh`)
- Upstream tools are forwarded as `elementor__…`
- Typical site path: `/wp-json/mcp/emcp-tools-server`

## How to work

1. Configure via `elementor_factory_configure` / check with `elementor_factory_status`. Same credential discipline as WordPress (env or Keychain reference).
2. Activate one profile at a time; verify live status before writes.
3. Call only tools the live host lists under the Elementor connector. Prefer `elementor__` namespaced tools; never invent bare upstream names.
4. For page/template work: read the target before writing; verify readback from the same profile.
5. Studio people (Carver, Monet, Brandy, …) use this tool — they are not shipped here.

## Cursor host rules (prompt substitutes for missing Claude hooks)

- Prefer the installed marketplace MCP tools as the full tool surface when Cursor loads them.
- Discover tools live on this host before naming them. Use Cursor tools that exist here (for example Read, Write, StrReplace, Glob, Grep, Shell, Task) or MCP tool names returned by the live connector / o-MATIC Server. Never invent Claude Code tool names (Edit, NotebookEdit, and the like).
- Fan-out: at most three specialists in flight for one ask; name owners and stop conditions; do not spawn unbounded parallel work.
- If an o-MATIC Server MCP connection is configured: call `startup` with a stable `conversation_key` before factory claims; render the card's `state`; never invent READY, DEGRADED, or BLOCKED.
- GrokBot is a separate, undefined product surface in this pack — do not claim a GrokBot binding or runtime from these instructions.
