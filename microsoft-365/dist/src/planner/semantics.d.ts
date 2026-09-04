import type { PlannerChecklist, PlannerChecklistItem, PlannerReferences } from "./types.js";
export type ProgressPercent = 0 | 50 | 100;
export type ProgressLabel = "Not started" | "In progress" | "Completed";
export declare const PROGRESS_INPUT_HELP = "Use 0, 50 or 100, or one of \"Not started\", \"In progress\", \"Completed\". Planner has exactly three states; intermediate percentages are not representable and the board would not move.";
/** Normalise a caller-supplied progress value to 0 / 50 / 100. */
export declare function toPercentComplete(input: number | string): ProgressPercent;
/** Render any stored percentComplete the way the Planner UI does. */
export declare function describeProgress(percentComplete: number | undefined): ProgressLabel;
export declare function progressLabelFor(percent: ProgressPercent): ProgressLabel;
export type PriorityLabel = "Urgent" | "Important" | "Medium" | "Low";
export declare function toPriority(input: number | string): number;
export declare function describePriority(priority: number | undefined): PriorityLabel | undefined;
/** Normalise a date input to the DateTimeOffset Planner wants; null clears. */
export declare function toPlannerDate(input: string | null | undefined): string | null | undefined;
export declare const CATEGORY_KEYS: string[];
export declare function isCategoryKey(value: string): boolean;
/** Map a label or category key to a category key, using the plan's labels. */
export declare function resolveCategoryKey(input: string, categoryDescriptions: Record<string, string | null> | undefined): string;
/** Build the appliedCategories patch from caller-friendly label names. */
export declare function buildCategoryPatch(input: Record<string, boolean> | string[] | undefined, categoryDescriptions: Record<string, string | null> | undefined): Record<string, boolean> | undefined;
/** Render a task's categories with their human labels. */
export declare function describeCategories(applied: Record<string, boolean> | undefined, categoryDescriptions: Record<string, string | null> | undefined): Array<{
    category: string;
    label: string | null;
}>;
export declare const CHECKLIST_ITEM_TYPE = "microsoft.graph.plannerChecklistItem";
export type ChecklistPatch = Record<string, PlannerChecklistItem | null>;
export type ChecklistOperation = {
    action: "add";
    title: string;
    isChecked?: boolean;
} | {
    action: "remove";
    id?: string;
    title?: string;
} | {
    action: "check";
    id?: string;
    title?: string;
} | {
    action: "uncheck";
    id?: string;
    title?: string;
} | {
    action: "toggle";
    id?: string;
    title?: string;
} | {
    action: "rename";
    id?: string;
    title?: string;
    newTitle: string;
};
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
export declare function buildChecklistPatch(current: PlannerChecklist | undefined, operations: ChecklistOperation[], newId?: () => string): ChecklistPatchResult;
export declare const REFERENCE_TYPE = "microsoft.graph.plannerExternalReference";
/**
 * Planner keys references by URL with a specific escaping rule: `%` first, then
 * `.`, `:`, `@` and `#`. Get this wrong and the reference silently lands under
 * a key nothing can find again.
 */
export declare function encodeReferenceKey(url: string): string;
export declare function decodeReferenceKey(key: string): string;
export type ReferencePatch = Record<string, PlannerExternalReferencePatch | null>;
export interface PlannerExternalReferencePatch {
    "@odata.type": string;
    alias?: string;
    type?: string;
    previewPriority?: string;
}
export type ReferenceOperation = {
    action: "add";
    url: string;
    alias?: string;
    type?: string;
} | {
    action: "remove";
    url: string;
};
export declare function buildReferencePatch(current: PlannerReferences | undefined, operations: ReferenceOperation[]): {
    patch: ReferencePatch;
    notes: string[];
};
