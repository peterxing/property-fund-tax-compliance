import { test } from "node:test";
import assert from "node:assert/strict";
import { MANUAL_ADJUSTMENT_TYPES, computeTaxComputation } from "../../src/engine/taxComputation.ts";
import type { MappedTbLine } from "../../src/engine/taxonomy.ts";
import { toCents } from "../../src/engine/money.ts";

function line(accountCode: string, accountName: string, debit: number, credit: number, category: MappedTbLine["category"]): MappedTbLine {
  return { accountCode, accountName, debit, credit, category };
}

function baseEntity(overrides: Partial<Parameters<typeof computeTaxComputation>[0]["entity"]> = {}) {
  return {
    kind: "PROPERTY_COMPANY" as const,
    financialYearStart: "2026-01-01",
    financialYearEnd: "2026-12-31",
    taxResidency: "SG" as const,
    principalActivity: "property leasing",
    ...overrides,
  };
}

function baseLines(): readonly MappedTbLine[] {
  return [line("4000", "Base rent", 0, toCents("100000"), "REV_RENTAL")];
}

test("end-to-end computation for a property company", () => {
  const result = computeTaxComputation({
    entity: {
      kind: "PROPERTY_COMPANY",
      incorporationDate: "2020-01-01",
      financialYearStart: "2025-01-01",
      financialYearEnd: "2025-12-31",
      taxResidency: "SG",
      principalActivity: "property leasing",
      isSingaporeIncorporated: true,
      isActiveCompany: true,
      localEmployeeCount: 3,
    },
    lines: [
      line("4000", "Base rent", 0, toCents("1200000"), "REV_RENTAL"),
      line("4010", "Service charges", 0, toCents("100000"), "REV_SERVICE_CHARGE"),
      line("4020", "Bank interest", 0, toCents("10000"), "INC_INTEREST"),
      line("4030", "Fair value gain on investment properties", 0, toCents("50000"), "INC_FV_GAIN_PROPERTY"),
      line("5000", "Property tax", toCents("120000"), 0, "EXP_PROPERTY_TAX"),
      line("5001", "Repairs & maintenance", toCents("30000"), 0, "EXP_REPAIRS_MAINT"),
      line("5002", "Loan interest", toCents("25000"), 0, "EXP_INTEREST"),
      line("5003", "Depreciation", toCents("40000"), 0, "EXP_DEPRECIATION"),
    ],
    capitalAllowances: { currentYearCapitalAllowances: toCents("35000") },
    broughtForward: { unabsorbedLosses: toCents("50000"), shareholdingTestSatisfied: true },
    manualAdjustments: [{ id: "donation", label: "Approved IPC donation", type: "CURRENT_YEAR_APPROVED_DONATION", amount: toCents("10000"), reason: "Approved IPC" }],
  });
  assert.equal(result.summary.ya, 2026);
  assert.equal(result.summary.accountingProfitBeforeTax, toCents("1145000"));
  assert.equal(result.summary.adjustedProfit, toCents("1135000"));
  assert.equal(result.summary.chargeableIncomeBeforeExemptions, toCents("1025000"));
  assert.equal(result.summary.exemptAmount, toCents("102500"));
  assert.equal(result.summary.chargeableIncome, toCents("922500"));
  assert.equal(result.summary.taxPayable, toCents("118825"));
});

test("REIT result exposes trust-level info finding without applying transparency", () => {
  const result = computeTaxComputation({
    entity: {
      kind: "REIT",
      financialYearStart: "2025-01-01",
      financialYearEnd: "2025-12-31",
      taxResidency: "SG",
      principalActivity: "property trust",
      hasOverseasIncome: true,
    },
    lines: [
      line("4000", "Base rent", 0, toCents("500000"), "REV_RENTAL"),
      line("5000", "Property tax", toCents("50000"), 0, "EXP_PROPERTY_TAX"),
    ],
  });
  assert.equal(result.summary.statutoryIncome, toCents("450000"));
  assert.equal(result.summary.exemptAmount, 0);
  assert.equal(result.summary.chargeableIncome, toCents("450000"));
  assert.equal(result.summary.taxPayable, toCents("76500"));
  assert.ok(result.findings.some((finding) => finding.id === "TAXCOMP.REIT_INFO"));
});

