import type { GraphClient } from "../graph/client.js";
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
    list?: {
        template?: string;
        hidden?: boolean;
    };
    createdDateTime?: string;
    lastModifiedDateTime?: string;
}
export interface SharePointListItem {
    id: string;
    webUrl?: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    createdBy?: {
        user?: {
            displayName?: string;
            email?: string;
        };
    };
    lastModifiedBy?: {
        user?: {
            displayName?: string;
            email?: string;
        };
    };
    fields?: Record<string, unknown>;
    "@odata.etag"?: string;
}
/** SharePoint Lists over Graph. Sites are addressed by id or by URL. */
export declare class SharePointApi {
    private readonly graph;
    private readonly siteCache;
    constructor(graph: GraphClient);
    /**
     * Accept anything a human is likely to have: a site id triple
     * ("contoso.sharepoint.com,<guid>,<guid>"), a full site URL, a
     * "hostname:/sites/path" pair, or "root".
     */
    resolveSiteId(site: string): Promise<string>;
    private remember;
    listLists(site: string, includeHidden?: boolean): Promise<SharePointList[]>;
    listItems(site: string, listId: string, options?: {
        filter?: string;
        orderby?: string;
        top?: number;
        maxItems?: number;
        select?: string[];
    }): Promise<SharePointListItem[]>;
    getItem(site: string, listId: string, itemId: string): Promise<SharePointListItem>;
    createItem(site: string, listId: string, fields: Record<string, unknown>): Promise<SharePointListItem>;
    /**
     * Update an item's field values. SharePoint list items do not use Planner's
     * ETag discipline — the fields endpoint is a last-writer-wins merge PATCH —
     * so only the fields supplied are touched.
     */
    updateItem(site: string, listId: string, itemId: string, fields: Record<string, unknown>): Promise<Record<string, unknown>>;
    /** Column definitions — needed to know the internal names PATCH expects. */
    listColumns(site: string, listId: string): Promise<Array<Record<string, unknown>>>;
}
