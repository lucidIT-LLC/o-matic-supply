import { redact } from "./util/redact.js";

/** Base for every error this server raises deliberately. */
export class M365Error extends Error {
  readonly code: string;
  /** Operator-facing next step, when there is an obvious one. */
  readonly hint: string | undefined;

  constructor(code: string, message: string, hint?: string) {
    super(redact(message));
    this.name = new.target.name;
    this.code = code;
    this.hint = hint === undefined ? undefined : redact(hint);
  }

  /** Single string suitable for returning to an MCP caller. */
  toToolMessage(): string {
    return this.hint ? `${this.code}: ${this.message}\n\nNext step: ${this.hint}` : `${this.code}: ${this.message}`;
  }
}

/** Missing or malformed configuration. Always fatal, always fail fast. */
export class ConfigError extends M365Error {
  constructor(message: string, hint?: string) {
    super("CONFIG", message, hint);
  }
}

/** Anything that goes wrong acquiring or refreshing a token. */
export class AuthError extends M365Error {
  constructor(message: string, hint?: string) {
    super("AUTH", message, hint);
  }
}

/** Token storage backend failure (Keychain, etc.). */
export class TokenStoreError extends M365Error {
  constructor(message: string, hint?: string) {
    super("TOKEN_STORE", message, hint);
  }
}

/** A feature that exists as an interface but is not implemented yet. */
export class NotImplementedError extends M365Error {
  constructor(what: string, hint?: string) {
    super("NOT_IMPLEMENTED", `${what} is not implemented yet.`, hint);
  }
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
export class GraphError extends M365Error {
  readonly detail: GraphErrorDetail;

  constructor(detail: GraphErrorDetail, hint?: string) {
    const service = detail.service ?? "Graph";
    const parts = [
      `${service} ${detail.method} ${detail.url} failed with ${detail.status} ${detail.statusText}`,
    ];
    if (detail.graphCode) parts.push(`code=${detail.graphCode}`);
    if (detail.graphMessage) parts.push(`message=${detail.graphMessage}`);
    if (detail.requestId) parts.push(`request-id=${detail.requestId}`);
    super(`${(detail.service ?? "GRAPH").toUpperCase()}_${detail.status}`, parts.join(" | "), hint);
    this.detail = detail;
  }

  get status(): number {
    return this.detail.status;
  }
}

/**
 * HTTP 412 from a Planner write. Planner uses optimistic concurrency: the ETag
 * you send must match the resource's current one. A 412 means somebody (or
 * something) changed the resource after we read it.
 */
export class EtagConflictError extends M365Error {
  readonly resource: string;
  readonly detail: GraphErrorDetail;

  constructor(resource: string, detail: GraphErrorDetail) {
    super(
      "PLANNER_ETAG_CONFLICT",
      `This ${resource} changed in Planner between the read and the write, so the update was rejected (HTTP 412) and nothing was saved.`,
      `Re-read the ${resource} to see its current state, decide whether your change still applies, then retry the write. Do not reuse the previous copy — the ETag it carried is dead.`,
    );
    this.resource = resource;
    this.detail = detail;
  }
}

/** Convert anything thrown into a safe, caller-readable message. */
export function toToolMessage(error: unknown): string {
  if (error instanceof M365Error) return error.toToolMessage();
  if (error instanceof Error) return redact(`${error.name}: ${error.message}`);
  return redact(String(error));
}
