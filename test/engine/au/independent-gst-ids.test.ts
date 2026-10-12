import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateAuBasDueDate } from "../../../src/engine/au/calendar.ts";
import {
  buildAuBas,
  computeAuFailureToLodgePenalty,
  computeAuGeneralInterestCharge,
  computeGstPropertySettlementWithholding,
} from "../../../src/engine/au/gst.ts";
import {
  deriveAcnFromCompanyAbn,
  validateAbn,
  validateAcn,
  validateTfn,
} from "../../../src/engine/au/identifiers.ts";

test("ABN and ACN checksum specimens from ABR/ASIC and hand-computed controls", () => {
  // ABR specimen: "51 824 753 556 is a valid ABN"
  // https://abr.business.gov.au/Help/AbnFormat (retrieved 2026-10-10)
  assert.equal(validateAbn("51 824 753 556").ok, true);
  assert.equal(validateAbn("51-824-753-556").normalized, "51824753556");
  assert.equal(validateAbn("51 824 753 557").ok, false, "one-digit mutation should fail");
  assert.equal(validateAbn("01 234 567 890").ok, false, "leading-zero control");
  assert.equal(validateAbn("51 824 753 55").ok, false, "wrong length should fail");

  // ASIC format specimen: "ACN: 123 456 789 / ABN: 36 123 456 789"
  // https://asic.gov.au/for-business/registering-a-company/steps-to-register-a-company/australian-company-numbers/ (retrieved 2026-10-10)
  // The page illustrates formatting only; independently applying the weighted check-digit rule makes 123 456 789 invalid.
  assert.equal(validateAcn("123 456 789").ok, false);

  // Hand-computed valid control: 123456780 satisfies the standard ACN check-digit formula,
  // and 11 123 456 780 satisfies the ABN modulus-89 formula.
  assert.equal(validateAcn("123 456 780").ok, true);
  assert.equal(deriveAcnFromCompanyAbn("11 123 456 780"), "123456780");
  assert.equal(deriveAcnFromCompanyAbn("36 123 456 789"), null);
});

test("TFN payer codes are rejected; hand-computed 8-digit and 9-digit TFNs validate", () => {
  // ATO payer-code placeholders:
  // 000000000 / 111111111 / 333333333 / 444444444
  // https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/payg-withholding/payments-you-need-to-withhold-from/payments-to-employees/tax-file-number-and-withholding-declarations (retrieved 2026-10-10)
  for (const code of ["000000000", "111111111", "333333333", "444444444"] as const) {
    assert.equal(validateTfn(code).ok, false, code);
  }

  // Hand-computed controls using the published modulus-11 weighting convention commonly used by payroll systems.
  assert.deepEqual(validateTfn("123 456 782"), { ok: true, digits: 9 });
  assert.deepEqual(validateTfn("1234 5673"), { ok: true, digits: 8 });
  assert.equal(validateTfn("123 456 783").ok, false, "one-digit mutation should fail");
  assert.equal(validateTfn("0123 4567").ok, false, "leading-zero 8-digit control");
});

test("ATO BAS due dates: quarterly dates and weekend rollover", () => {
  // "21st day of the following month", quarterly 28 Oct / 28 Feb / 28 Apr / 28 Jul,
  // and "If the due date is on a weekend or public holiday, you have until the next business day".
  // https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas/due-dates-for-lodging-and-paying-your-bas
  assert.equal(
    calculateAuBasDueDate({ periodStart: "2026-07-01", periodEnd: "2026-09-30", frequency: "QUARTERLY" }),
    "2026-10-28",
  );
  assert.equal(
    calculateAuBasDueDate({ periodStart: "2026-10-01", periodEnd: "2026-12-31", frequency: "QUARTERLY" }),
    "2027-03-01",
    "28 February 2027 is a Sunday",
  );
  assert.equal(
    calculateAuBasDueDate({ periodStart: "2025-07-01", periodEnd: "2026-06-30", frequency: "ANNUAL", annualDueMode: "STANDARD_31_OCTOBER" }),
    "2026-11-02",
    "31 October 2026 is a Saturday",
  );
});

test("GST-at-settlement withholding examples and exclusions match the ATO page", () => {
  // ATO examples:
  // - $900,000 new residential premises => $81,818 (1/11th)
  // - margin-scheme example on $900,000 contract => $63,000 (7%)
  // - substantial renovations are excluded from withholding
  // https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/property/gst-at-settlement
  assert.equal(
    computeGstPropertySettlementWithholding({
      contractDate: "2026-10-10",
      contractPrice: 90_000_000,
      supplyType: "FULLY_TAXABLE",
      isNewResidentialPremises: true,
      supplierRegisteredOrRequired: true,
    }).amount,
    8_181_800,
  );
  assert.equal(
    computeGstPropertySettlementWithholding({
      contractDate: "2026-10-10",
      contractPrice: 90_000_000,
      supplyType: "MARGIN_SCHEME",
      isNewResidentialPremises: true,
      supplierRegisteredOrRequired: true,
    }).amount,
    6_300_000,
  );
  assert.equal(
    computeGstPropertySettlementWithholding({
      contractDate: "2026-10-10",
      contractPrice: 90_000_000,
      supplyType: "FULLY_TAXABLE",
      isNewResidentialPremises: true,
      createdThroughSubstantialRenovations: true,
      supplierRegisteredOrRequired: true,
    }).withholdingRequired,
    false,
  );
});

