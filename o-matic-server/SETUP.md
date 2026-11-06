# o-MATIC Server setup

The portable Agent Plugins package points to the cloud Server by default:

```text
https://factory.o-matic.ai/mcp
```

The user authenticates with the host's OAuth/SSO flow. The package contains no
bearer token, password, or client secret. Each host establishes its own
authorization and the Server continues to enforce that host's factory grants.
This package has no static bearer or local-password option. Deprecating local
Server authentication itself is a separate Server policy and rollout.

## Choose cloud or on-premises

The Agent Plugins standard does not define a shared installation settings
dialog. Open `setup/index.html` in a browser to choose the cloud endpoint or
check **Use an on-premises Server** and enter the HTTPS MCP URL. The page creates
a portable `mcp.json` configuration for the selected endpoint; import it using
the host's documented MCP configuration flow, then authenticate in that host.

Claude Code has its own plugin configuration prompt for the Server URL. Other
hosts use their own remote MCP setup dialog or config file. See
[`adapters/README.md`](adapters/README.md) for the current host paths.

An on-premises Server must be reachable from the target host, present trusted
HTTPS, expose Streamable HTTP at its MCP URL, and provide working OAuth
discovery and SSO. SaaS-hosted connectors cannot reach an isolated LAN unless
the host provides an approved network path.

## Startup

Use the `start-factory` skill before factory work where the host loads plugin
skills. It calls Server `startup`, selects a granted factory by the returned
database, reads the startup state, and refreshes tools after an auth or tool
discovery change. Hosts that do not load skills need host-specific startup
instructions. Installation alone does not invoke startup on every new chat.
