import { M365Error } from "../errors.js";
const PROGRESS_LABELS = {
    0: "Not started",
    50: "In progress",
    100: "Completed",
};
const PROGRESS_WORDS = {
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
export const PROGRESS_INPUT_HELP = 'Use 0, 50 or 100, or one of "Not started", "In progress", "Completed". Planner has exactly three states; intermediate percentages are not representable and the board would not move.';
/** Normalise a caller-supplied progress value to 0 / 50 / 100. */
export function toPercentComplete(input) {
    if (typeof input === "number") {
        if (input === 0 || input === 50 || input === 100)
            return input;
        throw new M365Error("PLANNER_PROGRESS", `percentComplete ${input} is not one of Planner's three states.`, PROGRESS_INPUT_HELP);
    }
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed))
        return toPercentComplete(Number(trimmed));
    const word = PROGRESS_WORDS[trimmed.toLowerCase()];
    if (word === undefined) {
        throw new M365Error("PLANNER_PROGRESS", `"${input}" is not a recognised Planner progress value.`, PROGRESS_INPUT_HELP);
    }
    return word;
}
/** Render any stored percentComplete the way the Planner UI does. */
export function describeProgress(percentComplete) {
    if (percentComplete === undefined || percentComplete <= 0)
        return "Not started";
    if (percentComplete >= 100)
        return "Completed";
    return "In progress";
}
export function progressLabelFor(percent) {
    return PROGRESS_LABELS[percent];
}
const PRIORITY_WORDS = {
    urgent: 1,
    critical: 1,
    important: 3,
    high: 3,
    medium: 5,
    normal: 5,
    none: 5,
    low: 9,
};
export function toPriority(input) {
    if (typeof input === "number") {
        if (!Number.isInteger(input) || input < 0 || input > 10) {
            throw new M365Error("PLANNER_PRIORITY", `priority ${input} is out of range.`, 'Use 0-10, or one of "Urgent" (1), "Important" (3), "Medium" (5), "Low" (9).');
        }
        return input;
    }
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed))
        return toPriority(Number(trimmed));
    const value = PRIORITY_WORDS[trimmed.toLowerCase()];
    if (value === undefined) {
        throw new M365Error("PLANNER_PRIORITY", `"${input}" is not a recognised Planner priority.`, 'Use "Urgent", "Important", "Medium" or "Low", or the integer 0-10.');
    }
    return value;
}
export function describePriority(priority) {
    if (priority === undefined || priority === null)
        return undefined;
    if (priority <= 1)
        return "Urgent";
    if (priority <= 4)
        return "Important";
    if (priority <= 7)
        return "Medium";
    return "Low";
}
/* ---------------------------------------------------------------------------
 * dates
 * ------------------------------------------------------------------------- */
