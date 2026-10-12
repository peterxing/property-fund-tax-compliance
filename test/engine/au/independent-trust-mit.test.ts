// Independent verification of AU trust / MIT / AMIT engine against ATO primary sources (retrieved 2026-10-10).
// Every expectation below comes from an ATO page, an ATO worked example, or a hand calculation written out here.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAmmaStatement, computeAmitCostBaseNetAmount, determineTrustComponents } from "../../../src/engine/au/amit.ts";
import { allocateDistributionToMembers, computeDistribution, reconcileWithholding } from "../../../src/engine/au/distribution.ts";
import { determineMemberWithholding } from "../../../src/engine/au/members.ts";
import { buildFundPaymentNotice, computeMitWithholding } from "../../../src/engine/au/mitWithholding.ts";

const URL_MIT_FACT_SHEET = "https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/in-detail/investing-in-australia/withholding-tax-arrangements-for-managed-investment-trust-fund-payments";
const URL_MIT_WITHHOLDING = "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/withholding-rules/withholding-on-fund-payments-for-mits";
const URL_WITHHOLDING_FOR_MITS = "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/withholding-rules/withholding-for-mits";
const URL_BTR = "https://www.ato.gov.au/businesses-and-organisations/assets-and-property/build-to-rent-development-tax-incentives";
const URL_INVESTMENT_INCOME = "https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/payg-withholding/payments-you-need-to-withhold-from/withholding-from-investment-income";
const URL_AMIT_REPORTING = "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/amit-reporting-requirements";
const URL_AMMA_EXAMPLE = "https://www.ato.gov.au/forms-and-instructions/attribution-managed-investment-trust-member-annual-statement-standard-distribution-statement-2024/amma-statement-or-sds-example";
const URL_AMMA_GUIDANCE = "https://www.ato.gov.au/forms-and-instructions/attribution-managed-investment-trust-member-annual-statement-standard-distribution-statement-2024/guidance-notes";
const URL_AMMA_ABOUT = "https://www.ato.gov.au/forms-and-instructions/attribution-managed-investment-trust-member-annual-statement-standard-distribution-statement-2024/about-the-amma-statement-and-sds";
const URL_ATTRIBUTION = "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/attribution-method-for-managed-investment-trusts/attributing-amounts-to-members";

