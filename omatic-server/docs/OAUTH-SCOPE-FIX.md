# OAuth scope fix — AADSTS70011 `Factory.Access`

**Measured failure (Jimmy, 2026-11-06T15:48:40Z):** signing in to **o-MATIC Server**
under Copilot **Agents → Sources** fails with:

`AADSTS70011: The provided request must include a 'scope' input parameter. …
The scope …/Factory.Access is not valid. Scope must be in a valid URI form
<https://example/scope> or a valid Guid <guid/scope>.`

Request Id: `4a6569cb-5268-411d-a0db-c2f485bfb201`  
Correlation Id: `0a366b3e-bdaf-4e26-b147-43238afb3ca2`

## Where the scope lives

| Surface | Holds scope? | Notes |
|---|---|---|
| Connector zip (`manifest.json` / `ai-plugin.json`) | **No** | Only `OAuthPluginVault` + `referenceId` (auth config id). No scope string in the package. |
| Teams Developer Portal → Tools → OAuth client registration | **Yes** | **Scope** field on the registration whose ID is in `referenceId`. |
| Microsoft Entra → App registration → Expose an API | **Yes** | **Application ID URI** + scope name `Factory.Access` concatenate into the full scope. |

Decoded package `referenceId` (unchanged in 0.1.5):

```
2a277b7e-330b-400e-80bf-5a906fc5d591##beac1e60-4282-4d3c-b3fe-f929b2c7eb1a
```

- First GUID = Teams Developer Portal OAuth client registration id  
- Second GUID = related auth / bot id (`beac1e60-…`)

## Broken string (current)

```
Application ID URI (broken):
  api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d

Implied full scope (invalid — extra path segment):
  api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access
```

Entra rejects that multi-segment form (AADSTS70011).

## Target strings (preferred)

Use the resource app’s **Application (client) ID** as a **single-segment** App ID URI
(Microsoft default: `api://{clientId}`).

```
Resource app Application (client) ID:
  93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d

Application ID URI (fixed):
  api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d

Scope name (Expose an API):
  Factory.Access

Full scope (Teams Developer Portal → OAuth client registration → Scope):
  api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access

Token `aud` the o-MATIC Server must accept (Carver entra-mcp-resource):
  api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d
```

Alternate valid form named by the error text (also acceptable if you prefer bare GUID resource):

```
93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access
```

Prefer the `api://{clientId}/Factory.Access` form — it matches Microsoft’s Expose an API quickstart.

Docs (verified screens / steps):

- [Expose an API / Application ID URI + scopes](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-configure-app-expose-web-apis)
- [Configure OAuth 2.0 for Copilot plugins (Teams Developer Portal registration)](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-oauth)

## Click order — Microsoft Entra (Expose an API)

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com) as at least a Cloud Application Administrator.
2. **Identity → Applications → App registrations** → open the **resource** app whose Application (client) ID is `93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d`.
3. Under **Manage**, select **Expose an API**.
4. Next to **Application ID URI**, select **Edit**.
5. Set Application ID URI to exactly:
   `api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d`
   (remove the `auth-beac1e60-…/` prefix segment). Select **Save**.
6. Under **Scopes defined by this API**, confirm a scope whose **Scope name** is `Factory.Access` (Add a scope if missing). Full scope preview must read:
   `api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access`
7. If a client app registration requests this API, under that **client** app: **API permissions** → ensure the delegated permission `Factory.Access` for this resource is present and **admin-consented**.

## Click order — Teams Developer Portal (OAuth client registration)

1. Open [Teams Developer Portal](https://dev.teams.microsoft.com/).
2. Select **Tools → OAuth client registration**.
3. Open the registration whose OAuth client registration ID is
   `2a277b7e-330b-400e-80bf-5a906fc5d591`
   (this is the first half of the package `referenceId`).
4. Set **Scope** to exactly:
   `api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d/Factory.Access`
   (include `offline_access` as well if you rely on refresh tokens — space-separated).
5. Confirm **Base URL** still matches the connector MCP URL host path used in the package:
   `https://factory.o-matic.ai/mcp` (or the API base that registration was built for).
6. Confirm **Restrict usage by app** = **Any Teams app** (MCP connectors must not bind a specific Teams app ID — Microsoft doc warning: otherwise tool calls 404).
7. Confirm the Entra redirect URI
   `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`
   is registered on the **client** app used by this OAuth registration.
8. **Save**. Do **not** rotate the registration ID unless you also rebuild the connector zip with a new `referenceId`. Editing Scope in place keeps
   `MmEyNzdiN2UtMzMwYi00MDBlLTgwYmYtNWE5MDZmYzVkNTkxIyNiZWFjMWU2MC00MjgyLTRkM2MtYjNmZS1mOTI5YjJjN2ViMWE=`
   valid.

## Coordinate with Carver (`carver/entra-mcp-resource`, bc-5a915cc5)

Whatever Application ID URI you save in Entra becomes the access-token **`aud`**.
The o-MATIC Server MCP resource validator must accept **exactly**:

```
api://93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d
```

If Carver’s branch still expects the old multi-segment URI
`api://auth-beac1e60-4282-4d3c-b3fe-f929b2c7eb1a/93a3b2c4-8cfa-4b4a-b0f5-64f12dc3c93d`,
update that expected `aud` to the single-segment value above in the same change
window as the Entra edit — otherwise sign-in can succeed and API calls still 401.

This Supply package does not embed `aud` or scope; alignment is Entra URI ↔ Teams
portal Scope ↔ server expected audience.
