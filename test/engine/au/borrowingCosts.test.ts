import assert from "node:assert/strict";
import { test } from "node:test";
import { computeBlackholeExpenditureSchedule, computeBorrowingExpenseSchedule } from "../../../src/engine/au/borrowingCosts.ts";

const dollars = (amount: number): number => amount * 100;

test("borrowing expenses of $100 or less are immediately deductible", () => {
  const result = computeBorrowingExpenseSchedule({ amount: dollars(100), incurredDate: "2025-07-01", loanEndDate: "2028-06-30" });
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0]?.deduction, dollars(100));
});

test("borrowing expenses above $100 are spread over the shorter loan term by days", () => {
  const result = computeBorrowingExpenseSchedule({ amount: dollars(1_000), incurredDate: "2025-07-01", loanEndDate: "2028-06-30" });
  assert.deepEqual(result.lines.map((line) => line.deduction), [33303, 33303, 33394]);
  assert.equal(result.lines[2]?.relevantDays, 366);
});

test("blackhole expenditure is spread evenly over five income years", () => {
  const result = computeBlackholeExpenditureSchedule({ amount: 500_005, incurredDate: "2025-08-01" });
  assert.equal(result.lines.length, 5);
  assert.deepEqual(result.lines.map((line) => line.deduction), [100001, 100001, 100001, 100001, 100001]);
});

test("borrowing expense input validation rejects a loan end before the start", () => {
  assert.throws(() => computeBorrowingExpenseSchedule({ amount: dollars(500), incurredDate: "2025-07-01", loanEndDate: "2025-06-30" }), /loanEndDate/);
});

