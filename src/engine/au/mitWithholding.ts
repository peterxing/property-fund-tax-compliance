import { addDays, addMonths, type ISODate } from "../dates.ts";
import { mulBps, type Cents } from "../money.ts";
import type { RuleEntry } from "../rules.ts";
import { ENGINE_DISCLAIMER_AU } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";
import { annualNoticeRetentionEnd, determineMemberWithholding, type AuMemberProfile } from "./members.ts";
import type { AuTaxRegime } from "./types.ts";

export interface MitFundPaymentBreakdown {
  ordinaryFundPayment: Cents;
  cleanBuildingFundPayment?: Cents;
  buildToRentFundPayment?: Cents;
  ncmiFundPayment?: Cents;
  excludedFromNcmiFundPayment?: Cents;
  excludedDirAmounts?: Cents;
  excludedForeignSourceAmounts?: Cents;
  excludedNonTapCapitalGains?: Cents;
}

export interface ComputeMitWithholdingInput {
  paymentDate: ISODate;
  incomeYearEnd: ISODate;
  trustRegime: Extract<AuTaxRegime, "MIT" | "AMIT">;
  withholdingMit?: boolean;
  member: AuMemberProfile;
  paymentAmount: Cents;
  fundPaymentBreakdown: MitFundPaymentBreakdown;
  paymentAttributedToAustralianPermanentEstablishment?: boolean;
}

export interface ComputeMitWithholdingResult {
  totalFundPayment: Cents;
  withholdingAmount: Cents;
  finalTax: boolean;
  rateBps: number;
  requiresNotice: boolean;
  breakdown: Required<MitFundPaymentBreakdown>;
  memberOutcome: ReturnType<typeof determineMemberWithholding>;
  working: ComputationLine[];
  findings: Finding[];
  notes: string[];
}

export interface FundPaymentNoticeInput {
  payerName: string;
  payerAbn?: string;
  recipientName: string;
  recipientMemberClass: AuMemberProfile["memberClass"];
  paymentDate: ISODate;
  incomeYearEnd: ISODate;
  breakdown: MitFundPaymentBreakdown;
  withholdingAmount?: Cents;
  cleanBuildingMit?: boolean;
}

export interface FundPaymentNotice {
  payerName: string;
  payerAbn?: string;
  recipientName: string;
  recipientMemberClass: AuMemberProfile["memberClass"];
  paymentDate: ISODate;
  incomeYearEnd: ISODate;
  dueDate: ISODate;
  retainOnWebsiteUntil: ISODate;
  content: {
    amountSubjectToMitWithholding: Cents;
    cleanBuildingMit: boolean;
    incomeYearEnd: ISODate;
    ordinaryFundPayment: Cents;
    cleanBuildingFundPayment: Cents;
    buildToRentFundPayment: Cents;
    ncmiFundPayment: Cents;
    excludedFromNcmiFundPayment: Cents;
    amountWithheld: Cents;
  };
  notes: string[];
}

export type PaygRemitterSize = "SMALL" | "MEDIUM";

function assertCents(value: number | undefined, label: string): Cents {
  const amount = value ?? 0;
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError(`${label} must be a non-negative integer number of cents, got ${value}`);
  return amount;
}

