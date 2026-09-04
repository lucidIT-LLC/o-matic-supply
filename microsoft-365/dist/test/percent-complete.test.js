import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { M365Error } from "../src/errors.js";
import { describeProgress, progressLabelFor, toPercentComplete, toPriority, describePriority, toPlannerDate, } from "../src/planner/semantics.js";
describe("percentComplete mapping", () => {
    test("accepts the three real Planner states as numbers", () => {
        assert.equal(toPercentComplete(0), 0);
        assert.equal(toPercentComplete(50), 50);
        assert.equal(toPercentComplete(100), 100);
    });
    test("accepts the UI's words, case and punctuation insensitively", () => {
        for (const input of ["Not started", "not started", "NOT-STARTED", "todo", "backlog"]) {
            assert.equal(toPercentComplete(input), 0, input);
        }
        for (const input of ["In progress", "in-progress", "inprogress", "doing", "WIP", "started"]) {
            assert.equal(toPercentComplete(input), 50, input);
        }
        for (const input of ["Completed", "complete", "done", "FINISHED", "closed"]) {
            assert.equal(toPercentComplete(input), 100, input);
        }
    });
    test("accepts numeric strings", () => {
        assert.equal(toPercentComplete("0"), 0);
        assert.equal(toPercentComplete("50"), 50);
        assert.equal(toPercentComplete("100"), 100);
    });
    test("rejects intermediate percentages, which Planner cannot represent", () => {
        for (const input of [25, 75, 1, 99, -1, 101]) {
            assert.throws(() => toPercentComplete(input), (error) => error instanceof M365Error &&
                error.code === "PLANNER_PROGRESS" &&
                /0, 50 or 100/.test(error.toToolMessage()), `expected ${input} to be rejected`);
        }
    });
    test("rejects words it does not know rather than guessing", () => {
        assert.throws(() => toPercentComplete("nearly there"), M365Error);
        assert.throws(() => toPercentComplete(""), M365Error);
    });
    test("labels round-trip", () => {
        assert.equal(progressLabelFor(0), "Not started");
        assert.equal(progressLabelFor(50), "In progress");
        assert.equal(progressLabelFor(100), "Completed");
    });
    test("describeProgress reads stored values the way the UI does", () => {
        // Planner itself only writes 0/50/100, but other clients have written
        // arbitrary integers; reading must not lie about them.
        assert.equal(describeProgress(undefined), "Not started");
        assert.equal(describeProgress(0), "Not started");
        assert.equal(describeProgress(1), "In progress");
        assert.equal(describeProgress(50), "In progress");
        assert.equal(describeProgress(99), "In progress");
        assert.equal(describeProgress(100), "Completed");
    });
});
describe("priority mapping", () => {
    test("words map to the values the Planner UI writes", () => {
        assert.equal(toPriority("Urgent"), 1);
        assert.equal(toPriority("important"), 3);
        assert.equal(toPriority("Medium"), 5);
        assert.equal(toPriority("low"), 9);
    });
    test("integers pass through, out-of-range is rejected", () => {
        assert.equal(toPriority(7), 7);
        assert.throws(() => toPriority(11), M365Error);
        assert.throws(() => toPriority("someday"), M365Error);
    });
    test("stored values are described in the UI's four buckets", () => {
        assert.equal(describePriority(0), "Urgent");
        assert.equal(describePriority(1), "Urgent");
        assert.equal(describePriority(3), "Important");
        assert.equal(describePriority(5), "Medium");
        assert.equal(describePriority(10), "Low");
        assert.equal(describePriority(undefined), undefined);
    });
});
describe("date normalisation", () => {
    test("date-only becomes a DateTimeOffset", () => {
        assert.equal(toPlannerDate("2026-09-01"), "2026-09-01T00:00:00Z");
    });
    test("null clears, undefined means 'do not touch'", () => {
        assert.equal(toPlannerDate(null), null);
        assert.equal(toPlannerDate(""), null);
        assert.equal(toPlannerDate(undefined), undefined);
    });
    test("garbage is rejected", () => {
        assert.throws(() => toPlannerDate("next tuesday"), M365Error);
    });
});
//# sourceMappingURL=percent-complete.test.js.map