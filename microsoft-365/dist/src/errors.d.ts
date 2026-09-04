/** Base for every error this server raises deliberately. */
export declare class M365Error extends Error {
    readonly code: string;
    /** Operator-facing next step, when there is an obvious one. */
    readonly hint: string | undefined;
    constructor(code: string, message: string, hint?: string);
    /** Single string suitable for returning to an MCP caller. */
    toToolMessage(): string;
}
/** Missing or malformed configuration. Always fatal, always fail fast. */
export declare class ConfigError extends M365Error {
    constructor(message: string, hint?: string);
}
/** Anything that goes wrong acquiring or refreshing a token. */
export declare class AuthError extends M365Error {
    constructor(message: string, hint?: string);
}
/** Token storage backend failure (Keychain, etc.). */
export declare class TokenStoreError extends M365Error {
    constructor(message: string, hint?: string);
}
/** A feature that exists as an interface but is not implemented yet. */
export declare class NotImplementedError extends M365Error {
    constructor(what: string, hint?: string);
}
export interface GraphErrorDetail {
    /** Which service answered. Defaults to Graph. */
    service?: string | undefined;
    status: number;
    statusText: string;
    method: string;
    /** Graph URL with the query string preserved; never contains a token. */
    url: string;
    graphCode?: string | undefined;
    graphMessage?: string | undefined;
    requestId?: string | undefined;
    clientRequestId?: string | undefined;
    date?: string | undefined;
    retryAfterSeconds?: number | undefined;
}
/**
 * A non-2xx response from Microsoft Graph, reduced to the fields that are
 * actually useful for debugging. The request body and headers — which is where
 * the bearer token lives — are never attached.
 */
export declare class GraphError extends M365Error {
    readonly detail: GraphErrorDetail;
    constructor(detail: GraphErrorDetail, hint?: string);
    get status(): number;
}
/**
 * HTTP 412 from a Planner write. Planner uses optimistic concurrency: the ETag
 * you send must match the resource's current one. A 412 means somebody (or
 * something) changed the resource after we read it.
 */
export declare class EtagConflictError extends M365Error {
    readonly resource: string;
    readonly detail: GraphErrorDetail;
    constructor(resource: string, detail: GraphErrorDetail);
}
/** Convert anything thrown into a safe, caller-readable message. */
export declare function toToolMessage(error: unknown): string;
