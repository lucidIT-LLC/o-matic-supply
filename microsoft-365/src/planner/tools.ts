import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ServerContext } from "../context.js";
import { M365Error } from "../errors.js";
import { runTool } from "../tools/helpers.js";
import {
  buildCategoryPatch,
  describePriority,
  describeProgress,
  toPercentComplete,
  toPlannerDate,
  toPriority,
  type ChecklistOperation,
  type ReferenceOperation,
} from "./semantics.js";
import type { PlannerTask } from "./types.js";

const progressInput = z
  .union([z.number(), z.string()])
  .describe(
    'Planner progress. 0 / 50 / 100, or "Not started" / "In progress" / "Completed". Planner has exactly three states — intermediate percentages are not representable.',
  );

const priorityInput = z
  .union([z.number(), z.string()])
  .describe('Planner priority: "Urgent", "Important", "Medium", "Low", or 0-10.');

const dateInput = z
  .string()
  .nullable()
  .describe('ISO date ("2026-09-01") or date-time ("2026-09-01T17:00:00Z"). null clears the field.');

const assigneeInput = z
  .array(z.string())
  .describe(
    'Assignees as email/UPN, display name, object GUID, or "me". Emails are resolved to object IDs automatically — Planner itself only accepts GUIDs.',
  );

/** Summarise a task for list output without a per-task round trip. */
function summariseTask(task: PlannerTask): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    planId: task.planId,
    bucketId: task.bucketId,
    progress: { percentComplete: task.percentComplete ?? 0, label: describeProgress(task.percentComplete) },
    priority: { value: task.priority, label: describePriority(task.priority) },
    dueDateTime: task.dueDateTime,
    startDateTime: task.startDateTime,
    completedDateTime: task.completedDateTime,
    assigneeIds: Object.keys(task.assignments ?? {}),
    appliedCategories: Object.entries(task.appliedCategories ?? {})
      .filter(([, on]) => on)
      .map(([key]) => key),
    checklist: { total: task.checklistItemCount ?? 0, open: task.activeChecklistItemCount ?? 0 },
    hasDescription: task.hasDescription ?? false,
    referenceCount: task.referenceCount ?? 0,
    hasComments: Boolean(task.conversationThreadId),
  };
}

