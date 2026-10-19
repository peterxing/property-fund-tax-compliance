import assert from "node:assert/strict";
import { test } from "node:test";
import { computeBorrowingExpenseSchedule, computeBlackholeExpenditureSchedule } from "../../src/engine/au/borrowingCosts.ts";
import { computeCapitalWorksDeduction } from "../../src/engine/au/capitalWorks.ts";
import { AU_DEPRECIABLE_ASSET_CLASSES, computeDepreciation, computeDepreciationSchedule } from "../../src/engine/au/depreciation.ts";
import { money } from "../../src/domain/format.ts";
import { seedData } from "../../src/domain/seed/index.ts";
import { assetRegisterView } from "../../src/domain/assets/index.ts";
import { assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const doc = "au-capital-allowances";
const D = (dollars: number) => Math.round(dollars * 100);
const aud = (cents: number) => money(cents, "AUD", 2);

function div43Probe(buildingType: "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL" | "SHORT_TERM_TRAVELLER_ACCOMMODATION" | "STRUCTURAL_IMPROVEMENT" | "BUILD_TO_RENT", constructionStartDate: string) {
  const result = computeCapitalWorksDeduction({
    incomeYear: 2026,
    asset: {
      id: `${buildingType}-${constructionStartDate}`,
      label: buildingType,
      buildingType,
      constructionStartDate,
      constructionCompleteDate: "2025-06-30",
      firstIncomeUseDate: "2025-07-01",
      acquisitionDate: "2025-07-01",
      constructionExpenditure: D(100_000),
      ...(buildingType === "BUILD_TO_RENT" ? { buildToRentActiveFromDate: "2025-07-01" } : {}),
    },
  });
  return { rate: `${result.line.rateBps / 100}%`, years: result.line.rateBps === 400 ? "25 years" : "40 years" };
}

test("capital allowances examples are exactly the documented set", () => {
  assert.deepEqual(exampleIds(readRuleDoc(doc)), ["DIV40-1", "DIV40-2", "LVP-1", "BAL-1", "DIV40-3", "DIV43-1", "DIV43-2", "DIV43-3", "BORR-1", "BORR-2"]);
});

test("Division 40 worked examples quote engine results", () => {
  const baseAsset = { id: "copier", label: "Photocopier", assetClassId: "OTHER_PLANT", cost: D(1_500), startDate: "2024-07-01", effectiveLifeYears: 5 } as const;
  const dv = computeDepreciation({ incomeYear: 2025, asset: { ...baseAsset, method: "DIMINISHING_VALUE" } }).line;
  const pc = computeDepreciation({ incomeYear: 2025, asset: { ...baseAsset, method: "PRIME_COST" } }).line;
  assert.equal(dv.declineInValue, D(600));
  assert.equal(pc.declineInValue, D(300));
  assertExampleQuotes(doc, "DIV40-1", [
    `A$1,500.00 × 365 / 365 × 200% / 5`,
    `decline in value ${aud(dv.declineInValue)}; closing adjustable value ${aud(dv.closingAdjustableValue)}`,
    `A$1,500.00 × 365 / 365 × 100% / 5`,
    `decline in value ${aud(pc.declineInValue)}; closing adjustable value ${aud(pc.closingAdjustableValue)}`,
  ]);

  const leap = computeDepreciation({ incomeYear: 2024, asset: { id: "carpet", label: "Carpet", assetClassId: "CARPET", cost: D(8_000), startDate: "2023-07-01", method: "PRIME_COST" } }).line;
  assert.equal(leap.daysHeld, 366);
  assertExampleQuotes(doc, "DIV40-2", [`366 days held`, `A$8,000.00 × 366 / 365 × 100% / 8 = ${aud(leap.declineInValue)}`, `Closing adjustable value is ${aud(leap.closingAdjustableValue)}`]);
});

test("pool and balancing examples quote engine results", () => {
  const pool = computeDepreciationSchedule({
    fromIncomeYear: 2026,
    toIncomeYear: 2027,
    assets: [{ id: "pool", label: "Low-cost controller", assetClassId: "OTHER_PLANT", cost: D(800), startDate: "2025-07-01", method: "PRIME_COST", effectiveLifeYears: 4, poolMethod: "LOW_VALUE_POOL" }],
  }).assetLines;
  assertExampleQuotes(doc, "LVP-1", [
    tableRow(["2026", aud(pool[0]!.openingAdjustableValue), `${aud(D(800))} × 18.75% = ${aud(pool[0]!.deductionAllowed)}`, aud(pool[0]!.closingAdjustableValue)]),
    tableRow(["2027", aud(pool[1]!.openingAdjustableValue), `${aud(pool[1]!.openingAdjustableValue)} × 37.5% = ${aud(pool[1]!.deductionAllowed)}`, aud(pool[1]!.closingAdjustableValue)]),
  ]);

  const bal = computeDepreciation({ incomeYear: 2026, asset: { id: "gain", label: "Disposed above adjustable value", assetClassId: "OTHER_PLANT", cost: D(100_000), startDate: "2025-07-01", method: "PRIME_COST", effectiveLifeYears: 10, terminationDate: "2026-06-30", terminationValue: D(95_000) } }).line;
  assertExampleQuotes(doc, "BAL-1", [
    `Current-year decline is ${aud(bal.deductionAllowed)}`,
    `termination value exceeds adjustable value by ${aud(bal.balancingAdjustmentIncome)}`,
    `closing adjustable value ${aud(bal.closingAdjustableValue)}`,
    `register net deduction is ${aud(bal.deductionAllowed - bal.balancingAdjustmentIncome)}`,
  ]);
});

test("demo Harbourline examples quote seed register results", () => {
  const view = assetRegisterView(seedData(), "harbourline");
  const hvac = view.rows.find((row) => row.description === "HVAC plant replacement")!;
  const div40 = view.comparisons.find((row) => row.key === "div40")!;
  assertExampleQuotes(doc, "DIV40-3", [
    `cost ${aud(hvac.cost)}`,
    `claims ${aud(hvac.baseDeduction)} for 2026`,
    `closing written-down value ${aud(hvac.closingWrittenDownValue)}`,
    `Tax depreciation — Div 40` ,
    `${aud(div40.register)}`,
  ]);

  const structure = view.rows.find((row) => row.description === "Base building structure")!;
  const div43 = view.comparisons.find((row) => row.key === "div43")!;
  assertExampleQuotes(doc, "DIV43-3", [
    `construction expenditure ${aud(structure.cost)}`,
    `base deduction ${aud(structure.baseDeduction)}`,
    `closing undeducted construction expenditure ${aud(structure.closingWrittenDownValue)}`,
    `Capital works — Div 43`,
    `${aud(div43.register)}`,
  ]);
});

test("Division 43 worked examples quote engine results", () => {
  const commercial = computeCapitalWorksDeduction({ incomeYear: 2026, asset: { id: "building", label: "Commercial structure", buildingType: "COMMERCIAL", constructionStartDate: "2024-07-01", constructionCompleteDate: "2025-06-30", firstIncomeUseDate: "2025-07-01", acquisitionDate: "2025-07-01", constructionExpenditure: D(4_000_000) } }).line;
  assertExampleQuotes(doc, "DIV43-1", [`${commercial.daysClaimed} / ${commercial.daysInIncomeYear} days at 2.5%`, `A$4,000,000.00 × 2.5% = ${aud(commercial.deduction)}`, `Closing undeducted construction expenditure is ${aud(commercial.closingUndeductedConstructionExpenditure)}`]);

  const btr = computeCapitalWorksDeduction({ incomeYear: 2026, asset: { id: "btr", label: "BTR tower", buildingType: "BUILD_TO_RENT", constructionStartDate: "2023-05-10", constructionCompleteDate: "2025-01-01", acquisitionDate: "2025-01-01", buildToRentActiveFromDate: "2025-01-01", constructionExpenditure: D(100_000) } }).line;
  assertExampleQuotes(doc, "DIV43-2", [`${btr.daysClaimed} / ${btr.daysInIncomeYear} days at 4%`, `giving ${aud(btr.deduction)}`]);
});

test("borrowing and blackhole worked examples quote engine results", () => {
  const peter = computeBorrowingExpenseSchedule({ amount: D(1_600), incurredDate: "2024-07-03", loanStartDate: "2024-07-03", loanEndDate: "2049-07-02" }).lines;
  assertExampleQuotes(doc, "BORR-1", peter.map((line) => tableRow([String(line.incomeYear), aud(line.openingUnclaimedAmount), `${line.relevantDays.toLocaleString("en-AU")} / ${line.remainingLoanDays.toLocaleString("en-AU")}`, aud(line.deduction), aud(line.closingUnclaimedAmount)])));

  const blackhole = computeBlackholeExpenditureSchedule({ amount: D(5_000), incurredDate: "2024-08-01" }).lines;
  assertExampleQuotes(doc, "BORR-2", blackhole.map((line) => `${line.incomeYear} ${aud(line.deduction)}`));
});

test("Division 40 rate and catalogue tables quote code values", () => {
  assertSectionQuotes(doc, "Division 40 method constants", [
    tableRow(["Diminishing value multiplier before 10 May 2006", "150%", "`au-div40.general-formulas.2001-plus`"]),
    tableRow(["Diminishing value multiplier from 10 May 2006", "200%", "`au-div40.general-formulas.2001-plus`"]),
    tableRow(["Day denominator for both methods", "365", "`au-div40.general-formulas.2001-plus`"]),
    tableRow(["Low-value pool first-year addition rate", "18.75%", "`au-div40.pools-and-small-business.2026`"]),
    tableRow(["Low-cost asset allocation threshold", "cost is less than A$1,000.00", "code condition `asset.cost < 100_000`"]),
  ]);
  assertSectionQuotes(doc, "Division 40 asset class defaults", AU_DEPRECIABLE_ASSET_CLASSES.map((row) => tableRow([row.label, row.defaultAppliesFrom, row.defaultEffectiveLifeYears === undefined ? "user supplied" : `${row.defaultEffectiveLifeYears} years`])));
});

test("Division 43 and borrowing rate tables quote code values", () => {
  const rows = [
    ["Residential rental building", "From 1985-07-18", div43Probe("RESIDENTIAL", "1985-07-18")],
    ["Commercial / other non-residential building", "From 1979-08-22", div43Probe("COMMERCIAL", "1979-08-22")],
    ["Industrial building", "1984-08-22 to 1987-09-15", div43Probe("INDUSTRIAL", "1984-08-22")],
    ["Industrial building", "From 1992-02-27", div43Probe("INDUSTRIAL", "1992-02-27")],
    ["Traveller accommodation building", "From 1992-02-27", div43Probe("SHORT_TERM_TRAVELLER_ACCOMMODATION", "1992-02-27")],
    ["Structural improvement", "From 1992-02-27", div43Probe("STRUCTURAL_IMPROVEMENT", "1992-02-27")],
    ["Build-to-rent development", "From 2023-05-10, active from 2025-01-01 or later", div43Probe("BUILD_TO_RENT", "2023-05-10")],
  ];
  assertSectionQuotes(doc, "Division 43 rate table", rows.map(([type, dates, probe]) => tableRow([type as string, dates as string, (probe as { rate: string }).rate, (probe as { years: string }).years, type === "Build-to-rent development" ? "`au-div43.build-to-rent.2025-plus`" : "`au-div43.general-rates.1979-plus`"])));
  assertSectionQuotes(doc, "Borrowing cost thresholds and rates", [
    tableRow(["Immediate deduction threshold", "Deductible amount is A$100.00 or less", "`au-borrowing-expenses.25-25`"]),
    tableRow(["Spreading period", "Shorter of five years and actual loan period", "`au-borrowing-expenses.25-25`"]),
    tableRow(["Section 40-880 allocation", "20% in the incurred year and each of the next four income years", "`au-blackhole-expenditure.40-880`"]),
  ]);
});
