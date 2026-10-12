import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateExpenses } from "../../src/engine/allocation.ts";

test("gross-revenue allocation disallows the exempt / foreign portion", () => {
  const result = allocateExpenses({
    expenses: [{ category: "shared-overheads", amount: 100_000 }],
    properties: [
      { propertyCode: "SG1", jurisdiction: "SG", incomeCharacter: "TAXABLE", grossRevenue: 1_000_000, assetValue: 8_000_000 },
      { propertyCode: "OS1", jurisdiction: "OVERSEAS", incomeCharacter: "FOREIGN", grossRevenue: 3_000_000, assetValue: 12_000_000 },
    ],
    policies: [{ expenseCategory: "shared-overheads", basis: "GROSS_REVENUE" }],
  });
  assert.equal(result.deductibleAgainstTaxableIncome, 25_000);
  assert.equal(result.disallowedAgainstTaxableIncome, 75_000);
  assert.ok(result.findings.some((finding) => finding.id === "ALLOC.DISALLOWED_STREAM"));
});

test("manual override is honoured and flagged", () => {
  const result = allocateExpenses({
    expenses: [{ category: "manager-fee", amount: 100_000 }],
    properties: [
      { propertyCode: "SG1", jurisdiction: "SG", incomeCharacter: "TAXABLE", grossRevenue: 1_000_000, assetValue: 8_000_000 },
      { propertyCode: "SG2", jurisdiction: "SG", incomeCharacter: "EXEMPT", grossRevenue: 1_000_000, assetValue: 12_000_000 },
    ],
    policies: [{ expenseCategory: "manager-fee", basis: "GROSS_REVENUE" }],
    overrides: [{ expenseCategory: "manager-fee", allocationsByStreamBps: { SG_TAXABLE: 7000, SG_EXEMPT: 3000 }, reason: "Direct review" }],
  });
  assert.equal(result.deductibleAgainstTaxableIncome, 70_000);
  assert.equal(result.disallowedAgainstTaxableIncome, 30_000);
  assert.ok(result.lines.some((line) => line.source === "OVERRIDE"));
});

