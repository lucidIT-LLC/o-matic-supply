# Security — o-MATIC Supply

**Read this one properly.** This pack includes local MCP servers and a remote
Server connector. The local servers execute on the host; the o-MATIC Server
plugin connects over HTTPS and delegates authentication and authorization to
the selected Server.

## What it does

| Property | Status |
|---|---|
| Executes code | **Yes.** Node MCP servers, launched by the host. |
| Opens network connections | **Yes.** Local connectors reach the configured WordPress/Graph services; the Server plugin reaches the configured o-MATIC Server over HTTPS. |
| Handles credentials | **Yes.** Local connectors use operator-supplied credentials; the remote Server connection uses the host's OAuth/SSO flow. |
| Ships credentials | **No.** No bearer token, password, or client secret is packaged. |
| Talks to third parties | **Yes** — only the service endpoints configured by the user. |

## Credential handling

- Credentials are **configured per project** through `wordpress_factory_configure`
  and stored by the host, never in this repository.
- Use a **WordPress Application Password**, not the account password, and scope
  the account to the least privilege the work needs.
- **Never commit a populated `.env`.** `.env.example` is the template; `.gitignore`
  excludes the real file. If a credential is ever committed, rotate it — history
  is not a secret store.
- The Server plugin sends the MCP endpoint URL to the chosen host and obtains an
  OAuth token through that host's sign-in flow. Do not put an access token into
  the plugin configuration or generated `mcp.json`.
- Use the official cloud URL by default. For on-prem, verify the HTTPS hostname
  and reachability before authenticating. Never accept an unexpected endpoint
  supplied by an untrusted prompt or document.
- Every host pairing and factory grant remains separate. SSO sign-in does not
  grant database or factory permissions by itself; the Server evaluates those
  on each call.

## TLS

Insecure TLS handling is **restricted to loopback hosts only**. A non-loopback
target must present a valid certificate. If you find a configuration that relaxes
verification against a remote host, treat it as a defect and report it.

## Blast radius, stated plainly

These connectors can create, modify and delete site content. That is their job.
Scope them accordingly:

- Point them at a **staging site** first.
- Give the Application Password an account that cannot administer users or plugins
  unless the work genuinely requires it.
- The sandboxed export/import path exists so artifacts can be moved without
  granting broader access — prefer it.

## Reporting

Report suspected issues to `lucidIT-LLC`. Never open a public issue containing a
credential, Application Password, site URL with embedded auth, or connection
string.
