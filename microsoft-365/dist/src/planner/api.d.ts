import type { GraphClient } from "../graph/client.js";
import type { UserResolver } from "../graph/users.js";
import { type ChecklistOperation, type ReferenceOperation } from "./semantics.js";
import type { PlannerBucket, PlannerGoal, PlannerPlan, PlannerPlanDetails, PlannerTask, PlannerTaskCard, PlannerTaskDetails } from "./types.js";
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
export declare class PlannerApi {
    private readonly graph;
    private readonly users;
    constructor(graph: GraphClient, users: UserResolver);
    /** Plans in a specific group (Microsoft 365 group / Team). */
    listPlansByGroup(groupId: string): Promise<PlannerPlan[]>;
    /** Plans the signed-in user can see in their Planner hub. */
    listMyPlans(): Promise<PlannerPlan[]>;
    /** Unified groups the signed-in user belongs to — the containers of plans. */
    listMyGroups(): Promise<Array<{
        id: string;
        displayName?: string;
        mail?: string;
    }>>;
    getPlan(planId: string): Promise<PlannerPlan>;
    getPlanDetails(planId: string): Promise<PlannerPlanDetails>;
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
    listGoals(planId: string): Promise<PlannerGoal[]>;
    /** Category key -> label map for a plan, used to translate task labels. */
    getCategoryDescriptions(planId: string): Promise<Record<string, string | null>>;
    listBuckets(planId: string): Promise<PlannerBucket[]>;
    getBucket(bucketId: string): Promise<{
        value: PlannerBucket;
        etag: string | undefined;
    }>;
    createBucket(planId: string, name: string, orderHint?: string): Promise<PlannerBucket>;
    renameBucket(bucketId: string, name: string): Promise<PlannerBucket>;
    deleteBucket(bucketId: string): Promise<void>;
    listTasksByPlan(planId: string): Promise<PlannerTask[]>;
    listTasksByBucket(bucketId: string): Promise<PlannerTask[]>;
    listMyTasks(): Promise<PlannerTask[]>;
    /** Fresh task + its own ETag. Never reuse this ETag for /details. */
    readTask(taskId: string): Promise<{
        value: PlannerTask;
        etag: string | undefined;
    }>;
    /** Fresh task details + their own, DIFFERENT ETag. Never reuse for the task. */
    readTaskDetails(taskId: string): Promise<{
        value: PlannerTaskDetails;
        etag: string | undefined;
    }>;
    createTask(body: Record<string, unknown>): Promise<PlannerTask>;
    /**
     * PATCH /planner/tasks/{id} using an ETag read in this call. `patch` must
     * already be a Graph-shaped delta.
     */
    updateTask(taskId: string, patch: Record<string, unknown>): Promise<PlannerTask>;
    /**
     * PATCH /planner/tasks/{id}/details using the DETAILS ETag, read in this call.
     * Dictionary deltas (checklist, references) are computed here against the
     * same fresh copy whose ETag is being sent, so a concurrent edit produces a
     * 412 rather than a silent overwrite.
     */
    updateTaskDetails(taskId: string, input: {
        description?: string | null | undefined;
        previewType?: string | undefined;
        checklist?: ChecklistOperation[] | undefined;
        references?: ReferenceOperation[] | undefined;
    }): Promise<{
        details: PlannerTaskDetails;
        notes: string[];
    }>;
    deleteTask(taskId: string): Promise<void>;
    /**
     * The whole card in one call: task fields *and* details, with labels,
     * assignees and bucket resolved to names. A caller should never need a second
     * round trip to see what a card says.
     */
    getTaskCard(taskId: string, options?: {
        resolveNames?: boolean;
    }): Promise<PlannerTaskCard>;
    buildCard(task: PlannerTask, taskEtag: string | undefined, details: PlannerTaskDetails | undefined, detailsEtag: string | undefined, resolveNames: boolean): Promise<PlannerTaskCard>;
}
