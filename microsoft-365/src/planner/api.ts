import { M365Error } from "../errors.js";
import type { GraphClient } from "../graph/client.js";
import type { UserResolver } from "../graph/users.js";
import { log } from "../util/logger.js";
import {
  buildChecklistPatch,
  buildReferencePatch,
  decodeReferenceKey,
  describeCategories,
  describePriority,
  describeProgress,
  type ChecklistOperation,
  type ReferenceOperation,
} from "./semantics.js";
import type {
  PlannerBucket,
  PlannerGoal,
  PlannerPlan,
  PlannerPlanDetails,
  PlannerTask,
  PlannerTaskCard,
  PlannerTaskDetails,
} from "./types.js";

/**
 * Planner repository.
 *
 * ============================ ETag discipline ============================
 * Every Planner PATCH and DELETE carries If-Match with the resource's CURRENT
 * ETag. Two rules follow, and they are enforced structurally here rather than
 * left to callers:
 *
 *  1. Read immediately before every write. The ETag from a previous tool call
 *    is not just stale, it is a bug: someone may have touched the card in the
 *    Planner UI in between, and Planner will either reject the write (412) or —
 *    worse, for dictionary fields — you will have computed your delta against a
 *    version that no longer exists. Nothing in this class caches an ETag across
 *    calls, and no ETag is ever accepted as a tool parameter.
 *
 *  2. `/planner/tasks/{id}` and `/planner/tasks/{id}/details` are SEPARATE
 *    resources with SEPARATE ETags. Using one for the other is the single most
 *    common Planner integration bug. They are read by two different methods
 *    here and never share a variable.
 * =========================================================================
 */
export class PlannerApi {
  private readonly graph: GraphClient;
  private readonly users: UserResolver;

  constructor(graph: GraphClient, users: UserResolver) {
    this.graph = graph;
    this.users = users;
  }

  /* ------------------------------------------------------------------ plans */

  /** Plans in a specific group (Microsoft 365 group / Team). */
  async listPlansByGroup(groupId: string): Promise<PlannerPlan[]> {
    return this.graph.getAll<PlannerPlan>(`/groups/${encodeURIComponent(groupId)}/planner/plans`);
  }

  /** Plans the signed-in user can see in their Planner hub. */
  async listMyPlans(): Promise<PlannerPlan[]> {
    return this.graph.getAll<PlannerPlan>("/me/planner/plans");
  }

  /** Unified groups the signed-in user belongs to — the containers of plans. */
  async listMyGroups(): Promise<Array<{ id: string; displayName?: string; mail?: string }>> {
    return this.graph.getAll<{ id: string; displayName?: string; mail?: string }>(
      "/me/memberOf/microsoft.graph.group",
      { $select: ["id", "displayName", "mail", "groupTypes"], $top: 100 },
    );
  }

  async getPlan(planId: string): Promise<PlannerPlan> {
    return this.graph.get<PlannerPlan>(`/planner/plans/${encodeURIComponent(planId)}`);
  }

  async getPlanDetails(planId: string): Promise<PlannerPlanDetails> {
    return this.graph.get<PlannerPlanDetails>(`/planner/plans/${encodeURIComponent(planId)}/details`);
  }

  /**
   * Goals for a plan — the high-level outcomes a set of tasks is meant to
   * accomplish, each optionally linked to specific tasks via the task's
   * read-only goalIds.
   *
   * BETA GRAPH ENDPOINT, deliberately. Goals do not exist anywhere in the
   * stable v1.0 Planner API as of this writing — confirmed by checking
   * both directly, not assumed. Microsoft's own beta docs carry the
   * standard caveat that beta surfaces are subject to change and not
   * supported in production; this call hits https://graph.microsoft.com/beta
   * explicitly (an absolute URL, bypassing the configured v1.0 base) rather
   * than silently reinterpreting the whole server's base URL as beta. If
   * this starts failing, that caveat is why — check whether the shape
   * changed before assuming a config or auth problem.
   */
  async listGoals(planId: string): Promise<PlannerGoal[]> {
    return this.graph.getAll<PlannerGoal>(
      `https://graph.microsoft.com/beta/planner/plans/${encodeURIComponent(planId)}/goals`,
    );
  }

  /** Category key -> label map for a plan, used to translate task labels. */
  async getCategoryDescriptions(planId: string): Promise<Record<string, string | null>> {
    try {
      const details = await this.getPlanDetails(planId);
      return details.categoryDescriptions ?? {};
    } catch (error) {
      log.warn(`Could not read plan details for ${planId}; labels will not be resolved.`, error);
      return {};
    }
  }

  /* ---------------------------------------------------------------- buckets */

  async listBuckets(planId: string): Promise<PlannerBucket[]> {
    return this.graph.getAll<PlannerBucket>(`/planner/plans/${encodeURIComponent(planId)}/buckets`);
  }

  async getBucket(bucketId: string): Promise<{ value: PlannerBucket; etag: string | undefined }> {
    return this.graph.getWithEtag<PlannerBucket>(`/planner/buckets/${encodeURIComponent(bucketId)}`);
  }

