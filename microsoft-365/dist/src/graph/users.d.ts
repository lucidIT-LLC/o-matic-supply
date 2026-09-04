import type { GraphClient } from "./client.js";
export interface DirectoryUser {
    id: string;
    displayName?: string;
    userPrincipalName?: string;
    mail?: string;
}
export declare function isGuid(value: string): boolean;
/** Escape a string for an OData string literal. */
export declare function odataString(value: string): string;
/**
 * Turns whatever a human typed into the user GUID that Planner assignments
 * actually require.
 *
 * This exists because Planner's `assignments` dictionary is keyed by object ID
 * and silently accepts nothing else. Callers reliably try to pass an email
 * address, so the tools accept one and resolve it here.
 */
export declare class UserResolver {
    private readonly graph;
    private readonly cache;
    constructor(graph: GraphClient);
    private static readonly SELECT;
    /** The signed-in user. */
    me(): Promise<DirectoryUser>;
    /**
     * Resolve one identifier: a GUID (returned as-is), a UPN/email, or a display
     * name. Throws a clear error listing candidates when a name is ambiguous.
     */
    resolve(identifier: string): Promise<DirectoryUser>;
    /** Resolve a list, preserving order and de-duplicating by GUID. */
    resolveMany(identifiers: string[]): Promise<DirectoryUser[]>;
    /** Best-effort GUID -> display name, for rendering assignments and comments. */
    describe(id: string): Promise<DirectoryUser>;
    search(term: string, limit?: number): Promise<DirectoryUser[]>;
    private byUpnOrMail;
    private byDisplayName;
    private remember;
}
