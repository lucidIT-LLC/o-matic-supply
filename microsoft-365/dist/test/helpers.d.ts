import type { AuthProvider } from "../src/auth/types.js";
import { GraphClient, type FetchLike } from "../src/graph/client.js";
import { PlannerApi } from "../src/planner/api.js";
/** A token that is deliberately recognisable if it ever leaks into output. */
export declare const FAKE_TOKEN = "eyJfake.token.value-DO-NOT-LOG";
export declare const stubAuth: AuthProvider;
export interface RecordedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}
export interface StubRoute {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
}
/**
 * A fetch double that records every request and answers from a handler.
 * No network, no timers worth waiting on.
 */
export declare function stubFetch(handler: (request: RecordedRequest) => StubRoute): {
    fetchImpl: FetchLike;
    requests: RecordedRequest[];
};
export declare function makeGraph(fetchImpl: FetchLike, overrides?: {
    maxRetries?: number;
}): GraphClient;
export declare function makePlanner(fetchImpl: FetchLike): PlannerApi;
