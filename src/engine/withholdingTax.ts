import type { ISODate } from "./dates.ts";
import { addDays, addMonths, compareISO, toISO } from "./dates.ts";
import type { Bps, Cents } from "./money.ts";
import { mulBps } from "./money.ts";
import type { RuleEntry } from "./rules.ts";
import { ENGINE_DISCLAIMER, RuleNotFoundError } from "./rules.ts";
import type { Finding } from "./types.ts";

export type WithholdingTaxPaymentType =
  | "INTEREST"
  | "ROYALTY"
  | "DIRECTOR_FEES"
  | "TECHNICAL_SERVICE_FEES"
  | "MANAGEMENT_FEES"
  | "CONSULTANCY_PROFESSIONAL_FEES"
  | "RENT_MOVABLE_PROPERTY"
  | "BRANCH_PROFIT_REMITTANCE"
  | "NON_RESIDENT_PUBLIC_ENTERTAINER"
  | "OTHER_SECTION_45";

export const WITHHOLDING_PAYMENT_TYPES = [
  { id: "INTEREST", label: "Interest", description: "Interest, commissions, fees or other payments connected with indebtedness.", usesServicePlace: false },
  { id: "ROYALTY", label: "Royalty", description: "Royalties and similar payments for the use of, or right to use, intellectual property or know-how.", usesServicePlace: false },
  { id: "DIRECTOR_FEES", label: "Director's fees", description: "Director's fees paid to a non-resident director.", usesServicePlace: false },
  { id: "TECHNICAL_SERVICE_FEES", label: "Technical service fees", description: "Technical-assistance or technical-service fees; place of performance matters.", usesServicePlace: true },
  { id: "MANAGEMENT_FEES", label: "Management fees", description: "Management or support-service fees; place of performance matters.", usesServicePlace: true },
  {
    id: "CONSULTANCY_PROFESSIONAL_FEES",
    label: "Consultancy / professional fees",
    description: "Consultancy or professional fees to non-residents; place of performance matters.",
    usesServicePlace: true,
  },
  { id: "RENT_MOVABLE_PROPERTY", label: "Rent of movable property", description: "Rent or hire charges for movable property.", usesServicePlace: false },
  { id: "BRANCH_PROFIT_REMITTANCE", label: "Branch profit remittance", description: "Branch profit remittance profile (current domestic rate modelled at nil).", usesServicePlace: false },
  {
    id: "NON_RESIDENT_PUBLIC_ENTERTAINER",
    label: "Non-resident public entertainer",
    description: "Income of a non-resident public entertainer under the specific IRAS rate line.",
    usesServicePlace: false,
  },
  { id: "OTHER_SECTION_45", label: "Other Section 45 payment", description: "Residual Section 45 payment bucket when a more specific category is not selected.", usesServicePlace: false },
] as const satisfies readonly { id: WithholdingTaxPaymentType; label: string; description: string; usesServicePlace: boolean }[];

export interface ComputeWithholdingTaxInput {
  paymentDate: ISODate;
  grossPayment: Cents;
  paymentType: WithholdingTaxPaymentType;
  servicePerformedInSingapore?: boolean;
  treatyRateBps?: Bps;
  remittedDate?: ISODate;
  exemptions?: {
    exemptUnderDomesticLaw?: boolean;
    taxNotApplicableByFactPattern?: boolean;
  };
}

export interface WithholdingTaxBreakdown {
  component: string;
  label: string;
  rateBps: Bps;
  taxableAmount: Cents;
  tax: Cents;
}

export interface LatePenaltyBreakdown {
  dueDate: ISODate;
  lateDays: number;
  basePenalty: Cents;
  monthlyPenalty: Cents;
  totalPenalty: Cents;
}

export interface ComputeWithholdingTaxResult {
  grossPayment: Cents;
  statutoryRateBps: Bps;
  effectiveRateBps: Bps;
  tax: Cents;
  netPaymentIfTaxWithheldFromGross: Cents;
  dueDate: ISODate;
  latePenalty: LatePenaltyBreakdown | null;
  ruleVersion: string;
  breakdown: WithholdingTaxBreakdown[];
  notes: string[];
  findings: Finding[];
}

interface WhtRateRule {
  from: ISODate;
  to?: ISODate;
  rates: Record<WithholdingTaxPaymentType, Bps>;
  ruleVersion: string;
}

const WHT_RATES: readonly WhtRateRule[] = [
  {
    from: "2022-01-01",
    ruleVersion: "withholding-tax.current",
    rates: {
      INTEREST: 1500,
      ROYALTY: 1000,
      DIRECTOR_FEES: 2400,
      TECHNICAL_SERVICE_FEES: 1700,
      MANAGEMENT_FEES: 1700,
      CONSULTANCY_PROFESSIONAL_FEES: 1500,
      RENT_MOVABLE_PROPERTY: 1500,
      BRANCH_PROFIT_REMITTANCE: 0,
      NON_RESIDENT_PUBLIC_ENTERTAINER: 1500,
      OTHER_SECTION_45: 1500,
    },
  },
];

