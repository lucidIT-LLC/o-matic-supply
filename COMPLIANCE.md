# Compliance posture — o-MATIC Firm

## The short version

**This repository makes no compliance claim.** It distributes MCP connectors.

Unlike the o-MATIC skill marketplaces, this pack **does** execute code and
**does** handle credentials — see `SECURITY.md`. What it does not do is make any
compliance assertion about doing so. A connector that writes to a WordPress site
is not a control, and installing it changes nothing about the compliance posture
of an O-Matic Factory.

That is accuracy, not modesty. Compliance properties belong to the system that
handles data — the **O-Matic Server** and the **O-Matic Factory** on it.

- Content it reads and writes is **your** WordPress content. Do not point these
  connectors at a system holding PHI without a review that says you may.
- Credentials are operator-supplied and host-stored; none ship here.
- It connects only to the site you configure.

**The trust boundary is the O-Matic Server**, not this repository.

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
