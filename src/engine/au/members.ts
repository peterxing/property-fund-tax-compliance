import { addYears, type ISODate } from "../dates.ts";
import { mulBps, type Bps, type Cents } from "../money.ts";
import type { RuleEntry, Effective } from "../rules.ts";
import { ENGINE_DISCLAIMER_AU, requireEffective } from "../rules.ts";
import type { Finding, ComputationLine } from "../types.ts";
import type { AuTaxRegime } from "./types.ts";

export type AuMemberClass =
  | "RESIDENT_INDIVIDUAL"
  | "RESIDENT_COMPANY"
  | "COMPLYING_SUPER_FUND"
  | "SMSF"
  | "OTHER_RESIDENT_TRUST"
  | "FOREIGN_INDIVIDUAL_EOI"
  | "FOREIGN_INDIVIDUAL_NON_EOI"
  | "FOREIGN_COMPANY_EOI"
  | "FOREIGN_COMPANY_NON_EOI"
  | "FOREIGN_FUND_EOI"
  | "FOREIGN_FUND_NON_EOI"
  | "FOREIGN_PENSION_EOI"
  | "FOREIGN_PENSION_NON_EOI"
  | "FOREIGN_SOVEREIGN_EOI"
  | "FOREIGN_SOVEREIGN_NON_EOI"
  | "CUSTODIAN"
  | "NOMINEE";

export const AU_MEMBER_CLASSES = [
  { id: "RESIDENT_INDIVIDUAL", label: "Resident individual", description: "Australian resident individual unitholder." },
  { id: "RESIDENT_COMPANY", label: "Resident company", description: "Australian resident company or corporate unitholder." },
  { id: "COMPLYING_SUPER_FUND", label: "Complying super fund", description: "APRA-regulated complying superannuation fund." },
  { id: "SMSF", label: "SMSF", description: "Resident self-managed superannuation fund." },
  { id: "OTHER_RESIDENT_TRUST", label: "Other resident trust", description: "Australian resident trust or estate member." },
  { id: "FOREIGN_INDIVIDUAL_EOI", label: "Foreign individual (EOI country)", description: "Foreign individual resident in an information-exchange country." },
  { id: "FOREIGN_INDIVIDUAL_NON_EOI", label: "Foreign individual (non-EOI country)", description: "Foreign individual resident outside the information-exchange-country list." },
  { id: "FOREIGN_COMPANY_EOI", label: "Foreign company (EOI country)", description: "Foreign company resident in an information-exchange country." },
  { id: "FOREIGN_COMPANY_NON_EOI", label: "Foreign company (non-EOI country)", description: "Foreign company resident outside the information-exchange-country list." },
  { id: "FOREIGN_FUND_EOI", label: "Foreign fund (EOI country)", description: "Foreign fund or collective vehicle resident in an information-exchange country." },
  { id: "FOREIGN_FUND_NON_EOI", label: "Foreign fund (non-EOI country)", description: "Foreign fund or collective vehicle resident outside the information-exchange-country list." },
  { id: "FOREIGN_PENSION_EOI", label: "Foreign pension (EOI country)", description: "Foreign pension or retirement vehicle resident in an information-exchange country." },
  { id: "FOREIGN_PENSION_NON_EOI", label: "Foreign pension (non-EOI country)", description: "Foreign pension or retirement vehicle resident outside the information-exchange-country list." },
  { id: "FOREIGN_SOVEREIGN_EOI", label: "Foreign sovereign (EOI country)", description: "Foreign government or sovereign entity resident in an information-exchange country." },
  { id: "FOREIGN_SOVEREIGN_NON_EOI", label: "Foreign sovereign (non-EOI country)", description: "Foreign government or sovereign entity resident outside the information-exchange-country list." },
  { id: "CUSTODIAN", label: "Custodian", description: "Custodian or depository intermediary; beneficial-owner look-through is needed for withholding." },
  { id: "NOMINEE", label: "Nominee", description: "Nominee holder; beneficial-owner look-through is needed for withholding." },
] as const satisfies readonly { id: AuMemberClass; label: string; description: string }[];

