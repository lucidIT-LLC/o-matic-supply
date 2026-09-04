import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { GraphError } from "../src/errors.js";
import { makeGraph, stubFetch, FAKE_TOKEN, type StubRoute } from "./helpers.js";

const BASE = "https://graph.microsoft.com/v1.0";

describe("@odata.nextLink pagination", () => {
  test("follows every page and returns the union, in order", async () => {
    const { fetchImpl, requests } = stubFetch((request): StubRoute => {
      if (request.url.includes("skiptoken=2")) return { body: { value: [{ id: "e" }] } };
      if (request.url.includes("skiptoken=1")) {
        return {
          body: {
            value: [{ id: "c" }, { id: "d" }],
            "@odata.nextLink": `${BASE}/planner/plans/p1/tasks?$skiptoken=2`,
          },
        };
      }
      return {
        body: {
          value: [{ id: "a" }, { id: "b" }],
          "@odata.nextLink": `${BASE}/planner/plans/p1/tasks?$skiptoken=1`,
        },
      };
    });

    const graph = makeGraph(fetchImpl);
    const items = await graph.getAll<{ id: string }>("/planner/plans/p1/tasks");

    assert.deepEqual(items.map((i) => i.id), ["a", "b", "c", "d", "e"]);
    assert.equal(requests.length, 3);
  });

  test("a single page with no nextLink makes exactly one request", async () => {
    const { fetchImpl, requests } = stubFetch(() => ({ body: { value: [{ id: "only" }] } }));
    const graph = makeGraph(fetchImpl);
    const items = await graph.getAll("/planner/plans/p1/buckets");
    assert.equal(items.length, 1);
    assert.equal(requests.length, 1);
  });

  test("an empty collection yields an empty array, not a throw", async () => {
    const { fetchImpl } = stubFetch(() => ({ body: { value: [] } }));
    const graph = makeGraph(fetchImpl);
    assert.deepEqual(await graph.getAll("/me/planner/tasks"), []);
  });

  test("the server's nextLink is used verbatim — our query options are not re-applied", async () => {
    const nextLink = `${BASE}/users?$skiptoken=OPAQUE&$select=id`;
    const { fetchImpl, requests } = stubFetch((request): StubRoute => {
      if (request.url === nextLink) return { body: { value: [{ id: "2" }] } };
      return { body: { value: [{ id: "1" }], "@odata.nextLink": nextLink } };
    });

    const graph = makeGraph(fetchImpl);
    await graph.getAll("/users", { $select: ["id", "displayName"], $top: 1 });

    assert.equal(requests[1]?.url, nextLink);
    assert.ok(!requests[1]?.url.includes("displayName"));
  });

  test("maxItems stops the walk early without asking for more pages", async () => {
    const { fetchImpl, requests } = stubFetch(() => ({
      body: {
        value: [{ id: "a" }, { id: "b" }, { id: "c" }],
        "@odata.nextLink": `${BASE}/planner/plans/p1/tasks?$skiptoken=next`,
      },
    }));

    const graph = makeGraph(fetchImpl);
    const items = await graph.getAll("/planner/plans/p1/tasks", undefined, { maxItems: 2 });

    assert.equal(items.length, 2);
    assert.equal(requests.length, 1);
  });

  test("maxPages is a circuit breaker against an endless nextLink chain", async () => {
    let page = 0;
    const { fetchImpl, requests } = stubFetch(() => {
      page += 1;
      return {
        body: { value: [{ id: `p${page}` }], "@odata.nextLink": `${BASE}/x?$skiptoken=${page}` },
      };
    });

    const graph = makeGraph(fetchImpl);
    const items = await graph.getAll("/x", undefined, { maxPages: 4 });

    assert.equal(items.length, 4);
    assert.equal(requests.length, 4);
  });

  test("every page carries the bearer token, and nothing else leaks it", async () => {
    const { fetchImpl, requests } = stubFetch((request): StubRoute => {
      if (request.url.includes("skiptoken")) return { body: { value: [{ id: "2" }] } };
      return { body: { value: [{ id: "1" }], "@odata.nextLink": `${BASE}/x?$skiptoken=1` } };
    });

    const graph = makeGraph(fetchImpl);
    await graph.getAll("/x");

    for (const request of requests) {
      assert.equal(request.headers["authorization"], `Bearer ${FAKE_TOKEN}`);
    }
  });
});

describe("retry and rate limiting", () => {
  test("a 429 is retried and Retry-After is honoured", async () => {
    const waits: number[] = [];
    let calls = 0;
    const { fetchImpl } = stubFetch(() => {
      calls += 1;
      if (calls === 1) return { status: 429, headers: { "retry-after": "7" }, body: {} };
      return { body: { value: [{ id: "ok" }] } };
    });

    const graph = new (await import("../src/graph/client.js")).GraphClient({
      baseUrl: BASE,
      auth: { async getAccessToken() { return FAKE_TOKEN; } },
      fetchImpl,
      sleep: async (ms) => { waits.push(ms); },
      maxRetries: 3,
    });

    const items = await graph.getAll("/x");
    assert.equal(items.length, 1);
    assert.equal(calls, 2);
    assert.deepEqual(waits, [7000]);
  });

  test("a 5xx is retried, then surfaces as a GraphError once retries run out", async () => {
    let calls = 0;
    const { fetchImpl } = stubFetch(() => {
      calls += 1;
      return { status: 503, body: { error: { code: "ServiceUnavailable", message: "later" } } };
    });

    const graph = makeGraph(fetchImpl, { maxRetries: 2 });
    const error = await graph.getAll("/x").then(() => null).catch((e: unknown) => e);

    assert.ok(error instanceof GraphError);
    assert.equal(error.status, 503);
    assert.equal(calls, 3); // initial + 2 retries
  });

  test("a 4xx is not retried", async () => {
    let calls = 0;
    const { fetchImpl } = stubFetch(() => {
      calls += 1;
      return { status: 404, body: { error: { code: "NotFound", message: "gone" } } };
    });

    const graph = makeGraph(fetchImpl);
    await graph.getAll("/x").catch(() => undefined);
    assert.equal(calls, 1);
  });
});
