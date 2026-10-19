import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCgt, computeForeignResidentCgtWithholding } from "../../src/engine/au/cgt.ts";
import { money } from "../../src/domain/format.ts";
import { assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const doc = "au-cgt";
const D = (dollars: number) => Math.round(dollars * 100);
const aud = (cents: number) => money(cents, "AUD", 2);

test("CGT examples are exactly the documented set", () => {
  assert.deepEqual(exampleIds(readRuleDoc(doc)), ["CGT-1", "CGT-2", "CGT-3", "CGT-4", "FRCGW-1", "FRCGW-2"]);
});

test("CGT worked examples quote engine results", () => {
  const calcDefault = computeCgt({
    label: "Property",
    entityType: "TRUST",
    acquisitionDate: "2019-06-30",
    disposalContractDate: "2026-08-15",
    capitalProceeds: D(15_000_000),
    acquisitionPrice: D(10_000_000),
    incidentalAcquisitionCosts: [{ amount: D(350_000), date: "2019-06-30" }],
    capitalWorksDeductionsClaimed: D(500_000),
    currentYearCapitalLosses: D(250_000),
  });
  assertExampleQuotes(doc, "CGT-1", [
    `Cost base is \`A$10,000,000.00 + A$350,000.00 - A$500,000.00 = ${aud(calcDefault.costBase)}\``,
    `Gross capital gain is ${aud(calcDefault.grossCapitalGain)}`,
    `Losses applied are ${aud(calcDefault.currentYearCapitalLossesApplied + calcDefault.priorYearCapitalLossesApplied)}`,
    `discount amount is ${aud(calcDefault.discountAmount)}`,
    `net capital gain is ${aud(calcDefault.netCapitalGain)}`,
    `trust discount component is ${aud(calcDefault.trustDiscountComponent)}`,
  ]);

  const individual = computeCgt({
    label: "Property",
    entityType: "INDIVIDUAL",
    acquisitionDate: "2024-01-01",
    disposalContractDate: "2025-01-02",
    capitalProceeds: D(10_000),
    acquisitionPrice: D(7_000),
    incidentalAcquisitionCosts: [{ amount: D(100), date: "2024-01-01" }],
    incidentalDisposalCosts: [{ amount: D(50), date: "2025-01-02" }],
    capitalWorksDeductionsClaimed: D(20),
  });
  assertExampleQuotes(doc, "CGT-2", [`Cost base is ${aud(individual.costBase)}`, `Gross capital gain is ${aud(individual.grossCapitalGain)}`, `50% discount is ${aud(individual.discountAmount)}`, `net capital gain is ${aud(individual.netCapitalGain)}`]);

  const company = computeCgt({ label: "Company pre-1999 asset", entityType: "COMPANY", acquisitionDate: "1998-01-15", disposalContractDate: "2026-07-02", capitalProceeds: D(1_500), acquisitionPrice: D(1_000) });
  assertExampleQuotes(doc, "CGT-3", [`indexation factor rounded to three decimals of 1.025`, `Indexed cost base is ${aud(company.indexedCostBase!)}`, `gross and net capital gain are ${aud(company.netCapitalGain)}`]);

  const residency = computeCgt({
    label: "Residency apportion",
    entityType: "INDIVIDUAL",
    acquisitionDate: "2010-01-01",
    disposalContractDate: "2020-01-02",
    capitalProceeds: D(1_000),
    acquisitionPrice: 0,
    residencyPeriods: [{ from: "2012-05-09", to: "2016-05-08", status: "AU_RESIDENT" }, { from: "2016-05-09", to: "2020-01-02", status: "FOREIGN_RESIDENT" }],
  });
  assertExampleQuotes(doc, "CGT-4", [`floors the apportioned 50% discount to ${residency.discountPercentageBps.toLocaleString("en-AU")} basis points`, `discount ${aud(residency.discountAmount)}`, `Net capital gain is ${aud(residency.netCapitalGain)}`]);
});

test("FRCGW examples quote engine results", () => {
  const before = computeForeignResidentCgtWithholding({ contractDate: "2024-12-31", settlementDate: "2025-01-31", scenario: "DIRECT_REAL_PROPERTY", assetValue: D(1_200_000) });
  const after = computeForeignResidentCgtWithholding({ contractDate: "2025-01-01", settlementDate: "2025-01-31", scenario: "DIRECT_REAL_PROPERTY", assetValue: D(1_200_000) });
  assertExampleQuotes(doc, "FRCGW-1", [
    `contract date 2024-12-31`,
    `threshold and 12.5% rate, so amount to withhold is ${aud(before.amountToWithhold)} and due date is ${before.dueDate}`,
    `contract date 2025-01-01`,
    `threshold is ${aud(after.threshold)} and the rate is 15%, so amount to withhold is ${aud(after.amountToWithhold)} and due date remains ${after.dueDate}`,
  ]);

  const cert = computeForeignResidentCgtWithholding({ contractDate: "2025-01-01", settlementDate: "2025-02-01", scenario: "DIRECT_REAL_PROPERTY", assetValue: D(1_000_000), hasClearanceCertificate: true });
  assert.equal(cert.applies, false);
  assertExampleQuotes(doc, "FRCGW-2", [`threshold ${aud(cert.threshold)}`, `rate 0%`, `amount to withhold ${aud(cert.amountToWithhold)}`, `due date ${cert.dueDate}`]);
});

test("CGT rate and cost-base tables quote code-modelled fields", () => {
  assertSectionQuotes(doc, "CGT cost base elements", [
    tableRow(["Acquisition price", "Yes", "Yes", "Yes"]),
    tableRow(["Non-capital owning costs", "Yes", "No", "No"]),
    tableRow(["Capital works deductions claimed", "Subtracted", "Subtracted", "Subtracted after indexation"]),
  ]);
  assertSectionQuotes(doc, "CGT discount and indexation constants", [
    tableRow(["Individual", "50% before any residency apportionment", "Available for pre-1999-09-21 assets if `chooseIndexation` is true; otherwise discount method defaults", "`au-cgt.cost-base-and-discount`"]),
    tableRow(["Trust", "50%", "Available for pre-1999-09-21 assets if `chooseIndexation` is true; otherwise discount method defaults", "`au-cgt.cost-base-and-discount`"]),
    tableRow(["Company", "0%", "Must use indexation when an indexed base is available", "`au-cgt.cost-base-and-discount`"]),
    tableRow(["Complying super fund", "33.33% displayed; discount amount is exactly one third of gain after losses", "Available for pre-1999-09-21 assets if `chooseIndexation` is true; otherwise discount method defaults", "`au-cgt.cost-base-and-discount`"]),
  ]);
});

test("FRCGW rate table quotes effective-dated engine behaviour", () => {
  const rows = [
    { date: "2016-07-01", range: "2016-07-01 to 2017-06-30", value: D(2_000_000) },
    { date: "2017-07-01", range: "2017-07-01 to 2024-12-31", value: D(750_000) },
    { date: "2025-01-01", range: "From 2025-01-01", value: D(1) },
  ].map(({ date, range, value }) => {
    const result = computeForeignResidentCgtWithholding({ contractDate: date, settlementDate: date, scenario: "DIRECT_REAL_PROPERTY", assetValue: value });
    return tableRow([range, aud(result.threshold), `${result.withholdingRateBps / 100}%`, "`au-frcgw.2016-plus`"]);
  });
  assertSectionQuotes(doc, "FRCGW rates and thresholds", rows);
});
