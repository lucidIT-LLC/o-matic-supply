# Compliance posture — o-MATIC Firm

## The short version

**This repository makes no compliance claim.** It distributes MCP connectors.

Unlike the o-MATIC skill marketplaces, this pack **does** execute code and
**does** handle credentials — see `SECURITY.md`. What it does not do is make any
compliance assertion about doing so. A connector that writes to a WordPress site
or calls a remote o-MATIC Server is not itself a compliance control, and
installing it changes nothing about the compliance posture of a factory.

That is accuracy, not modesty. Compliance properties belong to the system that
handles data — the **o-MATIC Server** and the **o-MATIC Factory** on it.

- Content it reads and writes is **your** WordPress content. Do not point these
  connectors at a system holding PHI without a review that says you may.
- Credentials are operator-supplied or authorized through the host's OAuth/SSO
  flow; none ship here.
- Each connector connects only to the service endpoint the operator configures.

**The trust boundary is the o-MATIC Server**, not this repository.

## Where the real claims live, and their ceiling

Compliance status is tracked in the System 5 compliance register, which records a
**truth status** per control — MISSING / DESIGNED / BUILT / LIVE / EVIDENCED /
ASSESSED — with the evidence that advanced it. Public language is capped by that
status:

| Truth status | What may be said publicly |
|---|---|
| MISSING / DESIGNED / BUILT | **Nothing.** |
| LIVE | The specific measured mechanism, nothing more. |
| EVIDENCED | The "designed to support HIPAA Security Rule safeguards" formulation. |
| ASSESSED | Only what the assessment letter permits, quoted. |

**Forbidden at every rung:** "HIPAA certified" (no such certification exists),
"HITRUST certified" before a validated assessment, and "compliant" as an
unqualified adjective.

Ask for the current register rather than inferring status from any document,
including this one.