function pickRule(date: ISODate): WhtRateRule {
  const row = WHT_RATES.find((candidate) => candidate.from <= date && (candidate.to === undefined || date <= candidate.to));
  if (!row) throw new RuleNotFoundError("Withholding tax rates", date);
  return row;
}

export function withholdingTaxDueDate(paymentDate: ISODate): ISODate {
  const secondMonth = addMonths(paymentDate, 2);
  const [year, month] = secondMonth.split("-").map(Number);
  return toISO(year!, month!, 15);
}

function diffDays(a: ISODate, b: ISODate): number {
  return Math.max(0, Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000));
}

function computeLatePenalty(tax: Cents, dueDate: ISODate, remittedDate: ISODate): LatePenaltyBreakdown | null {
  if (compareISO(remittedDate, dueDate) <= 0 || tax <= 0) return null;
  const lateDays = diffDays(dueDate, remittedDate);
  const basePenalty = mulBps(tax, 500);
  const monthsAfterThirty = Math.ceil(Math.max(0, lateDays - 30) / 30);
  const monthlyPenalty = mulBps(tax, Math.min(monthsAfterThirty, 10) * 100);
  return { dueDate, lateDays, basePenalty, monthlyPenalty, totalPenalty: basePenalty + monthlyPenalty };
}

export function computeWithholdingTax(input: ComputeWithholdingTaxInput): ComputeWithholdingTaxResult {
  if (input.paymentDate < "2022-01-01") throw new RangeError("Withholding tax is only modelled from 2022-01-01.");
  const findings: Finding[] = [];
  const notes = [
    ENGINE_DISCLAIMER,
    "Treaty relief is not embedded. Provide treatyRateBps only after confirming beneficial ownership, limitation-on-benefits conditions and treaty article scope.",
    "For technical, management and service fees, this module follows IRAS' territorial rule: WHT applies only to work done in Singapore unless a specific deeming provision or exemption applies.",
  ];
  if (input.exemptions?.taxNotApplicableByFactPattern) {
    return {
      grossPayment: input.grossPayment,
      statutoryRateBps: 0,
      effectiveRateBps: 0,
      tax: 0,
      netPaymentIfTaxWithheldFromGross: input.grossPayment,
      dueDate: withholdingTaxDueDate(input.paymentDate),
      latePenalty: null,
      ruleVersion: "withholding-tax.fact-pattern.not-applicable",
      breakdown: [],
      notes,
      findings: [{ id: "WHT.NOT_APPLICABLE", severity: "INFO", message: "The fact pattern was marked as outside Section 45 withholding tax." }],
    };
  }

  const rule = pickRule(input.paymentDate);
  let statutoryRateBps = rule.rates[input.paymentType];
  if (input.exemptions?.exemptUnderDomesticLaw) statutoryRateBps = 0;
  if (
    (input.paymentType === "TECHNICAL_SERVICE_FEES" || input.paymentType === "MANAGEMENT_FEES" || input.paymentType === "CONSULTANCY_PROFESSIONAL_FEES") &&
    input.servicePerformedInSingapore === false
  ) {
    statutoryRateBps = 0;
    findings.push({ id: "WHT.SERVICE_OUTSIDE_SINGAPORE", severity: "INFO", message: "Service-fee withholding was reduced to nil because the work was stated to be performed wholly outside Singapore." });
  }
  const effectiveRateBps = input.treatyRateBps === undefined ? statutoryRateBps : Math.min(statutoryRateBps, input.treatyRateBps);
  if (input.treatyRateBps !== undefined && input.treatyRateBps > statutoryRateBps) {
    findings.push({ id: "WHT.TREATY_HIGHER_THAN_DOMESTIC", severity: "WARNING", message: "The supplied treaty rate is higher than the domestic rate, so the domestic rate was used." });
  }
  const tax = mulBps(Math.max(0, input.grossPayment), effectiveRateBps);
  const dueDate = withholdingTaxDueDate(input.paymentDate);
  const latePenalty = input.remittedDate ? computeLatePenalty(tax, dueDate, input.remittedDate) : null;
  if (latePenalty) {
    findings.push({
      id: "WHT.LATE_PAYMENT",
      severity: "WARNING",
      message: "The remittance date is after the IRAS due date, so late-payment penalties apply.",
      data: { lateDays: latePenalty.lateDays, basePenalty: latePenalty.basePenalty, monthlyPenalty: latePenalty.monthlyPenalty },
    });
  }
  if (input.paymentType === "INTEREST") {
    findings.push({
      id: "WHT.INTEREST_EXEMPTIONS_REVIEW",
      severity: "INFO",
      message: "Check whether the interest qualifies for a domestic exemption or concession (for example, approved foreign loans or specified tax incentives). This engine does not infer those approvals.",
    });
  }
  return {
    grossPayment: input.grossPayment,
    statutoryRateBps: rule.rates[input.paymentType],
    effectiveRateBps,
    tax,
    netPaymentIfTaxWithheldFromGross: input.grossPayment - tax,
    dueDate,
    latePenalty,
    ruleVersion: rule.ruleVersion,
    breakdown: [{ component: input.paymentType, label: "Section 45 withholding tax", rateBps: effectiveRateBps, taxableAmount: input.grossPayment, tax }],
    notes,
    findings,
  };
}

