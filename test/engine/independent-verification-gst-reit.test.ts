// Independent verification of the GST / REIT engine against IRAS primary sources (retrieved 2026-10-09).
// Every expected number below comes from an IRAS page or a hand calculation - NEVER edit an expectation to make the engine pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessGstRegistration, buildGstReturn, computeGstLateFilingPenalty, computeGstLatePaymentPenalty, computePartialExemption, gstRateByDate, gstReturnDueDate,
} from "../../src/engine/gst.ts";
import { determineReitInvestorTax, reitFormUtDueDate, reitWithholdingDueDate } from "../../src/engine/reitTax.ts";

// IRAS "GST: Partial Exemption and Input Tax Recovery" (6th ed.), worked example in section 7
test("partial exemption: IRAS worked example - ratio rounded to the nearest whole percent, Regulation 35 passes", () => {
  const r = computePartialExemption({
    periodStart: "2026-01-01", periodEnd: "2026-03-31",
    taxableSupplies: 100_000_000, // $1,000,000
    exemptSupplies: 6_500_000, // $65,000 = $15,000 reg 33 + $50,000 non-reg 33
    regulation33ExemptSupplies: 1_500_000,
    nonRegulation33ExemptSupplies: 5_000_000,
    directTaxableInputTax: 5_600_000, // $56,000
    directReg33InputTax: 700, // $7
    directExemptInputTax: 14_000, // $140 (never claimable)
    residualInputTax: 70_000, // $700
  });
  assert.equal(r.deMinimisPass, false, "$65,000 / $1,065,000 = 6.10% > 5%");
  assert.equal(r.regulation35Pass, true, "$50,000 / $1,065,000 = 4.69% <= 5%");
  assert.equal(r.recoverableResidualBps, 9500, "(1,000,000 + 15,000) / 1,065,000 = 95.3% -> 95%");
  assert.equal(r.claimableInputTax, 5_667_200, "$56,000 + $7 + $700 x 95% = $56,672");
  assert.equal(r.disallowedInputTax, 17_500, "$140 + 5% of $700 residual");
});

test("partial exemption: 86.48% rounds to 86% (IRAS example), and a failed Regulation 35 test drops direct Regulation 33 input tax", () => {
  const r = computePartialExemption({
    periodStart: "2026-01-01", periodEnd: "2026-03-31",
    taxableSupplies: 460_000_000, exemptSupplies: 71_900_000, // $4,600,000 over $5,319,000
    directTaxableInputTax: 0, directReg33InputTax: 0, directExemptInputTax: 0, residualInputTax: 1_000_000, // $10,000
  });
  assert.equal(r.deMinimisPass, false);
  assert.equal(r.recoverableResidualBps, 8600);
  assert.equal(r.claimableInputTax, 860_000);
  const failReg35 = computePartialExemption({
    periodStart: "2026-01-01", periodEnd: "2026-03-31",
    taxableSupplies: 80_000_000, exemptSupplies: 20_000_000, regulation33ExemptSupplies: 10_000_000, nonRegulation33ExemptSupplies: 10_000_000, // non-reg 33 = 10% of total
    directTaxableInputTax: 0, directReg33InputTax: 50_000, directExemptInputTax: 0, residualInputTax: 100_000,
  });
  assert.equal(failReg35.regulation35Pass, false);
  assert.equal(failReg35.recoverableResidualBps, 8000, "numerator is taxable supplies only: 80%");
  assert.equal(failReg35.claimableInputTax, 80_000, "direct reg-33 input tax not claimable; 80% of $1,000 residual = $800");
});

test("de minimis: IRAS FAQ example passes exactly; one cent over either limit fails", () => {
  // 1 Apr - 30 Jun 2014: standard $2,080,000, zero-rated $300,000, exempt $120,000, total $2,500,000 -> $40,000 a month and 4.8%
  const faq = computePartialExemption({ periodStart: "2014-04-01", periodEnd: "2014-06-30", taxableSupplies: 238_000_000, exemptSupplies: 12_000_000, directTaxableInputTax: 0, directReg33InputTax: 0, directExemptInputTax: 0, residualInputTax: 0 });
  assert.equal(faq.deMinimisPass, true);
  const overMonthly = computePartialExemption({ periodStart: "2014-04-01", periodEnd: "2014-06-30", taxableSupplies: 237_999_999, exemptSupplies: 12_000_001, directTaxableInputTax: 0, directReg33InputTax: 0, directExemptInputTax: 0, residualInputTax: 0 });
  assert.equal(overMonthly.deMinimisPass, false, "$120,000.01 over 3 months is more than $40,000 a month on average");
  // 5% limit binding: total $2,000,000 so 5% is $100,000, below the $120,000 monthly allowance
  const atFive = computePartialExemption({ periodStart: "2026-01-01", periodEnd: "2026-03-31", taxableSupplies: 190_000_000, exemptSupplies: 10_000_000, directTaxableInputTax: 0, directReg33InputTax: 0, directExemptInputTax: 0, residualInputTax: 0 });
  const overFive = computePartialExemption({ periodStart: "2026-01-01", periodEnd: "2026-03-31", taxableSupplies: 189_999_999, exemptSupplies: 10_000_001, directTaxableInputTax: 0, directReg33InputTax: 0, directExemptInputTax: 0, residualInputTax: 0 });
  assert.equal(atFive.deMinimisPass, true);
  assert.equal(overFive.deMinimisPass, false);
});

