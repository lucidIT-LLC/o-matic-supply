import { M365Error } from "../errors.js";
import type { PlannerChecklist, PlannerChecklistItem, PlannerReferences } from "./types.js";

/* ---------------------------------------------------------------------------
 * percentComplete
 *
 * Planner's data model stores an integer, but the product only has three
 * states. The UI writes 0, 50 or 100 and reads anything in 1..99 as
 * "In progress". Callers reliably try to write 25 or 75 and then wonder why the
 * board does not move, so this server accepts only the three real values — and
 * accepts their names, which is what an agent actually has in hand.
 * ------------------------------------------------------------------------- */

export type ProgressPercent = 0 | 50 | 100;
export type ProgressLabel = "Not started" | "In progress" | "Completed";

const PROGRESS_LABELS: Record<ProgressPercent, ProgressLabel> = {
  0: "Not started",
  50: "In progress",
  100: "Completed",
};

const PROGRESS_WORDS: Record<string, ProgressPercent> = {
  "not started": 0,
  notstarted: 0,
  "not-started": 0,
  "not_started": 0,
  new: 0,
  todo: 0,
  "to do": 0,
  backlog: 0,
  "in progress": 50,
  inprogress: 50,
  "in-progress": 50,
  "in_progress": 50,
  started: 50,
  doing: 50,
  wip: 50,
  active: 50,
  complete: 100,
  completed: 100,
  done: 100,
  finished: 100,
  closed: 100,
};

export const PROGRESS_INPUT_HELP =
  'Use 0, 50 or 100, or one of "Not started", "In progress", "Completed". Planner has exactly three states; intermediate percentages are not representable and the board would not move.';

/** Normalise a caller-supplied progress value to 0 / 50 / 100. */
export function toPercentComplete(input: number | string): ProgressPercent {
  if (typeof input === "number") {
    if (input === 0 || input === 50 || input === 100) return input;
    throw new M365Error(
      "PLANNER_PROGRESS",
      `percentComplete ${input} is not one of Planner's three states.`,
      PROGRESS_INPUT_HELP,
    );
  }
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return toPercentComplete(Number(trimmed));

  const word = PROGRESS_WORDS[trimmed.toLowerCase()];
  if (word === undefined) {
    throw new M365Error(
      "PLANNER_PROGRESS",
      `"${input}" is not a recognised Planner progress value.`,
      PROGRESS_INPUT_HELP,
    );
  }
  return word;
}

/** Render any stored percentComplete the way the Planner UI does. */
export function describeProgress(percentComplete: number | undefined): ProgressLabel {
  if (percentComplete === undefined || percentComplete <= 0) return "Not started";
  if (percentComplete >= 100) return "Completed";
  return "In progress";
}

export function progressLabelFor(percent: ProgressPercent): ProgressLabel {
  return PROGRESS_LABELS[percent];
}

/* ---------------------------------------------------------------------------
 * priority
 * Planner stores 0..10; the UI exposes four buckets and normalises on write.
 * ------------------------------------------------------------------------- */

export type PriorityLabel = "Urgent" | "Important" | "Medium" | "Low";

const PRIORITY_WORDS: Record<string, number> = {
  urgent: 1,
  critical: 1,
  important: 3,
  high: 3,
  medium: 5,
  normal: 5,
  none: 5,
  low: 9,
};

export function toPriority(input: number | string): number {
  if (typeof input === "number") {
    if (!Number.isInteger(input) || input < 0 || input > 10) {
      throw new M365Error(
        "PLANNER_PRIORITY",
        `priority ${input} is out of range.`,
        'Use 0-10, or one of "Urgent" (1), "Important" (3), "Medium" (5), "Low" (9).',
      );
    }
    return input;
  }
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return toPriority(Number(trimmed));
  const value = PRIORITY_WORDS[trimmed.toLowerCase()];
  if (value === undefined) {
    throw new M365Error(
      "PLANNER_PRIORITY",
      `"${input}" is not a recognised Planner priority.`,
      'Use "Urgent", "Important", "Medium" or "Low", or the integer 0-10.',
    );
  }
  return value;
}

