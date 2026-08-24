# O-Matic WordPress Factory Adapters

`agent-pack.json` is the host-neutral manifest.

This package has two layers:

- MCP tool layer: `server/index.mjs` for WordPress and `server/elementor.mjs` for Elementor.
- Skill prompt layer: `skills/*/SKILL.md`, usable as system/developer instructions in any model host.

Full site operation requires the MCP tool layer. Prompt-only hosts can use Brandy, Carver, Jo, and Monet for planning, review, design direction, and implementation guidance, but they cannot read or write WordPress or Elementor unless the host provides an MCP bridge or equivalent tools.

Adapters:

- `codex/` explains Codex plugin and MCP loading.
- `claude/` explains Claude Code plugin loading.
- `cowork/` explains desktop MCP configuration.
- `google/` explains Gemini / Google AI Studio prompt-only use.
- `ollama/` explains Modelfile prompt-only use.
- `generic/` explains any system-prompt runtime.