test("MIT withholding rates and scope match the ATO tables and pages", () => {
  // ATO MIT fact sheet/table: 22.5% from 1 Jul 2008, 15% from 1 Jul 2009, 7.5% from 1 Jul 2010,
  // then 15% (or 10% clean building) from 1 Jul 2012 for EOI residents; 30% for non-EOI.
  // Build-to-rent concessional 15% applies from 1 Jan 2025 for EOI residents.
  // Sources: URL_MIT_FACT_SHEET, URL_MIT_WITHHOLDING, URL_BTR.
  const cases = [
    { date: "2008-07-01", memberClass: "FOREIGN_COMPANY_EOI", bucket: { ordinaryFundPayment: 10_000 }, rateBps: 2250 },
    { date: "2009-07-01", memberClass: "FOREIGN_COMPANY_EOI", bucket: { ordinaryFundPayment: 10_000 }, rateBps: 1500 },
    { date: "2010-07-01", memberClass: "FOREIGN_COMPANY_EOI", bucket: { ordinaryFundPayment: 10_000 }, rateBps: 750 },
    { date: "2012-07-01", memberClass: "FOREIGN_COMPANY_EOI", bucket: { ordinaryFundPayment: 10_000 }, rateBps: 1500 },
    { date: "2012-07-01", memberClass: "FOREIGN_COMPANY_EOI", bucket: { cleanBuildingFundPayment: 10_000 }, rateBps: 1000 },
    { date: "2026-10-10", memberClass: "FOREIGN_COMPANY_NON_EOI", bucket: { ordinaryFundPayment: 10_000 }, rateBps: 3000 },
    { date: "2026-10-10", memberClass: "FOREIGN_COMPANY_EOI", bucket: { ncmiFundPayment: 10_000 }, rateBps: 3000 },
    { date: "2025-01-01", memberClass: "FOREIGN_COMPANY_EOI", bucket: { buildToRentFundPayment: 10_000 }, rateBps: 1500 },
  ] as const;

  for (const row of cases) {
    const r = determineMemberWithholding({
      trustRegime: "AMIT",
      paymentDate: row.date,
      member: { memberClass: row.memberClass, countryOfResidence: "Test" },
      actualCashPayment: 10_000,
      withholdingMit: true,
      mitRateBuckets: row.bucket,
    });
    assert.equal(r.scenario, "MIT_FUND_PAYMENT_WITHHOLDING", `${row.date} ${row.memberClass}`);
    assert.equal(r.rateBps, row.rateBps, `${row.date} ${row.memberClass}`);
    assert.equal(r.withholdingAmount, row.rateBps, `A$100.00 base x ${row.rateBps / 100}%`);
  }

  // ATO: no MIT withholding where payment is attributable to an Australian PE of the foreign recipient.
  // Source: URL_MIT_FACT_SHEET, “except where the recipient is carrying on business at or through an Australian permanent establishment...”
  const pe = determineMemberWithholding({
    trustRegime: "AMIT",
    paymentDate: "2026-10-10",
    member: { memberClass: "FOREIGN_COMPANY_EOI", countryOfResidence: "US" },
    actualCashPayment: 10_000,
    withholdingMit: true,
    paymentAttributedToAustralianPermanentEstablishment: true,
    mitRateBuckets: { ordinaryFundPayment: 10_000 },
  });
  assert.equal(pe.withholdingAmount, 0);
  assert.equal(pe.scenario, "NONE");

  // ATO: investment bodies withhold at the top rate; tax-deferred-only distributions are excluded.
  // Source: URL_INVESTMENT_INCOME.
  const residentNoTfn = determineMemberWithholding({
    trustRegime: "AMIT",
    paymentDate: "2026-10-10",
    member: { memberClass: "RESIDENT_INDIVIDUAL" },
    actualCashPayment: 12_345,
    tfnWithholdingBase: 12_345,
  });
  assert.equal(residentNoTfn.scenario, "TFN_ABN_WITHHOLDING");
  assert.equal(residentNoTfn.rateBps, 4700);
  assert.equal(residentNoTfn.withholdingAmount, 5802, "A$123.45 x 47% = A$58.0215 -> A$58.02");

  const residentTaxDeferredOnly = determineMemberWithholding({
    trustRegime: "AMIT",
    paymentDate: "2026-10-10",
    member: { memberClass: "RESIDENT_INDIVIDUAL" },
    actualCashPayment: 12_345,
    tfnWithholdingBase: 0,
    returnOfCapitalOnly: true,
  });
  assert.equal(residentTaxDeferredOnly.withholdingAmount, 0);
  assert.equal(residentTaxDeferredOnly.scenario, "NONE");
});

test("resident MIT / AMIT fund payments still require a notice even when no withholding is due", () => {
  // ATO: “If you are an Australian resident ... a MIT or AMIT must notify you if any such payment is a fund payment ...
  // and state the amount that would have been subject to withholding if you were a non-resident.”
  // Source: URL_WITHHOLDING_FOR_MITS.
  const r = computeMitWithholding({
    paymentDate: "2026-09-30",
    incomeYearEnd: "2026-06-30",
    trustRegime: "AMIT",
    member: { memberClass: "RESIDENT_INDIVIDUAL", quotedTfn: true },
    paymentAmount: 10_000,
    fundPaymentBreakdown: { ordinaryFundPayment: 10_000 },
  });
  assert.equal(r.withholdingAmount, 0);
  assert.equal(r.requiresNotice, true);
  assert.equal(r.memberOutcome.requiresNotice, true);
});

