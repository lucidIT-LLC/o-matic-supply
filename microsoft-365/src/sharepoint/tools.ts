import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ServerContext } from "../context.js";
import { runTool } from "../tools/helpers.js";

const siteInput = z
  .string()
  .describe(
    'SharePoint site: a full URL ("https://contoso.sharepoint.com/sites/ops"), a "hostname:/sites/path" pair, a Graph site id, or "root".',
  );

export function registerSharePointTools(server: McpServer, ctx: ServerContext): void {
  const { sharepoint } = ctx;

  server.registerTool(
    "sharepoint_list_lists",
    {
      title: "List SharePoint lists",
      description: "List the lists on a SharePoint site. Hidden system lists are excluded by default.",
      inputSchema: {
        site: siteInput,
        includeHidden: z.boolean().optional().describe("Include hidden system lists. Default false."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("sharepoint_list_lists", async () => {
        const lists = await sharepoint.listLists(args.site, args.includeHidden ?? false);
        return {
          site: args.site,
          count: lists.length,
          lists: lists.map((l) => ({
            id: l.id,
            displayName: l.displayName,
            name: l.name,
            template: l.list?.template,
            webUrl: l.webUrl,
            description: l.description,
          })),
        };
      }),
  );

  server.registerTool(
    "sharepoint_list_items",
    {
      title: "List SharePoint list items",
      description:
        "List items in a SharePoint list with their field values. Field keys are INTERNAL column names, which often differ from the display names; use includeColumns to see the mapping before writing.",
      inputSchema: {
        site: siteInput,
        listId: z.string().describe("List id or list name."),
        filter: z.string().optional().describe("OData $filter, e.g. \"fields/Status eq 'Open'\"."),
        orderby: z.string().optional().describe("OData $orderby, e.g. \"fields/Created desc\"."),
        limit: z.number().int().min(1).max(2000).optional().describe("Maximum items. Default 500."),
        includeColumns: z
          .boolean()
          .optional()
          .describe("Also return the list's column definitions (internal name -> display name)."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("sharepoint_list_items", async () => {
        const items = await sharepoint.listItems(args.site, args.listId, {
          filter: args.filter,
          orderby: args.orderby,
          maxItems: args.limit ?? 500,
        });
        const columns = args.includeColumns
          ? await sharepoint.listColumns(args.site, args.listId).catch(() => [])
          : undefined;
        return {
          site: args.site,
          listId: args.listId,
          count: items.length,
          items: items.map((item) => ({
            id: item.id,
            webUrl: item.webUrl,
            createdDateTime: item.createdDateTime,
            lastModifiedDateTime: item.lastModifiedDateTime,
            lastModifiedBy: item.lastModifiedBy?.user?.displayName,
            fields: item.fields,
          })),
          ...(columns ? { columns } : {}),
          note:
            "A $filter on a non-indexed column returns an error rather than a slow result; add the column to the list's indexes in SharePoint if that happens.",
        };
      }),
  );

  server.registerTool(
    "sharepoint_create_item",
    {
      title: "Create a SharePoint list item",
      description:
        "Create an item in a SharePoint list. `fields` is keyed by INTERNAL column name (Title, Status, AssignedToLookupId, ...), not display name.",
      inputSchema: {
        site: siteInput,
        listId: z.string().describe("List id or list name."),
        fields: z.record(z.unknown()).describe("Field values keyed by internal column name."),
      },
    },
    async (args) =>
      runTool("sharepoint_create_item", async () => {
        const item = await sharepoint.createItem(args.site, args.listId, args.fields);
        return { created: true, id: item.id, webUrl: item.webUrl, fields: item.fields };
      }),
  );

  server.registerTool(
    "sharepoint_update_item",
    {
      title: "Update a SharePoint list item",
      description:
        "Update field values on a list item. Only the fields supplied are changed; SharePoint merges rather than replaces. Note this is last-writer-wins — unlike Planner, there is no ETag check.",
      inputSchema: {
        site: siteInput,
        listId: z.string().describe("List id or list name."),
        itemId: z.string().describe("List item id."),
        fields: z.record(z.unknown()).describe("Field values keyed by internal column name."),
      },
    },
    async (args) =>
      runTool("sharepoint_update_item", async () => {
        const fields = await sharepoint.updateItem(args.site, args.listId, args.itemId, args.fields);
        return { updated: true, itemId: args.itemId, fields };
      }),
  );
}
