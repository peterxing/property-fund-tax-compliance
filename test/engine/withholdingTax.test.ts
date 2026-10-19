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
  // Due 15 Mar 2026; the 1% runs from 14 Apr 2026 and one month (to 14 May) is complete by 20 May.
  assert.equal(result.latePenalty?.basePenalty, 750_000);
  assert.equal(result.latePenalty?.monthlyPenalty, 150_000);
  assert.equal(result.latePenalty?.totalPenalty, 900_000);
});

test("late-payment penalty reproduces IRAS's worked example and caps the additional penalty at 15%", () => {
  // IRAS, Late payment and non-payment of taxes (read 19 October 2026): payment to the non-resident 26 May 2025, S$7,000 tax due
  // 15 Jul 2025, paid 25 Oct 2025: 5% = S$350 plus 1% x 2 completed months = S$140, S$490 in all.
  const iras = computeWithholdingTax({ paymentDate: "2025-05-26", grossPayment: 70_000_00, paymentType: "ROYALTY", remittedDate: "2025-10-25" });
  assert.equal(iras.tax, 7_000_00);
  assert.equal(iras.latePenalty?.dueDate, "2025-07-15");
  assert.equal(iras.latePenalty?.basePenalty, 350_00);
  assert.equal(iras.latePenalty?.monthlyPenalty, 140_00);
  assert.equal(iras.latePenalty?.totalPenalty, 490_00);

  const oneDayLate = computeWithholdingTax({ paymentDate: "2025-05-26", grossPayment: 70_000_00, paymentType: "ROYALTY", remittedDate: "2025-07-16" });
  assert.equal(oneDayLate.latePenalty?.totalPenalty, 350_00, "5% only until a month is complete after day 30");

  const years = computeWithholdingTax({ paymentDate: "2025-05-26", grossPayment: 70_000_00, paymentType: "ROYALTY", remittedDate: "2027-12-31" });
  assert.equal(years.latePenalty?.monthlyPenalty, 1_050_00, "additional penalty capped at 15%");
  assert.equal(years.latePenalty?.totalPenalty, 1_400_00, "20% in all");
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
