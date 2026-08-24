# Security — o-MATIC Supply

**Read this one properly.** The skill marketplaces are inert text. This pack is
not: it ships Node MCP servers that execute locally and authenticate to a
WordPress site on your behalf.

## What it does

| Property | Status |
|---|---|
| Executes code | **Yes.** Node MCP servers, launched by the host. |
| Opens network connections | **Yes.** To the WordPress/Elementor site you configure. |
| Handles credentials | **Yes.** WordPress Application Passwords, supplied by the operator. |
| Ships credentials | **No.** Nothing is committed here; see `.env.example`. |
| Talks to third parties | **Yes** — your WordPress site, and nothing else. |

## Credential handling

- Credentials are **configured per project** through `wordpress_factory_configure`
  and stored by the host, never in this repository.
- Use a **WordPress Application Password**, not the account password, and scope
  the account to the least privilege the work needs.
- **Never commit a populated `.env`.** `.env.example` is the template; `.gitignore`
  excludes the real file. If a credential is ever committed, rotate it — history
  is not a secret store.

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