// IRAS "Late filing or non-filing of GST returns": $200 immediately, a further $200 for every completed month, max $10,000
test("late filing penalty: $200 at once, $200 for each completed month, capped at $10,000", () => {
  const due = "2025-10-31";
  assert.equal(computeGstLateFilingPenalty({ dueDate: due, filedDate: "2025-10-31" }), 0, "on the due date is on time");
  assert.equal(computeGstLateFilingPenalty({ dueDate: due, filedDate: "2025-11-01" }), 20_000, "one day late = $200");
  assert.equal(computeGstLateFilingPenalty({ dueDate: due, filedDate: "2025-12-05" }), 40_000, "one completed month late = $400");
  assert.equal(computeGstLateFilingPenalty({ dueDate: due, filedDate: "2026-02-15" }), 80_000, "three completed months late = $800");
  assert.equal(computeGstLateFilingPenalty({ dueDate: due, filedDate: "2030-01-15" }), 1_000_000, "capped at $10,000");
});

// IRAS "Late payment or non-payment of GST", Examples 1 and 4
test("late payment penalty: 5% at once, then 2% per month (IRAS example: $1,300 on $10,000)", () => {
  assert.equal(computeGstLatePaymentPenalty({ unpaidTax: 1_000_000, dueDate: "2025-07-31", paidDate: "2025-07-31" }), 0);
  assert.equal(computeGstLatePaymentPenalty({ unpaidTax: 1_000_000, dueDate: "2025-07-31", paidDate: "2025-08-20" }), 50_000, "5% = $500 while within the 60 days after the notice");
  assert.equal(computeGstLatePaymentPenalty({ unpaidTax: 1_000_000, dueDate: "2025-07-31", paidDate: "2025-12-16", penaltyNoticeDate: "2025-08-05" }), 130_000, "Example 4: $500 + 2% x 4 months (Aug-Nov) x $10,000 = $1,300");
  assert.equal(computeGstLatePaymentPenalty({ unpaidTax: 1_000_000, dueDate: "2025-07-31", paidDate: "2025-12-16" }), 130_000, "notice date defaults to the day after the due date");
  assert.equal(computeGstLatePaymentPenalty({ unpaidTax: 1_000_000, dueDate: "2020-07-31", paidDate: "2030-07-31" }), 550_000, "5% + additional 2%/month capped at 50% of the unpaid tax");
});

// IRAS "Do I need to register for GST"
test("GST registration: retrospective 1 Jan-30 Jan then 1 Mar; prospective is the 31st day before 1 Jul 2025 and 2 months after", () => {
  const retro = assessGstRegistration({ assessmentDate: "2025-12-31", retrospectiveAnnualTaxableTurnover: 100_000_001 });
  assert.equal(retro.registrationRequired, true);
  assert.equal(retro.applicationDueDate, "2026-01-30");
  assert.equal(retro.effectiveRegistrationDate, "2026-03-01");
  const notOver = assessGstRegistration({ assessmentDate: "2025-12-31", retrospectiveAnnualTaxableTurnover: 100_000_000 });
  assert.equal(notOver.registrationRequired, false, "the test is 'more than' $1 million");
  const before = assessGstRegistration({ assessmentDate: "2025-03-15", forecastTaxableTurnoverNext12Months: 150_000_000, forecastDate: "2025-03-15" });
  assert.equal(before.basis, "PROSPECTIVE");
  assert.equal(before.applicationDueDate, "2025-04-14", "within 30 days after the forecast");
  assert.equal(before.effectiveRegistrationDate, "2025-04-15", "registered on the 31st day after the forecast date");
  const after = assessGstRegistration({ assessmentDate: "2025-08-10", forecastTaxableTurnoverNext12Months: 150_000_000, forecastDate: "2025-08-10" });
  assert.equal(after.applicationDueDate, "2025-09-09");
  assert.equal(after.effectiveRegistrationDate, "2025-10-10", "2 months from the forecast date for liability arising on or after 1 Jul 2025");
});

test("GST rate history matches the IRAS table", () => {
  const expected: [string, number][] = [
    ["1994-04-01", 300], ["2002-12-31", 300], ["2003-01-01", 400], ["2003-12-31", 400], ["2004-01-01", 500], ["2007-06-30", 500],
    ["2007-07-01", 700], ["2022-12-31", 700], ["2023-01-01", 800], ["2023-12-31", 800], ["2024-01-01", 900], ["2026-10-09", 900],
  ];
  for (const [date, bps] of expected) assert.equal(gstRateByDate(date), bps, date);
});

