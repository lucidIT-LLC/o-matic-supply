/**
 * OneNote resource shapes, per Microsoft Graph.
 *
 * OneNote is delegated-only across the whole surface — Graph's own docs state
 * plainly that the OneNote API does not support application (app-only)
 * authentication. Every call here runs as the signed-in person, same as the
 * rest of this server; there is no "background OneNote job" mode and there
 * will not be one, because Graph does not offer it.
 */
export interface OneNoteNotebook {
    id: string;
    displayName?: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    isDefault?: boolean;
    links?: {
        oneNoteClientUrl?: {
            href?: string;
        };
        oneNoteWebUrl?: {
            href?: string;
        };
    };
}
export interface OneNoteSection {
    id: string;
    displayName?: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    parentNotebook?: {
        id?: string;
        displayName?: string;
    };
}
export interface OneNotePage {
    id: string;
    title?: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    contentUrl?: string;
    links?: {
        oneNoteClientUrl?: {
            href?: string;
        };
        oneNoteWebUrl?: {
            href?: string;
        };
    };
    parentSection?: {
        id?: string;
        displayName?: string;
    };
    parentNotebook?: {
        id?: string;
        displayName?: string;
    };
}
/**
 * Who owns the notebook being addressed. Mirrors the Graph service root
 * pattern: /me/onenote, /users/{id}/onenote, /groups/{id}/onenote,
 * /sites/{id}/onenote. "me" covers the overwhelming majority of real use —
 * a person's own OneNote — and is the default everywhere in this module.
 */
export interface OneNoteScope {
    kind: "me" | "user" | "group" | "site";
    /** Required when kind is not "me". A user principal name, group id, or site id. */
    id?: string;
}
/** An inline binary part for createPage — an image or a file attachment. */
export interface OneNotePagePart {
    /** The "name:xxx" reference used inside the HTML body's src/data attribute. */
    partName: string;
    contentType: string;
    data: Uint8Array;
}