  async createBucket(planId: string, name: string, orderHint = " !"): Promise<PlannerBucket> {
    const response = await this.graph.request<PlannerBucket>("/planner/buckets", {
      method: "POST",
      body: { name, planId, orderHint },
    });
    return requireBody(response.body, "bucket");
  }

  async renameBucket(bucketId: string, name: string): Promise<PlannerBucket> {
    const fresh = await this.getBucket(bucketId); // read immediately before write
    const response = await this.graph.request<PlannerBucket>(
      `/planner/buckets/${encodeURIComponent(bucketId)}`,
      {
        method: "PATCH",
        body: { name },
        ifMatch: requireEtag(fresh.etag, "bucket"),
        conflictResource: "bucket",
        prefer: "return=representation",
      },
    );
    return response.body ?? { ...fresh.value, name };
  }

  async deleteBucket(bucketId: string): Promise<void> {
    const fresh = await this.getBucket(bucketId);
    await this.graph.request(`/planner/buckets/${encodeURIComponent(bucketId)}`, {
      method: "DELETE",
      ifMatch: requireEtag(fresh.etag, "bucket"),
      conflictResource: "bucket",
    });
  }

  /* ------------------------------------------------------------------ tasks */

  async listTasksByPlan(planId: string): Promise<PlannerTask[]> {
    return this.graph.getAll<PlannerTask>(`/planner/plans/${encodeURIComponent(planId)}/tasks`);
  }

  async listTasksByBucket(bucketId: string): Promise<PlannerTask[]> {
    return this.graph.getAll<PlannerTask>(`/planner/buckets/${encodeURIComponent(bucketId)}/tasks`);
  }

  async listMyTasks(): Promise<PlannerTask[]> {
    return this.graph.getAll<PlannerTask>("/me/planner/tasks");
  }

  /** Fresh task + its own ETag. Never reuse this ETag for /details. */
  async readTask(taskId: string): Promise<{ value: PlannerTask; etag: string | undefined }> {
    return this.graph.getWithEtag<PlannerTask>(`/planner/tasks/${encodeURIComponent(taskId)}`);
  }

  /** Fresh task details + their own, DIFFERENT ETag. Never reuse for the task. */
  async readTaskDetails(
    taskId: string,
  ): Promise<{ value: PlannerTaskDetails; etag: string | undefined }> {
    return this.graph.getWithEtag<PlannerTaskDetails>(
      `/planner/tasks/${encodeURIComponent(taskId)}/details`,
    );
  }

  async createTask(body: Record<string, unknown>): Promise<PlannerTask> {
    const response = await this.graph.request<PlannerTask>("/planner/tasks", {
      method: "POST",
      body,
    });
    return requireBody(response.body, "task");
  }

  /**
   * PATCH /planner/tasks/{id} using an ETag read in this call. `patch` must
   * already be a Graph-shaped delta.
   */
  async updateTask(taskId: string, patch: Record<string, unknown>): Promise<PlannerTask> {
    if (Object.keys(patch).length === 0) {
      throw new M365Error("PLANNER_NO_CHANGES", "No task fields were supplied to update.");
    }
    const fresh = await this.readTask(taskId);
    const response = await this.graph.request<PlannerTask>(
      `/planner/tasks/${encodeURIComponent(taskId)}`,
      {
        method: "PATCH",
        body: patch,
        ifMatch: requireEtag(fresh.etag, "task"),
        conflictResource: "task",
        prefer: "return=representation",
      },
    );
    return response.body ?? { ...fresh.value, ...(patch as Partial<PlannerTask>) };
  }

  /**
   * PATCH /planner/tasks/{id}/details using the DETAILS ETag, read in this call.
   * Dictionary deltas (checklist, references) are computed here against the
   * same fresh copy whose ETag is being sent, so a concurrent edit produces a
   * 412 rather than a silent overwrite.
   */
  async updateTaskDetails(
    taskId: string,
    input: {
      description?: string | null | undefined;
      previewType?: string | undefined;
      checklist?: ChecklistOperation[] | undefined;
      references?: ReferenceOperation[] | undefined;
    },
  ): Promise<{ details: PlannerTaskDetails; notes: string[] }> {
    const fresh = await this.readTaskDetails(taskId);
    const notes: string[] = [];
    const patch: Record<string, unknown> = {};

    if (input.description !== undefined) patch["description"] = input.description ?? "";
    if (input.previewType !== undefined) patch["previewType"] = input.previewType;

    if (input.checklist && input.checklist.length > 0) {
      const result = buildChecklistPatch(fresh.value.checklist, input.checklist);
      if (Object.keys(result.patch).length > 0) patch["checklist"] = result.patch;
      notes.push(...result.notes);
    }

    if (input.references && input.references.length > 0) {
      const result = buildReferencePatch(fresh.value.references, input.references);
      if (Object.keys(result.patch).length > 0) patch["references"] = result.patch;
      notes.push(...result.notes);
    }

    if (Object.keys(patch).length === 0) {
      return { details: fresh.value, notes: [...notes, "Nothing to change; no write was sent."] };
    }

    const response = await this.graph.request<PlannerTaskDetails>(
      `/planner/tasks/${encodeURIComponent(taskId)}/details`,
      {
        method: "PATCH",
        body: patch,
        ifMatch: requireEtag(fresh.etag, "task details"),
        conflictResource: "task details",
        prefer: "return=representation",
      },
    );
    const details = response.body ?? (await this.readTaskDetails(taskId)).value;
    return { details, notes };
  }

