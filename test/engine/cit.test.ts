import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCit, computeTaxExemptionAmount, determineStartUpTaxExemptionEligibility } from "../../src/engine/cit.ts";

const dollars = (amount: number): number => amount * 100;

test("PTE from YA 2020 onward matches independent band calculations", () => {
  const cases = [
    { income: 10_000, exempt: 7_500 },
    { income: 20_000, exempt: 12_500 },
    { income: 100_000, exempt: 52_500 },
    { income: 200_000, exempt: 102_500 },
    { income: 300_000, exempt: 102_500 },
    { income: 1_000_000, exempt: 102_500 },
  ] as const;
  for (const item of cases) {
    const result = computeCit({ ya: 2027, normalChargeableIncome: dollars(item.income), startUpExemption: false });
    assert.equal(result.exemptionAmount, dollars(item.exempt), `income ${item.income}`);
  }
});

test("PTE before YA 2020 matches independent band calculations", () => {
  const cases = [
    { income: 100_000, exempt: 52_500 },
    { income: 200_000, exempt: 102_500 },
    { income: 300_000, exempt: 152_500 },
    { income: 1_000_000, exempt: 152_500 },
  ] as const;
  for (const item of cases) {
    const result = computeCit({ ya: 2019, normalChargeableIncome: dollars(item.income), startUpExemption: false });
    assert.equal(result.exemptionAmount, dollars(item.exempt), `income ${item.income}`);
  }
});

test("SUTE from YA 2020 onward matches independent band calculations", () => {
  const baseProfile = {
    incorporationDate: "2026-01-01",
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    kind: "PROPERTY_COMPANY" as const,
    isSingaporeIncorporated: true,
    isSingaporeTaxResident: true,
    shareholderCount: 2,
    allShareholdersAreIndividuals: true,
    principalActivity: "property leasing",
  };
  const cases = [
    { income: 100_000, exempt: 75_000 },
    { income: 200_000, exempt: 125_000 },
    { income: 300_000, exempt: 125_000 },
  ] as const;
  for (const item of cases) {
    const result = computeCit({ ya: 2027, normalChargeableIncome: dollars(item.income), startUpExemption: { ya: 2027, ...baseProfile } });
    assert.equal(result.exemptionAmount, dollars(item.exempt), `income ${item.income}`);
  }
});

test("SUTE before YA 2020 matches independent band calculations", () => {
  const baseProfile = {
    incorporationDate: "2018-01-01",
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    kind: "PROPERTY_COMPANY" as const,
    isSingaporeIncorporated: true,
    isSingaporeTaxResident: true,
    shareholderCount: 2,
    allShareholdersAreIndividuals: true,
    principalActivity: "property leasing",
  };
  const cases = [
    { income: 100_000, exempt: 100_000 },
    { income: 200_000, exempt: 150_000 },
    { income: 300_000, exempt: 200_000 },
  ] as const;
  for (const item of cases) {
    const result = computeCit({ ya: 2019, normalChargeableIncome: dollars(item.income), startUpExemption: { ya: 2019, ...baseProfile } });
    assert.equal(result.exemptionAmount, dollars(item.exempt), `income ${item.income}`);
  }
});

test("YA 2027 PTE example returns IRAS-style amounts and warns that rebate is unverified", () => {
  const result = computeCit({ ya: 2027, normalChargeableIncome: dollars(100_000), startUpExemption: false });
  assert.equal(result.exemptionAmount, dollars(52_500));
  assert.equal(result.chargeableIncomeAfterExemption, dollars(47_500));
  assert.equal(result.taxBeforeRebate, dollars(8_075));
  assert.equal(result.taxPayable, dollars(8_075));
  assert.ok(result.findings.some((finding) => finding.id === "CIT.REBATE_NOT_VERIFIED"));
});

test("SUTE example for YA 2023 applies only to eligible start-ups", () => {
  const result = computeCit({
    ya: 2023,
    normalChargeableIncome: dollars(200_000),
    startUpExemption: {
      ya: 2023,
      incorporationDate: "2022-01-01",
      financialYearEndMonth: 12,
      financialYearEndDay: 31,
      kind: "PROPERTY_COMPANY",
      isSingaporeIncorporated: true,
      isSingaporeTaxResident: true,
      shareholderCount: 2,
      allShareholdersAreIndividuals: true,
      principalActivity: "property leasing",
    },
  });
  assert.equal(result.exemptionScheme.id, "SUTE");
  assert.equal(result.exemptionAmount, dollars(125_000));
  assert.equal(result.chargeableIncomeAfterExemption, dollars(75_000));
  assert.equal(result.taxPayable, dollars(12_750));
});

test("investment holding and property development activities do not qualify for SUTE", () => {
  const holding = determineStartUpTaxExemptionEligibility({
    ya: 2026,
    incorporationDate: "2025-01-01",
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    kind: "PROPERTY_COMPANY",
    isSingaporeIncorporated: true,
    isSingaporeTaxResident: true,
    shareholderCount: 1,
    allShareholdersAreIndividuals: true,
    principalActivity: "investment holding of rental properties",
  });
  const developer = determineStartUpTaxExemptionEligibility({
    ya: 2026,
    incorporationDate: "2025-01-01",
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    kind: "DEVELOPER",
    isSingaporeIncorporated: true,
    isSingaporeTaxResident: true,
    shareholderCount: 1,
    allShareholdersAreIndividuals: true,
    principalActivity: "property development for sale",
  });
  assert.equal(holding.eligible, false);
  assert.match(holding.reasons.join(" "), /investment holding/i);
  assert.equal(developer.eligible, false);
  assert.match(developer.reasons.join(" "), /property development/i);
});

test("YA 2026 rebate cap and cash grant use cents-scaled limits", () => {
  const result = computeCit({
    ya: 2026,
    normalChargeableIncome: dollars(1_000_000),
    startUpExemption: false,
    isActiveCompany: true,
    localEmployeeCount: 1,
  });
  assert.equal(result.taxBeforeRebate, dollars(152_575));
  assert.equal(result.rebateCashGrant, dollars(2_000));
  assert.equal(result.rebate, dollars(38_000));
  assert.equal(result.taxPayable, dollars(114_575));
});

test("non-company REIT-trust style taxpayers do not get PTE, SUTE or CIT rebate", () => {
  const result = computeCit({
    ya: 2026,
    normalChargeableIncome: dollars(100_000),
    startUpExemption: true,
    isActiveCompany: true,
    localEmployeeCount: 1,
    entityIsCompany: false,
  });
  assert.equal(result.exemptionScheme.id, "NONE");
  assert.equal(result.exemptionAmount, 0);
  assert.equal(result.taxBeforeRebate, dollars(17_000));
  assert.equal(result.rebate, 0);
  assert.equal(result.taxPayable, dollars(17_000));
});

test("whole-dollar rounding follows IRAS-style computation inputs", () => {
  const exemption = computeTaxExemptionAmount(10_050, {
    id: "PTE",
    label: "Partial tax exemption",
    bands: [
      { upToDollars: 10_000, exemptionBps: 7500 },
      { upToDollars: 200_000, exemptionBps: 5000 },
    ],
    maxExemptAmount: dollars(102_500),
  });
  const result = computeCit({ ya: 2027, normalChargeableIncome: 10_050, startUpExemption: false });
  assert.equal(exemption, 7_600);
  assert.equal(result.chargeableIncomeAfterExemption, 2_500);
  assert.equal(result.taxPayable, 425);
});