test("GST F5 due date is one month after the accounting period; box arithmetic holds on a simple return", () => {
  // IRAS, GST filing due dates (read 19 October 2026): Jan–Mar 30 Apr, Apr–Jun 31 Jul, Jul–Sep 31 Oct, Oct–Dec 31 Jan; a special period
  // 5 Apr–5 Jul 2026 is due 5 Aug 2026. (The helper used to add one calendar month, giving 30 Jul and 30 Oct.)
  assert.equal(gstReturnDueDate("2026-03-31"), "2026-04-30");
  assert.equal(gstReturnDueDate("2026-06-30"), "2026-07-31");
  assert.equal(gstReturnDueDate("2025-09-30"), "2025-10-31");
  assert.equal(gstReturnDueDate("2026-12-31"), "2027-01-31");
  assert.equal(gstReturnDueDate("2026-07-05"), "2026-08-05", "special accounting period");
  const r = buildGstReturn({
    periodStart: "2026-01-01", periodEnd: "2026-03-31",
    transactions: [
      { date: "2026-01-15", documentNo: "S1", counterparty: "Tenant A", taxCode: "SR", netAmount: 100_000_00, gstAmount: 9_000_00, currency: "SGD" },
      { date: "2026-02-15", documentNo: "S2", counterparty: "Tenant B", taxCode: "ZR", netAmount: 20_000_00, gstAmount: 0, currency: "SGD" },
      { date: "2026-03-01", documentNo: "P1", counterparty: "Vendor", taxCode: "TX", netAmount: 40_000_00, gstAmount: 3_600_00, currency: "SGD" },
    ],
  });
  assert.equal(r.boxes.box1StandardRatedSupplies, 100_000_00);
  assert.equal(r.boxes.box2ZeroRatedSupplies, 20_000_00);
  assert.equal(r.boxes.box4TotalSupplies, 120_000_00);
  assert.equal(r.boxes.box5TaxablePurchases, 40_000_00);
  assert.equal(r.boxes.box6OutputTaxDue, 9_000_00);
  assert.equal(r.boxes.box7InputTaxAndRefundsClaimed, 3_600_00);
  assert.equal(r.boxes.box8NetGst, 5_400_00, "Box 8 = Box 6 - Box 7");
});

// IRAS REIT e-Tax Guide (Twelfth Edition, published 4 Dec 2025), paras 7.1, 7.2, 8.3, 16.1
test("REIT withholding by investor class follows the e-Tax Guide table", () => {
  const nrni = (date: string, declaration: "FORM_A_VALID" | "MISSING") => determineReitInvestorTax({ distributionDate: date, investorClass: "QUALIFYING_NON_RESIDENT_NON_INDIVIDUAL", declarationStatus: declaration });
  assert.deepEqual([nrni("2026-09-30", "FORM_A_VALID").withholdingRateBps, nrni("2026-09-30", "FORM_A_VALID").finalTax], [1000, true]);
  assert.deepEqual([nrni("2031-01-01", "FORM_A_VALID").withholdingRateBps, nrni("2031-01-01", "FORM_A_VALID").finalTax], [1700, false], "concession ends 31 Dec 2030");
  assert.equal(nrni("2026-09-30", "MISSING").withholdingRateBps, 1700, "no declaration -> withhold at the prevailing rate (para 12.2(b))");
  const fund = (date: string, section: "13D" | "13OA") => determineReitInvestorTax({ distributionDate: date, investorClass: "QUALIFYING_NON_RESIDENT_FUND", declarationStatus: "FORM_A_VALID", fundExemptionSection: section });
  assert.equal(fund("2019-07-01", "13D").withholdingRateBps, 1000);
  assert.equal(fund("2019-06-30", "13D").withholdingRateBps, 1700);
  assert.equal(fund("2024-12-31", "13OA").withholdingRateBps, 1700, "s13OA funds qualify only from 1 Jan 2025");
  assert.equal(fund("2025-01-01", "13OA").withholdingRateBps, 1000);
  const other = determineReitInvestorTax({ distributionDate: "2026-09-30", investorClass: "OTHER_NON_RESIDENT_NON_INDIVIDUAL", declarationStatus: "FORM_A_VALID" });
  assert.deepEqual([other.withholdingRateBps, other.finalTax], [1700, false]);
  for (const cls of ["INDIVIDUAL", "SINGAPORE_COMPANY", "SINGAPORE_BRANCH", "SINGAPORE_BODY_OF_PERSONS", "INTERNATIONAL_ORGANISATION", "REIT_ETF"] as const) {
    const t = determineReitInvestorTax({ distributionDate: "2026-09-30", investorClass: cls, declarationStatus: "FORM_A_VALID" });
    assert.equal(t.withholdingApplies, false, `${cls} receives distributions gross`);
  }
});

test("REIT filing dates: Form UT by 15 April; withholding tax by the 15th of the second month after payment", () => {
  assert.equal(reitFormUtDueDate(2027), "2027-04-15");
  assert.equal(reitWithholdingDueDate("2026-09-28"), "2026-11-15");
  assert.equal(reitWithholdingDueDate("2026-11-30"), "2027-01-15");
});
