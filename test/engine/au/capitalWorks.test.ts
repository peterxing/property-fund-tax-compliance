import assert from "node:assert/strict";
import { test } from "node:test";
import { AU_CAPITAL_WORKS_BUILDING_TYPES, computeCapitalWorksDeduction, computeCapitalWorksSchedule } from "../../../src/engine/au/capitalWorks.ts";

const dollars = (amount: number): number => amount * 100;

test("division 43 residential building gives a full-year 2.5% deduction after completion", () => {
  const result = computeCapitalWorksDeduction({
    incomeYear: 2026,
    asset: {
      id: "res-1",
      label: "Residential block",
      buildingType: "RESIDENTIAL",
      constructionStartDate: "2024-01-01",
      constructionCompleteDate: "2024-12-31",
      firstIncomeUseDate: "2025-01-01",
      acquisitionDate: "2025-01-01",
      constructionExpenditure: dollars(100_000),
    },
  });
  assert.equal(result.line.rateBps, 250);
  assert.equal(result.line.deduction, dollars(2_500));
  assert.equal(result.line.daysClaimed, 365);
});

test("build-to-rent uses the 4% rate from the 10 May 2023 construction boundary", () => {
  const result = computeCapitalWorksDeduction({
    incomeYear: 2026,
    asset: {
      id: "btr-1",
      label: "BTR tower",
      buildingType: "BUILD_TO_RENT",
      constructionStartDate: "2023-05-10",
      constructionCompleteDate: "2025-01-01",
      acquisitionDate: "2025-01-01",
      buildToRentActiveFromDate: "2025-01-01",
      constructionExpenditure: dollars(100_000),
    },
  });
  assert.equal(result.line.rateBps, 400);
  assert.equal(result.line.deduction, dollars(4_000));
});

test("industrial buildings begun after 15 September 1987 but before 27 February 1992 revert to 2.5%", () => {
  const result = computeCapitalWorksDeduction({
    incomeYear: 1991,
    asset: {
      id: "ind-1990",
      label: "1990 factory",
      buildingType: "INDUSTRIAL",
      constructionStartDate: "1990-01-15",
      constructionCompleteDate: "1990-06-30",
      firstIncomeUseDate: "1990-07-01",
      constructionExpenditure: dollars(100_000),
    },
  });
  assert.equal(result.line.rateBps, 250);
  assert.equal(result.line.deduction, dollars(2_500));
});

test("capital works schedule aggregates yearly deductions across assets", () => {
  const result = computeCapitalWorksSchedule({
    fromIncomeYear: 2026,
    toIncomeYear: 2026,
    assets: [{
      id: "res-1",
      label: "Residential block",
      buildingType: "RESIDENTIAL",
      constructionStartDate: "2024-01-01",
      constructionCompleteDate: "2024-12-31",
      firstIncomeUseDate: "2025-01-01",
      acquisitionDate: "2025-01-01",
      constructionExpenditure: dollars(100_000),
    }],
  });
  assert.equal(result.summaries[0]?.totalDeduction, dollars(2_500));
  assert.equal(result.assetLines.length, 1);
});

test("capital works rejects prior claims above construction expenditure", () => {
  assert.throws(() => computeCapitalWorksDeduction({
    incomeYear: 2026,
    asset: {
      id: "bad",
      label: "Bad asset",
      buildingType: "RESIDENTIAL",
      constructionStartDate: "2024-01-01",
      constructionCompleteDate: "2024-12-31",
      constructionExpenditure: dollars(10_000),
      priorDivision43Claims: dollars(10_001),
    },
  }), /priorDivision43Claims/);
});

test("capital works building catalogue exposes build-to-rent selection", () => {
  assert.ok(AU_CAPITAL_WORKS_BUILDING_TYPES.some((row) => row.id === "BUILD_TO_RENT"));
});
