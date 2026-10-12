import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPITAL_ALLOWANCE_REGIMES, CAPITAL_ASSET_CLASSES, computeCapitalAllowances } from "../../src/engine/capitalAllowances.ts";

const dollars = (amount: number): number => amount * 100;

test("section 19A three-year write-off spreads cost evenly by YA", () => {
  const result = computeCapitalAllowances({
    fromYa: 2026,
    toYa: 2028,
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    assets: [{ id: "a1", label: "Air-conditioning", regime: "S19A_3Y", cost: dollars(3_000), acquisitionDate: "2025-01-01" }],
  });
  assert.deepEqual(result.yaSummaries.map((row) => row.capitalAllowances), [dollars(1_000), dollars(1_000), dollars(1_000)]);
});

test("low-value asset rules respect the S$5,000 per-asset limit and S$30,000 annual cap", () => {
  const result = computeCapitalAllowances({
    fromYa: 2026,
    toYa: 2026,
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    assets: Array.from({ length: 7 }, (_, index) => ({
      id: `lva-${index + 1}`,
      label: `Low-value asset ${index + 1}`,
      regime: "S19A_1Y_LOW_VALUE" as const,
      cost: dollars(5_000),
      acquisitionDate: "2025-01-01",
    })),
  });
  assert.equal(result.yaSummaries[0]?.capitalAllowances, dollars(30_000));
  assert.ok(result.findings.some((finding) => finding.id === "CA.LOW_VALUE_ASSET.CAP"));
});

test("low-value asset claims above S$5,000 per asset are rejected for that regime", () => {
  const result = computeCapitalAllowances({
    fromYa: 2026,
    toYa: 2026,
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    assets: [{ id: "lva-over", label: "Oversized low-value asset", regime: "S19A_1Y_LOW_VALUE", cost: dollars(5_100), acquisitionDate: "2025-01-01" }],
  });
  assert.equal(result.yaSummaries[0]?.capitalAllowances, 0);
  assert.ok(result.findings.some((finding) => finding.id === "CA.LOW_VALUE_ASSET.LIMIT"));
});

test("balancing allowance arises on disposal when proceeds are below TWDV", () => {
  const result = computeCapitalAllowances({
    fromYa: 2026,
    toYa: 2027,
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    assets: [{ id: "a1", label: "Air-conditioning", regime: "S19A_3Y", cost: dollars(3_000), acquisitionDate: "2025-01-01", disposalDate: "2026-06-30", disposalProceeds: dollars(500) }],
  });
  assert.equal(result.yaSummaries[0]?.capitalAllowances, dollars(1_000));
  assert.equal(result.yaSummaries[1]?.balancingAllowance, dollars(1_500));
  assert.equal(result.yaSummaries[1]?.balancingCharge, 0);
});

test("section 14N one-year deduction is available from YA 2025 onward", () => {
  const result = computeCapitalAllowances({
    fromYa: 2026,
    toYa: 2028,
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    assets: [],
    renovationExpenditures: [{ id: "rr1", label: "Lobby refresh", cost: dollars(9_000), incurredDate: "2025-02-01", claimMode: "ONE_YEAR" }],
  });
  assert.equal(result.yaSummaries[0]?.section14nDeduction, dollars(9_000));
  assert.equal(result.yaSummaries[1]?.section14nDeduction, 0);
});

test("section 14N cap is S$300,000 per relevant window", () => {
  const result = computeCapitalAllowances({
    fromYa: 2026,
    toYa: 2026,
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    assets: [],
    renovationExpenditures: [{ id: "rr-cap", label: "Major refurbishment", cost: dollars(350_000), incurredDate: "2025-02-01", claimMode: "ONE_YEAR" }],
  });
  assert.equal(result.yaSummaries[0]?.section14nDeduction, dollars(300_000));
  assert.ok(result.findings.some((finding) => finding.id === "CA.S14N.CAP"));
});

test("section 14N is denied for investment holding companies", () => {
  const result = computeCapitalAllowances({
    fromYa: 2026,
    toYa: 2026,
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    entityKind: "PROPERTY_FUND",
    principalActivity: "investment holding",
    assets: [],
    renovationExpenditures: [{ id: "rr1", label: "Lobby refresh", cost: dollars(9_000), incurredDate: "2025-02-01" }],
  });
  assert.equal(result.yaSummaries[0]?.section14nDeduction, 0);
  assert.ok(result.findings.some((finding) => finding.id === "CA.S14N.INVESTMENT_HOLDING"));
});

test("capital-allowance catalogues expose selectable regimes and asset classes", () => {
  assert.ok(CAPITAL_ALLOWANCE_REGIMES.some((item) => item.id === "S14N_3Y"));
  assert.ok(CAPITAL_ALLOWANCE_REGIMES.some((item) => item.id === "S14N_1Y"));
  assert.ok(CAPITAL_ALLOWANCE_REGIMES.some((item) => item.id === "S19A_1Y_LOW_VALUE"));
  assert.ok(CAPITAL_ASSET_CLASSES.some((item) => item.id === "RENOVATION_REFURBISHMENT" && item.defaultRegime === "S14N_3Y"));
  assert.ok(CAPITAL_ASSET_CLASSES.some((item) => item.id === "LOW_VALUE_ASSET" && item.defaultRegime === "S19A_1Y_LOW_VALUE"));
});
