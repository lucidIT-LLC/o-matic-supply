import { M365Error } from "../errors.js";
import type { GraphClient, ODataQuery } from "../graph/client.js";

export interface SharePointSite {
  id: string;
  displayName?: string;
  name?: string;
  webUrl?: string;
}

export interface SharePointList {
  id: string;
  displayName?: string;
  name?: string;
  webUrl?: string;
  description?: string;
  list?: { template?: string; hidden?: boolean };
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

export interface SharePointListItem {
  id: string;
  webUrl?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  createdBy?: { user?: { displayName?: string; email?: string } };
  lastModifiedBy?: { user?: { displayName?: string; email?: string } };
  fields?: Record<string, unknown>;
  "@odata.etag"?: string;
}

/** SharePoint Lists over Graph. Sites are addressed by id or by URL. */
export class SharePointApi {
  private readonly graph: GraphClient;
  private readonly siteCache = new Map<string, string>();

  constructor(graph: GraphClient) {
    this.graph = graph;
  }

  /**
   * Accept anything a human is likely to have: a site id triple
   * ("contoso.sharepoint.com,<guid>,<guid>"), a full site URL, a
   * "hostname:/sites/path" pair, or "root".
   */
  async resolveSiteId(site: string): Promise<string> {
    const key = site.trim();
    if (key === "") throw new M365Error("SHAREPOINT_SITE", "A site id or URL is required.");
    const cached = this.siteCache.get(key.toLowerCase());
    if (cached) return cached;

    // Already a Graph site id.
    if (key.includes(",")) return this.remember(key, key);
    if (key.toLowerCase() === "root") {
      const root = await this.graph.get<SharePointSite>("/sites/root", { $select: ["id", "webUrl"] });
      return this.remember(key, root.id);
    }

    let lookup: string;
    if (/^https?:\/\//i.test(key)) {
      const url = new URL(key);
      const path = url.pathname.replace(/\/+$/, "");
      lookup = `/sites/${url.hostname}:${path === "" ? "/" : path}`;
    } else if (key.includes(":/")) {
      lookup = `/sites/${key}`;
    } else if (key.includes("/")) {
      lookup = `/sites/${key}`;
    } else {
      lookup = `/sites/${key}`;
    }

    const resolved = await this.graph.get<SharePointSite>(lookup, { $select: ["id", "webUrl", "displayName"] });
    return this.remember(key, resolved.id);
  }

  private remember(key: string, id: string): string {
    this.siteCache.set(key.toLowerCase(), id);
    return id;
  }

  async listLists(site: string, includeHidden = false): Promise<SharePointList[]> {
    const siteId = await this.resolveSiteId(site);
    const lists = await this.graph.getAll<SharePointList>(`/sites/${siteId}/lists`, {
      $select: ["id", "displayName", "name", "webUrl", "description", "createdDateTime", "lastModifiedDateTime"],
      $expand: "list",
    });
    return includeHidden ? lists : lists.filter((l) => l.list?.hidden !== true);
  }

  async listItems(
    site: string,
    listId: string,
    options: { filter?: string; orderby?: string; top?: number; maxItems?: number; select?: string[] } = {},
  ): Promise<SharePointListItem[]> {
    const siteId = await this.resolveSiteId(site);
    const query: ODataQuery = { $expand: "fields", $top: options.top ?? 100 };
    if (options.filter) query.$filter = options.filter;
    if (options.orderby) query.$orderby = options.orderby;
    if (options.select) query.$expand = `fields($select=${options.select.join(",")})`;

    return this.graph.getAll<SharePointListItem>(
      `/sites/${siteId}/lists/${encodeURIComponent(listId)}/items`,
      query,
      { maxItems: options.maxItems ?? 500 },
    );
  }

  async getItem(site: string, listId: string, itemId: string): Promise<SharePointListItem> {
    const siteId = await this.resolveSiteId(site);
    return this.graph.get<SharePointListItem>(
      `/sites/${siteId}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
      { $expand: "fields" },
    );
  }

  async createItem(
    site: string,
    listId: string,
    fields: Record<string, unknown>,
  ): Promise<SharePointListItem> {
    const siteId = await this.resolveSiteId(site);
    const response = await this.graph.request<SharePointListItem>(
      `/sites/${siteId}/lists/${encodeURIComponent(listId)}/items`,
      { method: "POST", body: { fields } },
    );
    if (!response.body) {
      throw new M365Error("SHAREPOINT_EMPTY_RESPONSE", "The list item was created but Graph returned no body.");
    }
    return response.body;
  }

  /**
   * Update an item's field values. SharePoint list items do not use Planner's
   * ETag discipline — the fields endpoint is a last-writer-wins merge PATCH —
   * so only the fields supplied are touched.
   */
  async updateItem(
    site: string,
    listId: string,
    itemId: string,
    fields: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const siteId = await this.resolveSiteId(site);
    const response = await this.graph.request<Record<string, unknown>>(
      `/sites/${siteId}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/fields`,
      { method: "PATCH", body: fields },
    );
    return response.body ?? fields;
  }

  /** Column definitions — needed to know the internal names PATCH expects. */
  async listColumns(site: string, listId: string): Promise<Array<Record<string, unknown>>> {
    const siteId = await this.resolveSiteId(site);
    return this.graph.getAll<Record<string, unknown>>(
      `/sites/${siteId}/lists/${encodeURIComponent(listId)}/columns`,
    );
  }
}
