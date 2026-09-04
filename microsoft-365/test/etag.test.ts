import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { EtagConflictError, GraphError } from "../src/errors.js";
import { CHECKLIST_ITEM_TYPE } from "../src/planner/semantics.js";
import { makePlanner, stubFetch, FAKE_TOKEN, type RecordedRequest, type StubRoute } from "./helpers.js";

const TASK_ID = "task-1";
const TASK_URL = `https://graph.microsoft.com/v1.0/planner/tasks/${TASK_ID}`;
const DETAILS_URL = `${TASK_URL}/details`;

/** Etags are deliberately different for the task and its details. */
const TASK_ETAG_V1 = 'W/"JzEtVGFzayAgQEBAQEBAQEBAQEBAQEBAWCc="';
const TASK_ETAG_V2 = 'W/"JzItVGFzayAgQEBAQEBAQEBAQEBAQEBAWCc="';
const DETAILS_ETAG = 'W/"JzEtVGFza0RldGFpbHMgQEBAQEBAQEBAWCc="';

function taskBody(etag: string): Record<string, unknown> {
  return {
    "@odata.etag": etag,
    id: TASK_ID,
    planId: "plan-1",
    bucketId: "bucket-1",
    title: "Original title",
    percentComplete: 0,
  };
}

function detailsBody(): Record<string, unknown> {
  return {
    "@odata.etag": DETAILS_ETAG,
    id: TASK_ID,
    description: "before",
    checklist: {
      "item-a": { "@odata.type": CHECKLIST_ITEM_TYPE, title: "Draft", isChecked: false },
    },
  };
}