export function describePriority(priority: number | undefined): PriorityLabel | undefined {
  if (priority === undefined || priority === null) return undefined;
  if (priority <= 1) return "Urgent";
  if (priority <= 4) return "Important";
  if (priority <= 7) return "Medium";
  return "Low";
}

/* ---------------------------------------------------------------------------
 * dates
 * ------------------------------------------------------------------------- */

/** Normalise a date input to the DateTimeOffset Planner wants; null clears. */
export function toPlannerDate(input: string | null | undefined): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null || input.trim() === "") return null;
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00Z`;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new M365Error(
      "PLANNER_DATE",
      `"${input}" is not a valid date.`,
      'Use an ISO 8601 date ("2026-09-01") or date-time ("2026-09-01T17:00:00Z"), or null to clear the field.',
    );
  }
  return new Date(parsed).toISOString();
}

/* ---------------------------------------------------------------------------
 * appliedCategories (labels)
 *
 * The task holds { category1: true, ... }; the human label for category1 lives
 * on the PLAN's details. A caller should be able to say "Blocked" and have it
 * work, so both directions are resolved here.
 * ------------------------------------------------------------------------- */

export const CATEGORY_KEYS: string[] = Array.from({ length: 25 }, (_, i) => `category${i + 1}`);

export function isCategoryKey(value: string): boolean {
  return /^category([1-9]|1\d|2[0-5])$/.test(value.trim());
}

/** Map a label or category key to a category key, using the plan's labels. */
export function resolveCategoryKey(
  input: string,
  categoryDescriptions: Record<string, string | null> | undefined,
): string {
  const trimmed = input.trim();
  if (isCategoryKey(trimmed)) return trimmed.toLowerCase();

  const matches = Object.entries(categoryDescriptions ?? {}).filter(
    ([, label]) => typeof label === "string" && label.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (matches.length === 1) return (matches[0] as [string, string | null])[0];
  if (matches.length > 1) {
    throw new M365Error(
      "PLANNER_CATEGORY_AMBIGUOUS",
      `The label "${input}" is used by more than one category on this plan (${matches.map(([k]) => k).join(", ")}).`,
      "Pass the category key (category1..category25) instead.",
    );
  }
  const known = Object.entries(categoryDescriptions ?? {})
    .filter(([, label]) => typeof label === "string" && label.trim() !== "")
    .map(([key, label]) => `${key}="${label as string}"`)
    .join(", ");
  throw new M365Error(
    "PLANNER_CATEGORY",
    `"${input}" is not a label on this plan and is not a category key.`,
    known
      ? `Labels defined on this plan: ${known}. You may also pass category1..category25 directly.`
      : `This plan has no named labels yet. Pass category1..category25 directly, or name the labels in Planner first.`,
  );
}

/** Build the appliedCategories patch from caller-friendly label names. */
export function buildCategoryPatch(
  input: Record<string, boolean> | string[] | undefined,
  categoryDescriptions: Record<string, string | null> | undefined,
): Record<string, boolean> | undefined {
  if (input === undefined) return undefined;
  const patch: Record<string, boolean> = {};
  if (Array.isArray(input)) {
    // An array means "these labels are on", and says nothing about the others.
    for (const item of input) patch[resolveCategoryKey(item, categoryDescriptions)] = true;
    return patch;
  }
  for (const [key, value] of Object.entries(input)) {
    patch[resolveCategoryKey(key, categoryDescriptions)] = Boolean(value);
  }
  return patch;
}

/** Render a task's categories with their human labels. */
export function describeCategories(
  applied: Record<string, boolean> | undefined,
  categoryDescriptions: Record<string, string | null> | undefined,
): Array<{ category: string; label: string | null }> {
  return Object.entries(applied ?? {})
    .filter(([, on]) => on)
    .map(([category]) => ({ category, label: categoryDescriptions?.[category] ?? null }))
    .sort((a, b) => categoryIndex(a.category) - categoryIndex(b.category));
}

function categoryIndex(key: string): number {
  const match = /^category(\d+)$/.exec(key);
  return match ? Number(match[1]) : 999;
}

/* ---------------------------------------------------------------------------
 * checklist — open dictionary, delta semantics
 *
 * A PATCH to plannerTaskDetails.checklist replaces ONLY the keys present in the
 * payload. Sending null for a key deletes it. Sending the whole dictionary is
 * how integrations accidentally wipe items added by someone else between the
 * read and the write. Everything below produces a minimal delta computed from a
 * freshly-read copy.
 * ------------------------------------------------------------------------- */

export const CHECKLIST_ITEM_TYPE = "microsoft.graph.plannerChecklistItem";

export type ChecklistPatch = Record<string, PlannerChecklistItem | null>;

export type ChecklistOperation =
  | { action: "add"; title: string; isChecked?: boolean }
  | { action: "remove"; id?: string; title?: string }
  | { action: "check"; id?: string; title?: string }
  | { action: "uncheck"; id?: string; title?: string }
  | { action: "toggle"; id?: string; title?: string }
  | { action: "rename"; id?: string; title?: string; newTitle: string };

export interface ChecklistPatchResult {
  patch: ChecklistPatch;
  /** The dictionary as it will look after the patch is applied. */
  projected: PlannerChecklist;
  notes: string[];
}

/**
 * Compute the minimal checklist delta for a set of operations, against a
 * freshly-read checklist. Never returns keys that are unchanged.
 */
export function buildChecklistPatch(
  current: PlannerChecklist | undefined,
  operations: ChecklistOperation[],
  newId: () => string = defaultChecklistId,
): ChecklistPatchResult {
  const projected: PlannerChecklist = structuredCloneish(current ?? {});
  const patch: ChecklistPatch = {};
  const notes: string[] = [];

  for (const operation of operations) {
    switch (operation.action) {
      case "add": {
        const title = operation.title.trim();
        if (title === "") {
          throw new M365Error("PLANNER_CHECKLIST", "A checklist item must have a title.");
        }
        const duplicate = findChecklistEntry(projected, { title });
        if (duplicate) {
          notes.push(`Checklist already contains "${title}" (${duplicate[0]}); not added again.`);
          break;
        }
        const id = newId();
        const item: PlannerChecklistItem = {
          "@odata.type": CHECKLIST_ITEM_TYPE,
          title,
          isChecked: operation.isChecked ?? false,
        };
        projected[id] = item;
        patch[id] = item;
        break;
      }
      case "remove": {
        const entry = requireChecklistEntry(projected, operation, "remove");
        delete projected[entry[0]];
        patch[entry[0]] = null; // null is the documented delete verb.
        break;
      }
      case "check":
      case "uncheck":
      case "toggle": {
        const entry = requireChecklistEntry(projected, operation, operation.action);
        const [id, item] = entry;
        const next =
          operation.action === "toggle" ? !(item.isChecked ?? false) : operation.action === "check";
        if ((item.isChecked ?? false) === next) {
          notes.push(`Checklist item "${item.title ?? id}" was already ${next ? "checked" : "unchecked"}.`);
          break;
        }
        const updated: PlannerChecklistItem = { ...item, isChecked: next, "@odata.type": CHECKLIST_ITEM_TYPE };
        projected[id] = updated;
        // Only the changed field is sent: a checklist value PATCH merges.
        patch[id] = { "@odata.type": CHECKLIST_ITEM_TYPE, isChecked: next };
        break;
      }
      case "rename": {
        const entry = requireChecklistEntry(projected, operation, "rename");
        const [id, item] = entry;
        const newTitle = operation.newTitle.trim();
        if (newTitle === "") {
          throw new M365Error("PLANNER_CHECKLIST", "A checklist item must have a title.");
        }
        if (item.title === newTitle) break;
        projected[id] = { ...item, title: newTitle, "@odata.type": CHECKLIST_ITEM_TYPE };
        patch[id] = { "@odata.type": CHECKLIST_ITEM_TYPE, title: newTitle };
        break;
      }
      default: {
        const exhaustive: never = operation;
        throw new M365Error("PLANNER_CHECKLIST", `Unknown checklist action: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  return { patch, projected, notes };
}

