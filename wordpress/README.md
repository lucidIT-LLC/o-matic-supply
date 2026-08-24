# O-Matic WordPress Factory

Private work-in-progress repository for the O-Matic WordPress Factory plugin.

## Intent

Give small independent website builders a practical factory for WordPress and Elementor work:

- Brandy for brand checks, messaging fit, brand styling, theme selection, brand onboarding, and brand gates
- Carver for code, Python, Java, HTML, React artifacts, plugins, integrations, automation, WordPress, and Elementor implementation
- Jo for writing coaching, writing feedback, business/professional review, voice development, and manuscript-level critique
- Monet for visual structure, diagrams, dashboards, web artifact UI direction, layout thinking, design direction, and static art-object visuals

The plugin packages configurable MCP connector access so each project can point at its own site credentials and MCP endpoints.

## Bundled Skills

Brandy, Carver, Jo, and Monet are the bundled skills in this repository:

```text
skills/wp-factory-brandy/SKILL.md
skills/wp-factory-carver/SKILL.md
skills/jo/SKILL.md
skills/wp-factory-monet/SKILL.md
```

Brandy is the brand creator and guardian. She owns brand voice, messaging, naming, claim discipline, visual brand implications, brand styling passes, theme selection and generation, brand onboarding, and brand gates. For O-Matic work she carries the Factory 2.0 updates: brand locks, authority tiers, no-overclaim doctrine, AO language, compatibility-tier caution, and DB/Brand Book source order. She can apply active-brand colors, typography, contrast, accent use, and fallback fonts to artifacts without importing another company's brand tokens. She can also offer theme families or create a custom theme for unbranded or exploratory artifacts, but themes do not override an active brand source. She stays warm and sharp, not generic-marketing polite.

Carver is polyglot and code-first. WordPress and Elementor are the current delivery surface for this plugin, not the boundary of the role. He owns implementation, debugging, Python, Java, JavaScript, TypeScript, HTML, CSS, shell, SQL, PHP, React/TypeScript artifact builds, unfamiliar-stack ramp-up, scripts, services, integrations, plugins, themes, connector wiring, and verification. The skill keeps his builder personality while adding the archetypes needed for high-detail work: Master Craftsperson, Polyglot Engineer, Build Foreman, Adapter Engineer, Inspector, Systems Joiner, and Responsible Builder.

Jo is the exact Writing Coach skill from the O-Matic Consulting Pack. She coaches writing without ghostwriting: deep reads, quick reads, collection/manuscript patterns, craft coaching, business/professional review, and voice development. The pen stays in the writer's hand.

Monet is the visual systems skill. He owns diagrams, charts, dashboards, IA maps, web artifact UI direction, layout direction, source-backed visual explanations, and static design artifacts. Art Object Mode adds the useful canvas-design baseline: create a visual philosophy first, embed a subtle conceptual thread, keep text sparse and visual-first, communicate through composition, and take a second refinement pass for margins, containment, spacing, hierarchy, and polish. Web Artifact Design Mode adds React/Tailwind/shadcn visual direction, component hierarchy, responsive QA, and anti-slop guidance while Carver owns implementation and bundling. These modes do not replace Monet's factual discipline for diagrams and dashboards.

The skills are packaged for Codex through `.codex-plugin/plugin.json` and referenced for Claude-oriented plugin use through `.claude-plugin/plugin.json`. Generic hosts can still load the same `SKILL.md` files as prompt/runtime instruction files.

Bundled skills use version-aware sync semantics. Run `npm run skills:sync` to install missing skills into `${CODEX_HOME:-~/.codex}/skills` or update older installed copies. The script skips installed skills that are already the same version or newer. Use `npm run skills:check` for a non-mutating audit.

## Current Scope

This build provides two separate stdio MCP connectors:

- `o-matic-wordpress-connector` forwards a project's WordPress MCP tools with a `wp__` prefix.
- `o-matic-elementor-connector` forwards a project's Elementor MCP tools with an `elementor__` prefix.

Each connector has its own setup tools, environment variables, endpoint path, upstream MCP session, and project-local factory information file.

## Requirements

Create a WordPress Application Password from `wp-admin -> Users -> Edit User`. WordPress REST API requests use HTTPS Basic Auth with the username and Application Password.

Default MCP endpoints:

```text
WordPress:  /wp-json/mcp/mcp-adapter-default-server
Elementor:  /wp-json/mcp/emcp-tools-server
```

Override the path during setup when a project uses a different WordPress or Elementor MCP endpoint.

The connectors discover the target site's REST API root during verification. This matters for WordPress 7.0 and older installs alike because WordPress supports both pretty-permalink REST roots such as `/wp-json/` and fallback roots such as `/?rest_route=/`.

## Setup Flow

1. Install or point your host at this plugin's MCP servers.
2. Start the MCP servers in a project with `OMATIC_PROJECT_ROOT` set to that project root.
3. Put Application Passwords in environment variables before setup. This avoids sending secrets as normal tool arguments when the host supports env configuration.

```sh
export WP_CLIENT_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx'
export ELEMENTOR_CLIENT_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx'
```

4. Configure WordPress:

```json
{
  "site_url": "https://example.com",
  "username": "admin",
  "application_password_env": "WP_CLIENT_APP_PASSWORD",
  "mcp_path": "/wp-json/mcp/mcp-adapter-default-server",
  "verify_mcp": true
}
```

Call this payload through `wordpress_factory_configure`.
The WordPress connector checks the upstream MCP tool surface by default and stores a redacted capability summary plus cached tool schemas. WordPress MCP endpoints vary by site and plugin, so this summary is descriptive instead of requiring one fixed tool set.

5. Configure Elementor:

```json
{
  "site_url": "https://example.com",
  "username": "admin",
  "application_password_env": "ELEMENTOR_CLIENT_APP_PASSWORD",
  "mcp_path": "/wp-json/mcp/emcp-tools-server",
  "verify_mcp": true
}
```

Call this payload through `elementor_factory_configure`.
The Elementor connector checks the upstream MCP tool surface by default and stores cached tool schemas. It expects core Elementor MCP coverage for schema discovery, page building, and page inventory/export. Template, theme-builder, and dynamic-tag tools are reported when available.

6. Check status:

```json
{ "verify": true }
```

Use `wordpress_factory_status` and `elementor_factory_status`.
For a live Elementor MCP capability check, call `elementor_factory_status` with:

```json
{ "verify_mcp": true }
```

7. List tools. Forwarded tools appear as `wp__...` and `elementor__...`.

The connectors prefer cached upstream tool schemas from the stored profile during `tools/list`. That keeps host startup and routine tool refreshes from blocking on a live WordPress site. Use `wordpress_factory_refresh_tools` or `elementor_factory_refresh_tools` after changing a site's MCP plugins or endpoint.

When using multiple stored profiles in one connector process, call `wordpress_factory_activate_profile` or `elementor_factory_activate_profile` before forwarded tool calls. Environment-based configuration takes precedence over stored profiles and cannot be switched at runtime.

## LLM Usage Guidance

Both connectors tell the host how to use them through MCP initialization instructions and built-in usage-guide tools:

```text
wordpress_factory_usage_guide
elementor_factory_usage_guide
wordpress_factory_refresh_tools
elementor_factory_refresh_tools
wordpress_factory_activate_profile
elementor_factory_activate_profile
```

Agents should call the relevant usage-guide tool before choosing forwarded site tools. The guide explains the forwarded prefix, setup/status/profile tools, current redacted profile, stored capability summary, and safe workflow rules. This exists because MCP tool lists alone are often not enough for an LLM to choose the right sequence or avoid guessing parameters.

## Factory Information

By default the connectors store project connection profiles at:

```text
<OMATIC_PROJECT_ROOT>/.omatic/wordpress-factory.json
<OMATIC_PROJECT_ROOT>/.omatic/elementor-factory.json
```

Files are written with `0600` permissions. The connectors also write `.omatic/.gitignore` entries for their factory files and temporary writes. These files contain Application Passwords, so do not commit them.

When verification is enabled, each profile stores the discovered `restApiRoot`, detected `wordpressVersion` when the site exposes it, and `lastVerifiedAt`. The connector uses that REST root for forwarded MCP calls, so sites without pretty permalinks can use the `?rest_route=/...` form automatically.

Direct `application_password` setup is supported for local emergencies, but hosts may log normal MCP tool arguments. Prefer `application_password_env` for real projects. HTTPS is required except for loopback development hosts such as `localhost` and `127.0.0.1`.

You can bypass stored factory information and configure from environment variables instead:

```sh
OMATIC_WP_URL=https://example.com
OMATIC_WP_USERNAME=admin
OMATIC_WP_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx'
OMATIC_WP_MCP_PATH=/wp-json/mcp/mcp-adapter-default-server
OMATIC_WP_REST_API_ROOT=https://example.com/wp-json/
OMATIC_WP_TIMEOUT_MS=15000

OMATIC_ELEMENTOR_URL=https://example.com
OMATIC_ELEMENTOR_USERNAME=admin
OMATIC_ELEMENTOR_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx'
OMATIC_ELEMENTOR_MCP_PATH=/wp-json/mcp/emcp-tools-server
OMATIC_ELEMENTOR_REST_API_ROOT=https://example.com/wp-json/
OMATIC_ELEMENTOR_TIMEOUT_MS=15000
```

## Host Support

- Codex: `.codex-plugin/plugin.json`, `skills/`, and `.mcp.json`
- Claude Code: `.claude-plugin/plugin.json`, `skills/`, and `config/examples/claude-code.mcp.json`
- Claude Cowork: `config/examples/cowork-mcpb-manifest.json` and `config/examples/cowork-elementor-mcpb-manifest.json`
- Generic MCP hosts: `config/examples/generic-mcp.json`

Both connector servers speak standard stdio MCP and forward to Streamable HTTP MCP endpoints on the target WordPress site.

## Development

```sh
npm run check
npm run skills:check
npm run skills:sync
```

The check command performs syntax checks, connector self-tests, and a stdio MCP smoke test that verifies initialize/tools-list behavior, unknown notification silence, and cached forwarded tool listing without a live WordPress request. Skill sync is separate because it inspects or changes the operator's installed skill root.

## Status

WIP. Keep private until the plugin shape, connector setup, bundled skills, and onboarding flow are ready for release. Brandy, Carver, Jo, and Monet are now bundled.