export type AuWithholdingScenario =
  | "NONE"
  | "TFN_ABN_WITHHOLDING"
  | "MIT_FUND_PAYMENT_WITHHOLDING"
  | "NOTICE_ONLY"
  | "TRUSTEE_ASSESSED_NON_RESIDENT";

export const AU_WITHHOLDING_SCENARIOS = [
  { id: "NONE", label: "No withholding", description: "No cash withholding is required for the member and payment." },
  { id: "TFN_ABN_WITHHOLDING", label: "TFN or ABN withholding", description: "Resident investment-body withholding where no TFN or ABN is quoted." },
  { id: "MIT_FUND_PAYMENT_WITHHOLDING", label: "MIT fund payment withholding", description: "Final MIT withholding on the fund payment part of a payment to a foreign resident." },
  { id: "NOTICE_ONLY", label: "Notice only", description: "No withholding, but a MIT or intermediary should notify the recipient of the amount that would have been withheld." },
  { id: "TRUSTEE_ASSESSED_NON_RESIDENT", label: "Trustee assessed for foreign resident", description: "Outside the MIT withholding regime, the trustee is taxed under the general trust rules or the non-withholding AMIT rules." },
] as const satisfies readonly { id: AuWithholdingScenario; label: string; description: string }[];

export interface AuMemberProfile {
  memberClass: AuMemberClass;
  quotedTfn?: boolean;
  quotedAbn?: boolean;
  tfnExempt?: boolean;
  countryOfResidence?: string;
  beneficialOwner?: Omit<AuMemberProfile, "beneficialOwner">;
}

export interface AuMitRateBuckets {
  ordinaryFundPayment?: Cents;
  cleanBuildingFundPayment?: Cents;
  buildToRentFundPayment?: Cents;
  ncmiFundPayment?: Cents;
  excludedFromNcmiFundPayment?: Cents;
}

export interface DetermineMemberWithholdingInput {
  trustRegime: AuTaxRegime;
  paymentDate: ISODate;
  member: AuMemberProfile;
  actualCashPayment?: Cents;
  tfnWithholdingBase?: Cents;
  returnOfCapitalOnly?: boolean;
  withholdingMit?: boolean;
  paymentAttributedToAustralianPermanentEstablishment?: boolean;
  mitRateBuckets?: AuMitRateBuckets;
}

export interface DetermineMemberWithholdingResult {
  effectiveMemberClass: AuMemberClass;
  scenario: AuWithholdingScenario;
  rateBps: Bps;
  withholdingAmount: Cents;
  finalTax: boolean;
  requiresNotice: boolean;
  creditLabel?: "13R" | "13A";
  working: ComputationLine[];
  findings: Finding[];
  notes: string[];
  bucketRates?: Record<string, Bps>;
}

interface MitRateRow {
  ordinaryEoiBps: Bps;
  ordinaryNonEoiBps: Bps;
  cleanBuildingEoiBps: Bps;
}

const TFN_WITHHOLDING_RATES: readonly Effective<Bps>[] = [
  { from: "2014-07-01", to: "2017-06-30", value: 4900 },
  { from: "2017-07-01", value: 4700 },
] as const;

const MIT_WITHHOLDING_RATES: readonly Effective<MitRateRow>[] = [
  { from: "2008-07-01", to: "2009-06-30", value: { ordinaryEoiBps: 2250, ordinaryNonEoiBps: 3000, cleanBuildingEoiBps: 2250 } },
  { from: "2009-07-01", to: "2010-06-30", value: { ordinaryEoiBps: 1500, ordinaryNonEoiBps: 3000, cleanBuildingEoiBps: 1500 } },
  { from: "2010-07-01", to: "2012-06-30", value: { ordinaryEoiBps: 750, ordinaryNonEoiBps: 3000, cleanBuildingEoiBps: 750 } },
  { from: "2012-07-01", value: { ordinaryEoiBps: 1500, ordinaryNonEoiBps: 3000, cleanBuildingEoiBps: 1000 } },
] as const;

