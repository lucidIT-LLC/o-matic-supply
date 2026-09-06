# Team Assistant MCP

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives an AI assistant
governed read/write access to **a team's actual work** — **Microsoft Planner** (including Goals),
**Teams channels**, **SharePoint Lists**, and **OneNote** (real rich HTML content, not flat text)
— over Microsoft Graph.

Deliberately out of scope: Premium Planner / "Project" (Dataverse) is a different auth audience
and a different backend entirely — a separate plugin, by design, not a gap in this one.

The point is the second verb. Plenty of connectors can *read* a Microsoft 365 tenant; very few
can *act* in one — create the task, update the plan, post to the channel. Reading makes a better
search box. Acting is what makes an assistant.

The assistant acts **as the signed-in person and can do nothing that person cannot do**. It
inherits their conditional access, their MFA and their data boundaries. There is no service
account and no standing tenant-wide access.

Tenant-agnostic, config-driven, TypeScript, stdio transport, no runtime dependencies beyond the
MCP SDK and zod.

---


### A note on the rename

This server was previously called `omatic-m365-mcp`. Nothing about an existing install has to
change:

- **Environment variables.** The `TEAM_ASSISTANT_*` names above are preferred, but every
  `OMATIC_M365_*` equivalent is still read as a fallback. New names win where both are set.
- **Config file.** The new paths are searched first; `./omatic-m365.config.json` and
  `~/.config/omatic-m365-mcp/config.json` are still searched after them.
- **Keychain.** `tokenStoreService` still defaults to `omatic-m365-mcp` **on purpose**. That
  string is the address of your stored refresh token; changing it would orphan the token and
  force a silent re-authentication for no benefit beyond tidiness. Set
  `TEAM_ASSISTANT_TOKEN_SERVICE` if you want to move it deliberately.
- **MCP registration key.** The example above uses `team-assistant`. If your client already
  registers this server under a different key, renaming it changes the tool names your assistant
  sees — so change it when you mean to, not by accident.

---
## Why this exists

Anthropic's stock Microsoft 365 connector **declares no Planner scopes at all.**

Verified 2026-08-20 against the connector's published permission list
(`support.claude.com` article 12542951): the scopes it requests cover Mail, Calendar, Chat,
Channel, OnlineMeeting, Files and Sites — and contain **no `Tasks.*` permission of any kind**.
`Tasks.Read`, `Tasks.ReadWrite`, `Tasks.Read.All` and `Tasks.ReadWrite.All` are all absent.

A token that was never issued a `Tasks.*` scope cannot read a Planner plan, and no amount of
prompting works around it — the failure is at the token, not at the tool. So Planner work is
simply not reachable through the stock connector.

This server requests `Tasks.ReadWrite` explicitly and implements Planner properly: correct ETag
concurrency, correct dictionary delta semantics, and the three-state progress model the Planner
UI actually uses. Teams and SharePoint are included because they are the surfaces a Planner
workflow leans on next, not because they are the point.

---

## Requirements

