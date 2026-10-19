import assert from "node:assert/strict";
import test from "node:test";
import { computeWithholdingTax, WITHHOLDING_PAYMENT_TYPES } from "../../src/engine/withholdingTax.ts";
import { money } from "../../src/domain/format.ts";
import { assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const doc = "sg-withholding-tax";
const D = (dollars: number) => dollars * 100;
const sgd = (cents: number) => money(cents, "SGD", 2);

test("sg-withholding-tax worked examples match the engine", () => {
  assert.deepEqual(exampleIds(readRuleDoc(doc)), ["WHT-1", "WHT-2", "WHT-3"]);

  const interest = computeWithholdingTax({ paymentDate: "2026-08-15", grossPayment: D(1_000_000), paymentType: "INTEREST", treatyRateBps: 1000, remittedDate: "2026-11-20" });
  assertExampleQuotes(doc, "WHT-1", [
    sgd(interest.grossPayment),
    `${interest.statutoryRateBps / 100}%`,
    `${interest.effectiveRateBps / 100}%`,
    sgd(interest.tax),
    sgd(interest.netPaymentIfTaxWithheldFromGross),
    interest.dueDate,
    `${interest.latePenalty!.lateDays} late days`,
    sgd(interest.latePenalty!.basePenalty),
    sgd(interest.latePenalty!.monthlyPenalty),
    sgd(interest.latePenalty!.totalPenalty),
  ]);

  const service = computeWithholdingTax({ paymentDate: "2026-08-15", grossPayment: D(200_000), paymentType: "TECHNICAL_SERVICE_FEES", servicePerformedInSingapore: false });
  assert.equal(service.findings[0]?.id, "WHT.SERVICE_OUTSIDE_SINGAPORE");
  assertExampleQuotes(doc, "WHT-2", [
    sgd(service.grossPayment),
    `${service.statutoryRateBps / 100}%`,
    `${service.effectiveRateBps / 100}%`,
    sgd(service.tax),
    sgd(service.netPaymentIfTaxWithheldFromGross),
    "WHT.SERVICE_OUTSIDE_SINGAPORE",
  ]);

  const iras = computeWithholdingTax({ paymentDate: "2025-05-26", grossPayment: D(70_000), paymentType: "ROYALTY", remittedDate: "2025-10-25" });
  assert.equal(iras.tax, D(7_000));
  assert.equal(iras.latePenalty?.dueDate, "2025-07-15");
  assert.equal(iras.latePenalty?.basePenalty, D(350));
  assert.equal(iras.latePenalty?.monthlyPenalty, D(140));
  assert.equal(iras.latePenalty?.totalPenalty, D(490));
  assertExampleQuotes(doc, "WHT-3", [
    sgd(iras.grossPayment),
    `${iras.statutoryRateBps / 100}%`,
    sgd(iras.tax),
    iras.dueDate,
    `${iras.latePenalty!.lateDays} late days`,
    sgd(iras.latePenalty!.basePenalty),
    sgd(iras.latePenalty!.monthlyPenalty),
    sgd(iras.latePenalty!.totalPenalty),
  ]);
});

test("sg-withholding-tax rates table quotes code-derived payment categories", () => {
  const rows = WITHHOLDING_PAYMENT_TYPES.map((type) => {
    const result = computeWithholdingTax({ paymentDate: "2026-08-15", grossPayment: D(100), paymentType: type.id });
    const serviceRule = type.usesServicePlace ? "Yes; nil if wholly outside Singapore" : "No";
    return tableRow([type.id, type.label, `${result.statutoryRateBps / 100}%`, serviceRule, "`withholding-tax.rates.current`"]);
  });
  assertSectionQuotes(doc, "Withholding tax rates", rows);
});

test("sg-withholding-tax deadline and penalty table quotes the implemented method", () => {
  const late = computeWithholdingTax({ paymentDate: "2026-08-15", grossPayment: D(100_000), paymentType: "INTEREST", remittedDate: "2026-11-20" });
  assert.equal(late.dueDate, "2026-10-15");
  assert.equal(late.latePenalty?.basePenalty, D(750));
  assert.equal(late.latePenalty?.monthlyPenalty, 0);
  assertSectionQuotes(doc, "Withholding due date and penalty thresholds", [
    tableRow(["Due date", "15th day of the second month from payment date", "`withholding-tax.deadline.current`"]),
    tableRow(["First late penalty", "5% of unpaid WHT when remitted after due date", "`withholding-tax.penalty.current`"]),
    tableRow(["Additional late penalty", "1% per completed calendar month from 30 days after the due date, capped at 15% extra", "`withholding-tax.penalty.current`"]),
    tableRow(["Maximum penalty", "20% in all", "`withholding-tax.penalty.current`"]),
  ]);
});
