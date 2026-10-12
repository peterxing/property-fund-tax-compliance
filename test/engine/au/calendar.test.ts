import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateAuBasDueDate, calculateAuPaygInstalmentDueDate, listAuReportingPeriods, rollForwardToBusinessDay } from "../../../src/engine/au/calendar.ts";

test("quarterly BAS dates cover ordinary, agent and online concessions", () => {
  assert.equal(calculateAuBasDueDate({ periodStart: "2026-07-01", periodEnd: "2026-09-30", frequency: "QUARTERLY" }), "2026-10-28");
  assert.equal(calculateAuBasDueDate({ periodStart: "2026-07-01", periodEnd: "2026-09-30", frequency: "QUARTERLY", taxAgentConcession: true }), "2026-11-25");
  assert.equal(calculateAuBasDueDate({ periodStart: "2026-01-01", periodEnd: "2026-03-31", frequency: "QUARTERLY", electronicLodgmentConcession: true }), "2026-05-12");
  assert.equal(calculateAuBasDueDate({ periodStart: "2026-10-01", periodEnd: "2026-12-31", frequency: "QUARTERLY", taxAgentConcession: true }), "2027-03-01");
});

test("monthly and annual BAS rules include december concession and business-day rollover", () => {
  assert.equal(calculateAuBasDueDate({ periodStart: "2026-12-01", periodEnd: "2026-12-31", frequency: "MONTHLY" }), "2027-01-21");
  assert.equal(calculateAuBasDueDate({ periodStart: "2026-12-01", periodEnd: "2026-12-31", frequency: "MONTHLY", taxAgentConcession: true, annualTurnoverCents: 900_000_000 }), "2027-02-22");
  assert.equal(calculateAuBasDueDate({ periodStart: "2028-07-01", periodEnd: "2028-09-30", frequency: "QUARTERLY" }), "2028-10-30");
  assert.equal(calculateAuBasDueDate({ periodStart: "2026-07-01", periodEnd: "2027-06-30", frequency: "ANNUAL" }), "2027-11-01");
  assert.equal(calculateAuBasDueDate({ periodStart: "2026-07-01", periodEnd: "2027-06-30", frequency: "ANNUAL", annualDueMode: "NO_TAX_RETURN_28_FEB" }), "2028-02-28");
});

test("period listing and PAYG instalment helper follow the published quarter pattern", () => {
  const periods = listAuReportingPeriods({ incomeYearEnd: 2027, frequency: "QUARTERLY", taxAgentConcession: true });
  assert.equal(periods.length, 4);
  assert.deepEqual(periods.map((p) => p.dueDate), ["2026-11-25", "2027-03-01", "2027-05-26", "2027-08-25"]);
  assert.equal(calculateAuPaygInstalmentDueDate("2026-12-31"), "2027-01-28");
  assert.equal(calculateAuPaygInstalmentDueDate("2026-12-31", "HEAD_COMPANY_QUARTERLY"), "2027-01-21");
  assert.equal(rollForwardToBusinessDay("2027-01-01"), "2027-01-04");
});