/** Normalise a date input to the DateTimeOffset Planner wants; null clears. */
export function toPlannerDate(input) {
    if (input === undefined)
        return undefined;
    if (input === null || input.trim() === "")
        return null;
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed))
        return `${trimmed}T00:00:00Z`;
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
        throw new M365Error("PLANNER_DATE", `"${input}" is not a valid date.`, 'Use an ISO 8601 date ("2026-09-01") or date-time ("2026-09-01T17:00:00Z"), or null to clear the field.');
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
export const CATEGORY_KEYS = Array.from({ length: 25 }, (_, i) => `category${i + 1}`);
export function isCategoryKey(value) {
    return /^category([1-9]|1\d|2[0-5])$/.test(value.trim());
}
/** Map a label or category key to a category key, using the plan's labels. */
export function resolveCategoryKey(input, categoryDescriptions) {
    const trimmed = input.trim();
    if (isCategoryKey(trimmed))
        return trimmed.toLowerCase();
    const matches = Object.entries(categoryDescriptions ?? {}).filter(([, label]) => typeof label === "string" && label.trim().toLowerCase() === trimmed.toLowerCase());
    if (matches.length === 1)
        return matches[0][0];
    if (matches.length > 1) {
        throw new M365Error("PLANNER_CATEGORY_AMBIGUOUS", `The label "${input}" is used by more than one category on this plan (${matches.map(([k]) => k).join(", ")}).`, "Pass the category key (category1..category25) instead.");
    }
    const known = Object.entries(categoryDescriptions ?? {})
        .filter(([, label]) => typeof label === "string" && label.trim() !== "")
        .map(([key, label]) => `${key}="${label}"`)
        .join(", ");
    throw new M365Error("PLANNER_CATEGORY", `"${input}" is not a label on this plan and is not a category key.`, known
        ? `Labels defined on this plan: ${known}. You may also pass category1..category25 directly.`
        : `This plan has no named labels yet. Pass category1..category25 directly, or name the labels in Planner first.`);
}
/** Build the appliedCategories patch from caller-friendly label names. */
export function buildCategoryPatch(input, categoryDescriptions) {
    if (input === undefined)
        return undefined;
    const patch = {};
    if (Array.isArray(input)) {
        // An array means "these labels are on", and says nothing about the others.
        for (const item of input)
            patch[resolveCategoryKey(item, categoryDescriptions)] = true;
        return patch;
    }
    for (const [key, value] of Object.entries(input)) {
        patch[resolveCategoryKey(key, categoryDescriptions)] = Boolean(value);
    }
    return patch;
}
/** Render a task's categories with their human labels. */
export function describeCategories(applied, categoryDescriptions) {
    return Object.entries(applied ?? {})
        .filter(([, on]) => on)
        .map(([category]) => ({ category, label: categoryDescriptions?.[category] ?? null }))
        .sort((a, b) => categoryIndex(a.category) - categoryIndex(b.category));
}
function categoryIndex(key) {
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
/**
 * Compute the minimal checklist delta for a set of operations, against a
 * freshly-read checklist. Never returns keys that are unchanged.
 */
export function buildChecklistPatch(current, operations, newId = defaultChecklistId) {
    const projected = structuredCloneish(current ?? {});
    const patch = {};
    const notes = [];
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
                const item = {
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
                const next = operation.action === "toggle" ? !(item.isChecked ?? false) : operation.action === "check";
                if ((item.isChecked ?? false) === next) {
                    notes.push(`Checklist item "${item.title ?? id}" was already ${next ? "checked" : "unchecked"}.`);
                    break;
                }
                const updated = { ...item, isChecked: next, "@odata.type": CHECKLIST_ITEM_TYPE };
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
                if (item.title === newTitle)
                    break;
                projected[id] = { ...item, title: newTitle, "@odata.type": CHECKLIST_ITEM_TYPE };
                patch[id] = { "@odata.type": CHECKLIST_ITEM_TYPE, title: newTitle };
                break;
            }
            default: {
                const exhaustive = operation;
                throw new M365Error("PLANNER_CHECKLIST", `Unknown checklist action: ${JSON.stringify(exhaustive)}`);
            }
        }
    }
    return { patch, projected, notes };
}
function requireChecklistEntry(checklist, selector, action) {
    const entry = findChecklistEntry(checklist, selector);
    if (!entry) {
        const available = Object.entries(checklist)
            .map(([id, item]) => `  ${id} — ${item.isChecked ? "[x]" : "[ ]"} ${item.title ?? ""}`)
            .join("\n");
        throw new M365Error("PLANNER_CHECKLIST_NOT_FOUND", `Cannot ${action}: no checklist item matches ${selector.id ? `id "${selector.id}"` : `title "${selector.title ?? ""}"`}.`, available ? `Current checklist:\n${available}` : "The checklist is empty.");
    }
    return entry;
}
function findChecklistEntry(checklist, selector) {
    if (selector.id) {
        const item = checklist[selector.id];
        return item ? [selector.id, item] : undefined;
    }
    if (!selector.title) {
        throw new M365Error("PLANNER_CHECKLIST", "A checklist operation needs either an item id or a title to match.");
    }
    const wanted = selector.title.trim().toLowerCase();
    const matches = Object.entries(checklist).filter(([, item]) => (item.title ?? "").trim().toLowerCase() === wanted);
    if (matches.length > 1) {
        throw new M365Error("PLANNER_CHECKLIST_AMBIGUOUS", `More than one checklist item is titled "${selector.title}".`, `Pass the checklist item id instead: ${matches.map(([id]) => id).join(", ")}.`);
    }
    return matches[0];
}
/**
 * Checklist keys are client-generated. Planner accepts any string that is
 * unique within the task; a GUID keeps it collision-free without a round trip.
 */
function defaultChecklistId() {
    return globalThis.crypto.randomUUID();
}
function structuredCloneish(value) {
    return JSON.parse(JSON.stringify(value));
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
export function encodeReferenceKey(url) {
    return url
        .replace(/%/g, "%25")
        .replace(/\./g, "%2E")
        .replace(/:/g, "%3A")
        .replace(/@/g, "%40")
        .replace(/#/g, "%23");
}
export function decodeReferenceKey(key) {
    return key
        .replace(/%2E/gi, ".")
        .replace(/%3A/gi, ":")
        .replace(/%40/gi, "@")
        .replace(/%23/gi, "#")
        .replace(/%25/g, "%");
}
export function buildReferencePatch(current, operations) {
    const patch = {};
    const notes = [];
    const existing = current ?? {};
    for (const operation of operations) {
        const key = encodeReferenceKey(operation.url.trim());
        if (operation.action === "add") {
            const reference = { "@odata.type": REFERENCE_TYPE };
            if (operation.alias)
                reference.alias = operation.alias;
            if (operation.type)
                reference.type = operation.type;
            patch[key] = reference;
            if (existing[key])
                notes.push(`Reference ${operation.url} already existed; its alias/type were updated.`);
        }
        else {
            if (!existing[key]) {
                notes.push(`Reference ${operation.url} was not attached to this task; nothing to remove.`);
                continue;
            }
            patch[key] = null;
        }
    }
    return { patch, notes };
}
//# sourceMappingURL=semantics.js.map