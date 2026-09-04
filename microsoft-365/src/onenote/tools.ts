import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ServerContext } from "../context.js";
import { runTool } from "../tools/helpers.js";
import type { OneNoteScope } from "./types.js";

const scopeInput = z
  .object({
    kind: z.enum(["me", "user", "group", "site"]).default("me"),
    id: z
      .string()
      .optional()
      .describe('Required unless kind is "me": a user UPN, group id, or SharePoint site id.'),
  })
  .optional()
  .describe('Whose OneNote to use. Omit for "me" (the signed-in person\'s own notebooks) — the common case.');

function resolveScope(input: { kind?: "me" | "user" | "group" | "site"; id?: string } | undefined): OneNoteScope {
  return { kind: input?.kind ?? "me", id: input?.id };
}

export function registerOneNoteTools(server: McpServer, ctx: ServerContext): void {
  const { onenote } = ctx;

  server.registerTool(
    "onenote_list_notebooks",
    {
      title: "List OneNote notebooks",
      description: "List OneNote notebooks visible in the given scope.",
      inputSchema: { scope: scopeInput },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("onenote_list_notebooks", async () => {
        const notebooks = await onenote.listNotebooks(resolveScope(args.scope));
        return { count: notebooks.length, notebooks };
      }),
  );

  server.registerTool(
    "onenote_list_sections",
    {
      title: "List OneNote sections",
      description: "List the sections in a notebook.",
      inputSchema: { notebookId: z.string().describe("Notebook id, from onenote_list_notebooks."), scope: scopeInput },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("onenote_list_sections", async () => {
        const sections = await onenote.listSections(args.notebookId, resolveScope(args.scope));
        return { count: sections.length, sections };
      }),
  );

  server.registerTool(
    "onenote_list_pages",
    {
      title: "List OneNote pages",
      description: "List the pages in a section, most recently modified first.",
      inputSchema: {
        sectionId: z.string().describe("Section id, from onenote_list_sections."),
        limit: z.number().int().min(1).max(500).optional().describe("Maximum pages. Default 100."),
        scope: scopeInput,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("onenote_list_pages", async () => {
        const pages = await onenote.listPages(args.sectionId, resolveScope(args.scope), args.limit ?? 100);
        return { count: pages.length, pages };
      }),
  );

  server.registerTool(
    "onenote_search",
    {
      title: "Search OneNote",
      description: "Full-text search across a scope's OneNote pages (title and body content).",
      inputSchema: {
        query: z.string().describe("Search text."),
        limit: z.number().int().min(1).max(200).optional().describe("Maximum results. Default 25."),
        scope: scopeInput,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("onenote_search", async () => {
        const pages = await onenote.searchPages(args.query, resolveScope(args.scope), args.limit ?? 25);
        return { count: pages.length, pages };
      }),
  );

  server.registerTool(
    "onenote_get_page_content",
    {
      title: "Get OneNote page content",
      description:
        "Get a page's full HTML content exactly as OneNote stores it — headings, colors, tables, images and " +
        "attachments included, not a plain-text summary.",
      inputSchema: { pageId: z.string().describe("Page id."), scope: scopeInput },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("onenote_get_page_content", async () => {
        const html = await onenote.getPageContent(args.pageId, resolveScope(args.scope));
        return { pageId: args.pageId, html };
      }),
  );

  server.registerTool(
    "onenote_create_page",
    {
      title: "Create a OneNote page",
      description:
        "Create a new page in a section from real HTML — inline CSS for colors and styling, tables, headings, " +
        "and <img> tags all render as designed, not as flattened text. To embed a picture, either point <img src> " +
        'at a public URL directly, or supply it as a base64 attachment and reference it as src="name:<attachmentName>" ' +
        "in the HTML — matching the attachment's name exactly. The result is a real, good-looking OneNote page, " +
        "not a wall of plain text.",
      inputSchema: {
        sectionId: z.string().describe("Section id to create the page in, from onenote_list_sections."),
        title: z.string().describe("Page title."),
        html: z
          .string()
          .describe(
            "The page BODY as HTML — headings, paragraphs, tables, colored/styled text via inline style=\"...\", " +
              "<img> tags. Do not include <html>/<head>/<body> wrappers; the tool builds those around the title.",
          ),
        attachments: z
          .array(
            z.object({
              name: z.string().describe('Reference name — use as src="name:<name>" or data="name:<name>" in html.'),
              contentType: z.string().describe('MIME type, e.g. "image/png" or "application/pdf".'),
              base64Data: z.string().describe("Raw file content, base64-encoded."),
            }),
          )
          .optional()
          .describe("Images or files to embed/attach, referenced from html by name."),
        scope: scopeInput,
      },
    },
    async (args) =>
      runTool("onenote_create_page", async () => {
        const parts = (args.attachments ?? []).map((a) => ({
          partName: a.name,
          contentType: a.contentType,
          data: Uint8Array.from(Buffer.from(a.base64Data, "base64")),
        }));
        const fullHtml = `<!DOCTYPE html><html><head><title>${escapeHtml(args.title)}</title></head><body>${args.html}</body></html>`;
        const page = await onenote.createPage(args.sectionId, fullHtml, resolveScope(args.scope), parts);
        return { created: true, id: page.id, title: page.title, links: page.links };
      }),
  );

  server.registerTool(
    "onenote_append_to_page",
    {
      title: "Append content to a OneNote page",
      description:
        "Append HTML content to the end of an existing page's body. Additive only — this cannot remove or " +
        "overwrite what is already on the page, by design, so a bad append is always recoverable by editing it " +
        "out afterward rather than by having destroyed something.",
      inputSchema: {
        pageId: z.string().describe("Page id, from onenote_list_pages or onenote_search."),
        html: z.string().describe('HTML to append, e.g. "<p style=\\"color:#c00\\">New note...</p>".'),
        scope: scopeInput,
      },
    },
    async (args) =>
      runTool("onenote_append_to_page", async () => {
        await onenote.appendToPage(args.pageId, args.html, resolveScope(args.scope));
        return { appended: true, pageId: args.pageId };
      }),
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
