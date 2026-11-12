# AADSTS70011 — proven root cause (re-investigated 2026-11-06)

**Failures (Jimmy):** Copilot Settings → Sources → o-MATIC Server sign-in

| When | Request Id | Correlation Id | Timestamp |
|---|---|---|---|
| First | `4a6569cb-5268-411d-a0db-c2f485bfb201` | `0a366b3e-bdaf-4e26-b147-43238afb3ca2` | 2026-11-06T15:48:40Z |
| After App ID URI edit | `4fc0955f-b721-44aa-8226-a2a66eb32d01` | `4384df7f-0f42-4106-a801-16bbf31686dd` | 2026-11-06T16:07:21Z |

Both: `AADSTS70011` — scope `…/Factory.Access` format invalid.

**Earlier Supply guidance was wrong** on two counts: (1) it pointed at **OAuth client registration** (Jimmy correctly uses **Microsoft Entra SSO client ID registration**; the OAuth page is empty); (2) it claimed the portal-generated multi-segment Application ID URI makes `<uri>/Factory.Access` invalid. Live Entra probes show that form is **format-valid**.

---

## Proven: where the scope does / does not come from

### 1) Live MCP server — NOT the source of `Factory.Access`

Fetched 2026-11-06T16:08Z:

```http
GET https://factory.o-matic.ai/.well-known/oauth-protected-resource
→ 200
{
  "resource": "https://factory.o-matic.ai",
  "authorization_servers": ["https://factory.o-matic.ai"],
  "scopes_supported": [
    "factory:about-jimmy", "factory:commons", …,
    "factory:o-matic-foundry", "factory:o-matic-foundry-copilot-ro", …
  ],
  "bearer_methods_supported": ["header"]
}
```

```http
POST https://factory.o-matic.ai/mcp  (no Authorization)
→ 401
WWW-Authenticate: Bearer realm="o-matic",
  resource_metadata="https://factory.o-matic.ai/.well-known/oauth-protected-resource"
```

- No `Factory.Access`.
- No `api://auth-beac1e60-…`.
- AS metadata at `/.well-known/oauth-authorization-server` lists the same `factory:*` scopes (server’s **own** AS for non-Entra clients — irrelevant to Copilot Entra SSO).

### 2) Connector package 0.1.4 / 0.1.5 — NOT the source

`agentConnectors[].toolSource.remoteMcpServer.authorization` is only:

```json
"authorization": {
  "type": "OAuthPluginVault",
  "referenceId": "MmEyNzdiN2UtMzMwYi00MDBlLTgwYmYtNWE5MDZmYzVkNTkxIyNiZWFjMWU2MC00MjgyLTRkM2MtYjNmZS1mOTI5YjJjN2ViMWE="
}
```

Decoded `referenceId`:

```
2a277b7e-330b-400e-80bf-5a906fc5d591##beac1e60-4282-4d3c-b3fe-f929b2c7eb1a
```

No scope, no App ID URI, no `Factory.Access` in the zip. Re-uploading 0.1.5 alone cannot fix AADSTS70011.

### 3) Teams Developer Portal — **this is the source Copilot uses**

Microsoft Learn: [Configure Microsoft Entra SSO authentication](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso)

> Tools → **Microsoft Entra SSO client ID registration**  
> Field **Scope**: “The permissions your plugin requests from Entra.”

