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
