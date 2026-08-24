# Google / Gemini Adapter

For Gemini, Google AI Studio, or Gems:

1. Read `agent-pack.json`.
2. Choose a skill from `skills[]`.
3. Load that skill's `canonical_skill`.
4. Use the full `SKILL.md` body as the system instruction.
5. Send the operator task as the user message.

This is prompt-only unless the runtime also provides an MCP bridge or matching WordPress/Elementor tools.
