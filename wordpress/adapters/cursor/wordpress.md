# WordPress connector (Cursor method card)

Equipment, not staff. This card is the condensed Cursor method for the **WordPress** MCP connector inside `wordpress@o-matic-supply`. People who design and build with it live in o-MATIC Studio.

## What it is

- MCP server id: `o-matic-wordpress-connector`
- Bundle: `dist/index.mjs` (launched via `bin/omatic-wp-launch.sh`)
- Upstream tools are forwarded as `wp__…`
- Typical site path: `/wp-json/mcp/mcp-adapter-default-server`

## How to work

1. Confirm the connector is configured for this project (`wordpress_factory_status` / configure tools). Do not invent site URLs or Application Passwords.
2. Prefer env or Keychain credential references over plaintext secrets in `.omatic/`.
3. Call only tools the live host lists. Never invent unprefixed upstream WordPress tool names.
4. Name source vs target profiles for migrations; read the target object before writing; read back from the same profile after a write.
5. Keep draft / saved / published outcomes distinct — claim only measured results.

## Cursor host rules (prompt substitutes for missing Claude hooks)

- Prefer the installed marketplace MCP tools as the full tool surface when Cursor loads them.
- Discover tools live on this host before naming them. Use Cursor tools that exist here (for example Read, Write, StrReplace, Glob, Grep, Shell, Task) or MCP tool names returned by the live connector / o-MATIC Server. Never invent Claude Code tool names (Edit, NotebookEdit, and the like).
- Fan-out: at most three specialists in flight for one ask; name owners and stop conditions; do not spawn unbounded parallel work.
- If an o-MATIC Server MCP connection is configured: call `startup` with a stable `conversation_key` before factory claims; render the card's `state`; never invent READY, DEGRADED, or BLOCKED.
- GrokBot is a separate, undefined product surface in this pack — do not claim a GrokBot binding or runtime from these instructions.
