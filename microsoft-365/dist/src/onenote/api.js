import { M365Error } from "../errors.js";
/** Resolve a scope to its Graph service-root path segment, e.g. "/me" or "/users/alex@contoso.com". */
function scopeRoot(scope) {
    switch (scope.kind) {
        case "me":
            return "/me";
        case "user":
            if (!scope.id)
                throw new M365Error("ONENOTE_SCOPE", "A user id or UPN is required for scope 'user'.");
            return `/users/${encodeURIComponent(scope.id)}`;
        case "group":
            if (!scope.id)
                throw new M365Error("ONENOTE_SCOPE", "A group id is required for scope 'group'.");
            return `/groups/${encodeURIComponent(scope.id)}`;
        case "site":
            if (!scope.id)
                throw new M365Error("ONENOTE_SCOPE", "A SharePoint site id is required for scope 'site'.");
            return `/sites/${encodeURIComponent(scope.id)}`;
    }
}
/**
 * Build a multipart/form-data body for OneNote's page-creation endpoint.
 * The "Presentation" part carries the HTML; any additional binary parts are
 * referenced from that HTML via src="name:partName" or data="name:partName".
 * Returns the body plus the boundary needed for the Content-Type header.
 *
 * Hand-rolled rather than pulled in as a dependency: this is the one place
 * in the server that needs multipart, the format is small and stable, and it
 * keeps the "no runtime dependencies beyond the MCP SDK and zod" contract
 * the rest of this codebase deliberately holds to.
 */
function buildMultipart(html, parts) {
    const boundary = `OMaticOneNote${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const encoder = new TextEncoder();
    const chunks = [];
    const pushText = (text) => chunks.push(encoder.encode(text));
    pushText(`--${boundary}\r\n`);
    pushText(`Content-Disposition: form-data; name="Presentation"\r\n`);
    pushText(`Content-Type: text/html\r\n\r\n`);
    pushText(html);
    pushText(`\r\n`);
    for (const part of parts) {
        pushText(`--${boundary}\r\n`);
        pushText(`Content-Disposition: form-data; name="${part.partName}"\r\n`);
        pushText(`Content-Type: ${part.contentType}\r\n\r\n`);
        chunks.push(part.data);
        pushText(`\r\n`);
    }
    pushText(`--${boundary}--`);
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
    }
    return { body, boundary };
}
/**
 * OneNote over Microsoft Graph. Delegated-only (see types.ts) — every method
 * here runs as whichever person's token the auth provider hands back.
 */
export class OneNoteApi {
    graph;
    constructor(graph) {
        this.graph = graph;
    }
    async listNotebooks(scope = { kind: "me" }) {
        return this.graph.getAll(`${scopeRoot(scope)}/onenote/notebooks`, {
            $select: ["id", "displayName", "createdDateTime", "lastModifiedDateTime", "isDefault"],
        });
    }
    async listSections(notebookId, scope = { kind: "me" }) {
        return this.graph.getAll(`${scopeRoot(scope)}/onenote/notebooks/${encodeURIComponent(notebookId)}/sections`, { $select: ["id", "displayName", "createdDateTime", "lastModifiedDateTime"] });
    }
    async listPages(sectionId, scope = { kind: "me" }, limit = 100) {
        return this.graph.getAll(`${scopeRoot(scope)}/onenote/sections/${encodeURIComponent(sectionId)}/pages`, { $select: ["id", "title", "createdDateTime", "lastModifiedDateTime", "contentUrl"] }, { maxItems: limit });
    }
    /** Full-text search across a scope's OneNote content (title and body). */
    async searchPages(query, scope = { kind: "me" }, limit = 25) {
        return this.graph.getAll(`${scopeRoot(scope)}/onenote/pages`, { $search: `"${query.replace(/"/g, '\\"')}"`, $select: ["id", "title", "createdDateTime", "lastModifiedDateTime", "contentUrl"] }, { maxItems: limit });
    }
    /** Raw HTML content of a page, exactly as OneNote renders it — not a summary. */
    async getPageContent(pageId, scope = { kind: "me" }) {
        const response = await this.graph.requestRaw(`${scopeRoot(scope)}/onenote/pages/${encodeURIComponent(pageId)}/content`, {
            method: "GET",
            accept: "text/html",
        });
        if (response.status < 200 || response.status >= 300) {
            throw new M365Error("ONENOTE_GET_CONTENT", `OneNote returned ${response.status} reading page content.`);
        }
        return response.text;
    }
    /**
     * Create a page with real HTML — colors, tables, headings, inline-styled
     * text, embedded images (remote URL or uploaded binary), and file
     * attachments all go through this one call. `html` is the full page
     * document (title in <title>, body in <body>); `parts` supplies any
     * binary data the HTML references via src="name:X" / data="name:X".
     */
    async createPage(sectionId, html, scope = { kind: "me" }, parts = []) {
        const { body, boundary } = buildMultipart(html, parts);
        const response = await this.graph.requestRaw(`${scopeRoot(scope)}/onenote/sections/${encodeURIComponent(sectionId)}/pages`, {
            method: "POST",
            contentType: `multipart/form-data; boundary=${boundary}`,
            accept: "application/json",
            body,
        });
        if (response.status < 200 || response.status >= 300) {
            throw new M365Error("ONENOTE_CREATE_PAGE", `OneNote returned ${response.status} creating the page.`);
        }
        return JSON.parse(response.text);
    }
    /**
     * Append HTML content onto an existing page. OneNote's page-content PATCH
     * takes a list of commands; "append" targeting the page body is the one
     * safe default that cannot silently destroy existing content the way a
     * blind "replace" could, so it is the only action this method exposes.
     */
    async appendToPage(pageId, html, scope = { kind: "me" }) {
        const commands = [{ target: "body", action: "append", content: html, position: "after" }];
        const response = await this.graph.requestRaw(`${scopeRoot(scope)}/onenote/pages/${encodeURIComponent(pageId)}/content`, {
            method: "PATCH",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify(commands),
        });
        if (response.status < 200 || response.status >= 300) {
            throw new M365Error("ONENOTE_APPEND_PAGE", `OneNote returned ${response.status} appending to the page.`);
        }
    }
}
//# sourceMappingURL=api.js.map