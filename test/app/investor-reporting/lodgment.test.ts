import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REFERENCE_MAX_LENGTH, REFERENCE_MIN_LENGTH, checkLodgment, isRealISODate } from "../../../src/app/workspaces/investor-reporting/model.ts";

const TODAY = "2026-10-12";
const ok = { reference: "Receipt 418806117352", date: "2026-10-12" };

function errorsOf(draft: { reference: string; date: string }, today = TODAY) {
  const check = checkLodgment(draft, today);
  assert.equal(check.ok, false);
  return check.ok ? {} : check.errors;
}

describe("lodgment receipt reference", () => {
  it("accepts a typical ATO receipt and returns it trimmed", () => {
    assert.deepEqual(checkLodgment(ok, TODAY), { ok: true, reference: "Receipt 418806117352", date: "2026-10-12" });
    assert.deepEqual(checkLodgment({ ...ok, reference: "   418806117352  " }, TODAY), { ok: true, reference: "418806117352", date: "2026-10-12" });
  });

  it("is required: blank and whitespace-only are refused", () => {
    assert.equal(errorsOf({ ...ok, reference: "" }).reference, "Enter the ATO receipt reference.");
    assert.equal(errorsOf({ ...ok, reference: "     " }).reference, "Enter the ATO receipt reference.");
  });

  it("needs at least 3 characters after trimming", () => {
    assert.equal(REFERENCE_MIN_LENGTH, 3);
    assert.match(errorsOf({ ...ok, reference: "ab" }).reference ?? "", /too short/);
    assert.match(errorsOf({ ...ok, reference: "  ab  " }).reference ?? "", /too short/);
    assert.equal(checkLodgment({ ...ok, reference: "abc" }, TODAY).ok, true);
    assert.equal(checkLodgment({ ...ok, reference: "  abc  " }, TODAY).ok, true);
  });

  it("allows at most 60 characters", () => {
    assert.equal(REFERENCE_MAX_LENGTH, 60);
    assert.equal(checkLodgment({ ...ok, reference: "R".repeat(60) }, TODAY).ok, true);
    assert.match(errorsOf({ ...ok, reference: "R".repeat(61) }).reference ?? "", /too long/);
    // Padding does not count towards the limit.
    assert.equal(checkLodgment({ ...ok, reference: ` ${"R".repeat(60)} ` }, TODAY).ok, true);
  });

  it("allows letters, numbers, spaces and - _ / . : # only", () => {
    for (const reference of ["Receipt 418806117352", "ATO-2026/10_12", "ref.#4:5", "a b c"]) {
      assert.equal(checkLodgment({ ...ok, reference }, TODAY).ok, true, reference);
    }
    for (const reference of ["Receipt <1>", "a;b;c", "abc!", "R€ceipt", "ab\tc", "line\nbreak", "<script>alert(1)</script>", "a,b,c", "a=b+c", "'; DROP TABLE x"]) {
      assert.equal(errorsOf({ ...ok, reference }).reference, "Use letters, numbers, spaces and - _ / . : # only.", JSON.stringify(reference));
    }
  });
});

describe("lodgment date", () => {
  it("is required", () => {
    assert.equal(errorsOf({ ...ok, date: "" }).date, "Enter the date lodged.");
    assert.equal(errorsOf({ ...ok, date: "  " }).date, "Enter the date lodged.");
  });

  it("must be a real calendar date written YYYY-MM-DD", () => {
    for (const date of ["12/10/2026", "2026-1-5", "2026-10-1", "20261012", "2026-13-01", "2026-00-10", "2026-02-30", "2026-04-31", "2026-02-29", "abcd-ef-gh", "2026-10-12T09:00"]) {
      assert.equal(errorsOf({ ...ok, date }).date, "Enter a valid date.", date);
    }
    assert.equal(isRealISODate("2024-02-29"), true);
    assert.equal(isRealISODate("2026-02-28"), true);
    assert.equal(isRealISODate("2026-12-31"), true);
    assert.equal(isRealISODate("2100-02-29"), false);
    assert.equal(isRealISODate("2000-02-29"), true);
  });

  it("may be today or earlier, not later", () => {
    assert.equal(checkLodgment({ ...ok, date: "2026-10-12" }, TODAY).ok, true);
    assert.equal(checkLodgment({ ...ok, date: "2026-10-11" }, TODAY).ok, true);
    assert.equal(checkLodgment({ ...ok, date: "2025-01-01" }, TODAY).ok, true);
    assert.equal(errorsOf({ ...ok, date: "2026-10-13" }).date, "The date can't be in the future.");
    assert.equal(errorsOf({ ...ok, date: "2027-01-01" }).date, "The date can't be in the future.");
  });

  it("is checked against the day it is read, so the boundary moves with the clock", () => {
    assert.equal(checkLodgment({ ...ok, date: "2026-10-13" }, "2026-10-13").ok, true);
    assert.equal(errorsOf({ ...ok, date: "2026-10-13" }, "2026-10-12").date, "The date can't be in the future.");
  });
});

describe("lodgment form as a whole", () => {
  it("reports both problems at once", () => {
    assert.deepEqual(errorsOf({ reference: "", date: "" }), { reference: "Enter the ATO receipt reference.", date: "Enter the date lodged." });
    assert.deepEqual(errorsOf({ reference: "x", date: "2026-02-30" }), {
      reference: "The reference is too short. Use at least 3 characters.",
      date: "Enter a valid date.",
    });
  });

  it("reports only the field that is wrong", () => {
    assert.deepEqual(Object.keys(errorsOf({ ...ok, reference: "ab" })), ["reference"]);
    assert.deepEqual(Object.keys(errorsOf({ ...ok, date: "2030-01-01" })), ["date"]);
  });
});