test("fund payment notice timing and website-retention period match the ATO page", () => {
  // ATO: notice must be given “at or before” payment; website disclosure must remain available for 5 continuous years.
  // Source: URL_MIT_FACT_SHEET.
  const notice = buildFundPaymentNotice({
    payerName: "Trustee",
    recipientName: "Resident Holder",
    recipientMemberClass: "RESIDENT_INDIVIDUAL",
    paymentDate: "2026-09-30",
    incomeYearEnd: "2026-06-30",
    breakdown: { ordinaryFundPayment: 7_777, cleanBuildingFundPayment: 1_234, ncmiFundPayment: 505 },
    withholdingAmount: 0,
  });
  assert.equal(notice.dueDate, "2026-09-30");
  assert.equal(notice.retainOnWebsiteUntil, "2031-09-30");
  assert.equal(notice.content.amountSubjectToMitWithholding, 9_516);
});

test("AMIT overs of discount capital gains should not turn into a carry-forward discount-capital-gain deficit", () => {
  // ATO unders/overs page: an over reduces the trust component in the discovery year but the component cannot go below nil;
  // where the relevant character is a discount capital gain, the decrease is treated as a capital loss in the discovery year.
  // Source: https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/unders-and-overs-for-amits
  const r = determineTrustComponents({
    incomeYear: 2027,
    baseComponents: { CAPITAL_GAIN_DISCOUNTABLE: 100 },
    undersOvers: [{ character: "CAPITAL_GAIN_DISCOUNTABLE", amount: 150, adjustmentType: "OVER", baseYear: 2026 }],
  });
  assert.equal(r.determinedTrustComponents.CAPITAL_GAIN_DISCOUNTABLE, 0);
  assert.equal(r.carryForwardDeficits.CAPITAL_GAIN_DISCOUNTABLE ?? 0, 0);
});

test("AMIT cost base net amount reproduces the ATO example excess and a hand-worked shortfall", () => {
  // ATO AMMA example / guidance: A=105, B=0, X=100, C=225, D=282, F=25 => increase 737;
  // E=149 and G=613 => reduction 762; excess (decrease) = 25.
  // Sources: URL_AMMA_EXAMPLE and URL_AMMA_GUIDANCE.
  const excess = computeAmitCostBaseNetAmount({
    assessableAttributed: 71_200,
    naneAttributed: 2_500,
    taxOffsets: 14_900,
    cashPaymentsOrEntitlements: 61_300,
    startingCostBase: 2_000,
  });
  assert.equal(excess.increaseAmount, 73_700);
  assert.equal(excess.reductionAmount, 76_200);
  assert.equal(excess.excessDecrease, 2_500);
  assert.equal(excess.shortfallIncrease, 0);
  assert.equal(excess.closingCostBase, 0);
  assert.equal(excess.cgtEventE10Gain, 500);

  // Hand calculation from the statutory formula described at URL_AMMA_GUIDANCE:
  // increase 510.00 (assessable 500 + NANE 10) less reduction 405.00 (cash 400 + offsets 5) => shortfall 105.00.
  const shortfall = computeAmitCostBaseNetAmount({
    assessableAttributed: 50_000,
    naneAttributed: 1_000,
    taxOffsets: 500,
    cashPaymentsOrEntitlements: 40_000,
    startingCostBase: 10_000,
  });
  assert.equal(shortfall.excessDecrease, 0);
  assert.equal(shortfall.shortfallIncrease, 10_500);
  assert.equal(shortfall.closingCostBase, 20_500);
  assert.equal(shortfall.cgtEventE10Gain, 0);
});

