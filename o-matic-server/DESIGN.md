# o-MATIC Server plugin design

**Status:** working design, package version 0.1.0  
**Scope:** connect agent hosts to the existing o-MATIC Server MCP surface.

## Design decision

Ship the o-MATIC Server connection as a remote MCP plugin in o-MATIC Supply.
Use Streamable HTTP over HTTPS and OAuth/SSO, with the cloud MCP URL as the
default. Let the user select an on-premises endpoint in host configuration or
the included configuration helper. Do not bundle a local proxy, database
connection, static bearer token, local password, or second copy of Server
governance.

The package has two pieces:

1. A portable Agent Plugins manifest, MCP connection, and `start-factory` skill.
2. Host overlays and setup notes where installation, URL selection, OAuth, or
   lifecycle behavior differs.

The connection exposes the Server's existing MCP tools. It does not add tool
authority or issue grants.

## Roundtable summary

Three independent implementation and architecture reviewers converged on these
points:

- MCP is the interoperability layer. A host can use the Server by URL even if
  it does not install this plugin format.
- Package installation can distribute MCP configuration and a startup skill,
  but hosts decide when skills load and whether a session-start hook runs.
- Therefore, plugin installation cannot guarantee `startup` on every new
  conversation. Hosts with lifecycle hooks can add a host-specific startup
  gate; other hosts need a required instruction or an explicit startup step.
- A Server-side first-call gate would be the only cross-client enforcement
  point, and it would require a Server change. It is not part of this connector
  package. Do not claim startup is enforced when only the skill is installed.
- OAuth/SSO authenticates the person to a host/Server connection. It does not
  create the selected factory grant. Server-side grant resolution and governance
  remain authoritative.
- A private on-prem endpoint works only when the connecting host can reach it.
  Hosted agents such as Grok web or Claude Cowork may need a publicly reachable
  trusted endpoint or an approved private-network route.

The reviewers were independent code/architecture reviewers, not authenticated
o-MATIC roster agents. Roster-role conclusions are not attributed to Probot,
Fred, Data, or Carver.

## Startup contract

For each conversation that may use factory capabilities:

1. Reconnect and rediscover tools after authentication or permission changes.
2. Call `startup` before factory work and pass the same stable conversation key
   to kernel operations when the host can retain one.
3. If startup returns several grants, select the factory using its returned
   `database` field, then pass the exact returned grant name.
4. Read and report the Server's returned state; do not recompute readiness.
5. If the host cannot preserve a conversation key, report that continuity limit.

The skill documents this sequence. To make it automatic, install a host-level
required instruction or supported session hook separately. Do not encode
factory-specific names, policies, roster, session state, or memory in plugin
files.

## Authority and state placement

| Information | Owner | Reason |
|---|---|---|
| Policies, SOPs, roster, factory grants, tasks, decisions, memory, audit and readiness | o-MATIC Server database | These change per factory and are governed by the Server. |
| OAuth tokens and host pairing | Agent host's auth store and the Server's identity layer | Credentials are per host/user and must not be copied between clients. |
| Server endpoint selection | Host plugin configuration; cloud URL as default | Different clients may reach different Server deployments. Store no secret here. |
| Portable startup sequence | Supply plugin skill | It is repeatable client workflow shared across tools. |
| Required startup enforcement | Host settings/hooks, or a future Server gate | The portable plugin format does not run uniformly on every host. |
| Project files, client-specific rules and local environment context | Relevant workspace/repository | These are local to the project and cannot safely move to a shared Server plugin. |

The plugin can reduce copied connection instructions and repeated startup
procedures. It does not eliminate project files that define local code,
environment boundaries, or client-specific work.

## Does the Server need an update?

No Server update is part of packaging the connection or distributing the
startup skill. The live Foundry startup reported Server 3.0.3 as current and its
existing capabilities as ready. That demonstrates the current Server surface is
available to this authenticated Codex connection; it does not prove every host's
OAuth flow or the public plugin-review flow end to end.

Before claiming first-party OAuth setup is verified in a host, complete a real
user sign-in and call `startup` through that host. If that host's OAuth linking
requirements need MCP tool-level security metadata or a different discovery
contract that the Server does not currently return, scope a separate Server
change. Keep local-auth deprecation as a distinct Server policy and rollout;
this package simply ships no local-password or static-token option.

## Release and rollout

- Supply plugin source is `o-matic-server/` in this checkout.
- Current package edits are not yet available to Supply users through GitHub.
- A Supply update from the remote will include the plugin only after the change
  is committed, pushed, and packaged into the next Supply catalog release.
- Publishing in an individual host's official plugin directory is a separate
  review/submission step from updating the Supply GitHub repository.
- After any host sign-in, refresh MCP discovery before assuming newly granted
  tools or capabilities are visible.

## Unverified

- End-to-end OAuth/SSO sign-in and `startup` in ChatGPT/Codex, Copilot, Cursor,
  Claude, Grok web, and Grok Bot.
- On-prem connectivity from each cloud-hosted product and organization network.
- Host packaging and update behavior for the next Supply release.
- Automatic startup on every chat for any host other than where a separately
  configured and proven startup hook/instruction exists.
