import type { AuthProvider } from "../src/auth/types.js";
import { GraphClient, type FetchLike } from "../src/graph/client.js";
import { UserResolver } from "../src/graph/users.js";
import { PlannerApi } from "../src/planner/api.js";

/** A token that is deliberately recognisable if it ever leaks into output. */
export const FAKE_TOKEN = "eyJfake.token.value-DO-NOT-LOG";

export const stubAuth: AuthProvider = {
  async getAccessToken() {
    return FAKE_TOKEN;
  },
};

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
export function stubFetch(handler: (request: RecordedRequest) => StubRoute): {
  fetchImpl: FetchLike;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[key.toLowerCase()] = value;
    }
    const request: RecordedRequest = {
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const route = handler(request);
    const status = route.status ?? 200;
    const payload = route.body === undefined ? "" : JSON.stringify(route.body);
    return new Response(status === 204 || payload === "" ? null : payload, {
      status,
      headers: { "content-type": "application/json", ...(route.headers ?? {}) },
    });
  };
  return { fetchImpl, requests };
}

export function makeGraph(fetchImpl: FetchLike, overrides: { maxRetries?: number } = {}): GraphClient {
  return new GraphClient({
    baseUrl: "https://graph.microsoft.com/v1.0",
    auth: stubAuth,
    fetchImpl,
    sleep: async () => undefined, // tests never really wait
    maxRetries: overrides.maxRetries ?? 2,
  });
}

export function makePlanner(fetchImpl: FetchLike): PlannerApi {
  const graph = makeGraph(fetchImpl);
  return new PlannerApi(graph, new UserResolver(graph));
}
