import type { AuthProvider } from "../auth/types.js";
import { EtagConflictError, GraphError, type GraphErrorDetail } from "../errors.js";
import { log } from "../util/logger.js";

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

interface ODataCollection<T> {
  value?: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 509]);

/**
 * Thin, honest wrapper over Microsoft Graph.
 *
 * It does five things and nothing else: injects the bearer token, retries the
 * statuses that are worth retrying, follows @odata.nextLink, passes OData query
 * options through untouched, and turns failures into errors that never contain
 * a credential.
 */
export class GraphClient {
  private readonly baseUrl: string;
  private readonly auth: AuthProvider;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly maxBackoffMs: number;
  private readonly service: string;

  constructor(options: GraphClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.auth = options.auth;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? 5;
    this.maxBackoffMs = options.maxBackoffMs ?? 60_000;
    this.service = options.service ?? "Graph";
  }

  /** Build an absolute Graph URL from a path (or pass an absolute URL through). */
  resolveUrl(pathOrUrl: string, query?: ODataQuery): string {
    const base = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : `${this.baseUrl}/${pathOrUrl.replace(/^\/+/, "")}`;
    if (!query) return base;

    const url = new URL(base);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      const encoded = Array.isArray(value) ? value.join(",") : String(value);
      if (encoded === "") continue;
      url.searchParams.set(key, encoded);
    }
    return url.toString();
  }

  async request<T = unknown>(
    pathOrUrl: string,
    options: GraphRequestOptions = {},
  ): Promise<GraphResponse<T>> {
    const method = options.method ?? "GET";
    const url = this.resolveUrl(pathOrUrl, options.query);

    let attempt = 0;
    for (;;) {
      const token = await this.auth.getAccessToken();
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...options.headers,
      };
      if (options.body !== undefined) headers["content-type"] = "application/json";
      if (options.ifMatch) headers["if-match"] = options.ifMatch;
      if (options.prefer) headers["prefer"] = options.prefer;

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
      } catch (error) {
        if (attempt >= this.maxRetries) {
          throw new GraphError(
            {
              service: this.service,
              status: 0,
              statusText: "network error",
              method,
              url,
              graphMessage: (error as Error).message,
            },
            "Check network reachability to Microsoft Graph, then retry.",
          );
        }
        await this.sleep(this.backoffMs(attempt));
        attempt += 1;
        continue;
      }

      if (response.ok || response.status === 304) {
        return {
          status: response.status,
          body: await parseBody<T>(response),
          etag: response.headers.get("etag") ?? undefined,
          requestId: response.headers.get("request-id") ?? undefined,
        };
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < this.maxRetries) {
        const wait = this.retryDelayMs(response, attempt);
        log.warn(
          `Graph ${method} ${url} returned ${response.status}; retrying in ${Math.round(wait)}ms (attempt ${attempt + 1}/${this.maxRetries}).`,
        );
        // Drain the body so the socket can be reused.
        await response.text().catch(() => undefined);
        await this.sleep(wait);
        attempt += 1;
        continue;
      }

      throw await this.toError(response, method, url, options.conflictResource);
    }
  }

  /**
   * Like request(), but for endpoints that do not speak JSON in or out —
   * OneNote's page-content and page-creation endpoints take/return raw
   * HTML or multipart/form-data, and JSON.stringify()-ing that body or
   * demanding accept: application/json would break both directions.
   * Retry/backoff/auth/error handling are identical to request(); only the
   * body and content negotiation differ.
   */
  async requestRaw(
    pathOrUrl: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
      query?: ODataQuery;
      body?: string | Uint8Array;
      contentType?: string;
      accept?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<{ status: number; text: string; contentType: string | undefined; requestId: string | undefined }> {
    const method = options.method ?? "GET";
    const url = this.resolveUrl(pathOrUrl, options.query);

    let attempt = 0;
    for (;;) {
      const token = await this.auth.getAccessToken();
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        accept: options.accept ?? "*/*",
        ...(options.contentType ? { "content-type": options.contentType } : {}),
        ...options.headers,
      };

      let response: Response;
      try {
        response = await this.fetchImpl(url, { method, headers, body: options.body });
      } catch (error) {
        if (attempt >= this.maxRetries) {
          throw new GraphError(
            {
              service: this.service,
              status: 0,
              statusText: "network error",
              method,
              url,
              graphMessage: (error as Error).message,
            },
            "Check network reachability to Microsoft Graph, then retry.",
          );
        }
        await this.sleep(this.backoffMs(attempt));
        attempt += 1;
        continue;
      }

      if (response.ok || response.status === 304) {
        return {
          status: response.status,
          text: await response.text(),
          contentType: response.headers.get("content-type") ?? undefined,
          requestId: response.headers.get("request-id") ?? undefined,
        };
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < this.maxRetries) {
        const wait = this.retryDelayMs(response, attempt);
        log.warn(
          `Graph ${method} ${url} returned ${response.status}; retrying in ${Math.round(wait)}ms (attempt ${attempt + 1}/${this.maxRetries}).`,
        );
        await response.text().catch(() => undefined);
        await this.sleep(wait);
        attempt += 1;
        continue;
      }

      throw await this.toError(response, method, url, undefined);
    }
  }

  /** GET a single resource, returning the parsed body. */
  async get<T>(pathOrUrl: string, query?: ODataQuery): Promise<T> {
    const response = await this.request<T>(pathOrUrl, { method: "GET", query });
    if (response.body === undefined) {
      throw new GraphError({
        service: this.service,
        status: response.status,
        statusText: "empty body",
        method: "GET",
        url: this.resolveUrl(pathOrUrl, query),
        graphMessage: `${this.service} returned no body for a GET that should have returned one.`,
      });
    }
    return response.body;
  }

  /**
   * GET a resource together with its ETag. Planner writes need both, and they
   * need them from the *same* read.
   */
  async getWithEtag<T>(
    pathOrUrl: string,
    query?: ODataQuery,
  ): Promise<{ value: T; etag: string | undefined }> {
    const response = await this.request<T & { "@odata.etag"?: string }>(pathOrUrl, {
      method: "GET",
      query,
    });
    if (response.body === undefined) {
      throw new GraphError({
        service: this.service,
        status: response.status,
        statusText: "empty body",
        method: "GET",
        url: this.resolveUrl(pathOrUrl, query),
        graphMessage: "Graph returned no body.",
      });
    }
    // Planner puts the ETag in the payload as @odata.etag; other workloads use
    // the HTTP header. Prefer the payload value — it is the one Planner honours.
    const etag = response.body["@odata.etag"] ?? response.etag;
    return { value: response.body, etag };
  }

  /**
   * Follow @odata.nextLink to the end and return every page's items.
   *
   * Graph paginates almost everything, often at 20 items for Planner. A caller
   * that reads only the first page silently loses data, so this returns all of
   * it. `maxItems` exists as a circuit-breaker, not as a normal control.
   */
  async getAll<T>(
    pathOrUrl: string,
    query?: ODataQuery,
    limits: { maxItems?: number; maxPages?: number } = {},
  ): Promise<T[]> {
    const maxItems = limits.maxItems ?? Number.POSITIVE_INFINITY;
    const maxPages = limits.maxPages ?? 200;

    const items: T[] = [];
    let url: string | undefined = this.resolveUrl(pathOrUrl, query);
    let pages = 0;

    while (url) {
      const response: GraphResponse<ODataCollection<T>> = await this.request<ODataCollection<T>>(url, {
        method: "GET",
      });
      pages += 1;
      for (const item of response.body?.value ?? []) {
        items.push(item);
        if (items.length >= maxItems) return items;
      }
      const next = response.body?.["@odata.nextLink"];
      if (!next) break;
      if (pages >= maxPages) {
        log.warn(`Stopped paginating ${pathOrUrl} after ${pages} pages; results are incomplete.`);
        break;
      }
      // Trust the server's nextLink verbatim — it carries an opaque skiptoken
      // and re-applying our own query options to it corrupts the sequence.
      url = next;
    }
    return items;
  }

  private backoffMs(attempt: number): number {
    const base = Math.min(this.maxBackoffMs, 500 * 2 ** attempt);
    return base / 2 + Math.random() * (base / 2); // full-ish jitter
  }

  private retryDelayMs(response: Response, attempt: number): number {
    const header = response.headers.get("retry-after");
    if (header) {
      const seconds = Number(header);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, this.maxBackoffMs);
      const date = Date.parse(header);
      if (!Number.isNaN(date)) {
        return Math.min(Math.max(date - Date.now(), 0), this.maxBackoffMs);
      }
    }
    return this.backoffMs(attempt);
  }

  private async toError(
    response: Response,
    method: string,
    url: string,
    conflictResource: string | undefined,
  ): Promise<Error> {
    let graphCode: string | undefined;
    let graphMessage: string | undefined;
    let clientRequestId: string | undefined;

    try {
      const text = await response.text();
      if (text) {
        const parsed = JSON.parse(text) as {
          error?: { code?: string; message?: string; innerError?: Record<string, string> };
        };
        graphCode = parsed.error?.code;
        graphMessage = parsed.error?.message;
        clientRequestId = parsed.error?.innerError?.["client-request-id"];
      }
    } catch {
      // A non-JSON error body tells us nothing useful and may be an HTML
      // proxy page; drop it rather than forwarding noise.
    }

    const detail: GraphErrorDetail = {
      service: this.service,
      status: response.status,
      statusText: response.statusText,
      method,
      url,
      graphCode,
      graphMessage,
      requestId: response.headers.get("request-id") ?? undefined,
      clientRequestId,
      date: response.headers.get("date") ?? undefined,
    };

    if (response.status === 412 && conflictResource) {
      return new EtagConflictError(conflictResource, detail);
    }
    return new GraphError(detail, hintFor(detail));
  }
}

async function parseBody<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204 || response.status === 304) return undefined;
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function hintFor(detail: GraphErrorDetail): string | undefined {
  switch (detail.status) {
    case 401:
      return "The access token was rejected. Run m365_auth_status, and m365_sign_in if the session has lapsed.";
    case 403:
      return "Authorization failed. Most often this is a missing admin-consented scope — Planner needs Tasks.ReadWrite, and reading plan membership needs Group.Read.All. Check the Entra app registration's API permissions.";
    case 404:
      return "The resource does not exist, or the signed-in user cannot see it. Planner returns 404 rather than 403 for plans in groups the user does not belong to.";
    case 400:
      return detail.graphMessage?.includes("etag")
        ? "Planner rejected the request payload; re-read the resource and retry with its current ETag."
        : undefined;
    default:
      return undefined;
  }
}