export const RULES: RuleEntry[] = [
  {
    id: "withholding-tax.rates.current",
    domain: "WITHHOLDING_TAX",
    title: "Core Section 45 withholding tax rates",
    summary:
      "This module models the main domestic WHT rates visible on the IRAS withholding-tax pages as at 2026-10-09: interest 15%, royalties 10%, director's fees 24%, technical/service/management fees at the prevailing corporate rate (17% currently for companies), non-resident professional gross withholding 15%, rent of movable property 15%, non-resident public entertainers 15%, and branch remittance nil.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    notes: "This module does not separately model the professional net-income election or the REIT-distribution withholding categories shown on the IRAS rates page.",
    sources: [
      { title: "IRAS | Types of Payment and Withholding Tax (WHT) Rates", url: "https://www.iras.gov.sg/taxes/withholding-tax/basics-of-withholding-tax/types-of-payment-and-withholding-tax-rates", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | Payments that are Subject to Withholding Tax", url: "https://www.iras.gov.sg/taxes/withholding-tax/payments-to-non-resident-company/payments-that-are-subject-to-withholding-tax", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | Tax obligations for non-resident professional", url: "https://www.iras.gov.sg/taxes/withholding-tax/payments-to-non-resident-professional-(consultant-trainer-coach-etc-)/tax-obligations-for-non-resident-professional", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | Tax for Non-Resident Directors", url: "https://www.iras.gov.sg/taxes/withholding-tax/payments-to-non-resident-director/tax-obligations-for-non-resident-director", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | Tax obligations of non-resident public entertainer", url: "https://www.iras.gov.sg/taxes/withholding-tax/payments-to-non-resident-public-entertainer-(artiste-musician-sportsman-etc-)/tax-obligations-of-non-resident-public-entertainer", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
  },
  {
    id: "withholding-tax.service-place.current",
    domain: "WITHHOLDING_TAX",
    title: "Territorial rule for service fees",
    summary: "Management, technical-assistance, consultancy and professional fees are generally subject to WHT only to the extent the services are rendered in Singapore unless a deeming rule or incentive changes the outcome.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [{ title: "IRAS | Tax obligations for non-resident professional", url: "https://www.iras.gov.sg/taxes/withholding-tax/payments-to-non-resident-professional-(consultant-trainer-coach-etc-)/tax-obligations-for-non-resident-professional", retrieved: "2026-10-09", publisher: "IRAS" }],
  },
  {
    id: "withholding-tax.deadline.current",
    domain: "WITHHOLDING_TAX",
    title: "WHT remittance due date",
    summary: "Withholding tax is due to IRAS by the 15th day of the second month from the date of payment to the non-resident.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [{ title: "IRAS | Withholding Tax (WHT) filing and payment due date", url: "https://www.iras.gov.sg/taxes/withholding-tax/withholding-tax-filing/withholding-tax-filing-and-payment-due-date", retrieved: "2026-10-09", publisher: "IRAS" }],
  },
  {
    id: "withholding-tax.penalty.current",
    domain: "WITHHOLDING_TAX",
    title: "Late-payment penalties for WHT",
    summary: "IRAS imposes a 5% late-payment penalty and, if the tax remains unpaid after 30 days, an additional 1% per completed month up to 15% in total.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [{ title: "IRAS | Late payment and non-payment of taxes", url: "https://www.iras.gov.sg/taxes/withholding-tax/withholding-tax-payments/late-payment-and-non-payment-of-taxes", retrieved: "2026-10-09", publisher: "IRAS" }],
  },
  {
    id: "withholding-tax.treaty.override",
    domain: "WITHHOLDING_TAX",
    title: "Treaty override input",
    summary: "The engine accepts a treaty rate override but does not embed any treaty table or beneficial-ownership logic.",
    effectiveFrom: "2022-01-01",
    confidence: "ASSUMPTION",
    notes: "Users must confirm treaty entitlement outside the engine before passing treatyRateBps.",
    sources: [{ title: "IRAS | Claim of relief under the Avoidance of Double Taxation Agreement (DTA)", url: "https://www.iras.gov.sg/taxes/withholding-tax/withholding-tax-filing/claim-of-relief-under-the-avoidance-of-double-taxation-agreement-(dta)", retrieved: "2026-10-09", publisher: "IRAS" }],
  },
];
