import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { M365Error } from "../src/errors.js";
import { buildChecklistPatch, buildReferencePatch, encodeReferenceKey, decodeReferenceKey, CHECKLIST_ITEM_TYPE, } from "../src/planner/semantics.js";
function ids() {
    let n = 0;
    return () => `new-${++n}`;
}
const current = {
    "item-a": { "@odata.type": CHECKLIST_ITEM_TYPE, title: "Draft the SOW", isChecked: false, orderHint: "a" },
    "item-b": { "@odata.type": CHECKLIST_ITEM_TYPE, title: "Send for review", isChecked: true, orderHint: "b" },
};
describe("checklist read-modify-write", () => {
    test("adding produces only the new key, never the whole dictionary", () => {
        const { patch, projected } = buildChecklistPatch(current, [{ action: "add", title: "Countersign" }], ids());
        assert.deepEqual(Object.keys(patch), ["new-1"]);
        assert.equal(patch["new-1"]?.title, "Countersign");
        assert.equal(patch["new-1"]?.isChecked, false);
        assert.equal(patch["new-1"]?.["@odata.type"], CHECKLIST_ITEM_TYPE);
        // The untouched items must NOT appear: a PATCH that resends them would
        // clobber a concurrent edit made between our read and our write.
        assert.ok(!("item-a" in patch));
        assert.ok(!("item-b" in patch));
        assert.equal(Object.keys(projected).length, 3);
    });
    test("removal sends null, which is the documented delete verb", () => {
        const { patch, projected } = buildChecklistPatch(current, [{ action: "remove", id: "item-a" }], ids());
        assert.deepEqual(patch, { "item-a": null });
        assert.ok(!("item-a" in projected));
        assert.ok("item-b" in projected);
    });
    test("toggle flips the current value read from the fresh copy", () => {
        const { patch } = buildChecklistPatch(current, [{ action: "toggle", id: "item-a" }, { action: "toggle", id: "item-b" }], ids());
        assert.equal(patch["item-a"]?.isChecked, true);
        assert.equal(patch["item-b"]?.isChecked, false);
        // Only the changed field is sent; the title is not resent.
        assert.deepEqual(Object.keys(patch["item-a"] ?? {}).sort(), ["@odata.type", "isChecked"]);
    });
    test("a no-op check produces no patch entry and says so", () => {
        const { patch, notes } = buildChecklistPatch(current, [{ action: "check", id: "item-b" }], ids());
        assert.deepEqual(patch, {});
        assert.equal(notes.length, 1);
        assert.match(notes[0] ?? "", /already checked/);
    });
    test("items can be selected by exact title", () => {
        const { patch } = buildChecklistPatch(current, [{ action: "check", title: "Draft the SOW" }], ids());
        assert.equal(patch["item-a"]?.isChecked, true);
    });
    test("sequential operations compose against the projected state", () => {
        const { patch, projected } = buildChecklistPatch(current, [
            { action: "add", title: "Countersign" },
            { action: "check", title: "Countersign" },
            { action: "rename", id: "item-a", newTitle: "Draft the SOW v2" },
            { action: "remove", id: "item-b" },
        ], ids());
        // The add and the subsequent check collapse into one entry for the new key.
        assert.equal(patch["new-1"]?.isChecked, true);
        assert.equal(patch["item-a"]?.title, "Draft the SOW v2");
        assert.equal(patch["item-b"], null);
        assert.deepEqual(Object.keys(projected).sort(), ["item-a", "new-1"]);
    });
    test("a duplicate title is reported, not silently duplicated", () => {
        const { patch, notes } = buildChecklistPatch(current, [{ action: "add", title: "Draft the SOW" }], ids());
        assert.deepEqual(patch, {});
        assert.match(notes[0] ?? "", /already contains/);
    });
    test("an unknown item fails loudly and lists what is there", () => {
        assert.throws(() => buildChecklistPatch(current, [{ action: "check", title: "Nope" }], ids()), (error) => error instanceof M365Error &&
            error.code === "PLANNER_CHECKLIST_NOT_FOUND" &&
            /Draft the SOW/.test(error.toToolMessage()));
    });
    test("an ambiguous title fails rather than picking one", () => {
        const ambiguous = {
            one: { title: "Review", isChecked: false },
            two: { title: "review", isChecked: false },
        };
        assert.throws(() => buildChecklistPatch(ambiguous, [{ action: "check", title: "Review" }], ids()), (error) => error instanceof M365Error && error.code === "PLANNER_CHECKLIST_AMBIGUOUS");
    });
    test("an empty checklist accepts adds", () => {
        const { patch } = buildChecklistPatch(undefined, [{ action: "add", title: "First" }], ids());
        assert.equal(patch["new-1"]?.title, "First");
    });
    test("the source dictionary is never mutated", () => {
        const snapshot = JSON.stringify(current);
        buildChecklistPatch(current, [{ action: "remove", id: "item-a" }, { action: "add", title: "X" }], ids());
        assert.equal(JSON.stringify(current), snapshot);
    });
});
describe("reference keys", () => {
    test("Planner's escaping rule is applied and reversible", () => {
        const url = "https://contoso.sharepoint.com/sites/ops/Shared%20Documents/plan.docx#section";
        const key = encodeReferenceKey(url);
        assert.ok(!key.includes(":"));
        assert.ok(!key.includes("."));
        assert.ok(!key.includes("#"));
        assert.equal(decodeReferenceKey(key), url);
    });
    test("removing a reference that is not attached is a note, not a failure", () => {
        const { patch, notes } = buildReferencePatch({}, [
            { action: "remove", url: "https://example.com/a" },
        ]);
        assert.deepEqual(patch, {});
        assert.match(notes[0] ?? "", /not attached/);
    });
    test("adding a reference keys it by the escaped URL", () => {
        const { patch } = buildReferencePatch({}, [
            { action: "add", url: "https://example.com/a.pdf", alias: "Spec", type: "Pdf" },
        ]);
        const key = encodeReferenceKey("https://example.com/a.pdf");
        assert.equal(patch[key]?.alias, "Spec");
        assert.equal(patch[key]?.type, "Pdf");
    });
});
//# sourceMappingURL=checklist.test.js.map