Copilot Camp (Cowork SSO lab): [CWRK03](https://microsoft.github.io/copilot-camp/pages/copilot-cowork/03-cowork-plugins-sso/) — paste the **full** scope (`<APPLICATION_ID_URI>/<scopeName>`) into that **Scope** field; the package only stores the SSO registration id as `referenceId`.

**OAuth client registration** being empty is expected for Entra SSO. Do not use that page.

### 4) Entra app `93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d` — scope missing under single-segment URI

Live authorize probes (2026-11-06):

| Scope sent to Entra | Result |
|---|---|
| `api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access` | **No AADSTS70011** (format accepted) |
| `api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access` | **AADSTS65005** — scope `Factory.Access` **does not exist** on the app |
| `api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/access_as_user` | **AADSTS65005** — `access_as_user` also **does not exist** |
| `auth-beac1e60-…/93a3b2c4-…/Factory.Access` (missing `api://`) | **AADSTS70011** (format invalid) |
| `https://factory.o-matic.ai` (resource, no `/permission`) | **AADSTS70011** |
| `api://auth-beac…/93a3b2c4…/` (trailing slash, empty name) | **AADSTS70011** |

So: the portal-generated multi-segment URI is **not** what Entra rejects as format. AADSTS70011 means the **Scope string Copilot actually sends** is malformed (missing `api://`, resource-only URL, trailing slash, quotes, etc.) — **or** the SSO registration **Scope** field was never set to a full valid scope. Changing only Application ID URI (Jimmy’s edit) does not fix a bad/missing **Scope** field; the second failure at 16:07Z matches that.

---

## Correct Microsoft pattern (do this)

Direction of truth for Application ID URI: **Teams SSO registration generates it → you copy it into Entra** — not the reverse, and not inventing `api://{clientId}` in the portal as a “fix” for 70011.

Docs:

- [Configure Microsoft Entra SSO authentication](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso)
- [Copilot Camp CWRK03 – Entra SSO](https://microsoft.github.io/copilot-camp/pages/copilot-cowork/03-cowork-plugins-sso/)
- [Lab E6c – Entra SSO](https://microsoft.github.io/copilot-camp/pages/extend-m365-copilot/06c-add-sso/)

### Exact strings

```
SSO registration id (unchanged; matches package referenceId first half):
  2a277b7e-330b-400e-80bf-5a906fc5d591

Portal-generated Application ID URI (restore if overwritten):
  api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d

Scope name in Entra Expose an API (create if missing — proven missing today):
  Factory.Access
  (Microsoft labs often use access_as_user; either works if Scope field matches)

Full Scope field on the SSO registration (must be exact, no quotes):
  api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access

Token audience Carver must accept:
  api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d

Enterprise token store client to pre-authorize:
  ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b

Redirect URI (Web):
  https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect
```

If the portal still shows a generated Application ID URI that differs from the string above, **use the portal’s current value** everywhere (Entra identifierUris, Scope prefix, server `aud`) — do not invent a different URI.

### Click order — Teams Developer Portal

1. Open [Teams Developer Portal](https://dev.teams.microsoft.com/).
2. **Tools → Microsoft Entra SSO client ID registration** (not OAuth client registration).
3. Open **o-MATIC Server MCP** / auth id `2a277b7e-330b-400e-80bf-5a906fc5d591`.
4. Confirm **Application ID URI** is the portal-generated  
   `api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d`  
   (restore it if it was changed to `api://93a3b2c4-…` alone).
5. Confirm **Base URL** matches the connector MCP URL: `https://factory.o-matic.ai/mcp`.
6. Confirm **Restrict usage by app** = **Any Teams app**.
7. Set **Scope** to exactly:  
   `api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access`  
   (must include `api://`; no wrapping quotes; no trailing slash-only resource).
8. **Save**. Do not rotate the registration id (package `referenceId` stays valid).

Scope edits live in the Enterprise token store. **No connector re-upload is required** for a Scope-only fix. A new sign-in attempt after Save is enough; if Copilot still shows a stale error, sign out of the source and retry.

### Click order — Microsoft Entra (Expose an API)

1. [Entra admin center](https://entra.microsoft.com) → **Identity → Applications → App registrations** → app `93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d`.
2. **Expose an API** → set **Application ID URI** to the **same** portal-generated URI above.  
   If another URI already exists, use the **manifest editor** `identifierUris` array to **add** the portal URI (UI only shows the first URI — [Learn Step 3](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso)).
3. **Add a scope** if missing: name `Factory.Access` (Admins and users, Enabled). Full preview must equal the Scope string in the portal.
4. **Add a client application**: `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b`, authorize `Factory.Access`.
5. **Authentication → Web** redirect URI: `https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect`.
6. Optional but recommended: app manifest `api.requestedAccessTokenVersion` = `2` if the tenant enforces identifier-URI secure patterns ([identifier URI restrictions](https://learn.microsoft.com/en-us/entra/identity-platform/identifier-uri-restrictions)).

### Alternate (only if you deliberately abandon the portal-generated URI)

Not Microsoft’s SSO lab path. Requires creating the missing scope (proven absent today):

```
Application ID URI:  api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d
Scope name:          Factory.Access
SSO Scope field:     api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access
Server aud:          api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d
```

You must still keep the portal registration, Base URL, token-store client, and redirect URI correct. Prefer the portal-generated URI path above.

---

## Package

**No package change required for this auth fix.** Auth is only `referenceId`. 0.1.5 zip remains valid once portal + Entra Scope/URI match. No 0.1.6 rebuild for OAuth.

---

## Carver / o-matic-server (PR https://github.com/lucidIT-LLC/o-matic-server/pull/63)

This Supply agent cannot read that private PR. Write-up for Carver:

1. Copilot Entra SSO tokens use **`aud` = Application ID URI from the SSO registration**, not the MCP URL and not necessarily `api://{clientId}`.
2. Accept at least:

   ```
   api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d
   ```

   Also accept bare client id `93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d` if v2 tokens use it.
3. Do **not** require `aud` to equal `https://factory.o-matic.ai` / `…/mcp` for the Entra SSO path (that resource string is the server’s own RFC 9728 metadata for non-Entra OAuth).
4. Pre-authorized caller: `azp` / `appid` often `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b` (Enterprise token store).
5. Required scope claim: `Factory.Access` (or whatever name Jimmy exposes — keep scp/roles check aligned).
6. Live PRM can keep advertising `factory:*` for the server’s own AS; that is separate from Copilot’s Entra SSO Scope field. No need to publish `Factory.Access` on `/.well-known/oauth-protected-resource` for Copilot Entra SSO to request it.

Align PR 63 expected audiences with the **final** Application ID URI Jimmy saves in Entra (portal-generated string preferred).

---

## `unrecognized_error` after Entra sign-in (2026-11-06T16:43:58Z)

### Proven cause

**Teams platform auth callback / token exchange failed after Entra interactive sign-in succeeded.** The distinctive failure is on `teams.microsoft.com` with `RequestId: RoutingAdded-…` — that is the Teams Enterprise token-store callback path, not the MCP server.

Jimmy’s stated Web redirect list has `oAuthConsentRedirect` + `https://factory.o-matic.ai/entra/callback` and **omits** `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`. Learn’s “token exchange fails” checklist requires that `oAuthRedirect` URI ([troubleshoot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-troubleshooting)); Agents Toolkit records that the platform sends **both** consent and `oAuthRedirect` during Entra SSO ([toolkit PR #15786](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15786)). That documented gap is the cause to clear this popup. Candidate **(c)** is ruled out for this symptom (see table).

**Measured:** Microsoft sign-in passed; then `teams.microsoft.com` popup:

```
Error: 'unrecognized_error'
Timestamp: '2026-11-06T16:43:58.6614969+00:00'
RequestId: 'RoutingAdded-9f3a1dc5-7a94-46e9-9201-d17cddde5744'
```

Earlier between attempts: `AADSTS500011` resource principal
`api://auth-beac1e60-…/93a3b2c4-…` not found in tenant `2a277b7e-330b-400e-80bf-5a906fc5d591`.

### Candidate verdicts

| Candidate | Verdict | Evidence |
|---|---|---|
| **(c) Live MCP rejecting Entra token** | **Not this popup.** Required for the *next* hop. | Popup host is `teams.microsoft.com` during auth callback (`RequestId` prefix `RoutingAdded-`), **before** Copilot calls `/mcp`. Live `POST /mcp` with no/garbage/Entra-shaped Bearer still returns `401 {"error":"unauthorized"}` + `WWW-Authenticate` pointing at factory’s own PRM (`factory:*` scopes) — live **3.0.3 has no Entra resource validator**. That cannot paint a Teams popup mid-redirect. |
| **(b) SSO registration / referenceId** | Package side **OK**; still verify portal fields. | Package `referenceId` decodes `2a277b7e-…##beac1e60-…`; MCP URL `https://factory.o-matic.ai/mcp`; app id `6799c907-…`. **Restrict usage by app = Any Teams app** is correct ([Learn troubleshooting](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-troubleshooting); binding a specific app id → tool-call 404). |
| **(a) Admin consent / token-store** | Possible contributor; not the distinctive string. | Pre-authorize `ab3be6b7-…` is already done. Missing tenant admin consent usually surfaces as **Need admin approval**, not `unrecognized_error` ([OAuth Entra considerations](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-oauth)). Still grant admin consent once. |
| **Missing second Teams redirect URI** | **Highest-evidence fix for post-login Teams failure** | Jimmy listed `oAuthConsentRedirect` + `https://factory.o-matic.ai/entra/callback` but **not** `oAuthRedirect`. Microsoft Agents Toolkit: platform sends **both** `oAuthConsentRedirect` **and** `oAuthRedirect` during Entra SSO ([PR #15786](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15786)). Learn troubleshooting “token exchange fails” requires `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect` ([troubleshoot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-troubleshooting)). Entra SSO article documents consent redirect; both should be present. |
| **AADSTS500011 “tenant = SSO id”** | **Not a bug** — that GUID **is** the Entra tenant | Decoded `referenceId` first half = tenant id (auth-config encoding). Calendar Teams join URLs for james@lucidit.io use `tenantId=2a277b7e-330b-400e-80bf-5a906fc5d591`. 500011 meant the resource principal / identifier URI was not yet visible in that tenant ([AADSTS500011](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/error-code-aadsts500011-resource-principal-not-found)); Jimmy’s Expose-an-API fix cleared interactive Entra sign-in. |

`unrecognized_error` / `RoutingAdded-*` is **not** named on Learn; enable Copilot developer mode for the debug card ([troubleshoot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-troubleshooting)).

### Exact click order — clear `unrecognized_error`

**1. Entra → App `93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d` → Authentication → Web platform**

Add if missing (keep existing ones):

```
https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect
https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect
```

(`https://factory.o-matic.ai/entra/callback` is the server’s browser sign-in callback — fine to keep; it is **not** a substitute for the Teams platform redirects.)

**2. Same app → Expose an API** (confirm still true)

- Application ID URI = `api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d`
- Scope `Factory.Access` enabled
- Authorized client `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b` for `Factory.Access`

**3. Enterprise applications → that app → Permissions**

Grant **admin consent** for the exposed `Factory.Access` / token-store grant if status is not consented.

**4. Teams Developer Portal → Tools → Microsoft Entra SSO client ID registration → `2a277b7e-…`**

Confirm:

| Field | Exact value |
|---|---|
| Application ID URI | `api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d` |
| Scope | `api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access` |
| Base URL | `https://factory.o-matic.ai/mcp` |
| Restrict usage by app | **Any Teams app** |
| Client ID | `93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d` |

Save. Retry Sources sign-in (no package rebuild for these portal/Entra edits).

**5. If popup persists:** Copilot chat → enable developer mode (`-developer on`) → retry → read debug card for Base URL / App ID / referenceId messages from [troubleshoot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-troubleshooting).

### Does PR #63 need merge + deploy?

**Yes — to get past a successful Teams auth into working MCP tool calls.** Not to clear this Teams `unrecognized_error` popup.

Live 3.0.3 still answers every Bearer with `401` + factory-owned `resource_metadata`. Learn Entra SSO Step 4 requires the API to accept the portal Application ID URI as token audience ([Entra SSO](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso)). Until Carver’s entra-resource change is **merged and deployed**, Copilot will obtain an Entra token and then fail calling `https://factory.o-matic.ai/mcp`.