test("AMMA builder should keep franked distributions separate from the franking-credit tax offset", () => {
  // ATO AMMA example: Part C shows Franked distributions (13C) = $100 while Part B / Table 4 shows
  // Share of franking credit from franked dividends (13Q) = $30. These are distinct fields.
  // Sources: URL_AMMA_EXAMPLE and URL_AMMA_GUIDANCE.
  const cbna = computeAmitCostBaseNetAmount({
    assessableAttributed: 71_200,
    naneAttributed: 2_500,
    taxOffsets: 14_900,
    cashPaymentsOrEntitlements: 61_300,
  });
  const statement = buildAmmaStatement({
    incomeYearEnd: "2024-06-30",
    memberId: "INV-1",
    member: { memberClass: "RESIDENT_INDIVIDUAL", quotedTfn: true },
    attributedComponents: {
      INTEREST: 4_000,
      OTHER_AU_INCOME: 3_000,
      FRANKED_DIVIDEND: 10_000,
      UNFRANKED_DIVIDEND: 6_000,
      FOREIGN_INCOME: 28_200,
      CAPITAL_GAIN_DISCOUNTABLE: 7_000,
      CAPITAL_GAIN_OTHER: 8_500,
      NON_ASSESSABLE_TAX_EXEMPT: 2_500,
    },
    cashDistribution: 61_300,
    taxOffsets: 14_900,
    costBaseNetAmount: cbna,
  });
  assert.equal(statement.dueDate, "2024-09-30");
  assert.equal(statement.components.costBaseExcessDecrease, 2_500);
  assert.equal(statement.summary.frankingCreditOffset, 3_000);
});