- Node.js 20.10 or newer
- macOS, for the Keychain token store (see [Token storage](#token-storage))
- An Entra ID (Azure AD) app registration in the target tenant

## Install

```bash
npm install
npm run build
npm test
```

## Entra app registration

Create one app registration per tenant you deploy into.

**Overview blade** — note the two values you will configure:

| Value | Environment variable |
|---|---|
| Directory (tenant) ID | `TEAM_ASSISTANT_TENANT_ID` |
| Application (client) ID | `TEAM_ASSISTANT_CLIENT_ID` |

**Authentication blade**

- Under *Advanced settings*, set **Allow public client flows** to **Yes**.
  The device code grant is a public-client flow; without this, the device code request is
  rejected before a user ever sees a code.
- No redirect URI is needed. Device code does not use one.

**API permissions blade** — add these **delegated** Microsoft Graph permissions:

| Permission | Needed for | Admin consent |
|---|---|---|
| `offline_access` | refresh tokens (so sign-in is once per machine) | no |
| `User.Read` | the signed-in user | no |
| `User.ReadBasic.All` | resolving an email or name to the GUID Planner requires | no |
| `Group.Read.All` | listing plans by group / Team | **yes** |
| `Tasks.ReadWrite` | all Planner read and write | no |
| `Team.ReadBasic.All` | listing joined Teams | **yes** |
| `Channel.ReadBasic.All` | listing channels | **yes** |
| `ChannelMessage.Read.All` | reading channel messages | **yes** |
| `Sites.ReadWrite.All` | SharePoint Lists | **yes** |
| `Notes.Create` | creating OneNote pages | no |
| `Notes.ReadWrite` | reading and appending to existing OneNote pages | no |

Grant admin consent for the tenant. If a client will not consent to the Teams or SharePoint
permissions, drop them from `TEAM_ASSISTANT_SCOPES` — Planner still works with
`offline_access User.Read User.ReadBasic.All Group.Read.All Tasks.ReadWrite`.

OneNote has **no Application-permission tier in Graph at all** — every OneNote permission is
delegated-only, by Microsoft's own design. There is no app-only equivalent to fall back to, unlike
Planner or SharePoint.

Effective permission is always the **intersection** of what the app is granted and what the
signed-in user can do. Delegated `Tasks.ReadWrite` does not let the user touch a plan they are
not a member of.

## Configuration

Configuration is read from the environment first, then from an optional config file. There are
**no defaults for tenant or client ID** — the server fails fast and names what is missing.

| Variable | Required | Default |
|---|---|---|
| `TEAM_ASSISTANT_TENANT_ID` | **yes** | none — never guessed |
| `TEAM_ASSISTANT_CLIENT_ID` | **yes** | none — never guessed |
| `TEAM_ASSISTANT_AUTH_MODE` | no | `device-code` |
| `TEAM_ASSISTANT_SCOPES` | no | the delegated set above |
| `TEAM_ASSISTANT_AUTHORITY_HOST` | no | `https://login.microsoftonline.com` |
| `TEAM_ASSISTANT_GRAPH_BASE_URL` | no | `https://graph.microsoft.com/v1.0` |
| `TEAM_ASSISTANT_TOKEN_SERVICE` | no | `omatic-m365-mcp` — see the rename note below |
| `TEAM_ASSISTANT_CONFIG_FILE` | no | `./team-assistant.config.json`, then `~/.config/team-assistant-mcp/config.json` (pre-rename paths still searched) |
| `TEAM_ASSISTANT_LOG_LEVEL` | no | `info` |

The two cloud URLs exist for sovereign clouds (GCC High, DoD, 21Vianet). Leave them alone
otherwise.

### MCP client config

```json
{
  "mcpServers": {
    "team-assistant": {
      "command": "node",
      "args": ["/absolute/path/to/team-assistant-mcp/dist/index.mjs"],
      "env": {
        "TEAM_ASSISTANT_TENANT_ID": "<directory (tenant) id>",
        "TEAM_ASSISTANT_CLIENT_ID": "<application (client) id>"
      }
    }
  }
}
```

Neither of those values is a secret — they are visible to anyone who can sign in to the tenant.
The actual credential never appears in configuration at all.

## Host support

This server is a plain stdio MCP server — any host that can spawn one can use it. Config examples
for each host live in `config/examples/`:

| Host | Config format | Example |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` (installed via o-MATIC Supply), or project `.mcp.json` | `config/examples/claude-code.mcp.json` |
| Codex | `.codex-plugin/plugin.json` (installed via o-MATIC Supply), or `~/.codex/config.toml` | `config/examples/codex.config.toml` |
| Gemini CLI | `mcpServers` in `settings.json` (project or `~/.gemini/`) | `config/examples/generic-mcp.json` |
| GitHub Copilot (VS Code) | `.vscode/mcp.json`, top-level key `servers` (not `mcpServers`) | `config/examples/vscode.mcp.json` |
| Grok | Unverified as of this writing — no published MCP documentation was found. If xAI ships MCP support, the generic `mcpServers` example is the starting point to try. |  |

Installing the `microsoft-365` plugin from the [o-MATIC Supply](https://github.com/lucidIT-LLC/o-matic-supply)
marketplace (Claude Code or Codex) wires the manifest and launcher for you — the `config/examples/`
files are for a manual/standalone install into any other MCP host.

Every host that reads the MCP `instructions` field the server declares (used by Claude Code) gets
the full in-context tool guide described below under [Teaching the assistant](#teaching-the-assistant).
Whether Gemini CLI, Codex and GitHub Copilot surface that field to the model has not been verified
here — if a host does not, the tool descriptions on each individual tool (also written to be
self-sufficient) are the fallback.

## Teaching the assistant

Installing an MCP server is not the same as an assistant knowing how to use it well. Every tool
here carries a description written to stand on its own, and the server declares an `instructions`
block (in `src/server.ts`) covering the things a caller gets wrong without it: Planner's mandatory
ETag re-read-before-write discipline, the three-state progress model, where Goals sits (real,
plan-level, non-premium — not Viva Goals), that OneNote is delegated-only, and that SharePoint
list fields are internal names, not display labels. The goal is that an assistant using this
server for the first time does not need to be told any of this by the operator — it is already in
the tool surface.

## The two auth models

### `device-code` — implemented

OAuth 2.0 device authorization grant (RFC 8628). The server acts **as the signed-in user**.

Call `m365_sign_in`; it returns a short code and `https://microsoft.com/devicelogin`. The user
enters the code in a browser — on any device — and the server receives a token. `offline_access`
is requested, so the refresh token is stored and sign-in is normally needed **once per machine**.

Use this when:

- The tool should only ever see what the operator can already see.
- Actions should be attributable to a person, and appear in Planner as that person.
- You do not want to ask a tenant admin to consent to application-wide permissions.

Trade-off: everything the tool does is done *as* that user. In an audit log the work is
indistinguishable from the person doing it by hand.

### `client-credentials` — **not implemented** (interface and tests only)

App-only. Every call is made as the application itself, attributable to the app registration
rather than to a person, with no user session to keep alive.

Use this when a client's security review will not accept a tool acting as a named user — which
is the common outcome at any regulated site.

`src/auth/client-credentials.ts` documents exactly what implementing it requires: a certificate
credential from the keyring (not a secret in an env var), the `.default` scope, the `.All`
application permission names, and — importantly — **verification that each Planner operation
actually works app-only in the target tenant**, because app-only Planner support has historically
lagged delegated. Calling it today throws `NOT_IMPLEMENTED` with that pointer, rather than
failing somewhere less obvious.

## Token storage

The refresh token is stored in the **macOS Keychain** via the `security` CLI, under service
`team-assistant-mcp`, account `<tenantId>:<clientId>`.

- Never written to a file.
- Never logged, and never included in an error message — every string leaving the process passes
  through a redaction filter (`src/util/redact.ts`) as defense in depth.
- Behind a `TokenStore` interface (`get` / `set` / `delete`), so a Linux Secret Service or
  Windows Credential Manager backend can be added without touching the auth code.

On a non-macOS host the server degrades to an in-memory store and says so loudly: sign-in is
then required on every restart. That is deliberate — writing a refresh token to disk to avoid a
prompt is the wrong trade.

To remove the stored token: `m365_sign_out`, or delete the `team-assistant-mcp` entry in Keychain
Access.

## Tools

### Auth

| Tool | Purpose |
|---|---|
| `m365_auth_status` | mode, account, token expiry, store backend, scopes, config sources |
| `m365_sign_in` | start the device-code flow; returns the code and URL to show the user |
| `m365_sign_out` | drop the cached token and delete the stored refresh token |

### Planner

| Tool | Purpose |
|---|---|
| `planner_list_plans` | plans by group, or the signed-in user's plans plus their groups |
| `planner_get_plan` | plan + details, including the label names behind `category1..25` |
| `planner_list_buckets` | buckets (columns) in board order |
| `planner_create_bucket` / `planner_rename_bucket` / `planner_delete_bucket` | bucket lifecycle |
| `planner_list_tasks` | tasks by plan, by bucket, or assigned to the signed-in user |
| `planner_get_task` | **the whole card in one call** — task *and* details, names resolved |
| `planner_create_task` | create, including description and checklist in one operation |
| `planner_update_task` | title, progress, dates, priority, bucket, labels, assignments |
| `planner_update_task_details` | description, checklist add/remove/check/uncheck/toggle/rename, references |
| `planner_delete_task` | delete (requires `confirm: true`) |
| `planner_list_goals` | list a plan's Goals-tab goals, each with the task ids linked to it |
| `m365_resolve_user` | email / name / `"me"` → the directory GUID Planner requires |

`planner_list_goals` calls the Graph **beta** endpoint (`/beta/planner/plans/{id}/goals`) — the
Goals feature has no v1.0 equivalent yet. It is a real, ordinary, non-premium Planner feature (the
"Goals" tab on any plan), not Viva Goals and not Dataverse-gated; treat the shape as usable but
less stable than the rest of this server.

### Teams

Read: `teams_list_joined_teams`, `teams_list_channels`, `teams_list_channel_messages`.

Write: `teams_send_channel_message`, `teams_reply_to_message`. Both require `confirm: true` —
a channel post is visible to everyone in the team and cannot be quietly undone, so the gate is
deliberate rather than ceremonial. Prefer replying into an existing thread over starting a new
top-level post; a new post fragments the conversation.

A Team's id is also its Microsoft 365 group id, so it can be passed straight to
`planner_list_plans` as `groupId`.

### SharePoint Lists

`sharepoint_list_lists`, `sharepoint_list_items`, `sharepoint_create_item`,
`sharepoint_update_item`.

Field keys are **internal** column names, not display names. Pass `includeColumns: true` to
`sharepoint_list_items` to see the mapping before writing.

### OneNote

| Tool | Purpose |
|---|---|
| `onenote_list_notebooks` | notebooks visible in a scope (`me`, a user, a group, or a site) |
| `onenote_list_sections` | sections in a notebook |
| `onenote_list_pages` | pages in a section |
| `onenote_search` | find pages by title |
| `onenote_get_page_content` | read a page's HTML |
| `onenote_create_page` | create a page from HTML — colors, styling, tables, inline images and file attachments, not flat text |
| `onenote_append_to_page` | append HTML content to an existing page |

Pages are authored as real HTML and sent to Graph as `multipart/form-data` (a presentation HTML
part plus named binary parts for images/attachments, referenced from the HTML via
`src="name:X"`/`data="name:X"`); this server handles that plumbing so a caller just supplies HTML
and any binary parts. Content dropped in through these tools renders the way it would if a person
had typed and formatted it directly in OneNote.

OneNote has no Graph Application-permission tier at all — it is delegated-only by Microsoft's own
design, always acting as the signed-in user. `onenote_search` covers page **titles**, not general
full-text content search; for content search, list pages and read the ones that look relevant.

## Planner semantics this server encodes for you

These are the things that make hand-rolled Planner integrations wrong, handled here so a caller
cannot get them wrong.

**ETags are mandatory and are per-resource.**
Every Planner `PATCH` and `DELETE` must carry the resource's current `@odata.etag` in `If-Match`;
a stale one returns 412. So every write here **re-reads the resource immediately before writing**
and uses that fresh ETag. No ETag is cached across tool calls, and no tool accepts an ETag as a
parameter — there is no way for a caller to supply a stale one. A 412 comes back as
`PLANNER_ETAG_CONFLICT`: *this card changed since it was read, nothing was saved, re-read and
retry* — not a raw HTTP error.

**`/planner/tasks/{id}` and `/planner/tasks/{id}/details` are different resources with different
ETags.** Reusing one for the other is the single most common Planner integration bug. They are
read by two separate methods here and never share a variable. That is what `planner_update_task`
vs `planner_update_task_details` reflects.

**Progress has exactly three states.** `percentComplete` is 0 / 50 / 100 = Not started / In
progress / Completed. The words are accepted as input and translated. Intermediate values like 25
are rejected with an explanation rather than written — Planner cannot represent them and the
board would not move.

**Assignments need GUIDs, never emails.** Planner's `assignments` dictionary is keyed by object
ID and silently ignores anything else. The tools accept an email, UPN, display name, GUID or
`"me"` and resolve it against Graph.

**`assignments` and `checklist` are open dictionaries with delta semantics.** A PATCH replaces
only the keys you send; sending `null` for a key deletes it. Every change here is computed as a
minimal delta against the freshly-read copy whose ETag is being sent — add, remove and toggle are
read-modify-write, never a blind overwrite. An item somebody else added between the read and the
write survives.

**Labels live in two places.** A task carries `category1..category25` booleans; their human names
live on the **plan's** details. Pass a label name (`"Blocked"`) or a category key — both are
resolved, in both directions.

## What this can and cannot do

**Can**

- Full Planner read/write: plans, buckets, tasks, task details, checklists, references, labels,
  assignments, dates, priority, progress, and plan-level Goals (read).
- Resolve people, plans, buckets and labels to names so results are readable.
- Read Teams channel messages, and replies.
- Read, create and update SharePoint list items.
- Read and write real, richly formatted OneNote pages — colors, styling, tables, inline images and
  file attachments, not flat text.
- Survive rate limiting: 429 with `Retry-After` honored, 5xx retried with exponential backoff,
  `@odata.nextLink` followed to the last page so nothing is silently truncated.

**Cannot**

- **Planner card comments.** Planner comments are *not* Planner data. They are conversation posts
  on the backing Microsoft 365 **Group**, reached through the task's `conversationThreadId`, and
  the Planner API neither reads nor writes them. `planner_get_task` reports that a card has
  comments and returns the thread id; it cannot show them. Reading them would mean
  `Group.Read.All` plus the group conversation API and a different consent conversation; posting
  one would mean writing to a group mailbox. Neither is implemented, and no amount of Planner
  scope will change that.
- **Post to Teams without confirming.** Posting is supported, but every send requires an explicit
  `confirm: true`. A channel post is visible to the whole team and cannot be quietly undone, so it
  is not something a tool should do as a side effect.
- **App-only auth.** Declared, not implemented — see above.
- **Move a task between plans.** Graph does not support it; Planner's own UI recreates the card.
- **Planner Premium ("Project" / Dataverse).** Converting a board to premium moves it into
  Dataverse and removes it from the Planner Graph API, so `planner_*` stops seeing it — that is
  not a bug and not a permissions problem, and it is deliberately out of scope for this server. A
  separate plugin covers those boards.
- **Planner reference attachment file contents.** References are links; uploading a file there is
  a Files/SharePoint operation. (OneNote attachments are a separate, supported path — see above.)
- **Anything without a tenant.** No credentials, tenant ids, client ids or plan ids are baked in;
  a test asserts the source tree contains no literal GUIDs.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # build, then node --test over dist/test
```

Tests use the built-in `node:test` runner — no test framework dependency. They cover the
progress mapping, checklist read-modify-write and delta correctness, the ETag staleness path
(including a mocked 412 and proof the task and details ETags are never interchanged), the
pagination follower, retry/rate-limit behavior, the device-code and refresh flows against a
stubbed token endpoint, and configuration failure messages. No test performs a live Graph call.

```
src/
  index.ts              stdio entry point; fails fast on config errors
  server.ts             MCP server assembly and tool registration
  config.ts             env + optional file config, no invented defaults
  context.ts            dependency wiring
  errors.ts             typed errors; EtagConflictError; never carry a token
  auth/
    types.ts            AuthProvider, TokenStore, InteractiveSignInRequired
    device-code.ts      device authorization grant + silent refresh
    client-credentials.ts   app-only — interface only, not implemented
    token-store/        macOS Keychain, in-memory, backend selection
  graph/
    client.ts           bearer injection, retry, pagination, typed errors
    users.ts            email / name → directory GUID resolver
  planner/
    types.ts  semantics.ts  api.ts  tools.ts   (includes Goals, beta endpoint)
  teams/        api.ts  tools.ts        (read + gated posting)
  sharepoint/   api.ts  tools.ts
  onenote/      types.ts  api.ts  tools.ts     (rich HTML, multipart images/attachments)
  tools/        auth.ts  helpers.ts
  util/         logger.ts (stderr only)  redact.ts  audit.ts (hash-chained tool log)
test/
```

`stdout` is the MCP transport. All diagnostics go to `stderr`; anything else would corrupt the
session.

## License

Business Source License 1.1 (BUSL). See the repository root `LICENSE.md`. Converts to Apache License, Version 2.0 on 2030-09-05.
