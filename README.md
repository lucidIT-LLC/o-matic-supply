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
| `o-matic-server@o-matic-supply` | The **o-MATIC Server** remote MCP connector — OAuth/SSO access to the Server's governed tools, with a cloud default, on-prem endpoint setup, and a factory startup skill for hosts that load plugin skills. |

## This pack ships MCP servers — and that is the point

Supply ships locally hosted connectors and remote MCP connections. The o-MATIC
Server plugin is a portable Agent Plugins package for hosts that support that
standard; Claude Code has a native manifest overlay, while Grok and some other
hosts use their custom MCP connection flow. Compatibility is host-specific:
see `o-matic-server/adapters/README.md`.

Supply remains the connector shelf. The people who use these tools ship
separately in **o-MATIC Agency**, **o-MATIC Firm**, and **o-MATIC Studio**.

## The other doors

- **o-MATIC Agency** — staff who *run* the factory: Probot, Fred, Data
- **o-MATIC Firm** — expertise you *retain*: Smith, Jake
- **o-MATIC Studio** — people who *design and build*: Brandy, Carver, Monet, Jo, Pixel
- **o-MATIC Supply** — *tools*: WordPress/Elementor, Microsoft 365, and Server connectors

Studio and Supply are designed to be used together: Carver and Monet do the work,
these connectors are what they reach for.

## Install

```
/plugin marketplace add lucidIT-LLC/o-matic-supply
/plugin install wordpress@o-matic-supply
```

**Cursor:** add `lucidIT-LLC/o-matic-supply` as a plugin marketplace, then
install the connector you need. The o-MATIC Server plugin is remote HTTP MCP;
the local WordPress and Microsoft 365 plugins keep their existing host setup.
See `o-matic-server/SETUP.md` and `o-matic-server/adapters/README.md` for its
cloud/on-prem and cross-host setup. `o-matic-server/DESIGN.md` records the
startup guarantee, authority boundaries, network implications, and release
plan. Current published release baseline:
`supply--v1.4.0`; this working change has not been released.

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

The `start-factory` skill guides hosts that load plugin skills to call Server
`startup` before factory work. Installing the connector does not force every
host to run startup, create grants, or add governance. Hosts without plugin
skills need a host-level startup instruction or the manual startup workflow.

## Security

**This pack executes code and handles credentials.** Read `SECURITY.md` before
deploying it. No credentials ship in the repository. Local connectors retain
their existing credential controls; the remote Server connector uses the host's
OAuth/SSO flow, and the Server enforces its grants on every request.

## License

Business Source License 1.1 (BUSL). See `LICENSE.md`. Converts to Apache License, Version 2.0 on 2030-09-05.
