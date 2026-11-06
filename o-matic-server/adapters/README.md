# Host setup adapters

The MCP connection is portable. Plugin installation, OAuth sign-in, endpoint
reachability, and startup behavior are still controlled by each host. This
package uses the Agent Plugins 1.0 format where a host supports it, plus small
host overlays where needed. A host that does not install this package can still
connect to the same Server by URL.

| Host surface | Install/connect route | Endpoint and sign-in | Startup behavior |
|---|---|---|---|
| ChatGPT / Codex | Install the Agent Plugin where supported, or add a custom remote MCP server from the host's plugin settings. | Cloud URL is the package default. The host runs OAuth/SSO. On-prem works only when that host can reach the selected HTTPS endpoint. | The bundled `start-factory` skill is available to hosts that load plugin skills. Installation does not invoke it automatically. Add host-level startup instructions for repeat use. |
| GitHub Copilot in VS Code / IDE | Agent Plugins are supported in VS Code and other supported Copilot IDE surfaces; MCP can also be configured in `.vscode/mcp.json` or host settings. | Complete sign-in in the host. Enterprise policy may disable MCP. On-prem must be reachable from the IDE. | Use the skill where surfaced; otherwise use repository or user instructions. MCP server configuration alone does not run startup. |
| GitHub Copilot app / CLI / cloud agent | Plugins are available across these surfaces, but MCP configuration and auth are surface-specific. Use the host's plugin or MCP settings; don't assume a VS Code config applies to GitHub.com. | Cloud/remote agents need a reachable Server URL and host-supported auth. Repository-level or admin policy may apply. A private on-prem Server needs an approved route from the remote agent. | Use the skill or host instructions where supported. Plugin installation is not a guaranteed new-conversation hook. |
| Cursor IDE / Agent | Install the portable Agent Plugin from a marketplace, or configure remote MCP in Cursor. Team distribution uses a team marketplace; admins control access and installation mode. | OAuth is supported for remote Streamable HTTP. Cloud is the default. On-prem requires network reachability from the Cursor surface; private team servers may need team MCP configuration. | The skill can guide startup when loaded. A project/user instruction can call it each chat. Plugin installation by itself does not guarantee startup. |
| Claude Code | Install from the Supply Claude marketplace or add the remote HTTP server with `claude mcp`. The Claude overlay prompts for a Server URL and defaults to cloud. | Claude Code supports remote HTTP and OAuth discovery. Its `userConfig` lets this overlay select an on-prem URL. Claude Code must reach that URL. | The bundled skill guides the call. For a strict session-start call, configure a Claude Code hook or managed instruction separately; the skill alone is not an automatic hook. |
| Claude chat / Desktop / Cowork | Use the host's connector flow or a supported Claude plugin distribution route. Claude Code package support does not prove that every Claude surface installs the same MCP configuration. | Sign in with that host. Cowork connectors run through Anthropic's cloud and therefore require a public endpoint reachable by Anthropic, not an isolated LAN URL. | Use host instructions/routines if available. A connector does not guarantee startup. |
| Grok web | Add an administrator-provisioned or personal custom MCP connector by URL. It does not install Agent Plugins packages. | Grok's connector service must reach the Server over the public internet; private LAN endpoints are not reachable from the hosted connector. Complete the authentication offered by Grok. | Use a saved instruction where available to request startup. Connector installation does not run it at the start of every conversation. |
| Grok Bot | Add the MCP server by URL through Connect apps. The Bot may request approval for a private endpoint or private certificate authority. | The Bot reaches remote MCP services from its cloud infrastructure. A private/on-prem endpoint needs an approved network path. Authenticate within Grok Bot. | Put startup guidance in the Bot's instructions. A connected app does not guarantee startup. |
| xAI API / SDK | Configure the remote MCP URL in the API request. This is a developer integration, not a Supply plugin install. | The service making the request must reach the selected endpoint and handle its auth flow. | The application must invoke `startup` before its factory-dependent work. |

## The startup guarantee

The plugin makes the Server connection and startup workflow easier to distribute.
It cannot force every host to call `startup` on every new conversation. A skill
is guidance that a host may load or invoke; it is not a cross-host lifecycle
hook. Strong repeatability requires a host-level required instruction or a
supported session-start hook configured by that host. Hosts without either
mechanism remain promptable, not guaranteed. A true server-enforced first-call
gate would require an o-MATIC Server change and is outside this connector-only
package.

## Network limits for on-premises Servers

The URL selector chooses an endpoint; it does not create a route into a private
network. Local IDEs may reach an on-prem Server on their configured network.
Cloud-hosted Copilot agents, Claude Cowork, Grok web, and other hosted clients
need a public, trusted HTTPS route or a supported private connectivity feature.
Do not expose an on-prem Server to the public internet just to make a plugin
install appear successful.

## Sources checked 2026-11-06

- [OpenAI Agent Plugins packaging](https://developers.openai.com/plugins/build/plugins) and [OAuth authentication](https://developers.openai.com/plugins/build/auth)
- [GitHub Copilot plugins](https://docs.github.com/en/copilot/concepts/customizations/plugins) and [MCP configuration](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp)
- [Cursor plugins](https://cursor.com/docs/plugins) and [Cursor MCP](https://prod.cursor.com/docs/mcp)
- [Claude Code plugin manifest](https://code.claude.com/docs/en/plugins-reference) and [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Grok Connectors](https://docs.x.ai/grok/connectors), [Grok Bot Connect apps](https://docs.x.ai/grok-bot/computer-and-apps), and [Remote MCP Tools](https://docs.x.ai/developers/tools/remote-mcp)

## Boundary

This package supplies a remote MCP connection and a startup workflow. It does
not grant factories or move Server governance to clients. Server Policies,
SOPs, roster, tasks, memory, audit, embedding, vault, and web-publishing
authority remain Server-owned. Project files and workspace-specific rules stay
in the relevant project because the plugin cannot infer their local scope.