function requireChecklistEntry(
  checklist: PlannerChecklist,
  selector: { id?: string; title?: string },
  action: string,
): [string, PlannerChecklistItem] {
  const entry = findChecklistEntry(checklist, selector);
  if (!entry) {
    const available = Object.entries(checklist)
      .map(([id, item]) => `  ${id} — ${item.isChecked ? "[x]" : "[ ]"} ${item.title ?? ""}`)
      .join("\n");
    throw new M365Error(
      "PLANNER_CHECKLIST_NOT_FOUND",
      `Cannot ${action}: no checklist item matches ${selector.id ? `id "${selector.id}"` : `title "${selector.title ?? ""}"`}.`,
      available ? `Current checklist:\n${available}` : "The checklist is empty.",
    );
  }
  return entry;
}

function findChecklistEntry(
  checklist: PlannerChecklist,
  selector: { id?: string; title?: string },
): [string, PlannerChecklistItem] | undefined {
  if (selector.id) {
    const item = checklist[selector.id];
    return item ? [selector.id, item] : undefined;
  }
  if (!selector.title) {
    throw new M365Error(
      "PLANNER_CHECKLIST",
      "A checklist operation needs either an item id or a title to match.",
    );
  }
  const wanted = selector.title.trim().toLowerCase();
  const matches = Object.entries(checklist).filter(
    ([, item]) => (item.title ?? "").trim().toLowerCase() === wanted,
  );
  if (matches.length > 1) {
    throw new M365Error(
      "PLANNER_CHECKLIST_AMBIGUOUS",
      `More than one checklist item is titled "${selector.title}".`,
      `Pass the checklist item id instead: ${matches.map(([id]) => id).join(", ")}.`,
    );
  }
  return matches[0];
}

