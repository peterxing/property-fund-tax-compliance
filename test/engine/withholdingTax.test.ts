import { test } from "node:test";
import assert from "node:assert/strict";
import { WITHHOLDING_PAYMENT_TYPES, computeWithholdingTax, withholdingTaxDueDate } from "../../src/engine/withholdingTax.ts";

test("withholdingTaxDueDate uses the 15th of the second month", () => {
  assert.equal(withholdingTaxDueDate("2026-01-10"), "2026-03-15");
  assert.equal(withholdingTaxDueDate("2026-12-31"), "2027-02-15");
});

test("computeWithholdingTax applies the domestic interest rate and treaty override", () => {
  const domestic = computeWithholdingTax({ paymentDate: "2026-01-10", grossPayment: 100_000_000, paymentType: "INTEREST" });
  assert.equal(domestic.tax, 15_000_000);
  assert.equal(domestic.effectiveRateBps, 1500);

  const royalty = computeWithholdingTax({ paymentDate: "2026-01-10", grossPayment: 100_000_000, paymentType: "ROYALTY" });
  assert.equal(royalty.tax, 10_000_000);
  assert.equal(royalty.effectiveRateBps, 1000);

  const treaty = computeWithholdingTax({ paymentDate: "2026-01-10", grossPayment: 100_000_000, paymentType: "INTEREST", treatyRateBps: 1000 });
  assert.equal(treaty.tax, 10_000_000);
  assert.equal(treaty.effectiveRateBps, 1000);
});

test("technical and management fees use the current prevailing corporate rate when taxable", () => {
  const technical = computeWithholdingTax({ paymentDate: "2026-01-10", grossPayment: 100_000_000, paymentType: "TECHNICAL_SERVICE_FEES", servicePerformedInSingapore: true });
  const management = computeWithholdingTax({ paymentDate: "2026-01-10", grossPayment: 100_000_000, paymentType: "MANAGEMENT_FEES", servicePerformedInSingapore: true });
  assert.equal(technical.effectiveRateBps, 1700);
  assert.equal(technical.tax, 17_000_000);
  assert.equal(management.effectiveRateBps, 1700);
  assert.equal(management.tax, 17_000_000);
});

test("service fees can be nil where services are performed wholly outside Singapore", () => {
  const result = computeWithholdingTax({
    paymentDate: "2026-06-01",
    grossPayment: 50_000_000,
    paymentType: "TECHNICAL_SERVICE_FEES",
    servicePerformedInSingapore: false,
  });
  assert.equal(result.tax, 0);
  assert.equal(result.findings.some((finding) => finding.id === "WHT.SERVICE_OUTSIDE_SINGAPORE"), true);
});

test("late-payment penalty is added when remittance is after the due date", () => {
  const result = computeWithholdingTax({
    paymentDate: "2026-01-10",
    grossPayment: 100_000_000,
    paymentType: "INTEREST",
    remittedDate: "2026-05-20",
  });
  assert.equal(result.latePenalty?.basePenalty, 750_000);
  assert.equal(result.latePenalty?.monthlyPenalty, 300_000);
  assert.equal(result.latePenalty?.totalPenalty, 1_050_000);
});

test("withholding payment-type catalogue covers all supported ids", () => {
  assert.deepEqual(
    WITHHOLDING_PAYMENT_TYPES.map((item) => item.id).sort(),
    [
      "BRANCH_PROFIT_REMITTANCE",
      "CONSULTANCY_PROFESSIONAL_FEES",
      "DIRECTOR_FEES",
      "INTEREST",
      "MANAGEMENT_FEES",
      "NON_RESIDENT_PUBLIC_ENTERTAINER",
      "OTHER_SECTION_45",
      "RENT_MOVABLE_PROPERTY",
      "ROYALTY",
      "TECHNICAL_SERVICE_FEES",
    ],
  );
});
