import { test } from "node:test";
import assert from "node:assert/strict";
import { auIncomeYearEnding, auIncomeYearEnd, auIncomeYearLabel, auIncomeYearQuarters, auIncomeYearStart, auQuarterForDate, auSapCompanyLodgmentDueDate, auSapCompanyPaymentDueDate, auSapTrustLodgmentDueDate } from "../../../src/engine/au/dates.ts";

test("Australian income-year helpers work for 30 June balancers", () => {
  assert.equal(auIncomeYearEnding("2026-06-30"), 2026);
  assert.equal(auIncomeYearEnding("2026-07-01"), 2027);
  assert.equal(auIncomeYearStart(2026), "2025-07-01");
  assert.equal(auIncomeYearEnd(2026), "2026-06-30");
  assert.equal(auIncomeYearLabel(2026), "2025-26");
});

test("income-year helpers handle substituted accounting periods", () => {
  const yearEnd = { month: 12, day: 31 } as const;
  assert.equal(auIncomeYearEnding("2026-01-01", yearEnd), 2026);
  assert.equal(auIncomeYearEnding("2026-12-31", yearEnd), 2026);
  assert.equal(auIncomeYearStart(2026, yearEnd), "2026-01-01");
  assert.equal(auIncomeYearEnd(2026, yearEnd), "2026-12-31");
  assert.equal(auIncomeYearLabel(2026, yearEnd), "2026-26");
});

test("quarter helpers align to Australian income years", () => {
  const quarters = auIncomeYearQuarters(2026);
  assert.deepEqual(quarters.map((quarter) => [quarter.quarter, quarter.start, quarter.end]), [
    [1, "2025-07-01", "2025-09-30"],
    [2, "2025-10-01", "2025-12-31"],
    [3, "2026-01-01", "2026-03-31"],
    [4, "2026-04-01", "2026-06-30"],
  ]);
  assert.equal(auQuarterForDate("2026-03-15").quarter, 3);
  assert.equal(auQuarterForDate("2026-07-01").quarter, 1);
});

test("SAP due-date helpers follow the ATO month-based rules", () => {
  const decemberBal = { month: 12, day: 31 } as const;
  assert.equal(auSapTrustLodgmentDueDate(2026, decemberBal), "2027-04-30");
  assert.equal(auSapCompanyPaymentDueDate(2026, decemberBal), "2027-06-01");
  assert.equal(auSapCompanyLodgmentDueDate(2026, decemberBal), "2027-07-15");
});