test("developer gets info finding and SUTE is not applied", () => {
  const result = computeTaxComputation({
    entity: {
      kind: "DEVELOPER",
      incorporationDate: "2025-01-01",
      financialYearStart: "2025-01-01",
      financialYearEnd: "2025-12-31",
      taxResidency: "SG",
      principalActivity: "property development for sale",
      isSingaporeIncorporated: true,
      isActiveCompany: true,
      localEmployeeCount: 5,
    },
    lines: [
      line("4000", "Development sales", 0, toCents("1000000"), "REV_DEV_SALES"),
      line("5000", "Development cost of sales", toCents("700000"), 0, "EXP_DEV_COST_OF_SALES"),
      line("5001", "Project marketing", toCents("50000"), 0, "EXP_DEV_SELLING"),
      line("5002", "Depreciation", toCents("10000"), 0, "EXP_DEPRECIATION"),
    ],
  });
  assert.ok(result.findings.some((finding) => finding.id === "TAXCOMP.DEVELOPER_RECOGNITION"));
  assert.ok(result.findings.some((finding) => finding.id === "CIT.SUTE_NOT_AVAILABLE"));
});

test("manual ADD_BACK increases adjusted profit", () => {
  const base = computeTaxComputation({ entity: baseEntity(), lines: baseLines() });
  const adjusted = computeTaxComputation({
    entity: baseEntity(),
    lines: baseLines(),
    manualAdjustments: [{ id: "adj", label: "Non-deductible subscription", type: "ADD_BACK", amount: toCents("5000") }],
  });
  assert.equal(adjusted.summary.adjustedProfit - base.summary.adjustedProfit, toCents("5000"));
});

test("manual DEDUCT reduces adjusted profit", () => {
  const base = computeTaxComputation({ entity: baseEntity(), lines: baseLines() });
  const adjusted = computeTaxComputation({
    entity: baseEntity(),
    lines: baseLines(),
    manualAdjustments: [{ id: "adj", label: "Capital receipt exclusion", type: "DEDUCT", amount: toCents("5000") }],
  });
  assert.equal(base.summary.adjustedProfit - adjusted.summary.adjustedProfit, toCents("5000"));
});

test("manual SEPARATE_SOURCE_INCOME removes income from the normal taxable pool", () => {
  const base = computeTaxComputation({ entity: baseEntity(), lines: baseLines() });
  const adjusted = computeTaxComputation({
    entity: baseEntity({ hasOverseasIncome: true }),
    lines: baseLines(),
    manualAdjustments: [{ id: "adj", label: "Foreign branch income", type: "SEPARATE_SOURCE_INCOME", amount: toCents("5000") }],
  });
  assert.equal(base.summary.adjustedProfit - adjusted.summary.adjustedProfit, toCents("5000"));
});

test("manual FURTHER_DEDUCTION reduces adjusted profit before capital allowances", () => {
  const base = computeTaxComputation({ entity: baseEntity(), lines: baseLines() });
  const adjusted = computeTaxComputation({
    entity: baseEntity(),
    lines: baseLines(),
    manualAdjustments: [{ id: "adj", label: "Double deduction claim", type: "FURTHER_DEDUCTION", amount: toCents("5000") }],
  });
  assert.equal(base.summary.adjustedProfit - adjusted.summary.adjustedProfit, toCents("5000"));
  assert.equal(base.summary.statutoryIncome - adjusted.summary.statutoryIncome, toCents("5000"));
});

test("manual CURRENT_YEAR_APPROVED_DONATION reduces chargeable income using the 250% factor", () => {
  const base = computeTaxComputation({ entity: baseEntity(), lines: baseLines() });
  const adjusted = computeTaxComputation({
    entity: baseEntity(),
    lines: baseLines(),
    manualAdjustments: [{ id: "adj", label: "Approved IPC donation", type: "CURRENT_YEAR_APPROVED_DONATION", amount: toCents("1000") }],
  });
  assert.equal(base.summary.chargeableIncomeBeforeExemptions - adjusted.summary.chargeableIncomeBeforeExemptions, toCents("2500"));
});

