import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ServerConfig } from "./config.js";
import { createContext, type ServerContext } from "./context.js";
import { registerOneNoteTools } from "./onenote/tools.js";
import { registerPlannerTools } from "./planner/tools.js";
import { registerSharePointTools } from "./sharepoint/tools.js";
import { registerTeamsTools } from "./teams/tools.js";
import { registerAuthTools } from "./tools/auth.js";

export const SERVER_NAME = "team-assistant-mcp";
export const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS = `Microsoft 365 tools for Planner, Teams, SharePoint and OneNote, over Microsoft Graph.

Scope, on purpose: this server covers everyday, non-premium Microsoft 365. It
does not touch Dataverse / "Project" (Premium Planner) — that is deliberately a
separate plugin, a different auth audience and a different backend. If a plan
you expect is missing from planner_list_plans, it is likely Premium and out of
this server's reach entirely; that is not a bug or a permissions problem here.

=== PLANNER — the primary surface ===

- planner_get_task returns the whole card in one call. A Planner task and its
  "details" are two separate Graph resources; this server merges them so you
  never need two reads to see one card.
- Progress has exactly three states: 0 / 50 / 100 = Not started / In progress /
  Completed. The words are accepted directly.
- Assignments require directory GUIDs. Pass an email, a name, or "me" and the
  server resolves it; m365_resolve_user does it explicitly.
- Labels are category1..category25 on the task, but their human names live on
  the plan. Pass label names; they are resolved both ways.
- Every write re-reads the resource first and sends its current ETag. If you get
  PLANNER_ETAG_CONFLICT, someone changed the card after your read: re-read it,
  decide whether your change still applies, then retry. Nothing was saved.
- Planner card COMMENTS are not covered. They are Microsoft 365 Group
  conversation posts behind conversationThreadId and are outside the Planner API.

GOALS (planner_list_goals) — the plan's "Goals" tab, the OKR-shaped view: each
goal is a plan-level target that specific tasks link back to via their own
read-only goalIds. This is a real, ordinary Planner feature — it is NOT Viva
Goals (a different product) and it is NOT Premium/Dataverse-gated; a completely
basic plan has it. It lives only in the Graph BETA endpoint
(/beta/planner/plans/{id}/goals), not v1.0, so treat it as usable but less
stable than the rest of Planner: expect the shape to still move, and do not
assume every tenant/plan combination has it enabled. A useful pattern this
enables: create a goal first, then build out the tasks that serve it — start
from the outcome, not the to-do list.

=== TEAMS ===

Teams tools are read-only: list teams/channels, read channel messages. No
posting, no chat creation, no membership changes from here.

=== SHAREPOINT ===

SharePoint list operations address fields by their *internal* column name
(e.g. "Title", "_ExtendedDescription"), not the display label shown in the UI —
list the item schema first if the internal name isn't already known, because
display and internal names diverge as soon as anyone renames a column.

=== ONENOTE ===

Real rich content, not flat text: pages are authored as HTML (colors, styling,
tables, inline images, and file attachments), which Graph accepts as multipart
form data. This server handles the multipart plumbing — callers just pass HTML
plus any binary parts. Content dropped through onenote_create_page /
onenote_append_to_page renders in OneNote the way it would look if a person
had typed and formatted it there, not as a wall of plain text.

Two constraints worth knowing before relying on this:
- OneNote has NO application-permission tier in Graph at all — delegated only,
  by Microsoft's own design, not a choice this server made. It always acts as
  the signed-in user; there is no service-account / app-only path for OneNote,
  unlike Planner or SharePoint.
- onenote_search covers page titles via Graph's OneNote search, not general
  full-text content search — for content search, list pages and read the ones
  that look relevant.

=== AUTH ===

If a call fails with 401 or 403, call m365_auth_status, then m365_sign_in.`;

export function createServer(config: ServerConfig): { server: McpServer; ctx: ServerContext } {
  const ctx = createContext(config);
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerAuthTools(server, ctx);
  registerPlannerTools(server, ctx);
  registerTeamsTools(server, ctx);
  registerSharePointTools(server, ctx);
  registerOneNoteTools(server, ctx);

  return { server, ctx };
}
