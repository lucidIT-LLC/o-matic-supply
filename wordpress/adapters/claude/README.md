# Claude Adapter

Claude Code uses:

- Plugin manifest: `.claude-plugin/plugin.json`
- Marketplace index: `.claude-plugin/marketplace.json`
- Skills: `skills/*/SKILL.md`
- MCP servers launched from `server/index.mjs` and `server/elementor.mjs`

Canonical prompts remain in `skills/`. Do not copy behavior into manifests; manifests are packaging metadata only.
