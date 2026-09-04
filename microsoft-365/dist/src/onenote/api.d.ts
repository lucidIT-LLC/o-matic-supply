import type { GraphClient } from "../graph/client.js";
import type { OneNoteNotebook, OneNotePage, OneNotePagePart, OneNoteScope, OneNoteSection } from "./types.js";
/**
 * OneNote over Microsoft Graph. Delegated-only (see types.ts) — every method
 * here runs as whichever person's token the auth provider hands back.
 */
export declare class OneNoteApi {
    private readonly graph;
    constructor(graph: GraphClient);
    listNotebooks(scope?: OneNoteScope): Promise<OneNoteNotebook[]>;
    listSections(notebookId: string, scope?: OneNoteScope): Promise<OneNoteSection[]>;
    listPages(sectionId: string, scope?: OneNoteScope, limit?: number): Promise<OneNotePage[]>;
    /** Full-text search across a scope's OneNote content (title and body). */
    searchPages(query: string, scope?: OneNoteScope, limit?: number): Promise<OneNotePage[]>;
    /** Raw HTML content of a page, exactly as OneNote renders it — not a summary. */
    getPageContent(pageId: string, scope?: OneNoteScope): Promise<string>;
    /**
     * Create a page with real HTML — colors, tables, headings, inline-styled
     * text, embedded images (remote URL or uploaded binary), and file
     * attachments all go through this one call. `html` is the full page
     * document (title in <title>, body in <body>); `parts` supplies any
     * binary data the HTML references via src="name:X" / data="name:X".
     */
    createPage(sectionId: string, html: string, scope?: OneNoteScope, parts?: OneNotePagePart[]): Promise<OneNotePage>;
    /**
     * Append HTML content onto an existing page. OneNote's page-content PATCH
     * takes a list of commands; "append" targeting the page body is the one
     * safe default that cannot silently destroy existing content the way a
     * blind "replace" could, so it is the only action this method exposes.
     */
    appendToPage(pageId: string, html: string, scope?: OneNoteScope): Promise<void>;
}
