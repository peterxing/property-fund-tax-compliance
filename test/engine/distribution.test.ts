import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateToUnitholders, buildUnitholderStatement, computeDistribution, modelScenarios, reconcileWithholding } from "../../src/engine/distribution.ts";

test("distribution policy and holder allocation reconcile exactly across investor classes", () => {
  const distribution = computeDistribution({
    distributionDate: "2026-03-31",
    unitsOutstanding: 10000,
    policy: { label: "Base", taxableIncomePayoutBps: 9500, taxExemptIncomePayoutBps: 10000, capitalReleaseBps: 5000, dpuDecimals: 4 },
    income: {
      taxableSpecifiedIncome: 1_000_000,
      otherTrusteeTaxableIncome: 200_000,
      taxExemptIncome: 100_000,
      capitalDistributionPool: 50_000,
      distributedWithinSameYear: true,
    },
  });
  const allocation = allocateToUnitholders({
    distribution,
    unitholders: [
      { holderRef: "A01", maskedId: "****001A", unitsHeld: 1200, investorClass: "INDIVIDUAL", residency: "SG", declarationStatus: "NOT_REQUIRED" },
      { holderRef: "A02", maskedId: "****002B", unitsHeld: 900, investorClass: "SINGAPORE_COMPANY", residency: "SG", declarationStatus: "FORM_A_VALID" },
      { holderRef: "A03", maskedId: "****003C", unitsHeld: 1100, investorClass: "SINGAPORE_BRANCH", residency: "SG", declarationStatus: "FORM_A_VALID" },
      { holderRef: "A04", maskedId: "****004D", unitsHeld: 800, investorClass: "SINGAPORE_BODY_OF_PERSONS", residency: "SG", declarationStatus: "FORM_A_VALID" },
      { holderRef: "A05", maskedId: "****005E", unitsHeld: 700, investorClass: "INTERNATIONAL_ORGANISATION", residency: "NON_SG", declarationStatus: "FORM_A_VALID" },
      { holderRef: "A06", maskedId: "****006F", unitsHeld: 1300, investorClass: "REIT_ETF", residency: "SG", declarationStatus: "FORM_A_VALID" },
      { holderRef: "A07", maskedId: "****007G", unitsHeld: 1500, investorClass: "QUALIFYING_NON_RESIDENT_NON_INDIVIDUAL", residency: "NON_SG", declarationStatus: "FORM_A_VALID" },
      { holderRef: "A08", maskedId: "****008H", unitsHeld: 900, investorClass: "QUALIFYING_NON_RESIDENT_FUND", residency: "NON_SG", declarationStatus: "FORM_B_VALID" },
      { holderRef: "A09", maskedId: "****009I", unitsHeld: 1600, investorClass: "OTHER_NON_RESIDENT_NON_INDIVIDUAL", residency: "NON_SG", declarationStatus: "FORM_A_VALID" },
    ],
  });
  assert.equal(allocation.totals.grossDistribution, distribution.declaredAmount);
  assert.equal(allocation.totals.grossDistribution, allocation.totals.netCashPaid + allocation.totals.taxDeducted);
  const recon = reconcileWithholding({ allocation, amountRemittedToIras: allocation.totals.taxDeducted, statementsIssued: allocation.allocations.length });
  assert.equal(recon.variance, 0);
  const statement = buildUnitholderStatement(allocation.allocations[0]!, distribution.sourceInput.distributionDate);
  assert.equal(statement.holderRef, "A01");
  assert.equal(statement.grossDistribution, allocation.allocations[0]!.grossDistribution);
});

test("scenario modelling distinguishes just-below and above-threshold payout ratios", () => {
  const scenarios = modelScenarios({
    distributionDate: "2026-03-31",
    unitsOutstanding: 10000,
    income: {
      taxableSpecifiedIncome: 1_000_000,
      otherTrusteeTaxableIncome: 200_000,
      taxExemptIncome: 0,
      capitalDistributionPool: 0,
      distributedWithinSameYear: true,
    },
    policies: [
      { label: "89.99%", taxableIncomePayoutBps: 8999, taxExemptIncomePayoutBps: 0, capitalReleaseBps: 0, dpuDecimals: 4 },
      { label: "90.00%", taxableIncomePayoutBps: 9000, taxExemptIncomePayoutBps: 0, capitalReleaseBps: 0, dpuDecimals: 4 },
      { label: "95.00%", taxableIncomePayoutBps: 9500, taxExemptIncomePayoutBps: 0, capitalReleaseBps: 0, dpuDecimals: 4 },
    ],
  });
  assert.equal(scenarios[0]?.transparencyPass, false);
  assert.equal(scenarios[1]?.transparencyPass, true);
  assert.equal(scenarios[2]?.transparencyPass, true);
});
