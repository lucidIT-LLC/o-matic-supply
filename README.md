<p align="center">
  <img src=".github/brand/omatic-wordmark.png" width="240" alt="o-MATIC" />
</p>

<p align="center">
  Built by <a href="https://o-matic.ai">o-MATIC</a>, the AI research division of <a href="https://lucidit.io">LucidIT, LLC</a>.
</p>

# o-MATIC Supply

**Tools, not people.**

You don't go to a hardware store for a marketing manager, and you don't hire a
person when what you need is a wrench. o-MATIC Supply is where the equipment
lives.

| Plugin | What you get |
|---|---|
| `wordpress@o-matic-supply` | The **WordPress** and **Elementor** MCP connectors — site and content operations, Elementor page building, template and theme work, media handling, and a sandboxed export/import path. |
| `microsoft-365@o-matic-supply` | The **Team Assistant** MCP connector — governed read/write access to Microsoft Planner (including Goals), Teams channels, SharePoint Lists, and OneNote over Microsoft Graph, with per-user OAuth device-code sign-in and OS-keychain token storage. |
| `o-matic-server@o-matic-supply` | The **o-MATIC Server** remote MCP connector — OAuth/SSO access to the Server's governed tools, with a cloud default and on-prem endpoint setup. |

## This pack ships MCP servers — and that is the point

Supply ships local MCP connectors and remote MCP connections. The Server
connector uses the portable Agent Plugins format where supported, with
host-specific setup for other clients. See
`o-matic-server/adapters/README.md` for the supported routes and limits.

Supply remains the public connector shelf. Agent distribution is handled by the shared **o-MATIC Project Bot** source repository, which contains a common role design and host-specific packages for Codex, ChatGPT Work, Cursor, Claude, Copilot, and other supported platforms. ChatGPT Work uses the operator's existing Probot Dot with the Project Bot plugin; Codex uses the plugin plus native agent profiles. Install the connector or agent package appropriate to the host. The agent repository defines roles and setup; Supply provides the Server and other MCP connections. Installing a package does not grant Server access.

## Install

```
/plugin marketplace add lucidIT-LLC/o-matic-supply
/plugin install wordpress@o-matic-supply
```

**Cursor Teams and Enterprise:** a team admin can import `lucidIT-LLC/o-matic-supply` as a team marketplace from **Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace → Import from Repo**, then install the connector they need in Cursor Customize. The o-MATIC Server package uses remote HTTP MCP; the local WordPress and Microsoft 365 plugins keep their existing setup. See `o-matic-server/SETUP.md` and `o-matic-server/adapters/README.md` for cloud/on-prem and cross-host details. `o-matic-server/DESIGN.md` records startup limits and authority boundaries. Cursor requires public Marketplace plugins to be open source; this repository's BUSL license is not eligible for public Marketplace submission. The team marketplace route remains available under the configured repository access. Current published release: `supply--v1.5.0`. See [Cursor's plugin guide](https://cursor.com/docs/plugins) and [Marketplace submission page](https://cursor.com/marketplace/publish).

Configure the connection with `wordpress_factory_configure` before use, and read
`wordpress_factory_usage_guide` for the current capability summary. Forwarded
upstream tools are namespaced `wp__` and `elementor__`; never call unprefixed
upstream names through the connector.

Slate is not an o-MATIC Supply product. Per decision #414, it is a free factory
surface built into the o-MATIC Server, not sold or installed from this
marketplace — see the o-MATIC Server distribution for it.

## o-MATIC Server connection

Cloud endpoint: `https://factory.o-matic.ai/mcp`. The user completes OAuth/SSO
in the host. For on-prem, open `o-matic-server/setup/index.html`, check
**Use an on-premises Server**, enter its HTTPS MCP URL, and import the generated
configuration. The selected Server must be reachable from that host and expose
compatible OAuth discovery.

Call Server `startup` before factory work. The Supply package contains the
connector and setup instructions; use the Agency Probot skill or the host's
required startup instruction to run the sequence in each conversation.
Installing the connector does not force every host to run startup, create
grants, or add governance.

## Security

**This pack executes local connectors and manages a remote Server connection.**
Read `SECURITY.md` before deploying it. No credentials ship in the repository;
local connectors keep their existing credential controls and the Server
connection uses host-managed OAuth/SSO.

## License

Business Source License 1.1 (BUSL). See `LICENSE.md`. Converts to Apache License, Version 2.0 on 2030-09-05.
