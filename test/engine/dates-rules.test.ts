import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, addYears, diffDays, endOfMonth, financialYearStart, isISODate, monthsBetween, todaySG, yearOfAssessment } from "../../src/engine/dates.ts";
import { pickEffective, requireEffective, RuleNotFoundError } from "../../src/engine/rules.ts";

test("ISO validation", () => {
  assert.equal(isISODate("2026-02-29"), false);
  assert.equal(isISODate("2028-02-29"), true);
  assert.equal(isISODate("2026-13-01"), false);
  assert.equal(isISODate("26-01-01"), false);
});

test("date arithmetic clamps month ends and handles leap years", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(addYears("2028-02-29", 1), "2029-02-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(diffDays("2026-01-01", "2027-01-01"), 365);
  assert.equal(endOfMonth("2026-02-10"), "2026-02-28");
  assert.equal(monthsBetween("2026-01-31", "2026-02-28"), 1);
  assert.equal(monthsBetween("2026-01-31", "2026-02-27"), 0);
  assert.equal(monthsBetween("2024-03-15", "2026-03-14"), 23);
});

test("year of assessment and financial-year start", () => {
  assert.equal(yearOfAssessment("2025-12-31"), 2026);
  assert.equal(yearOfAssessment("2026-06-30"), 2027);
  assert.equal(financialYearStart("2025-12-31"), "2025-01-01");
  assert.equal(financialYearStart("2026-06-30"), "2025-07-01");
});

test("todaySG uses UTC+8", () => {
  assert.equal(todaySG(new Date("2026-10-09T17:00:00Z")), "2026-10-10");
  assert.equal(todaySG(new Date("2026-10-09T15:59:00Z")), "2026-10-09");
});

test("effective-dated lookup", () => {
  const rows = [
    { from: "2023-01-01", to: "2023-12-31", value: 800 },
    { from: "2024-01-01", value: 900 },
  ];
  assert.equal(pickEffective(rows, "2023-06-30"), 800);
  assert.equal(pickEffective(rows, "2026-01-01"), 900);
  assert.equal(pickEffective(rows, "2022-12-31"), undefined);
  assert.throws(() => requireEffective(rows, "2022-12-31", "GST rate"), RuleNotFoundError);
});
