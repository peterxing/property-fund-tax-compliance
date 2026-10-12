import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReturnSummary, deriveBasisPeriods, determineEciRequirement, determineReturnForm, explainInstalmentFact, estimateEci } from "../../src/engine/returns.ts";

const dollars = (amount: number): number => amount * 100;

test("return-form selection distinguishes Form C-S Lite, Form C-S and Form C at the stated revenue thresholds", () => {
  assert.equal(determineReturnForm({
    kind: "PROPERTY_COMPANY",
    isSingaporeIncorporated: true,
    annualRevenue: dollars(200_000),
    onlyIncomeTaxedAt17Percent: true,
    financialYearEnd: "2025-12-31",
  }).form, "FORM_C_S_LITE");
  assert.equal(determineReturnForm({
    kind: "PROPERTY_COMPANY",
    isSingaporeIncorporated: true,
    annualRevenue: dollars(200_001),
    onlyIncomeTaxedAt17Percent: true,
    financialYearEnd: "2025-12-31",
  }).form, "FORM_C_S");
  assert.equal(determineReturnForm({
    kind: "PROPERTY_COMPANY",
    isSingaporeIncorporated: true,
    annualRevenue: dollars(5_000_000),
    onlyIncomeTaxedAt17Percent: true,
    financialYearEnd: "2025-12-31",
  }).form, "FORM_C_S");
  assert.equal(determineReturnForm({
    kind: "PROPERTY_COMPANY",
    isSingaporeIncorporated: true,
    annualRevenue: dollars(5_000_001),
    onlyIncomeTaxedAt17Percent: true,
    financialYearEnd: "2025-12-31",
  }).form, "FORM_C");
});

test("REIT with section 43(2) treatment files Form UT, while other cases keep existing form handling", () => {
  const result = determineReturnForm({
    kind: "REIT",
    isSingaporeIncorporated: false,
    annualRevenue: dollars(10_000_000),
    onlyIncomeTaxedAt17Percent: true,
    financialYearEnd: "2025-12-31",
    hasSection43_2ReitTreatment: true,
  });
  assert.equal(result.form, "FORM_UT");
  assert.equal(result.dueDate, "2026-04-15");
  assert.ok(result.findings.some((finding) => finding.id === "RETURNS.FORM_UT"));

  const reitWithoutTransparency = determineReturnForm({
    kind: "REIT",
    isSingaporeIncorporated: true,
    annualRevenue: dollars(10_000_000),
    onlyIncomeTaxedAt17Percent: true,
    financialYearEnd: "2025-12-31",
  });
  assert.equal(reitWithoutTransparency.form, "FORM_C");

  const fund = determineReturnForm({
    kind: "PROPERTY_FUND",
    isSingaporeIncorporated: false,
    annualRevenue: dollars(10_000_000),
    onlyIncomeTaxedAt17Percent: true,
    financialYearEnd: "2025-12-31",
  });
  assert.equal(fund.form, "NOT_COMPANY_RETURN");
  assert.ok(fund.findings.some((finding) => finding.id === "RETURNS.NOT_COMPANY_FORM"));
});

test("ECI waiver and REIT-specific exception are recognised at the S$5 million threshold", () => {
  const waived = determineEciRequirement({
    kind: "PROPERTY_COMPANY",
    isSingaporeIncorporated: true,
    annualRevenue: dollars(5_000_000),
    onlyIncomeTaxedAt17Percent: true,
    financialYearEnd: "2025-12-31",
  }, 0);
  assert.equal(waived.waived, true);
  assert.equal(waived.dueDate, "2026-03-31");

  const notWaived = determineEciRequirement({
    kind: "PROPERTY_COMPANY",
    isSingaporeIncorporated: true,
    annualRevenue: dollars(5_000_001),
    onlyIncomeTaxedAt17Percent: true,
    financialYearEnd: "2025-12-31",
  }, 0);
  assert.equal(notWaived.required, true);

  const reit = determineEciRequirement({
    kind: "REIT",
    isSingaporeIncorporated: false,
    annualRevenue: dollars(10_000_000),
    financialYearEnd: "2025-12-31",
    hasSection43_2ReitTreatment: true,
  }, dollars(5_000));
  assert.equal(reit.required, false);
  assert.ok(reit.findings.some((finding) => finding.id === "ECI.REIT_WAIVER"));
  assert.match(reit.findings.find((finding) => finding.id === "ECI.REIT_WAIVER")?.message ?? "", /16\.1/i);
});

test("basis periods split a long first set of accounts across YAs", () => {
  assert.deepEqual(
    deriveBasisPeriods("2025-03-01", 12, 31, "2025-12-31"),
    [{ ya: 2026, basisPeriodStart: "2025-03-01", basisPeriodEnd: "2025-12-31" }],
  );
  assert.deepEqual(
    deriveBasisPeriods("2025-03-01", 12, 31, "2026-12-31"),
    [
      { ya: 2026, basisPeriodStart: "2025-03-01", basisPeriodEnd: "2025-12-31" },
      { ya: 2027, basisPeriodStart: "2026-01-01", basisPeriodEnd: "2026-12-31" },
    ],
  );
});

test("return summary is form-style only and estimateEci can read computation summaries", () => {
  const summary = {
    ya: 2026,
    accountingProfitBeforeTax: dollars(1_000_000),
    adjustedProfit: dollars(1_100_000),
    statutoryIncome: dollars(1_100_000),
    exemptIncome: 0,
    nonTaxableIncome: dollars(50_000),
    capitalAllowancesClaimed: dollars(40_000),
    lossesUtilised: dollars(20_000),
    chargeableIncomeBeforeExemptions: dollars(1_040_000),
    exemptAmount: dollars(102_500),
    chargeableIncome: dollars(937_500),
    taxBeforeRebate: dollars(159_375),
    citRebate: dollars(38_000),
    taxPayable: dollars(121_375),
    effectiveRateBps: 1214,
    unabsorbedLossesCf: 0,
    unabsorbedCapitalAllowancesCf: 0,
    donationsCf: 0,
    donationCarryForwards: [],
  } as const;
  const lines = buildReturnSummary(summary, {
    kind: "REIT",
    financialYearStart: "2025-01-01",
    financialYearEnd: "2025-12-31",
    taxResidency: "SG",
    principalActivity: "property trust",
  });
  assert.equal(lines[1]?.label, "Form-style summary (not IRAS XML/API field names)");
  assert.ok(lines.some((line) => line.code === "RET.REIT_INFO"));

  const eci = estimateEci({
    entity: {
      kind: "PROPERTY_COMPANY",
      isSingaporeIncorporated: true,
      annualRevenue: dollars(6_000_000),
      onlyIncomeTaxedAt17Percent: true,
      financialYearEnd: "2025-12-31",
    },
    computationSummary: summary,
  });
  assert.equal(eci.required, true);
  assert.equal(explainInstalmentFact("2025-12-31", "2026-01-31").amount, 10);
});
