import { test } from "node:test";
import assert from "node:assert/strict";
import { assessGstRegistration, buildGstReturn, classifyPropertySupply, computeGstLateFilingPenalty, computeGstLatePaymentPenalty, computePartialExemption, gstRateByDate } from "../../src/engine/gst.ts";

test("GST rate history covers 1994, 2003, 2004, 2007, 2023 and 2024 changes", () => {
  assert.equal(gstRateByDate("1994-04-01"), 300);
  assert.equal(gstRateByDate("2003-01-01"), 400);
  assert.equal(gstRateByDate("2004-01-01"), 500);
  assert.equal(gstRateByDate("2007-07-01"), 700);
  assert.equal(gstRateByDate("2023-12-31"), 800);
  assert.equal(gstRateByDate("2024-01-01"), 900);
});

test("partial exemption IRAS example rounds 95.3 percent to 95 percent and claims direct Reg 33 tax when Regulation 35 passes", () => {
  const result = computePartialExemption({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxableSupplies: 100_000_000,
    exemptSupplies: 6_500_000,
    regulation33ExemptSupplies: 1_500_000,
    nonRegulation33ExemptSupplies: 5_000_000,
    directTaxableInputTax: 5_600_000,
    directReg33InputTax: 700,
    directExemptInputTax: 0,
    residualInputTax: 70_000,
  });
  assert.equal(result.regulation35Pass, true);
  assert.equal(result.deMinimisPass, false);
  assert.equal(result.recoverableResidualBps, 9500);
  assert.equal(result.claimableInputTax, 5_667_200);
});

test("partial exemption IRAS example rounds 86.48 percent down to 86 percent", () => {
  const result = computePartialExemption({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxableSupplies: 460_000_000,
    exemptSupplies: 71_900_000,
    directTaxableInputTax: 0,
    directReg33InputTax: 0,
    directExemptInputTax: 0,
    residualInputTax: 100,
  });
  assert.equal(result.recoverableResidualBps, 8600);
  assert.equal(result.claimableInputTax, 86);
});

test("Regulation 35 fail removes direct Reg 33 claims and N1 exclusions are removed from both numerator and denominator", () => {
  const reg35Fail = computePartialExemption({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxableSupplies: 100_000_000,
    exemptSupplies: 10_000_000,
    regulation33ExemptSupplies: 4_000_000,
    nonRegulation33ExemptSupplies: 6_000_000,
    directTaxableInputTax: 1_000_000,
    directReg33InputTax: 50_000,
    directExemptInputTax: 0,
    residualInputTax: 10_000,
  });
  assert.equal(reg35Fail.regulation35Pass, false);
  assert.equal(reg35Fail.recoverableResidualBps, 9100);
  assert.equal(reg35Fail.claimableInputTax, 1_009_100);

  const n1Excluded = computePartialExemption({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxableSupplies: 100_000_000,
    exemptSupplies: 10_000_000,
    directTaxableInputTax: 0,
    directReg33InputTax: 0,
    directExemptInputTax: 0,
    residualInputTax: 10_000,
    excludedTaxableSuppliesForDeMinimis: 50_000_000,
  });
  assert.equal(n1Excluded.recoverableResidualBps, 8300);
  assert.equal(n1Excluded.claimableInputTax, 8_300);
});

test("de minimis examples use exact threshold arithmetic at the margins", () => {
  const pass = computePartialExemption({
    periodStart: "2014-04-01",
    periodEnd: "2014-06-30",
    taxableSupplies: 238_000_000,
    exemptSupplies: 12_000_000,
    directTaxableInputTax: 90_000,
    directReg33InputTax: 0,
    directExemptInputTax: 30_000,
    residualInputTax: 60_000,
  });
  assert.equal(pass.deMinimisPass, true);
  assert.equal(pass.exemptSuppliesPerMonth, 4_000_000);
  assert.equal(pass.exemptSuppliesRatioBps, 480);
  assert.equal(pass.claimableInputTax, 180_000);

  const failMonthlyAverage = computePartialExemption({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxableSupplies: 238_000_000,
    exemptSupplies: 12_000_001,
    directTaxableInputTax: 0,
    directReg33InputTax: 0,
    directExemptInputTax: 0,
    residualInputTax: 1_000,
  });
  assert.equal(failMonthlyAverage.deMinimisPass, false);

  // 5% boundary over a quarter: total supplies $2,000,000 so that 5% ($100,000) is below the $120,000 monthly-average limit and is the binding test
  const passFivePercent = computePartialExemption({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxableSupplies: 190_000_000,
    exemptSupplies: 10_000_000,
    directTaxableInputTax: 0,
    directReg33InputTax: 0,
    directExemptInputTax: 0,
    residualInputTax: 1_000,
  });
  assert.equal(passFivePercent.deMinimisPass, true);

  const failFivePercent = computePartialExemption({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxableSupplies: 189_999_999,
    exemptSupplies: 10_000_001,
    directTaxableInputTax: 0,
    directReg33InputTax: 0,
    directExemptInputTax: 0,
    residualInputTax: 1_000,
  });
  assert.equal(failFivePercent.deMinimisPass, false);

  // $125,000 over a quarter is exactly 5% of $2.5m but $41,667 a month, so the monthly-average limit fails it
  const failMonthlyLimit = computePartialExemption({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxableSupplies: 237_500_000,
    exemptSupplies: 12_500_000,
    directTaxableInputTax: 0,
    directReg33InputTax: 0,
    directExemptInputTax: 0,
    residualInputTax: 1_000,
  });
  assert.equal(failMonthlyLimit.deMinimisPass, false);
});