function normaliseBreakdown(input: MitFundPaymentBreakdown): Required<MitFundPaymentBreakdown> {
  return {
    ordinaryFundPayment: assertCents(input.ordinaryFundPayment, "ordinaryFundPayment"),
    cleanBuildingFundPayment: assertCents(input.cleanBuildingFundPayment, "cleanBuildingFundPayment"),
    buildToRentFundPayment: assertCents(input.buildToRentFundPayment, "buildToRentFundPayment"),
    ncmiFundPayment: assertCents(input.ncmiFundPayment, "ncmiFundPayment"),
    excludedFromNcmiFundPayment: assertCents(input.excludedFromNcmiFundPayment, "excludedFromNcmiFundPayment"),
    excludedDirAmounts: assertCents(input.excludedDirAmounts, "excludedDirAmounts"),
    excludedForeignSourceAmounts: assertCents(input.excludedForeignSourceAmounts, "excludedForeignSourceAmounts"),
    excludedNonTapCapitalGains: assertCents(input.excludedNonTapCapitalGains, "excludedNonTapCapitalGains"),
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function mitFundPaymentNoticeDueDate(paymentDate: ISODate): ISODate {
  return paymentDate;
}

export function mitAiirDueDate(incomeYearEnd: ISODate): ISODate {
  return addDays(addMonths(incomeYearEnd, 6), 15);
}

export function mitWithholdingRemittanceDueDate(periodEnd: ISODate, remitterSize: PaygRemitterSize): ISODate {
  if (remitterSize === "MEDIUM") {
    const nextMonth = addMonths(periodEnd, 1);
    return `${nextMonth.slice(0, 8)}21`;
  }
  const monthDay = periodEnd.slice(5);
  if (monthDay === "09-30") return `${periodEnd.slice(0, 4)}-10-28`;
  if (monthDay === "12-31") return `${String(Number(periodEnd.slice(0, 4)) + 1)}-02-28`;
  if (monthDay === "03-31") return `${periodEnd.slice(0, 4)}-04-28`;
  if (monthDay === "06-30") return `${periodEnd.slice(0, 4)}-07-28`;
  throw new RangeError(`periodEnd ${periodEnd} is not a supported month-end for a quarterly remitter`);
}

export function computeMitWithholding(input: ComputeMitWithholdingInput): ComputeMitWithholdingResult {
  const breakdown = normaliseBreakdown(input.fundPaymentBreakdown);
  const totalFundPayment = sum([
    breakdown.ordinaryFundPayment,
    breakdown.cleanBuildingFundPayment,
    breakdown.buildToRentFundPayment,
    breakdown.ncmiFundPayment,
    breakdown.excludedFromNcmiFundPayment,
  ]);
  const findings: Finding[] = [];
  const notes: string[] = [];
  const working: ComputationLine[] = [
    { code: "AU.MIT.FUND_PAYMENT", label: "Total fund payment", amount: totalFundPayment, kind: "TOTAL", source: "RULE", ref: "Fund payment guidance and section 12A-110 TAA 1953 for AMITs" },
  ];
  if (totalFundPayment > input.paymentAmount) {
    findings.push({
      id: "AU.MIT.FUND_PAYMENT_EXCEEDS_CASH",
      severity: "WARNING",
      message: "The fund payment exceeds the current cash payment. This can happen for AMIT deemed payments, but should be reviewed for ordinary cash distributions.",
      data: { totalFundPayment, paymentAmount: input.paymentAmount },
    });
  }
  const memberOutcome = determineMemberWithholding({
    trustRegime: input.trustRegime,
    paymentDate: input.paymentDate,
    member: input.member,
    actualCashPayment: input.paymentAmount,
    withholdingMit: input.withholdingMit,
    paymentAttributedToAustralianPermanentEstablishment: input.paymentAttributedToAustralianPermanentEstablishment,
    mitRateBuckets: breakdown,
  });
  working.push(...memberOutcome.working);
  if (breakdown.excludedDirAmounts > 0 || breakdown.excludedForeignSourceAmounts > 0 || breakdown.excludedNonTapCapitalGains > 0) {
    notes.push("Excluded amounts are tracked for reconciliation only and are not subject to MIT fund-payment withholding.");
  }
  return {
    totalFundPayment,
    withholdingAmount: memberOutcome.withholdingAmount,
    finalTax: memberOutcome.finalTax,
    rateBps: memberOutcome.rateBps,
    requiresNotice: memberOutcome.requiresNotice,
    breakdown,
    memberOutcome,
    working,
    findings: [...findings, ...memberOutcome.findings],
    notes: [...notes, ...memberOutcome.notes],
  };
}

export function buildFundPaymentNotice(input: FundPaymentNoticeInput): FundPaymentNotice {
  const breakdown = normaliseBreakdown(input.breakdown);
  const amountSubjectToMitWithholding = sum([
    breakdown.ordinaryFundPayment,
    breakdown.cleanBuildingFundPayment,
    breakdown.buildToRentFundPayment,
    breakdown.ncmiFundPayment,
    breakdown.excludedFromNcmiFundPayment,
  ]);
  return {
    payerName: input.payerName,
    payerAbn: input.payerAbn,
    recipientName: input.recipientName,
    recipientMemberClass: input.recipientMemberClass,
    paymentDate: input.paymentDate,
    incomeYearEnd: input.incomeYearEnd,
    dueDate: mitFundPaymentNoticeDueDate(input.paymentDate),
    retainOnWebsiteUntil: annualNoticeRetentionEnd(input.paymentDate),
    content: {
      amountSubjectToMitWithholding,
      cleanBuildingMit: input.cleanBuildingMit === true || breakdown.cleanBuildingFundPayment > 0,
      incomeYearEnd: input.incomeYearEnd,
      ordinaryFundPayment: breakdown.ordinaryFundPayment,
      cleanBuildingFundPayment: breakdown.cleanBuildingFundPayment,
      buildToRentFundPayment: breakdown.buildToRentFundPayment,
      ncmiFundPayment: breakdown.ncmiFundPayment,
      excludedFromNcmiFundPayment: breakdown.excludedFromNcmiFundPayment,
      amountWithheld: input.withholdingAmount ?? 0,
    },
    notes: [
      "The ATO guidance requires the notice or website disclosure at or before payment and the information must remain available for 5 continuous years if published on a website.",
      "The notice identifies the part of the payment from which withholding would have been required, whether the payment is attributable to a clean building MIT, and the income year to which it relates.",
    ],
  };
}

export const RULES = [
  {
    id: "au-mit.fund-payment-definition-and-notice.2016-plus",
    domain: "AU_MIT",
    title: "MIT fund payments, notices and payment statements",
    summary:
      "Fund payments broadly comprise Australian-source MIT net income excluding dividends, interest, royalties, foreign-source amounts and gains on non-taxable Australian property. MITs and intermediaries must withhold, or otherwise notify and disclose the relevant amount at or before payment, and website disclosures must remain available for 5 continuous years.",
    effectiveFrom: "2016-05-05",
    sources: [
      { title: "ATO | Withholding tax arrangements for managed investment trust fund payments", url: "https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/in-detail/investing-in-australia/withholding-tax-arrangements-for-managed-investment-trust-fund-payments", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Withholding on fund payments for MITs", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/withholding-rules/withholding-on-fund-payments-for-mits", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Withholding for MITs", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/withholding-rules/withholding-for-mits", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes:
      "The engine outputs structured notice content rather than a PDF. Payment summaries are modelled as statement data, not ATO-prescribed forms, because the ATO says the format is not prescribed provided the minimum fields are present.",
  },
  {
    id: "au-mit.reporting-due-dates.2026",
    domain: "AU_FILING",
    title: "MIT AIIR and PAYG withholding due dates",
    summary:
      "Investment bodies generally lodge the AIIR by 31 October, but MIT fund-payment withholding information is due within 6 months and 14 days after the MIT income year. Small withholders report and pay quarterly on activity statements and medium withholders monthly.",
    effectiveFrom: "2026-07-01",
    sources: [
      { title: "ATO | Due date for the AIIR", url: "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/third-party-reporting/annual-investment-income-report/due-date-for-the-aiir", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Paying and reporting PAYG withholding amounts for small and medium withholders", url: "https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/payg-withholding/paying-and-reporting-withheld-amounts/paying-and-reporting-payg-withholding-amounts-for-small-and-medium-withholders", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Due dates for lodging and paying your BAS", url: "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas/due-dates-for-lodging-and-paying-your-bas", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes:
      "This helper assumes standard monthly or quarterly activity-statement cycles and does not attempt to model agent concessions or bespoke extension approvals.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER_AU];
