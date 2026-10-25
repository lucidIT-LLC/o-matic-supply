# Cursor 4.7 — install o-MATIC Supply (WordPress & Elementor)

Supply is **tools, not people**. This plugin ships MCP connectors only. Studio specialists (Brandy, Carver, Monet, Jo, Andy) who *use* these tools ship separately in `lucidIT-LLC/o-matic-studio`.

## Primary path (marketplace plugin)

1. Add this repository as a Cursor plugin marketplace (GitHub: `lucidIT-LLC/o-matic-supply`).
2. Install the `wordpress` plugin. It declares `.cursor-plugin/plugin.json` with `"mcpServers": "./mcp.json"` — two stdio servers: `o-matic-wordpress-connector` and `o-matic-elementor-connector`.
3. Configure each site via the connector tools (`wordpress_factory_configure` / `elementor_factory_configure`). Prefer Application Password via env or macOS Keychain reference — not plaintext in project files.
4. Prefer live MCP tools returned by the host. Fall back to `adapters/cursor/wordpress.md` and `adapters/cursor/elementor.md` for condensed method cards and Cursor host rules.

## Prompt substitutes (Claude hooks are absent on Cursor)

Every `adapters/cursor/*.md` card repeats: discover tools live, never invent Claude tool names, fan-out ≤3 specialists, `startup` + `conversation_key` when o-MATIC Server MCP is present, GrokBot undefined.

## Compatibility

**MCP-host full operation only** (rule #284). A Cursor session that cannot spawn stdio MCP servers cannot use this pack — that is expected for a connector pack.