/**
 * Checklist keys are client-generated. Planner accepts any string that is
 * unique within the task; a GUID keeps it collision-free without a round trip.
 */
function defaultChecklistId(): string {
  return globalThis.crypto.randomUUID();
}

function structuredCloneish<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* ---------------------------------------------------------------------------
 * references — open dictionary keyed by an escaped URL
 * ------------------------------------------------------------------------- */

export const REFERENCE_TYPE = "microsoft.graph.plannerExternalReference";

/**
 * Planner keys references by URL with a specific escaping rule: `%` first, then
 * `.`, `:`, `@` and `#`. Get this wrong and the reference silently lands under
 * a key nothing can find again.
 */
export function encodeReferenceKey(url: string): string {
  return url
    .replace(/%/g, "%25")
    .replace(/\./g, "%2E")
    .replace(/:/g, "%3A")
    .replace(/@/g, "%40")
    .replace(/#/g, "%23");
}

export function decodeReferenceKey(key: string): string {
  return key
    .replace(/%2E/gi, ".")
    .replace(/%3A/gi, ":")
    .replace(/%40/gi, "@")
    .replace(/%23/gi, "#")
    .replace(/%25/g, "%");
}

export type ReferencePatch = Record<string, PlannerExternalReferencePatch | null>;
export interface PlannerExternalReferencePatch {
  "@odata.type": string;
  alias?: string;
  type?: string;
  previewPriority?: string;
}

export type ReferenceOperation =
  | { action: "add"; url: string; alias?: string; type?: string }
  | { action: "remove"; url: string };

export function buildReferencePatch(
  current: PlannerReferences | undefined,
  operations: ReferenceOperation[],
): { patch: ReferencePatch; notes: string[] } {
  const patch: ReferencePatch = {};
  const notes: string[] = [];
  const existing = current ?? {};

  for (const operation of operations) {
    const key = encodeReferenceKey(operation.url.trim());
    if (operation.action === "add") {
      const reference: PlannerExternalReferencePatch = { "@odata.type": REFERENCE_TYPE };
      if (operation.alias) reference.alias = operation.alias;
      if (operation.type) reference.type = operation.type;
      patch[key] = reference;
      if (existing[key]) notes.push(`Reference ${operation.url} already existed; its alias/type were updated.`);
    } else {
      if (!existing[key]) {
        notes.push(`Reference ${operation.url} was not attached to this task; nothing to remove.`);
        continue;
      }
      patch[key] = null;
    }
  }
  return { patch, notes };
}