const NCMI_WITHHOLDING_RATES: readonly Effective<Bps>[] = [
  { from: "2019-07-01", value: 3000 },
] as const;

const BTR_WITHHOLDING_RATES: readonly Effective<Bps>[] = [
  { from: "2025-01-01", value: 1500 },
] as const;

function assertNonNegative(amount: number | undefined, label: string): Cents {
  const v = amount ?? 0;
  if (!Number.isSafeInteger(v) || v < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of cents, got ${amount}`);
  }
  return v;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function isForeign(memberClass: AuMemberClass): boolean {
  return memberClass.startsWith("FOREIGN_");
}

function isInformationExchangeCountry(memberClass: AuMemberClass): boolean {
  return memberClass.endsWith("_EOI") && !memberClass.endsWith("_NON_EOI");
}

function isIntermediary(memberClass: AuMemberClass): boolean {
  return memberClass === "CUSTODIAN" || memberClass === "NOMINEE";
}

function isResidentInvestor(memberClass: AuMemberClass): boolean {
  return !isForeign(memberClass) && !isIntermediary(memberClass);
}

function bucketRate(memberClass: AuMemberClass, paymentDate: ISODate, bucket: keyof Required<AuMitRateBuckets>): Bps {
  const isEoi = isInformationExchangeCountry(memberClass);
  if (bucket === "ncmiFundPayment") {
    return requireEffective(NCMI_WITHHOLDING_RATES, paymentDate, "NCMI MIT withholding rate");
  }
  if (bucket === "buildToRentFundPayment") {
    return isEoi ? requireEffective(BTR_WITHHOLDING_RATES, paymentDate, "Build-to-rent MIT withholding rate") : 3000;
  }
  const rates = requireEffective(MIT_WITHHOLDING_RATES, paymentDate, "MIT withholding rate");
  if (bucket === "cleanBuildingFundPayment") return isEoi ? rates.cleanBuildingEoiBps : rates.ordinaryNonEoiBps;
  return isEoi ? rates.ordinaryEoiBps : rates.ordinaryNonEoiBps;
}

function describeTrusteeTaxScenario(trustRegime: AuTaxRegime): string {
  if (trustRegime === "AMIT") {
    return "The trust is not treated as a withholding MIT for this payment, so foreign-resident amounts are dealt with through trustee assessment under the AMIT rules rather than MIT cash withholding.";
  }
  return "The trust is outside the MIT withholding regime, so foreign-resident amounts are ordinarily dealt with through trustee assessment and statement credits rather than cash withholding by the trust.";
}

export function determineMemberWithholding(input: DetermineMemberWithholdingInput): DetermineMemberWithholdingResult {
  const findings: Finding[] = [];
  const working: ComputationLine[] = [];
  const notes: string[] = [];
  const actualCashPayment = assertNonNegative(input.actualCashPayment, "actualCashPayment");
  const tfnWithholdingBase = assertNonNegative(input.tfnWithholdingBase, "tfnWithholdingBase");
  const fundPaymentAmount = sum(Object.values({
    ordinaryFundPayment: assertNonNegative(input.mitRateBuckets?.ordinaryFundPayment, "ordinaryFundPayment"),
    cleanBuildingFundPayment: assertNonNegative(input.mitRateBuckets?.cleanBuildingFundPayment, "cleanBuildingFundPayment"),
    buildToRentFundPayment: assertNonNegative(input.mitRateBuckets?.buildToRentFundPayment, "buildToRentFundPayment"),
    ncmiFundPayment: assertNonNegative(input.mitRateBuckets?.ncmiFundPayment, "ncmiFundPayment"),
    excludedFromNcmiFundPayment: assertNonNegative(input.mitRateBuckets?.excludedFromNcmiFundPayment, "excludedFromNcmiFundPayment"),
  }));
  const member = isIntermediary(input.member.memberClass) && input.member.beneficialOwner ? input.member.beneficialOwner : input.member;
  const effectiveMemberClass = member.memberClass;
  if (isIntermediary(input.member.memberClass) && !input.member.beneficialOwner) {
    findings.push({
      id: "AU.MEMBER.INTERMEDIARY_LOOKTHROUGH_REQUIRED",
      severity: "WARNING",
      message: "Custodians and nominees need beneficial-owner look-through data to determine final withholding correctly.",
    });
    return {
      effectiveMemberClass: input.member.memberClass,
      scenario: "NOTICE_ONLY",
      rateBps: 0,
      withholdingAmount: 0,
      finalTax: false,
      requiresNotice: true,
      working,
      findings,
      notes: ["No beneficial-owner profile was supplied, so the engine only flags the notice obligation."],
    };
  }

  if (isResidentInvestor(effectiveMemberClass)) {
    const quoted = member.quotedTfn === true || member.quotedAbn === true || member.tfnExempt === true;
    const residentMitNoticeRequired = (input.trustRegime === "MIT" || input.trustRegime === "AMIT") && fundPaymentAmount > 0;
    if (quoted || input.returnOfCapitalOnly === true || tfnWithholdingBase === 0) {
      if (!quoted && actualCashPayment > 0 && input.returnOfCapitalOnly === true) {
        notes.push("No TFN withholding applies where the payment consists only of tax-deferred or return-of-capital amounts.");
      }
      if (residentMitNoticeRequired) {
        notes.push("ATO withholding-for-MITs guidance says that if you are an Australian resident, a MIT or AMIT must notify you if the payment is a fund payment and state the amount that would have been subject to withholding if you were a non-resident.");
      }
      return {
        effectiveMemberClass,
        scenario: "NONE",
        rateBps: 0,
        withholdingAmount: 0,
        finalTax: false,
        requiresNotice: residentMitNoticeRequired,
        working,
        findings,
        notes,
      };
    }
    const rateBps = requireEffective(TFN_WITHHOLDING_RATES, input.paymentDate, "TFN or ABN withholding rate");
    const withholdingAmount = mulBps(tfnWithholdingBase, rateBps);
    working.push({ code: "AU.TFN.BASE", label: "TFN/ABN withholding base", amount: tfnWithholdingBase, kind: "AMOUNT", source: "RULE", ref: "Sch 1 TAA 1953 ss 12-140 and 12-145" });
    working.push({ code: "AU.TFN.RATE", label: "TFN/ABN withholding rate", amount: rateBps, kind: "PERCENT", source: "RULE", ref: "ATO withholding from investment income guidance" });
    working.push({ code: "AU.TFN.WITHHELD", label: "TFN/ABN withholding amount", amount: withholdingAmount, kind: "TOTAL", source: "RULE", ref: "Sch 1 TAA 1953 ss 12-140 and 12-145" });
    return {
      effectiveMemberClass,
      scenario: "TFN_ABN_WITHHOLDING",
      rateBps,
      withholdingAmount,
      finalTax: false,
      requiresNotice: residentMitNoticeRequired,
      creditLabel: "13R",
      working,
      findings,
      notes: [
        "Resident investment-body withholding applies at the top individual rate plus Medicare levy when no TFN or ABN is quoted.",
        ...(residentMitNoticeRequired
          ? ["ATO withholding-for-MITs guidance says that if you are an Australian resident, a MIT or AMIT must notify you if the payment is a fund payment and state the amount that would have been subject to withholding if you were a non-resident."]
          : []),
      ],
    };
  }

  if (input.paymentAttributedToAustralianPermanentEstablishment === true) {
    return {
      effectiveMemberClass,
      scenario: "NONE",
      rateBps: 0,
      withholdingAmount: 0,
      finalTax: false,
      requiresNotice: false,
      working,
      findings,
      notes: ["No MIT withholding applies where the foreign recipient carries on business through an Australian permanent establishment and the payment is attributable to that establishment."],
    };
  }

  const buckets: Required<AuMitRateBuckets> = {
    ordinaryFundPayment: assertNonNegative(input.mitRateBuckets?.ordinaryFundPayment, "ordinaryFundPayment"),
    cleanBuildingFundPayment: assertNonNegative(input.mitRateBuckets?.cleanBuildingFundPayment, "cleanBuildingFundPayment"),
    buildToRentFundPayment: assertNonNegative(input.mitRateBuckets?.buildToRentFundPayment, "buildToRentFundPayment"),
    ncmiFundPayment: assertNonNegative(input.mitRateBuckets?.ncmiFundPayment, "ncmiFundPayment"),
    excludedFromNcmiFundPayment: assertNonNegative(input.mitRateBuckets?.excludedFromNcmiFundPayment, "excludedFromNcmiFundPayment"),
  };
  const totalFundPayment = fundPaymentAmount;
  if ((input.trustRegime === "MIT" || input.trustRegime === "AMIT") && input.withholdingMit !== false && totalFundPayment > 0) {
    const bucketRates: Record<string, Bps> = {};
    let withholdingAmount = 0;
    for (const [bucket, amount] of Object.entries(buckets) as [keyof Required<AuMitRateBuckets>, Cents][]) {
      if (amount <= 0) continue;
      const rateBps = bucketRate(effectiveMemberClass, input.paymentDate, bucket);
      bucketRates[bucket] = rateBps;
      const bucketWithholding = mulBps(amount, rateBps);
      withholdingAmount += bucketWithholding;
      working.push({
        code: `AU.MIT.${bucket.toUpperCase()}`,
        label: `${bucket} withholding base`,
        amount,
        kind: "AMOUNT",
        source: "RULE",
        ref: bucket === "ncmiFundPayment" ? "AMMA/SDS guidance note 10 and TAA Sch 1 NCMI provisions" : "MIT withholding guidance",
      });
      working.push({
        code: `AU.MIT.${bucket.toUpperCase()}.RATE`,
        label: `${bucket} withholding rate`,
        amount: rateBps,
        kind: "PERCENT",
        source: "RULE",
      });
      working.push({
        code: `AU.MIT.${bucket.toUpperCase()}.WITHHELD`,
        label: `${bucket} withholding amount`,
        amount: bucketWithholding,
        kind: "AMOUNT",
        source: "RULE",
      });
    }
    const blendedRate = totalFundPayment === 0 ? 0 : Math.round((withholdingAmount * 10_000) / totalFundPayment);
    notes.push("Foreign pension and sovereign member classes are conservatively treated the same as other foreign funds for MIT fund-payment withholding unless a separate verified exemption has been established outside this engine.");
    return {
      effectiveMemberClass,
      scenario: "MIT_FUND_PAYMENT_WITHHOLDING",
      rateBps: blendedRate,
      withholdingAmount,
      finalTax: true,
      requiresNotice: false,
      creditLabel: "13A",
      working,
      findings,
      notes,
      bucketRates,
    };
  }

  if (input.trustRegime === "MIT" || input.trustRegime === "AMIT") {
    return {
      effectiveMemberClass,
      scenario: "NOTICE_ONLY",
      rateBps: 0,
      withholdingAmount: 0,
      finalTax: false,
      requiresNotice: true,
      working,
      findings,
      notes: ["No foreign-resident fund-payment withholding was computed, but a resident recipient may still need the fund-payment notice information."],
    };
  }

  return {
    effectiveMemberClass,
    scenario: "TRUSTEE_ASSESSED_NON_RESIDENT",
    rateBps: 0,
    withholdingAmount: 0,
    finalTax: false,
    requiresNotice: false,
    working,
    findings,
    notes: [describeTrusteeTaxScenario(input.trustRegime)],
  };
}

export function mitigatesTfnWithholding(member: AuMemberProfile): boolean {
  return member.quotedTfn === true || member.quotedAbn === true || member.tfnExempt === true;
}

export function informationExchangeCountry(memberClass: AuMemberClass): boolean {
  return isInformationExchangeCountry(memberClass);
}

export function foreignMember(memberClass: AuMemberClass): boolean {
  return isForeign(memberClass);
}

export function annualNoticeRetentionEnd(noticeDate: ISODate): ISODate {
  return addYears(noticeDate, 5);
}

export const RULES = [
  {
    id: "au-members.tfn-abn-withholding.2017-plus",
    domain: "AU_IDENTIFIERS",
    title: "Resident TFN or ABN withholding for unit trust and AMIT payments",
    summary:
      "Investment bodies, including unit trusts and MITs, withhold from resident investment income when the investor has not quoted a TFN or ABN or claimed an exemption. The engine uses the top resident individual rate including Medicare levy, and does not withhold where the payment is only tax-deferred capital.",
    effectiveFrom: "2017-07-01",
    sources: [
      { title: "ATO | Withholding from investment income", url: "https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/payg-withholding/payments-you-need-to-withhold-from/withholding-from-investment-income", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Tax rates for Australian residents", url: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | AMMA statement and SDS 2024 guidance notes", url: "https://www.ato.gov.au/forms-and-instructions/attribution-managed-investment-trust-member-annual-statement-standard-distribution-statement-2024/guidance-notes", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes:
      "The ATO guidance states that the investment body withholds at the top rate of tax, the Medicare-levy note still applies, and the AMMA/SDS guide points to sections 12-140 and 12-145 of Schedule 1 to the TAA 1953.",
  },
  {
    id: "au-members.mit-foreign-member-withholding.2008-plus",
    domain: "AU_MIT",
    title: "MIT withholding rates by foreign member status and fund-payment category",
    summary:
      "Foreign residents in information-exchange countries generally face 15% MIT withholding on ordinary fund payments, 30% outside those countries, 10% for eligible clean building MIT payments, 30% for NCMI, and 15% for eligible build-to-rent fund payments from 1 January 2025.",
    effectiveFrom: "2008-07-01",
    sources: [
      { title: "ATO | Withholding tax arrangements for managed investment trust fund payments", url: "https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/in-detail/investing-in-australia/withholding-tax-arrangements-for-managed-investment-trust-fund-payments", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Withholding on fund payments for MITs", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/withholding-rules/withholding-on-fund-payments-for-mits", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Build to rent development tax incentives", url: "https://www.ato.gov.au/businesses-and-organisations/assets-and-property/build-to-rent-development-tax-incentives", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "Federal Register of Legislation | Taxation Administration Amendment (Updating the List of Exchange of Information Countries) Regulations 2018", url: "https://www.legislation.gov.au/Details/F2018L01596", retrieved: "2026-10-10", publisher: "Federal Register of Legislation" },
    ],
    confidence: "VERIFIED",
    notes:
      "The 2024 AMMA/SDS guide confirms a 30% withholding rate where a disclosed amount is NCMI. Foreign pension and sovereign classes are treated conservatively as ordinary foreign funds for fund-payment withholding because no separate ATO rate concession for fund payments was verified on the retrieval date.",
  },
  {
    id: "au-members.general-foreign-trust-tax.2016-plus",
    domain: "AU_TRUST_TAX",
    title: "Foreign residents outside the MIT withholding regime",
    summary:
      "Where a trust is not a withholding MIT, foreign-resident amounts are generally taxed through trustee assessment and statement credits rather than MIT cash withholding. Non-withholding AMITs use the trustee taxation and statement-of-attribution rules.",
    effectiveFrom: "2016-05-05",
    sources: [
      { title: "ATO | Withholding for MITs", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/withholding-rules/withholding-for-mits", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | AMIT trustee taxation", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/amit-trustee-taxation", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes: "This module returns a trustee-assessed scenario with no cash withholding where the payment is outside the withholding-MIT rules.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER_AU];
