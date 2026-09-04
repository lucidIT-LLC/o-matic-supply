import { M365Error } from "../errors.js";
/** SharePoint Lists over Graph. Sites are addressed by id or by URL. */
export class SharePointApi {
    graph;
    siteCache = new Map();
    constructor(graph) {
        this.graph = graph;
    }
    /**
     * Accept anything a human is likely to have: a site id triple
     * ("contoso.sharepoint.com,<guid>,<guid>"), a full site URL, a
     * "hostname:/sites/path" pair, or "root".
     */
    async resolveSiteId(site) {
        const key = site.trim();
        if (key === "")
            throw new M365Error("SHAREPOINT_SITE", "A site id or URL is required.");
        const cached = this.siteCache.get(key.toLowerCase());
        if (cached)
            return cached;
        // Already a Graph site id.
        if (key.includes(","))
            return this.remember(key, key);
        if (key.toLowerCase() === "root") {
            const root = await this.graph.get("/sites/root", { $select: ["id", "webUrl"] });
            return this.remember(key, root.id);
        }
        let lookup;
        if (/^https?:\/\//i.test(key)) {
            const url = new URL(key);
            const path = url.pathname.replace(/\/+$/, "");
            lookup = `/sites/${url.hostname}:${path === "" ? "/" : path}`;
        }
        else if (key.includes(":/")) {
            lookup = `/sites/${key}`;
        }
        else if (key.includes("/")) {
            lookup = `/sites/${key}`;
        }
        else {
            lookup = `/sites/${key}`;
        }
        const resolved = await this.graph.get(lookup, { $select: ["id", "webUrl", "displayName"] });
        return this.remember(key, resolved.id);
    }
    remember(key, id) {
        this.siteCache.set(key.toLowerCase(), id);
        return id;
    }
    async listLists(site, includeHidden = false) {
        const siteId = await this.resolveSiteId(site);
        const lists = await this.graph.getAll(`/sites/${siteId}/lists`, {
            $select: ["id", "displayName", "name", "webUrl", "description", "createdDateTime", "lastModifiedDateTime"],
            $expand: "list",
        });
        return includeHidden ? lists : lists.filter((l) => l.list?.hidden !== true);
    }
    async listItems(site, listId, options = {}) {
        const siteId = await this.resolveSiteId(site);
        const query = { $expand: "fields", $top: options.top ?? 100 };
        if (options.filter)
            query.$filter = options.filter;
        if (options.orderby)
            query.$orderby = options.orderby;
        if (options.select)
            query.$expand = `fields($select=${options.select.join(",")})`;
        return this.graph.getAll(`/sites/${siteId}/lists/${encodeURIComponent(listId)}/items`, query, { maxItems: options.maxItems ?? 500 });
    }
    async getItem(site, listId, itemId) {
        const siteId = await this.resolveSiteId(site);
        return this.graph.get(`/sites/${siteId}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`, { $expand: "fields" });
    }
    async createItem(site, listId, fields) {
        const siteId = await this.resolveSiteId(site);
        const response = await this.graph.request(`/sites/${siteId}/lists/${encodeURIComponent(listId)}/items`, { method: "POST", body: { fields } });
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
    async updateItem(site, listId, itemId, fields) {
        const siteId = await this.resolveSiteId(site);
        const response = await this.graph.request(`/sites/${siteId}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/fields`, { method: "PATCH", body: fields });
        return response.body ?? fields;
    }
    /** Column definitions — needed to know the internal names PATCH expects. */
    async listColumns(site, listId) {
        const siteId = await this.resolveSiteId(site);
        return this.graph.getAll(`/sites/${siteId}/lists/${encodeURIComponent(listId)}/columns`);
    }
}
//# sourceMappingURL=api.js.map