export function registerPlannerTools(server: McpServer, ctx: ServerContext): void {
  const { planner, users } = ctx;

  /* ------------------------------------------------------------------ plans */

  server.registerTool(
    "planner_list_plans",
    {
      title: "List Planner plans",
      description:
        "List Planner plans. With groupId, lists the plans in that Microsoft 365 group or Team. Without it, lists the plans visible to the signed-in user plus the groups they belong to, so you can find a groupId to drill into.",
      inputSchema: {
        groupId: z
          .string()
          .optional()
          .describe("Microsoft 365 group / Team object ID. Omit to list the signed-in user's plans."),
        includeGroups: z
          .boolean()
          .optional()
          .describe("Also list the user's groups (default true when groupId is omitted)."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("planner_list_plans", async () => {
        if (args.groupId) {
          const plans = await planner.listPlansByGroup(args.groupId);
          return { scope: "group", groupId: args.groupId, count: plans.length, plans: plans.map(plainPlan) };
        }
        const plans = await planner.listMyPlans();
        const groups = (args.includeGroups ?? true) ? await planner.listMyGroups().catch(() => []) : [];
        return {
          scope: "me",
          count: plans.length,
          plans: plans.map(plainPlan),
          groups: groups.map((g) => ({ id: g.id, displayName: g.displayName, mail: g.mail })),
          note:
            "Plans shared with the user only appear here once they are in the user's Planner hub. If a plan is missing, list it by its groupId.",
        };
      }),
  );

  server.registerTool(
    "planner_get_plan",
    {
      title: "Get a Planner plan",
      description:
        "Get a plan with its details, including categoryDescriptions — the human labels behind category1..category25. Task labels are meaningless without these.",
      inputSchema: { planId: z.string().describe("Planner plan ID.") },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("planner_get_plan", async () => {
        const [plan, details] = await Promise.all([
          planner.getPlan(args.planId),
          planner.getPlanDetails(args.planId).catch(() => undefined),
        ]);
        const labels = Object.entries(details?.categoryDescriptions ?? {})
          .filter(([, label]) => typeof label === "string" && label.trim() !== "")
          .map(([category, label]) => ({ category, label }));
        return {
          ...plainPlan(plan),
          labels,
          sharedWithUserIds: Object.keys(details?.sharedWith ?? {}),
        };
      }),
  );

  /* ---------------------------------------------------------------- buckets */

  server.registerTool(
    "planner_list_buckets",
    {
      title: "List Planner buckets",
      description: "List the buckets (columns) of a plan, in board order.",
      inputSchema: { planId: z.string().describe("Planner plan ID.") },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("planner_list_buckets", async () => {
        const buckets = await planner.listBuckets(args.planId);
        return {
          planId: args.planId,
          count: buckets.length,
          buckets: buckets
            .map((b) => ({ id: b.id, name: b.name, orderHint: b.orderHint }))
            .sort((a, b) => (a.orderHint ?? "").localeCompare(b.orderHint ?? "")),
        };
      }),
  );

  server.registerTool(
    "planner_create_bucket",
    {
      title: "Create a Planner bucket",
      description: "Create a new bucket (column) in a plan.",
      inputSchema: {
        planId: z.string().describe("Planner plan ID."),
        name: z.string().describe("Bucket name."),
        orderHint: z
          .string()
          .optional()
          .describe('Planner order hint. Default " !" places the bucket at the start of the board.'),
      },
    },
    async (args) =>
      runTool("planner_create_bucket", async () => {
        const bucket = await planner.createBucket(args.planId, args.name, args.orderHint ?? " !");
        return { id: bucket.id, name: bucket.name, planId: bucket.planId, orderHint: bucket.orderHint };
      }),
  );

  server.registerTool(
    "planner_rename_bucket",
    {
      title: "Rename a Planner bucket",
      description:
        "Rename a bucket. The bucket is re-read immediately before the write so a current ETag is used.",
      inputSchema: {
        bucketId: z.string().describe("Planner bucket ID."),
        name: z.string().describe("New bucket name."),
      },
    },
    async (args) =>
      runTool("planner_rename_bucket", async () => {
        const bucket = await planner.renameBucket(args.bucketId, args.name);
        return { id: bucket.id, name: bucket.name, planId: bucket.planId };
      }),
  );

  server.registerTool(
    "planner_delete_bucket",
    {
      title: "Delete a Planner bucket",
      description:
        "Delete a bucket. Tasks in the bucket are deleted with it — this is not recoverable through the API.",
      inputSchema: {
        bucketId: z.string().describe("Planner bucket ID."),
        confirm: z
          .literal(true)
          .describe("Must be true. Deleting a bucket also deletes every task in it."),
      },
      annotations: { destructiveHint: true },
    },
    async (args) =>
      runTool("planner_delete_bucket", async () => {
        if (args.confirm !== true) {
          throw new M365Error("PLANNER_CONFIRM", "Set confirm=true to delete a bucket and its tasks.");
        }
        await planner.deleteBucket(args.bucketId);
        return { deleted: true, bucketId: args.bucketId };
      }),
  );

  /* ------------------------------------------------------------------ tasks */

  server.registerTool(
    "planner_list_tasks",
    {
      title: "List Planner tasks",
      description:
        "List tasks in a plan or a bucket (or the signed-in user's assigned tasks when neither is given). Returns a summary per task; use planner_get_task for the full card.",
      inputSchema: {
        planId: z.string().optional().describe("List every task in this plan."),
        bucketId: z.string().optional().describe("List tasks in this bucket only."),
        includeCompleted: z
          .boolean()
          .optional()
          .describe("Include tasks at 100% complete. Default true."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("planner_list_tasks", async () => {
        let tasks: PlannerTask[];
        let scope: string;
        if (args.bucketId) {
          tasks = await planner.listTasksByBucket(args.bucketId);
          scope = `bucket:${args.bucketId}`;
        } else if (args.planId) {
          tasks = await planner.listTasksByPlan(args.planId);
          scope = `plan:${args.planId}`;
        } else {
          tasks = await planner.listMyTasks();
          scope = "me";
        }
        const filtered =
          args.includeCompleted === false ? tasks.filter((t) => (t.percentComplete ?? 0) < 100) : tasks;
        return { scope, count: filtered.length, tasks: filtered.map(summariseTask) };
      }),
  );

  server.registerTool(
    "planner_get_task",
    {
      title: "Get a Planner task (full card)",
      description:
        "Get one task as a complete card: title, progress, dates, priority, assignees (resolved to names), bucket, labels (resolved to their plan-level names), description, checklist and references. Task and task details are two separate Graph resources; this merges both so one call shows the whole card.",
      inputSchema: {
        taskId: z.string().describe("Planner task ID."),
        resolveNames: z
          .boolean()
          .optional()
          .describe("Resolve assignee, bucket, plan and label names. Default true; false is faster."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("planner_get_task", async () =>
        planner.getTaskCard(args.taskId, { resolveNames: args.resolveNames ?? true }),
      ),
  );

  server.registerTool(
    "planner_create_task",
    {
      title: "Create a Planner task",
      description:
        "Create a task. Description and checklist are stored on the task DETAILS resource, so supplying them performs a create followed by a details PATCH using the details' own fresh ETag.",
      inputSchema: {
        planId: z.string().describe("Planner plan ID."),
        title: z.string().describe("Task title."),
        bucketId: z.string().optional().describe("Bucket to place the task in."),
        assignees: assigneeInput.optional(),
        progress: progressInput.optional(),
        priority: priorityInput.optional(),
        dueDateTime: dateInput.optional(),
        startDateTime: dateInput.optional(),
        labels: z
          .array(z.string())
          .optional()
          .describe('Labels to apply, by plan label name (e.g. "Blocked") or category key (category1..category25).'),
        description: z.string().optional().describe("Card description (stored on task details)."),
        checklist: z
          .array(z.string())
          .optional()
          .describe("Checklist item titles to add (stored on task details)."),
      },
    },
    async (args) =>
      runTool("planner_create_task", async () => {
        const body: Record<string, unknown> = { planId: args.planId, title: args.title };
        if (args.bucketId) body["bucketId"] = args.bucketId;
        if (args.progress !== undefined) body["percentComplete"] = toPercentComplete(args.progress);
        if (args.priority !== undefined) body["priority"] = toPriority(args.priority);
        const due = toPlannerDate(args.dueDateTime);
        if (due !== undefined) body["dueDateTime"] = due;
        const start = toPlannerDate(args.startDateTime);
        if (start !== undefined) body["startDateTime"] = start;

        if (args.assignees && args.assignees.length > 0) {
          body["assignments"] = await buildAssignments(ctx, args.assignees);
        }
        if (args.labels && args.labels.length > 0) {
          const categories = await planner.getCategoryDescriptions(args.planId);
          body["appliedCategories"] = buildCategoryPatch(args.labels, categories);
        }

        const task = await planner.createTask(body);

        const notes: string[] = [];
        if (args.description !== undefined || (args.checklist && args.checklist.length > 0)) {
          const checklistOps: ChecklistOperation[] = (args.checklist ?? []).map((title) => ({
            action: "add" as const,
            title,
          }));
          const result = await planner.updateTaskDetails(task.id, {
            description: args.description,
            checklist: checklistOps.length > 0 ? checklistOps : undefined,
          });
          notes.push(...result.notes);
        }

        const card = await planner.getTaskCard(task.id);
        return { created: true, task: card, notes };
      }),
  );

  server.registerTool(
    "planner_update_task",
    {
      title: "Update a Planner task",
      description:
        "Update fields on the TASK resource: title, progress, dates, priority, bucket, labels and assignments. The task is re-read immediately before the write and its own fresh ETag is used — never the details ETag, which is a different resource. Description and checklist live on task details; use planner_update_task_details for those.",
      inputSchema: {
        taskId: z.string().describe("Planner task ID."),
        title: z.string().optional(),
        progress: progressInput.optional(),
        priority: priorityInput.optional(),
        dueDateTime: dateInput.optional(),
        startDateTime: dateInput.optional(),
        bucketId: z.string().optional().describe("Move the task to this bucket."),
        labels: z
          .record(z.boolean())
          .optional()
          .describe(
            'Label changes, keyed by plan label name or category key: {"Blocked": true, "category3": false}. Only the keys you send change.',
          ),
        addAssignees: assigneeInput.optional().describe("Assignees to add."),
        removeAssignees: assigneeInput.optional().describe("Assignees to remove."),
        setAssignees: assigneeInput
          .optional()
          .describe("Replace the assignee list with exactly these people."),
      },
    },
    async (args) =>
      runTool("planner_update_task", async () => {
        const patch: Record<string, unknown> = {};
        if (args.title !== undefined) patch["title"] = args.title;
        if (args.progress !== undefined) patch["percentComplete"] = toPercentComplete(args.progress);
        if (args.priority !== undefined) patch["priority"] = toPriority(args.priority);
        const due = toPlannerDate(args.dueDateTime);
        if (due !== undefined) patch["dueDateTime"] = due;
        const start = toPlannerDate(args.startDateTime);
        if (start !== undefined) patch["startDateTime"] = start;
        if (args.bucketId !== undefined) patch["bucketId"] = args.bucketId;

        const wantsAssignmentChange =
          args.addAssignees !== undefined ||
          args.removeAssignees !== undefined ||
          args.setAssignees !== undefined;

        if (args.labels !== undefined || wantsAssignmentChange) {
          // Read the current task once to compute dictionary deltas and to find
          // the plan for label resolution. updateTask() re-reads again for the
          // ETag it actually sends, which is the read that must be fresh.
          const current = await planner.readTask(args.taskId);

          if (args.labels !== undefined) {
            const categories = current.value.planId
              ? await planner.getCategoryDescriptions(current.value.planId)
              : {};
            patch["appliedCategories"] = buildCategoryPatch(args.labels, categories);
          }

          if (wantsAssignmentChange) {
            patch["assignments"] = await buildAssignmentDelta(ctx, current.value, args);
          }
        }

        const task = await planner.updateTask(args.taskId, patch);
        return { updated: true, task: summariseTask(task) };
      }),
  );

  server.registerTool(
    "planner_update_task_details",
    {
      title: "Update Planner task details",
      description:
        "Update the task DETAILS resource: description, checklist and references. Checklist and reference changes are computed as a minimal delta against a copy read in this same call, so concurrent edits by other people are preserved rather than overwritten. Sends the details ETag, which is separate from the task ETag.",
      inputSchema: {
        taskId: z.string().describe("Planner task ID."),
        description: z
          .string()
          .nullable()
          .optional()
          .describe("Replace the card description. null or empty string clears it."),
        addChecklistItems: z
          .array(
            z.union([
              z.string(),
              z.object({ title: z.string(), isChecked: z.boolean().optional() }),
            ]),
          )
          .optional()
          .describe("Checklist items to add."),
        removeChecklistItems: z
          .array(z.string())
          .optional()
          .describe("Checklist items to remove, by item id or exact title."),
        checkChecklistItems: z.array(z.string()).optional().describe("Mark these items checked."),
        uncheckChecklistItems: z.array(z.string()).optional().describe("Mark these items unchecked."),
        toggleChecklistItems: z.array(z.string()).optional().describe("Flip these items' checked state."),
        renameChecklistItems: z
          .array(z.object({ item: z.string(), newTitle: z.string() }))
          .optional()
          .describe("Rename checklist items, matched by id or exact title."),
        addReferences: z
          .array(
            z.object({
              url: z.string(),
              alias: z.string().optional(),
              type: z.string().optional().describe('e.g. "Word", "Excel", "PowerPoint", "Pdf", "Other".'),
            }),
          )
          .optional()
          .describe("Attachments/links to add."),
        removeReferences: z.array(z.string()).optional().describe("Reference URLs to remove."),
      },
    },
    async (args) =>
      runTool("planner_update_task_details", async () => {
        const checklist: ChecklistOperation[] = [];
        for (const item of args.addChecklistItems ?? []) {
          checklist.push(
            typeof item === "string"
              ? { action: "add", title: item }
              : { action: "add", title: item.title, isChecked: item.isChecked ?? false },
          );
        }
        for (const item of args.removeChecklistItems ?? []) checklist.push(selector("remove", item));
        for (const item of args.checkChecklistItems ?? []) checklist.push(selector("check", item));
        for (const item of args.uncheckChecklistItems ?? []) checklist.push(selector("uncheck", item));
        for (const item of args.toggleChecklistItems ?? []) checklist.push(selector("toggle", item));
        for (const entry of args.renameChecklistItems ?? []) {
          checklist.push({ ...selectorFields(entry.item), action: "rename", newTitle: entry.newTitle });
        }

        const references: ReferenceOperation[] = [
          ...(args.addReferences ?? []).map((r) => ({
            action: "add" as const,
            url: r.url,
            ...(r.alias ? { alias: r.alias } : {}),
            ...(r.type ? { type: r.type } : {}),
          })),
          ...(args.removeReferences ?? []).map((url) => ({ action: "remove" as const, url })),
        ];

        const result = await planner.updateTaskDetails(args.taskId, {
          description: args.description,
          checklist: checklist.length > 0 ? checklist : undefined,
          references: references.length > 0 ? references : undefined,
        });

        const card = await planner.getTaskCard(args.taskId);
        return { updated: true, task: card, notes: result.notes };
      }),
  );

  server.registerTool(
    "planner_delete_task",
    {
      title: "Delete a Planner task",
      description:
        "Delete a task. Not recoverable through the API. The task is re-read immediately before the delete so a current ETag is used.",
      inputSchema: {
        taskId: z.string().describe("Planner task ID."),
        confirm: z.literal(true).describe("Must be true. Deletion is permanent."),
      },
      annotations: { destructiveHint: true },
    },
    async (args) =>
      runTool("planner_delete_task", async () => {
        if (args.confirm !== true) {
          throw new M365Error("PLANNER_CONFIRM", "Set confirm=true to delete a task.");
        }
        await planner.deleteTask(args.taskId);
        return { deleted: true, taskId: args.taskId };
      }),
  );

  /* ----------------------------------------------------------------- goals */

  server.registerTool(
    "planner_list_goals",
    {
      title: "List a plan's goals",
      description:
        "List the high-level goals set on a plan (Planner's Goals tab) — each optionally linked to specific " +
        "tasks via taskIds. BETA Graph API: Goals do not exist in the stable v1.0 Planner API at all, only beta. " +
        "Real and working, but Microsoft's own beta caveat applies — the shape can change without notice.",
      inputSchema: { planId: z.string().describe("Plan id, from planner_list_plans.") },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("planner_list_goals", async () => {
        const goals = await planner.listGoals(args.planId);
        return { planId: args.planId, count: goals.length, goals };
      }),
  );

  /* -------------------------------------------------------------- directory */

  server.registerTool(
    "m365_resolve_user",
    {
      title: "Resolve a person to a directory GUID",
      description:
        "Resolve an email, UPN or display name to the object GUID Planner assignments require. Planner silently accepts nothing but GUIDs, so this is how you turn 'assign it to Dana' into something that works.",
      inputSchema: {
        identifier: z
          .string()
          .describe('Email, UPN, display name, object GUID, or "me".'),
        search: z
          .boolean()
          .optional()
          .describe("Return multiple candidates instead of failing on ambiguity."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool("m365_resolve_user", async () => {
        if (args.search) {
          const matches = await users.search(args.identifier);
          return { query: args.identifier, count: matches.length, users: matches };
        }
        return users.resolve(args.identifier);
      }),
  );
}

function selectorFields(value: string): { id?: string; title?: string } {
  // A GUID-looking value is treated as an item id; anything else as a title.
  return /^[0-9a-f-]{16,}$/i.test(value) ? { id: value } : { title: value };
}

function selector(action: "remove" | "check" | "uncheck" | "toggle", value: string): ChecklistOperation {
  return { action, ...selectorFields(value) } as ChecklistOperation;
}

function plainPlan(plan: {
  id: string;
  title?: string;
  owner?: string;
  createdDateTime?: string;
  container?: { containerId?: string; type?: string };
}): Record<string, unknown> {
  return {
    id: plan.id,
    title: plan.title,
    owner: plan.owner,
    createdDateTime: plan.createdDateTime,
    containerId: plan.container?.containerId ?? plan.owner,
    containerType: plan.container?.type,
  };
}

/** Build a full assignments dictionary for a create. */
async function buildAssignments(
  ctx: ServerContext,
  identifiers: string[],
): Promise<Record<string, unknown>> {
  const resolved = await ctx.users.resolveMany(identifiers);
  const assignments: Record<string, unknown> = {};
  for (const user of resolved) {
    assignments[user.id] = {
      "@odata.type": "microsoft.graph.plannerAssignment",
      orderHint: " !",
    };
  }
  return assignments;
}

/**
 * Assignments are an open dictionary: a PATCH replaces only the keys present,
 * and null removes a key. This computes the delta rather than overwriting, so a
 * concurrent assignment made by somebody else survives.
 */
async function buildAssignmentDelta(
  ctx: ServerContext,
  current: PlannerTask,
  args: { addAssignees?: string[]; removeAssignees?: string[]; setAssignees?: string[] },
): Promise<Record<string, unknown>> {
  const existing = new Set(Object.keys(current.assignments ?? {}));
  const patch: Record<string, unknown> = {};

  const assign = (id: string) => {
    if (existing.has(id)) return;
    patch[id] = { "@odata.type": "microsoft.graph.plannerAssignment", orderHint: " !" };
  };
  const unassign = (id: string) => {
    if (!existing.has(id)) return;
    patch[id] = null;
  };

  if (args.setAssignees !== undefined) {
    const wanted = new Set((await ctx.users.resolveMany(args.setAssignees)).map((u) => u.id));
    for (const id of wanted) assign(id);
    for (const id of existing) if (!wanted.has(id)) unassign(id);
    return patch;
  }
  for (const user of await ctx.users.resolveMany(args.addAssignees ?? [])) assign(user.id);
  for (const user of await ctx.users.resolveMany(args.removeAssignees ?? [])) unassign(user.id);
  return patch;
}