test("six-member AMIT allocation reconciles to the cent across odd cents, mixed classes and a mid-period unit movement", () => {
  // Hand calculation from the weights below using largest-remainder cents; not derived from engine output.
  // Attribution basis: URL_ATTRIBUTION (fair-and-reasonable basis consistent with constituent documents).
  const input = {
    trustRegime: "AMIT" as const,
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    recordDate: "2026-09-30",
    incomeYearEnd: "2027-06-30",
    unitsOutstanding: 820,
    distributableIncome: 11_457,
    componentPools: {
      RENT: 555,
      OTHER_AU_INCOME: 10_001,
      CAPITAL_GAIN_OTHER: 901,
      NON_ASSESSABLE_TAX_EXEMPT: 121,
      NON_ASSESSABLE_TAX_DEFERRED: 73,
    },
    mitFundPaymentBreakdown: { ordinaryFundPayment: 7_777, cleanBuildingFundPayment: 1_234, ncmiFundPayment: 505 },
    policy: { distributableIncomePayoutBps: 10_000, dpuDecimals: 4, attributionMethod: "TIME_WEIGHTED_DAILY" as const },
    taxOffsets: 0,
    members: [
      { memberId: "M1", displayName: "M1", profile: { memberClass: "RESIDENT_INDIVIDUAL", quotedTfn: true }, unitsHeldOnRecordDate: 100, holdingPeriods: [{ from: "2026-07-01", to: "2026-09-30", units: 100 }] },
      { memberId: "M2", displayName: "M2", profile: { memberClass: "RESIDENT_INDIVIDUAL" }, unitsHeldOnRecordDate: 200, holdingPeriods: [{ from: "2026-07-01", to: "2026-09-30", units: 200 }] },
      { memberId: "M3", displayName: "M3", profile: { memberClass: "FOREIGN_COMPANY_EOI", countryOfResidence: "US" }, unitsHeldOnRecordDate: 150, holdingPeriods: [{ from: "2026-07-01", to: "2026-08-15", units: 50 }, { from: "2026-08-16", to: "2026-09-30", units: 150 }] },
      { memberId: "M4", displayName: "M4", profile: { memberClass: "FOREIGN_COMPANY_NON_EOI", countryOfResidence: "ZZ" }, unitsHeldOnRecordDate: 0, holdingPeriods: [{ from: "2026-07-01", to: "2026-07-31", units: 80 }] },
      { memberId: "M5", displayName: "M5", profile: { memberClass: "FOREIGN_INDIVIDUAL_EOI", countryOfResidence: "GB" }, unitsHeldOnRecordDate: 300, holdingPeriods: [{ from: "2026-09-01", to: "2026-09-30", units: 300 }] },
      { memberId: "M6", displayName: "M6", profile: { memberClass: "RESIDENT_COMPANY", quotedAbn: true }, unitsHeldOnRecordDate: 70, holdingPeriods: [{ from: "2026-07-01", to: "2026-09-30", units: 70 }] },
    ],
  };

  const distribution = computeDistribution(input);
  assert.equal(distribution.declaredCashDistribution, 11_651);
  assert.equal(distribution.assessableCashDistribution, 11_457);
  assert.equal(distribution.distributionPerUnit.value, "0.1421");

  const allocation = allocateDistributionToMembers({ ...input, distribution, members: input.members });
  const expected = [
    { id: "M1", weight: 9200, gross: 1959, rent: 93, other: 1682, cap: 152, exempt: 20, deferred: 12, tfn: 0, mit: 0, total: 0, net: 1959 },
    { id: "M2", weight: 18400, gross: 3919, rent: 187, other: 3363, cap: 303, exempt: 41, deferred: 25, tfn: 1842, mit: 0, total: 1842, net: 2077 },
    { id: "M3", weight: 9200, gross: 1957, rent: 93, other: 1681, cap: 151, exempt: 20, deferred: 12, tfn: 0, mit: 243, total: 243, net: 1714 },
    { id: "M4", weight: 2480, gross: 528, rent: 25, other: 453, cap: 41, exempt: 6, deferred: 3, tfn: 0, mit: 130, total: 130, net: 398 },
    { id: "M5", weight: 9000, gross: 1916, rent: 91, other: 1645, cap: 148, exempt: 20, deferred: 12, tfn: 0, mit: 237, total: 237, net: 1679 },
    { id: "M6", weight: 6440, gross: 1372, rent: 66, other: 1177, cap: 106, exempt: 14, deferred: 9, tfn: 0, mit: 0, total: 0, net: 1372 },
  ] as const;

  assert.equal(allocation.members.length, expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    const got = allocation.members[i]!;
    const want = expected[i]!;
    assert.equal(got.memberId, want.id);
    assert.equal(got.weightUsed, want.weight);
    assert.equal(got.grossCashDistribution, want.gross);
    assert.equal(got.cashByCharacter.RENT, want.rent);
    assert.equal(got.cashByCharacter.OTHER_AU_INCOME, want.other);
    assert.equal(got.cashByCharacter.CAPITAL_GAIN_OTHER, want.cap);
    assert.equal(got.cashByCharacter.NON_ASSESSABLE_TAX_EXEMPT, want.exempt);
    assert.equal(got.cashByCharacter.NON_ASSESSABLE_TAX_DEFERRED, want.deferred);
    assert.equal(got.attributedComponents.RENT, want.rent);
    assert.equal(got.attributedComponents.OTHER_AU_INCOME, want.other);
    assert.equal(got.attributedComponents.CAPITAL_GAIN_OTHER, want.cap);
    assert.equal(got.attributedComponents.NON_ASSESSABLE_TAX_EXEMPT, want.exempt);
    assert.equal(got.attributedComponents.NON_ASSESSABLE_TAX_DEFERRED, want.deferred);
    assert.equal(got.tfnWithheld, want.tfn);
    assert.equal(got.mitWithheld, want.mit);
    assert.equal(got.totalWithheld, want.total);
    assert.equal(got.netCashDistribution, want.net);
  }

  assert.deepEqual(allocation.totals, {
    grossCashDistribution: 11_651,
    totalWithheld: 2_452,
    netCashDistribution: 9_199,
  });

  const recon = reconcileWithholding({ allocation, remittedToAto: 2_452, statementsIssued: 6 });
  assert.equal(recon.variance, 0);
  assert.equal(recon.findings.length, 0);
});

test("withholding reconciliation flags remittance and statement-count mismatches", () => {
  const allocation = { totals: { totalWithheld: 2_452 }, members: [{}, {}, {}, {}, {}, {}] } as Parameters<typeof reconcileWithholding>[0]["allocation"];
  const recon = reconcileWithholding({ allocation, remittedToAto: 2_450, statementsIssued: 5 });
  assert.equal(recon.withheldPerRegister, 2_452);
  assert.equal(recon.variance, -2);
  assert.equal(recon.expectedStatements, 6);
  assert.equal(recon.findings.length, 2);
});

