# Team Assistant / Microsoft 365 (Cursor method card)

Equipment, not staff. This card is the condensed Cursor method for `microsoft-365@o-matic-supply` (Team Assistant MCP over Microsoft Graph).

## What it is

- MCP server id: `team-assistant`
- Entry: `dist/index.mjs` via `bin/launch.sh` (GUI-safe Node resolution)
- Surfaces: Planner (including Goals), Teams (read), SharePoint Lists (read/write by internal column name), OneNote (rich HTML)
- Auth: per-tenant Entra app + delegated device-code; OS keychain token storage

## How to work

1. Confirm the connector can start and the operator has signed in. Do not invent tenant/client IDs or tokens.
2. Call only tools the live host lists. Prefer measured Graph results over inferred org state.
3. Planner work starts from goals when goals exist; do not claim Premium Planner / Dataverse ("Project") — out of scope for this plugin.
4. SharePoint writes use internal column names; verify list schema before mutating.
5. OneNote is delegated-only by Graph design — no application-permission tier exists.

## Cursor host rules (prompt substitutes for missing Claude hooks)

- Prefer the installed marketplace MCP tools as the full tool surface when Cursor loads them.
- Discover tools live on this host before naming them. Use Cursor tools that exist here (for example Read, Write, StrReplace, Glob, Grep, Shell, Task) or MCP tool names returned by the live connector / o-MATIC Server. Never invent Claude Code tool names (Edit, NotebookEdit, and the like).
- Fan-out: at most three specialists in flight for one ask; name owners and stop conditions; do not spawn unbounded parallel work.
- If an o-MATIC Server MCP connection is configured: call `startup` with a stable `conversation_key` before factory claims; render the card's `state`; never invent READY, DEGRADED, or BLOCKED.
- GrokBot is a separate, undefined product surface in this pack — do not claim a GrokBot binding or runtime from these instructions.
