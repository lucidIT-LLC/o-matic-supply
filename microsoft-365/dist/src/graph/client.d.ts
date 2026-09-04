import type { AuthProvider } from "../auth/types.js";
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export interface GraphClientOptions {
    baseUrl: string;
    auth: AuthProvider;
    fetchImpl?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    /** Retries for 429 / 5xx / network faults. Does not apply to 4xx. */
    maxRetries?: number;
    /** Upper bound on a single backoff wait. */
    maxBackoffMs?: number;
    /** Name of the service on the other end, used in error messages. Defaults to "Graph". */
    service?: string;
}
/** OData query options passed straight through to Graph. */
export interface ODataQuery {
    $select?: string | string[];
    $expand?: string | string[];
    $filter?: string;
    $orderby?: string | string[];
    $top?: number;
    $search?: string;
    $count?: boolean;
    [key: string]: string | string[] | number | boolean | undefined;
}
export interface GraphRequestOptions {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    query?: ODataQuery | undefined;
    body?: unknown;
    headers?: Record<string, string>;
    /** Value for the If-Match header. Planner writes require the fresh ETag. */
    ifMatch?: string | undefined;
    /**
     * When set, a 412 becomes an EtagConflictError naming this resource
     * ("task", "task details", "plan", "bucket") instead of a raw HTTP error.
     */
    conflictResource?: string | undefined;
    /** Extra Graph headers, e.g. Prefer: return=representation. */
    prefer?: string | undefined;
}
export interface GraphResponse<T> {
    status: number;
    /** Parsed JSON body, or undefined for 204 No Content. */
    body: T | undefined;
    /** Weak ETag exactly as returned, suitable for a later If-Match. */
    etag: string | undefined;
    requestId: string | undefined;
}
/**
 * Thin, honest wrapper over Microsoft Graph.
 *
 * It does five things and nothing else: injects the bearer token, retries the
 * statuses that are worth retrying, follows @odata.nextLink, passes OData query
 * options through untouched, and turns failures into errors that never contain
 * a credential.
 */
export declare class GraphClient {
    private readonly baseUrl;
    private readonly auth;
    private readonly fetchImpl;
    private readonly sleep;
    private readonly maxRetries;
    private readonly maxBackoffMs;
    private readonly service;
    constructor(options: GraphClientOptions);
    /** Build an absolute Graph URL from a path (or pass an absolute URL through). */
    resolveUrl(pathOrUrl: string, query?: ODataQuery): string;
    request<T = unknown>(pathOrUrl: string, options?: GraphRequestOptions): Promise<GraphResponse<T>>;
    /**
     * Like request(), but for endpoints that do not speak JSON in or out —
     * OneNote's page-content and page-creation endpoints take/return raw
     * HTML or multipart/form-data, and JSON.stringify()-ing that body or
     * demanding accept: application/json would break both directions.
     * Retry/backoff/auth/error handling are identical to request(); only the
     * body and content negotiation differ.
     */
    requestRaw(pathOrUrl: string, options?: {
        method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
        query?: ODataQuery;
        body?: string | Uint8Array;
        contentType?: string;
        accept?: string;
        headers?: Record<string, string>;
    }): Promise<{
        status: number;
        text: string;
        contentType: string | undefined;
        requestId: string | undefined;
    }>;
    /** GET a single resource, returning the parsed body. */
    get<T>(pathOrUrl: string, query?: ODataQuery): Promise<T>;
    /**
     * GET a resource together with its ETag. Planner writes need both, and they
     * need them from the *same* read.
     */
    getWithEtag<T>(pathOrUrl: string, query?: ODataQuery): Promise<{
        value: T;
        etag: string | undefined;
    }>;
    /**
     * Follow @odata.nextLink to the end and return every page's items.
     *
     * Graph paginates almost everything, often at 20 items for Planner. A caller
     * that reads only the first page silently loses data, so this returns all of
     * it. `maxItems` exists as a circuit-breaker, not as a normal control.
     */
    getAll<T>(pathOrUrl: string, query?: ODataQuery, limits?: {
        maxItems?: number;
        maxPages?: number;
    }): Promise<T[]>;
    private backoffMs;
    private retryDelayMs;
    private toError;
}