test("single-member and zero-unit boundaries allocate exactly what hand arithmetic says", () => {
  const zeroPayout = computeDistribution({
    trustRegime: "MIT",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    recordDate: "2026-09-30",
    incomeYearEnd: "2027-06-30",
    unitsOutstanding: 100,
    distributableIncome: 1_000,
    componentPools: { OTHER_AU_INCOME: 1_000 },
    policy: { distributableIncomePayoutBps: 0, dpuDecimals: 4 },
  });
  assert.equal(zeroPayout.declaredCashDistribution, 0);

  const single = computeDistribution({
    trustRegime: "MIT",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    recordDate: "2026-09-30",
    incomeYearEnd: "2027-06-30",
    unitsOutstanding: 1,
    distributableIncome: 123,
    componentPools: { OTHER_AU_INCOME: 123 },
    policy: { distributableIncomePayoutBps: 10_000, dpuDecimals: 4 },
  });
  const singleAlloc = allocateDistributionToMembers({
    trustRegime: "MIT",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    recordDate: "2026-09-30",
    incomeYearEnd: "2027-06-30",
    unitsOutstanding: 1,
    distributableIncome: 123,
    componentPools: { OTHER_AU_INCOME: 123 },
    policy: { distributableIncomePayoutBps: 10_000, dpuDecimals: 4 },
    distribution: single,
    members: [
      { memberId: "ONE", displayName: "One", profile: { memberClass: "RESIDENT_COMPANY", quotedAbn: true }, unitsHeldOnRecordDate: 1 },
      { memberId: "ZERO", displayName: "Zero", profile: { memberClass: "RESIDENT_COMPANY", quotedAbn: true }, unitsHeldOnRecordDate: 0 },
    ],
  });
  assert.equal(single.declaredCashDistribution, 123);
  assert.equal(singleAlloc.members[0]!.grossCashDistribution, 123);
  assert.equal(singleAlloc.members[1]!.grossCashDistribution, 0);
});

test("retained cash should not exceed the cash available to retain", () => {
  // Hand arithmetic: if only A$100.00 is available and the policy says retain A$200.00,
  // the maximum retainable amount is A$100.00 and the declared cash distribution is A$0.00.
  const r = computeDistribution({
    trustRegime: "MIT",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    recordDate: "2026-09-30",
    incomeYearEnd: "2027-06-30",
    unitsOutstanding: 100,
    distributableIncome: 10_000,
    componentPools: { OTHER_AU_INCOME: 10_000 },
    policy: { distributableIncomePayoutBps: 10_000, retainedCashAmount: 20_000, dpuDecimals: 4 },
  });
  assert.equal(r.declaredCashDistribution, 0);
  assert.equal(r.retainedCash, 10_000);
  assert.equal(r.findings.length, 0);
});

test("negative component pools should be rejected, not silently zeroed", () => {
  assert.throws(
    () => computeDistribution({
      trustRegime: "MIT",
      periodStart: "2026-07-01",
      periodEnd: "2026-09-30",
      recordDate: "2026-09-30",
      incomeYearEnd: "2027-06-30",
      unitsOutstanding: 100,
      distributableIncome: 10_000,
      componentPools: { OTHER_AU_INCOME: -1 },
      policy: { distributableIncomePayoutBps: 10_000, dpuDecimals: 4 },
    }),
    RangeError,
  );
});

// Touch constants so TS keeps the source URLs explicit in the file.
void [
  URL_MIT_FACT_SHEET,
  URL_MIT_WITHHOLDING,
  URL_WITHHOLDING_FOR_MITS,
  URL_BTR,
  URL_INVESTMENT_INCOME,
  URL_AMIT_REPORTING,
  URL_AMMA_EXAMPLE,
  URL_AMMA_GUIDANCE,
  URL_AMMA_ABOUT,
  URL_ATTRIBUTION,
];
