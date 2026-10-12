import assert from "node:assert/strict";
import { test } from "node:test";
import { AU_CGT_ENTITY_TYPES, AU_FRCGW_SCENARIOS, computeCgt, computeForeignResidentCgtWithholding } from "../../../src/engine/au/cgt.ts";

const dollars = (amount: number): number => amount * 100;

test("individual CGT discount applies after more than 12 months and after cost-base reductions", () => {
  const result = computeCgt({
    label: "Property",
    entityType: "INDIVIDUAL",
    acquisitionDate: "2024-01-01",
    disposalContractDate: "2025-01-02",
    capitalProceeds: dollars(10_000),
    acquisitionPrice: dollars(7_000),
    incidentalAcquisitionCosts: [{ amount: dollars(100), date: "2024-01-01" }],
    incidentalDisposalCosts: [{ amount: dollars(50), date: "2025-01-02" }],
    capitalWorksDeductionsClaimed: dollars(20),
  });
  assert.equal(result.methodUsed, "DISCOUNT");
  assert.equal(result.costBase, dollars(7_130));
  assert.equal(result.netCapitalGain, dollars(1_435));
});

test("exactly 12 months does not satisfy the discount holding period", () => {
  const result = computeCgt({
    label: "Property",
    entityType: "INDIVIDUAL",
    acquisitionDate: "2024-01-02",
    disposalContractDate: "2025-01-02",
    capitalProceeds: dollars(10_000),
    acquisitionPrice: dollars(7_000),
  });
  assert.equal(result.methodUsed, "OTHER");
  assert.equal(result.discountAmount, 0);
});

test("indexation can be chosen for pre-21 September 1999 assets", () => {
  const result = computeCgt({
    label: "Old property",
    entityType: "INDIVIDUAL",
    acquisitionDate: "1995-01-01",
    disposalContractDate: "2005-01-02",
    capitalProceeds: dollars(20_000),
    acquisitionPrice: dollars(10_000),
    chooseIndexation: true,
  });
  assert.equal(result.methodUsed, "INDEXATION");
  assert.equal(result.indexedCostBase, dollars(10_770));
  assert.equal(result.netCapitalGain, dollars(9_230));
});

test("pre-21 September 1999 individuals default to the discount method unless they choose indexation", () => {
  const result = computeCgt({
    label: "Pre-1999 property",
    entityType: "INDIVIDUAL",
    acquisitionDate: "1998-01-15",
    disposalContractDate: "2026-07-02",
    capitalProceeds: dollars(1_500),
    acquisitionPrice: dollars(1_000),
  });
  assert.equal(result.methodUsed, "DISCOUNT");
  assert.equal(result.indexedCostBase, dollars(1_025));
  assert.equal(result.netCapitalGain, dollars(250));
  assert.ok(result.findings.some((finding) => finding.id === "AU.CGT.INDEXATION_ALTERNATIVE"));
});

test("companies with eligible pre-21 September 1999 assets use indexation rather than the other method", () => {
  const result = computeCgt({
    label: "Company pre-1999 property",
    entityType: "COMPANY",
    acquisitionDate: "1998-01-15",
    disposalContractDate: "2026-07-02",
    capitalProceeds: dollars(1_500),
    acquisitionPrice: dollars(1_000),
  });
  assert.equal(result.methodUsed, "INDEXATION");
  assert.equal(result.indexedCostBase, dollars(1_025));
  assert.equal(result.netCapitalGain, dollars(475));
});

test("FRCGW boundaries use the effective-dated rates and thresholds", () => {
  const pre2017 = computeForeignResidentCgtWithholding({ contractDate: "2016-07-01", settlementDate: "2016-08-01", scenario: "DIRECT_REAL_PROPERTY", assetValue: dollars(2_000_000) });
  const current = computeForeignResidentCgtWithholding({ contractDate: "2025-01-01", settlementDate: "2025-02-01", scenario: "DIRECT_REAL_PROPERTY", assetValue: dollars(1_000_000) });
  assert.equal(pre2017.withholdingRateBps, 1000);
  assert.equal(pre2017.amountToWithhold, dollars(200_000));
  assert.equal(current.withholdingRateBps, 1500);
  assert.equal(current.amountToWithhold, dollars(150_000));
});

test("clearance certificates switch off direct-real-property withholding", () => {
  const result = computeForeignResidentCgtWithholding({ contractDate: "2025-01-01", settlementDate: "2025-02-01", scenario: "DIRECT_REAL_PROPERTY", assetValue: dollars(1_000_000), hasClearanceCertificate: true });
  assert.equal(result.applies, false);
  assert.equal(result.amountToWithhold, 0);
});

test("clearance certificates do not switch off option-or-right withholding", () => {
  const result = computeForeignResidentCgtWithholding({
    contractDate: "2026-02-01",
    settlementDate: "2026-03-01",
    scenario: "OPTION_OR_RIGHT",
    assetValue: dollars(1_000_000),
    hasClearanceCertificate: true,
  });
  assert.equal(result.applies, true);
  assert.equal(result.withholdingRateBps, 1500);
  assert.equal(result.amountToWithhold, dollars(150_000));
});

test("CGT catalogues expose entity and withholding selections", () => {
  assert.ok(AU_CGT_ENTITY_TYPES.some((row) => row.id === "COMPLYING_SUPER_FUND"));
  assert.ok(AU_FRCGW_SCENARIOS.some((row) => row.id === "OPTION_OR_RIGHT"));
});