test("donation carry-forwards preserve vintage and use oldest balances first", () => {
  const result = computeTaxComputation({
    entity: baseEntity(),
    lines: [line("4000", "Base rent", 0, toCents("6000"), "REV_RENTAL")],
    broughtForward: {
      unabsorbedDonations: [
        { ya: 2022, amount: toCents("5000") },
        { ya: 2024, amount: toCents("3000") },
      ],
      shareholdingTestSatisfied: true,
    },
  });
  assert.deepEqual(result.summary.donationCarryForwards, [{ ya: 2024, amount: toCents("2000") }]);
  assert.equal(result.summary.donationsCf, toCents("2000"));
  assert.equal(
    result.summary.donationsCf,
    result.summary.donationCarryForwards.reduce((total, item) => total + item.amount, 0),
  );
});

test("expired donation vintages are dropped from carry-forwards", () => {
  const result = computeTaxComputation({
    entity: baseEntity(),
    lines: [line("4000", "Base rent", 0, toCents("1000"), "REV_RENTAL")],
    broughtForward: {
      unabsorbedDonations: [
        { ya: 2020, amount: toCents("4000") },
        { ya: 2024, amount: toCents("3000") },
      ],
      shareholdingTestSatisfied: true,
    },
  });
  assert.deepEqual(result.summary.donationCarryForwards, [{ ya: 2024, amount: toCents("2000") }]);
  assert.equal(result.summary.donationsCf, toCents("2000"));
});

test("current-year unused donation deduction is carried at the current YA vintage", () => {
  const result = computeTaxComputation({
    entity: baseEntity(),
    lines: [line("4000", "Base rent", 0, toCents("10000"), "REV_RENTAL")],
    manualAdjustments: [{ id: "adj", label: "Approved IPC donation", type: "CURRENT_YEAR_APPROVED_DONATION", amount: toCents("6000") }],
  });
  assert.deepEqual(result.summary.donationCarryForwards, [{ ya: 2027, amount: toCents("5000") }]);
  assert.equal(result.summary.donationsCf, toCents("5000"));
});

test("manual EXEMPT_FOREIGN_INCOME reduces normal taxable income and populates exempt income", () => {
  const base = computeTaxComputation({ entity: baseEntity(), lines: baseLines() });
  const adjusted = computeTaxComputation({
    entity: baseEntity({ hasOverseasIncome: true }),
    lines: baseLines(),
    manualAdjustments: [{ id: "adj", label: "Section 13(9) exempt dividend", type: "EXEMPT_FOREIGN_INCOME", amount: toCents("5000") }],
  });
  assert.equal(base.summary.adjustedProfit - adjusted.summary.adjustedProfit, toCents("5000"));
  assert.equal(adjusted.summary.exemptIncome, toCents("5000"));
});

test("manual adjustments are flagged and shareholding-test failures restrict brought-forward items", () => {
  const result = computeTaxComputation({
    entity: baseEntity(),
    lines: baseLines(),
    broughtForward: {
      unabsorbedLosses: toCents("50000"),
      unabsorbedCapitalAllowances: toCents("20000"),
      shareholdingTestSatisfied: false,
    },
    manualAdjustments: [{ id: "private", label: "Private club subscription", type: "ADD_BACK", amount: toCents("5000"), reason: "Not deductible" }],
  });
  assert.equal(result.summary.lossesUtilised, 0);
  assert.equal(result.summary.unabsorbedCapitalAllowancesCf, toCents("20000"));
  assert.ok(result.lines.some((lineItem) => lineItem.code === "MANUAL.private" && lineItem.needsReview));
  assert.ok(result.findings.some((finding) => finding.id === "TAXCOMP.SHAREHOLDING_TEST"));
});

test("manual adjustment catalogue is exported for the UI", () => {
  assert.deepEqual(
    MANUAL_ADJUSTMENT_TYPES.map((item) => item.id),
    ["ADD_BACK", "DEDUCT", "SEPARATE_SOURCE_INCOME", "FURTHER_DEDUCTION", "CURRENT_YEAR_APPROVED_DONATION", "EXEMPT_FOREIGN_INCOME"],
  );
  assert.equal(MANUAL_ADJUSTMENT_TYPES.find((item) => item.id === "FURTHER_DEDUCTION")?.effect, "DEDUCT");
});

test("invalid financial-year inputs throw", () => {
  assert.throws(() => computeTaxComputation({
    entity: {
      kind: "PROPERTY_COMPANY",
      financialYearStart: "2025-12-31",
      financialYearEnd: "2025-01-01",
      taxResidency: "SG",
      principalActivity: "property leasing",
    },
    lines: [],
  }), /financialYearStart must be before financialYearEnd/);
});