describe("Planner ETag handling", () => {
  test("a write re-reads the resource and sends that read's ETag", async () => {
    const { fetchImpl, requests } = stubFetch((request): StubRoute => {
      if (request.method === "GET" && request.url === TASK_URL) {
        return { body: taskBody(TASK_ETAG_V1) };
      }
      if (request.method === "PATCH" && request.url === TASK_URL) {
        return { body: { ...taskBody(TASK_ETAG_V2), title: "New title" } };
      }
      throw new Error(`unexpected ${request.method} ${request.url}`);
    });

    const planner = makePlanner(fetchImpl);
    const updated = await planner.updateTask(TASK_ID, { title: "New title" });

    assert.equal(updated.title, "New title");
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.method, "GET");
    assert.equal(requests[1]?.method, "PATCH");
    assert.equal(requests[1]?.headers["if-match"], TASK_ETAG_V1);
  });

  test("no ETag is cached between calls — every write reads again", async () => {
    let served = 0;
    const { fetchImpl, requests } = stubFetch((request): StubRoute => {
      if (request.method === "GET") {
        served += 1;
        return { body: taskBody(served === 1 ? TASK_ETAG_V1 : TASK_ETAG_V2) };
      }
      return { body: taskBody(TASK_ETAG_V2) };
    });

    const planner = makePlanner(fetchImpl);
    await planner.updateTask(TASK_ID, { title: "one" });
    await planner.updateTask(TASK_ID, { title: "two" });

    const patches = requests.filter((r) => r.method === "PATCH");
    assert.equal(patches.length, 2);
    // Second write must use the ETag from the SECOND read, not the first.
    assert.equal(patches[0]?.headers["if-match"], TASK_ETAG_V1);
    assert.equal(patches[1]?.headers["if-match"], TASK_ETAG_V2);
  });

  test("a 412 becomes a clear 'the card changed, re-read and retry' error", async () => {
    const { fetchImpl, requests } = stubFetch((request): StubRoute => {
      if (request.method === "GET") return { body: taskBody(TASK_ETAG_V1) };
      return {
        status: 412,
        body: {
          error: {
            code: "",
            message: "The specified item was modified by another client.",
          },
        },
      };
    });

    const planner = makePlanner(fetchImpl);
    const error = await planner
      .updateTask(TASK_ID, { percentComplete: 100 })
      .then(() => null)
      .catch((e: unknown) => e);

    assert.ok(error instanceof EtagConflictError, "expected an EtagConflictError");
    assert.equal(error.code, "PLANNER_ETAG_CONFLICT");
    assert.equal(error.resource, "task");
    const message = error.toToolMessage();
    assert.match(message, /changed in Planner/);
    assert.match(message, /nothing was saved/);
    assert.match(message, /Re-read the task/);
    // The raw HTTP status must not be the headline the caller has to decode.
    assert.doesNotMatch(message, /^GRAPH_412/);
    // A 412 is not retryable: exactly one GET and one PATCH.
    assert.equal(requests.length, 2);
  });

  test("a 412 on details names the details resource, not the task", async () => {
    const { fetchImpl } = stubFetch((request): StubRoute => {
      if (request.method === "GET" && request.url === DETAILS_URL) return { body: detailsBody() };
      return { status: 412, body: { error: { message: "conflict" } } };
    });

    const planner = makePlanner(fetchImpl);
    const error = await planner
      .updateTaskDetails(TASK_ID, { description: "after" })
      .then(() => null)
      .catch((e: unknown) => e);

    assert.ok(error instanceof EtagConflictError);
    assert.equal(error.resource, "task details");
  });

  test("the task ETag and the details ETag are never interchanged", async () => {
    const { fetchImpl, requests } = stubFetch((request): StubRoute => {
      if (request.url === DETAILS_URL) return { body: detailsBody() };
      if (request.url === TASK_URL) return { body: taskBody(TASK_ETAG_V1) };
      throw new Error(`unexpected ${request.url}`);
    });

    const planner = makePlanner(fetchImpl);
    await planner.updateTask(TASK_ID, { title: "t" });
    await planner.updateTaskDetails(TASK_ID, { description: "d" });

    const taskPatch = requests.find((r) => r.method === "PATCH" && r.url === TASK_URL);
    const detailsPatch = requests.find((r) => r.method === "PATCH" && r.url === DETAILS_URL);

    assert.equal(taskPatch?.headers["if-match"], TASK_ETAG_V1);
    assert.equal(detailsPatch?.headers["if-match"], DETAILS_ETAG);
    assert.notEqual(taskPatch?.headers["if-match"], detailsPatch?.headers["if-match"]);
  });

  test("a checklist delta is computed from the copy whose ETag is sent", async () => {
    const { fetchImpl, requests } = stubFetch((request): StubRoute => {
      if (request.url === DETAILS_URL && request.method === "GET") return { body: detailsBody() };
      return { body: detailsBody() };
    });

    const planner = makePlanner(fetchImpl);
    await planner.updateTaskDetails(TASK_ID, {
      checklist: [{ action: "check", title: "Draft" }],
    });

    const patch = requests.find((r) => r.method === "PATCH");
    const checklist = (patch?.body as { checklist: Record<string, unknown> }).checklist;
    assert.deepEqual(Object.keys(checklist), ["item-a"]);
    assert.equal(patch?.headers["if-match"], DETAILS_ETAG);
  });

  test("deleting re-reads first and sends If-Match", async () => {
    const { fetchImpl, requests } = stubFetch((request): StubRoute => {
      if (request.method === "GET") return { body: taskBody(TASK_ETAG_V1) };
      return { status: 204 };
    });

    const planner = makePlanner(fetchImpl);
    await planner.deleteTask(TASK_ID);

    assert.equal(requests[0]?.method, "GET");
    assert.equal(requests[1]?.method, "DELETE");
    assert.equal(requests[1]?.headers["if-match"], TASK_ETAG_V1);
  });

  test("a non-412 failure stays a GraphError and never echoes the token", async () => {
    const { fetchImpl } = stubFetch((request): StubRoute => {
      if (request.method === "GET") return { body: taskBody(TASK_ETAG_V1) };
      return { status: 403, body: { error: { code: "Forbidden", message: "no" } } };
    });

    const planner = makePlanner(fetchImpl);
    const error = await planner
      .updateTask(TASK_ID, { title: "x" })
      .then(() => null)
      .catch((e: unknown) => e);

    assert.ok(error instanceof GraphError);
    assert.equal(error.status, 403);
    assert.ok(!error.toToolMessage().includes(FAKE_TOKEN));
    assert.match(error.toToolMessage(), /Tasks.ReadWrite/);
  });
});
