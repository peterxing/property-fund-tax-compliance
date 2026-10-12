import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReitTax, determineReitInvestorTax, reitWithholdingDueDate } from "../../src/engine/reitTax.ts";

test("REIT transparency passes at 90% and fails below 90%", () => {
  const pass = computeReitTax({
    distributionDate: "2026-03-31",
    taxableSpecifiedIncome: 1_000_000,
    taxableSpecifiedIncomeDistributed: 900_000,
    otherTrusteeTaxableIncome: 100_000,
    otherTrusteeTaxableIncomeDistributed: 50_000,
    distributedWithinSameYear: true,
  });
  assert.equal(pass.passesTransparencyTest, true);
  assert.equal(pass.composition.transparentTaxableDistribution, 900_000);
  assert.equal(pass.trusteeTaxBase, 200_000);
  const fail = computeReitTax({
    distributionDate: "2026-03-31",
    taxableSpecifiedIncome: 1_000_000,
    taxableSpecifiedIncomeDistributed: 899_900,
    otherTrusteeTaxableIncome: 100_000,
    otherTrusteeTaxableIncomeDistributed: 50_000,
    distributedWithinSameYear: true,
  });
  assert.equal(fail.passesTransparencyTest, false);
  assert.equal(fail.composition.transparentTaxableDistribution, 0);
  assert.equal(fail.composition.trusteeTaxedDistribution, 949_900);
  assert.equal(fail.trusteeTaxBase, 1_100_000);
});

test("REIT investor withholding rates follow verified investor classes and dates", () => {
  const qualifying = determineReitInvestorTax({
    distributionDate: "2026-03-31",
    investorClass: "QUALIFYING_NON_RESIDENT_NON_INDIVIDUAL",
    declarationStatus: "FORM_A_VALID",
  });
  assert.equal(qualifying.withholdingRateBps, 1000);
  assert.equal(qualifying.finalTax, true);
  const other = determineReitInvestorTax({
    distributionDate: "2026-03-31",
    investorClass: "OTHER_NON_RESIDENT_NON_INDIVIDUAL",
    declarationStatus: "FORM_A_VALID",
  });
  assert.equal(other.withholdingRateBps, 1700);
  assert.equal(other.finalTax, false);
  assert.equal(reitWithholdingDueDate("2026-03-31"), "2026-05-15");
});
