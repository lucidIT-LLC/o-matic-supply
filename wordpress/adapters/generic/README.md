# Generic Runtime Adapter

For any chat runtime with a system prompt:

1. Read `agent-pack.json`.
2. Choose a skill from `skills[]`.
3. Load that skill's `canonical_skill`.
4. Use the full `SKILL.md` body as the system/developer instruction.
5. Send the operator task as the first user message.

If the runtime supports tools, expose only tools that match the selected skill's lane. If it does not support tools, the skills still work as prompt-only agents.
