import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFundPaymentNotice,
  computeMitWithholding,
  mitAiirDueDate,
  mitFundPaymentNoticeDueDate,
  mitWithholdingRemittanceDueDate,
} from "../../../src/engine/au/mitWithholding.ts";

test("MIT withholding computes the expected blended cash withholding", () => {
  const result = computeMitWithholding({
    paymentDate: "2026-06-30",
    incomeYearEnd: "2026-06-30",
    trustRegime: "AMIT",
    member: { memberClass: "FOREIGN_COMPANY_EOI" },
    paymentAmount: 1_000_00,
    fundPaymentBreakdown: {
      ordinaryFundPayment: 600_00,
      buildToRentFundPayment: 200_00,
      ncmiFundPayment: 100_00,
      excludedFromNcmiFundPayment: 100_00,
    },
  });
  assert.equal(result.totalFundPayment, 1_000_00);
  assert.equal(result.withholdingAmount, 165_00);
  assert.equal(result.finalTax, true);
});

test("MIT withholding rates honour the 1 July 2012 boundary", () => {
  const pre = computeMitWithholding({
    paymentDate: "2012-06-30",
    incomeYearEnd: "2012-06-30",
    trustRegime: "MIT",
    member: { memberClass: "FOREIGN_COMPANY_EOI" },
    paymentAmount: 100_00,
    fundPaymentBreakdown: { ordinaryFundPayment: 100_00 },
  });
  const post = computeMitWithholding({
    paymentDate: "2012-07-01",
    incomeYearEnd: "2013-06-30",
    trustRegime: "MIT",
    member: { memberClass: "FOREIGN_COMPANY_EOI" },
    paymentAmount: 100_00,
    fundPaymentBreakdown: { ordinaryFundPayment: 100_00, cleanBuildingFundPayment: 100_00 },
  });
  assert.equal(pre.withholdingAmount, 7_50);
  assert.equal(post.memberOutcome.bucketRates?.ordinaryFundPayment, 1500);
  assert.equal(post.memberOutcome.bucketRates?.cleanBuildingFundPayment, 1000);
});

test("fund payment notice and due dates follow ATO timing rules", () => {
  const notice = buildFundPaymentNotice({
    payerName: "Example Property Trust",
    payerAbn: "12 345 678 901",
    recipientName: "Resident Custodian",
    recipientMemberClass: "RESIDENT_COMPANY",
    paymentDate: "2026-07-31",
    incomeYearEnd: "2026-06-30",
    breakdown: {
      ordinaryFundPayment: 95_00,
      ncmiFundPayment: 20_00,
    },
    withholdingAmount: 21_00,
  });
  assert.equal(notice.dueDate, "2026-07-31");
  assert.equal(notice.retainOnWebsiteUntil, "2031-07-31");
  assert.equal(notice.content.amountSubjectToMitWithholding, 115_00);
  assert.equal(mitAiirDueDate("2026-06-30"), "2027-01-14");
  assert.equal(mitFundPaymentNoticeDueDate("2026-07-31"), "2026-07-31");
  assert.equal(mitWithholdingRemittanceDueDate("2026-06-30", "MEDIUM"), "2026-07-21");
  assert.equal(mitWithholdingRemittanceDueDate("2026-06-30", "SMALL"), "2026-07-28");
});