test("FTL penalty units honour the 2023, 2024 and 2026 change dates", () => {
  // Penalty unit values:
  // 1 Jul 2023-6 Nov 2024 = $313; 7 Nov 2024-30 Jun 2026 = $330; on/after 1 Jul 2026 = $364.
  // https://www.ato.gov.au/individuals-and-families/paying-the-ato/interest-and-penalties/penalties/penalty-units
  // Base FTL penalty: one penalty unit for each 28 days or part thereof, up to 5 units.
  // https://www.ato.gov.au/individuals-and-families/paying-the-ato/interest-and-penalties/penalties/failure-to-lodge-on-time-penalty
  assert.deepEqual(
    computeAuFailureToLodgePenalty({ dueDate: "2024-11-05", lodgedDate: "2024-11-06", entitySize: "SMALL" }),
    { penalty: 31_300, penaltyUnits: 1, periodsLate: 1 },
  );
  assert.deepEqual(
    computeAuFailureToLodgePenalty({ dueDate: "2024-11-06", lodgedDate: "2024-11-07", entitySize: "SMALL" }),
    { penalty: 33_000, penaltyUnits: 1, periodsLate: 1 },
  );
  assert.deepEqual(
    computeAuFailureToLodgePenalty({ dueDate: "2026-06-30", lodgedDate: "2026-07-01", entitySize: "SMALL" }),
    { penalty: 36_400, penaltyUnits: 1, periodsLate: 1 },
  );
});

test("GIC current daily rates apply quarter by quarter", () => {
  // ATO GIC daily rates:
  // Jul-Sep 2024 0.03103825%; Oct-Dec 2024 0.03109290%; Jan-Mar 2025 0.03128767%;
  // Apr-Jun 2025 0.03060274%; Jul-Sep 2025 0.02953425%; Oct-Dec 2025 0.02906849%;
  // Jan-Mar 2026 0.02917808%; Apr-Jun 2026 0.03002740%; Jul-Sep 2026 0.03131507%; Oct-Dec 2026 0.03153425%.
  // https://www.ato.gov.au/tax-rates-and-codes/general-interest-charge-rates
  const cases: Array<[string, string, number]> = [
    ["2024-06-30", "2024-07-01", 3_104],
    ["2024-09-30", "2024-10-01", 3_109],
    ["2024-12-31", "2025-01-01", 3_129],
    ["2025-03-31", "2025-04-01", 3_060],
    ["2025-06-30", "2025-07-01", 2_953],
    ["2025-09-30", "2025-10-01", 2_907],
    ["2025-12-31", "2026-01-01", 2_918],
    ["2026-03-31", "2026-04-01", 3_003],
    ["2026-06-30", "2026-07-01", 3_132],
    ["2026-09-30", "2026-10-01", 3_153],
  ];
  for (const [dueDate, paidDate, expectedInterestCents] of cases) {
    const r = computeAuGeneralInterestCharge({ principal: 10_000_000, dueDate, paidDate });
    assert.equal(r.daysLate, 1, dueDate);
    assert.equal(r.interest, expectedInterestCents, dueDate);
  }
});

test("ATO worked example: BAS for a fully taxable $900,000 new-residential sale should report G1 and 1A without a rate-mismatch warning", () => {
  // ATO GST-at-settlement example:
  // "the full sale price of $900,000 at label G1" and
  // "the GST payable of $81,818 at label 1A."
  // https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/property/gst-at-settlement
  const r = buildAuBas({
    periodStart: "2018-10-01",
    periodEnd: "2018-12-31",
    accountingMethod: "NON_CASH",
    reportingCycle: "QUARTERLY",
    reportingMethod: "SIMPLER_BAS",
    transactions: [
      {
        date: "2018-11-25",
        taxCode: "SALE_TAXABLE_NEW_RESIDENTIAL",
        netAmount: 90_000_000,
        gstAmount: 8_181_800,
      },
    ],
  });
  assert.deepEqual(r.reportedLabels, { G1: 90_000_000, "1A": 8_181_800, "1B": 0 });
  assert.equal(
    r.findings.some((f) => f.id === "AU_GST.RATE_MISMATCH"),
    false,
    "ATO's own BAS example should not be internally flagged as a GST-rate mismatch",
  );
});