  async deleteTask(taskId: string): Promise<void> {
    const fresh = await this.readTask(taskId);
    await this.graph.request(`/planner/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
      ifMatch: requireEtag(fresh.etag, "task"),
      conflictResource: "task",
    });
  }

  /* ------------------------------------------------------------ merged card */

  /**
   * The whole card in one call: task fields *and* details, with labels,
   * assignees and bucket resolved to names. A caller should never need a second
   * round trip to see what a card says.
   */
  async getTaskCard(
    taskId: string,
    options: { resolveNames?: boolean } = {},
  ): Promise<PlannerTaskCard> {
    const resolveNames = options.resolveNames ?? true;
    // Two reads because they are two resources. Parallel, but never merged into
    // one ETag.
    const [task, details] = await Promise.all([this.readTask(taskId), this.readTaskDetails(taskId)]);
    return this.buildCard(task.value, task.etag, details.value, details.etag, resolveNames);
  }

  async buildCard(
    task: PlannerTask,
    taskEtag: string | undefined,
    details: PlannerTaskDetails | undefined,
    detailsEtag: string | undefined,
    resolveNames: boolean,
  ): Promise<PlannerTaskCard> {
    const notes: string[] = [];
    let categoryDescriptions: Record<string, string | null> = {};
    let bucketName: string | undefined;
    let planTitle: string | undefined;

    if (resolveNames && task.planId) {
      categoryDescriptions = await this.getCategoryDescriptions(task.planId);
      planTitle = await this.getPlan(task.planId)
        .then((plan) => plan.title)
        .catch(() => undefined);
    }
    if (resolveNames && task.bucketId) {
      bucketName = await this.getBucket(task.bucketId)
        .then((bucket) => bucket.value.name)
        .catch(() => undefined);
    }

    const assigneeIds = Object.keys(task.assignments ?? {});
    const assignees = resolveNames
      ? await Promise.all(
          assigneeIds.map(async (id) => {
            const user = await this.users.describe(id);
            return { id, displayName: user.displayName, userPrincipalName: user.userPrincipalName };
          }),
        )
      : assigneeIds.map((id) => ({ id, displayName: undefined, userPrincipalName: undefined }));

    const checklist = Object.entries(details?.checklist ?? {})
      .map(([id, item]) => ({
        id,
        title: item.title,
        isChecked: item.isChecked ?? false,
        orderHint: item.orderHint,
      }))
      .sort((a, b) => (a.orderHint ?? "").localeCompare(b.orderHint ?? ""));

    if (task.conversationThreadId) {
      notes.push(
        "This card has comments. Planner comments are Microsoft 365 Group conversation posts reached through conversationThreadId — the Planner API does not expose them and this server does not read or write them.",
      );
    }

    return {
      id: task.id,
      title: task.title,
      planId: task.planId,
      planTitle,
      bucketId: task.bucketId,
      bucketName,
      progress: {
        percentComplete: task.percentComplete ?? 0,
        label: describeProgress(task.percentComplete),
      },
      priority: { value: task.priority, label: describePriority(task.priority) },
      startDateTime: task.startDateTime,
      dueDateTime: task.dueDateTime,
      completedDateTime: task.completedDateTime,
      createdDateTime: task.createdDateTime,
      assignees,
      labels: describeCategories(task.appliedCategories, categoryDescriptions),
      description: details?.description,
      checklist,
      checklistSummary: {
        total: checklist.length,
        checked: checklist.filter((item) => item.isChecked).length,
      },
      references: Object.entries(details?.references ?? {}).map(([key, reference]) => ({
        url: decodeReferenceKey(key),
        alias: reference.alias,
        type: reference.type,
      })),
      conversationThreadId: task.conversationThreadId,
      etags: { task: taskEtag, details: detailsEtag },
      ...(notes.length > 0 ? { notes } : {}),
    };
  }
}

function requireEtag(etag: string | undefined, resource: string): string {
  if (!etag) {
    throw new M365Error(
      "PLANNER_MISSING_ETAG",
      `Graph returned no @odata.etag for this ${resource}, so the write cannot be made safely.`,
      `This usually means the read was served from an unexpected endpoint. Re-read the ${resource} and retry; do not retry without an ETag.`,
    );
  }
  return etag;
}

function requireBody<T>(body: T | undefined, what: string): T {
  if (body === undefined) {
    throw new M365Error(
      "PLANNER_EMPTY_RESPONSE",
      `Graph accepted the ${what} but returned no body.`,
      `Re-read the ${what} to confirm what was created.`,
    );
  }
  return body;
}
