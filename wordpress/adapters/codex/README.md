# Codex Adapter

Codex uses:

- Plugin manifest: `.codex-plugin/plugin.json`
- Marketplace index: `.agents/plugins/marketplace.json`
- MCP manifest: `.mcp.json`
- Skills: `skills/*/SKILL.md`

The plugin exposes separate WordPress and Elementor MCP connector servers. Bundled skills remain the canonical behavior contracts and are not forked per host.

Install target:

- `o-matic-wordpress-factory@lucidIT-LLC`

After marketplace/plugin updates, reinstall in Codex and start a fresh thread so skills and MCP definitions reload.