test("quarterly mixed residential and commercial letting builds expected GST boxes", () => {
  const result = buildGstReturn({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    revenue: 98_000_000,
    transactions: [
      { date: "2026-01-31", documentNo: "R001", counterparty: "Retail Tenant", taxCode: "SR", netAmount: 60_000_000, gstAmount: 5_400_000, currency: "SGD", propertyRef: "MALL-01" },
      { date: "2026-01-31", documentNo: "R002", counterparty: "Residential Tenant", taxCode: "ESN33", netAmount: 30_000_000, gstAmount: 0, currency: "SGD", propertyRef: "APT-01" },
      { date: "2026-02-15", documentNo: "R003", counterparty: "Facilities", taxCode: "SR", netAmount: 8_000_000, gstAmount: 720_000, currency: "SGD", propertyRef: "MALL-01" },
      { date: "2026-02-28", documentNo: "P001", counterparty: "Managing Agent", taxCode: "TX-RE", netAmount: 10_000_000, gstAmount: 900_000, currency: "SGD" },
      { date: "2026-03-10", documentNo: "P002", counterparty: "Lift Contractor", taxCode: "TX", netAmount: 5_000_000, gstAmount: 450_000, currency: "SGD" },
    ],
  });
  assert.equal(result.boxes.box1StandardRatedSupplies, 68_000_000);
  assert.equal(result.boxes.box3ExemptSupplies, 30_000_000);
  assert.equal(result.boxes.box4TotalSupplies, 98_000_000);
  assert.equal(result.boxes.box6OutputTaxDue, 6_120_000);
  assert.equal(result.boxes.box7InputTaxAndRefundsClaimed, 1_071_000);
  assert.equal(result.boxes.box8NetGst, 5_049_000);
  assert.equal(result.partialExemption?.deMinimisPass, false);
});

test("developer with residential and commercial units triggers partial exemption", () => {
  const result = buildGstReturn({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    transactions: [
      { date: "2026-01-20", documentNo: "S001", counterparty: "Buyer A", taxCode: "ESN33", netAmount: 120_000_000, gstAmount: 0, currency: "SGD" },
      { date: "2026-01-22", documentNo: "S002", counterparty: "Buyer B", taxCode: "SR", netAmount: 80_000_000, gstAmount: 7_200_000, currency: "SGD" },
      { date: "2026-02-15", documentNo: "C001", counterparty: "Architect", taxCode: "TX-N33", netAmount: 12_000_000, gstAmount: 1_080_000, currency: "SGD" },
      { date: "2026-02-16", documentNo: "C002", counterparty: "QS", taxCode: "TX", netAmount: 15_000_000, gstAmount: 1_350_000, currency: "SGD" },
      { date: "2026-02-17", documentNo: "C003", counterparty: "Shared Site Office", taxCode: "TX-RE", netAmount: 5_000_000, gstAmount: 450_000, currency: "SGD" },
    ],
  });
  assert.equal(result.partialExemption?.deMinimisPass, false);
  assert.equal(result.partialExemption?.claimableInputTax, 1_530_000);
  assert.equal(result.boxes.box7InputTaxAndRefundsClaimed, 1_530_000);
});

test("property supply classifier follows residential, commercial and going-concern rules", () => {
  assert.equal(classifyPropertySupply({ date: "2026-01-01", transactionType: "LEASE", propertyUse: "RESIDENTIAL" }).suggestedTaxCode, "ESN33");
  assert.equal(classifyPropertySupply({ date: "2026-01-01", transactionType: "LEASE", propertyUse: "OFFICE" }).suggestedTaxCode, "SR");
  assert.equal(classifyPropertySupply({ date: "2026-01-01", transactionType: "TRANSFER_OF_GOING_CONCERN", qualifiesAsTransferOfGoingConcern: true }).suggestedTaxCode, "OS");
  assert.equal(classifyPropertySupply({ date: "2026-01-01", transactionType: "SALE", propertyUse: "OFFICE", buyerAccountsForGstOnReitTransfer: true }).suggestedTaxCode, "SRCA-S");
});

test("GST registration helper applies the 2025 prospective timing change", () => {
  const pre = assessGstRegistration({ assessmentDate: "2025-06-30", forecastDate: "2025-06-30", forecastTaxableTurnoverNext12Months: 120_000_000 });
  assert.equal(pre.basis, "PROSPECTIVE");
  assert.equal(pre.applicationDueDate, "2025-07-30");
  assert.equal(pre.effectiveRegistrationDate, "2025-07-31");

  const post = assessGstRegistration({ assessmentDate: "2025-07-01", forecastDate: "2025-07-01", forecastTaxableTurnoverNext12Months: 120_000_000 });
  assert.equal(post.applicationDueDate, "2025-07-31");
  assert.equal(post.effectiveRegistrationDate, "2025-09-01");
});

test("GST late filing penalty starts immediately and then grows by completed months", () => {
  assert.equal(computeGstLateFilingPenalty({ dueDate: "2026-04-30", filedDate: "2026-04-30" }), 0);
  assert.equal(computeGstLateFilingPenalty({ dueDate: "2026-04-30", filedDate: "2026-05-01" }), 20_000);
  assert.equal(computeGstLateFilingPenalty({ dueDate: "2026-01-31", filedDate: "2026-02-28" }), 40_000);
  assert.equal(computeGstLateFilingPenalty({ dueDate: "2026-01-31", filedDate: "2030-02-28" }), 1_000_000);
});

test("GST late payment penalty matches the IRAS 10000 to 1300 example", () => {
  assert.equal(
    computeGstLatePaymentPenalty({ unpaidTax: 1_000_000, dueDate: "2025-07-31", paidDate: "2025-12-16", penaltyNoticeDate: "2025-08-05" }),
    130_000,
  );
});
