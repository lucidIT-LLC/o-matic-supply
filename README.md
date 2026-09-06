<p align="center">
  <img src=".github/brand/omatic-wordmark.png" width="240" alt="o-MATIC" />
</p>

<p align="center">
  Built by <a href="https://o-matic.ai">o-MATIC</a>, the AI research division of <a href="https://lucidit.io">lucidIT, LLC</a>.
</p>

# o-MATIC Supply

**Tools, not people.**

You don't go to a hardware store for a marketing manager, and you don't hire a
person when what you need is a wrench. o-MATIC Supply is where the equipment
lives.

| Plugin | What you get |
|---|---|
| `wordpress@o-matic-supply` | The **WordPress** and **Elementor** MCP connectors — site and content operations, Elementor page building, template and theme work, media handling, and a sandboxed export/import path. |
| `slate@o-matic-supply` | The narrow **Slate API** connector — versioned canvases, conflict-safe saves, restores, and bounded assets through a deployed O-Matic Server. |

## This pack ships MCP servers — and that is the point

Every other o-MATIC marketplace ships **skills only**, deliberately, because a
plugin declaring an `mcpServers` block is omitted by hosted-marketplace hosts.

Supply is the exception, because a connector *without* an MCP server is nothing.

**Compatibility tier (rule #284): MCP-host full operation only.** A host that
cannot spawn an MCP server cannot use this pack. That is expected, not a defect.

This split is why Supply exists. These connectors used to be bundled in the same
plugin as Brandy, Carver, Monet and Jo — so restricted hosts omitted the whole
thing and lost **four people** along with two tools. The people now ship
separately in **o-MATIC Studio**, which installs anywhere.

## The other doors

- **o-MATIC Agency** — staff who *run* the factory: Probot, Fred, Data
- **o-MATIC Firm** — expertise you *retain*: Smith, Tim, Rimmer, Jake
- **o-MATIC Studio** — people who *design and build*: Brandy, Carver, Monet, Jo, Pixel
- **o-MATIC Supply** — *tools*: WordPress and Elementor connectors

Studio and Supply are designed to be used together: Carver and Monet do the work,
these connectors are what they reach for.

## Install

```
/plugin marketplace add lucidIT-LLC/o-matic-supply
/plugin install wordpress@o-matic-supply
```

Configure the connection with `wordpress_factory_configure` before use, and read
`wordpress_factory_usage_guide` for the current capability summary. Forwarded
upstream tools are namespaced `wp__` and `elementor__`; never call unprefixed
upstream names through the connector.

Slate is installed only after the matching O-Matic Server release is deployed.
It accepts its server URL, host-held bearer token, and exact granted connection
from the host environment; it does not put server credentials in a browser or
project file. Call `slate_api_status` after installation to verify that the
remote server publishes the complete Slate surface.

## Security

**Unlike the skill marketplaces, this pack executes code and handles
credentials.** Read `SECURITY.md` before deploying it. In short: credentials are
supplied by the host and stored per project, never committed here; TLS relaxation
is restricted to loopback; and the connector is the only component in the o-MATIC
estate that talks to a third-party system on your behalf.

## License

MIT. See `LICENSE`.
