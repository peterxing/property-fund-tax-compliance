import { max0, mulBps, roundToDollar } from "./money.ts";
import type { Bps, Cents } from "./money.ts";
import { financialYearEnd, yearOfAssessment, type ISODate } from "./dates.ts";
import { ENGINE_DISCLAIMER, type Effective, pickEffective } from "./rules.ts";
import type { ComputationLine, EntityKind, Finding } from "./types.ts";

const RETRIEVED: ISODate = "2026-10-09";
const YA_DATE = (ya: number): ISODate => `${ya}-01-01`;
const DOLLAR = 100;
const PTE_MAX_EXEMPT_FROM_YA2020: Cents = 10_250_000;
const PTE_MAX_EXEMPT_BEFORE_YA2020: Cents = 15_250_000;
const SUTE_MAX_EXEMPT_FROM_YA2020: Cents = 12_500_000;
const SUTE_MAX_EXEMPT_BEFORE_YA2020: Cents = 20_000_000;

export interface TaxExemptionBand {
  upToDollars: number;
  exemptionBps: Bps;
}

export interface TaxExemptionScheme {
  id: "PTE" | "SUTE" | "NONE";
  label: string;
  bands: readonly TaxExemptionBand[];
  maxExemptAmount: Cents;
}

export interface CitRebatePolicy {
  rebateBps: Bps;
  maxBenefit: Cents;
  cashGrant: Cents;
  requiresActiveCompany: boolean;
  requiresLocalEmployee: boolean;
  localEmployeeCalendarYearOffset: number;
}

export interface StartUpExemptionProfile {
  ya: number;
  incorporationDate: ISODate;
  financialYearEndMonth: number;
  financialYearEndDay: number;
  kind?: EntityKind;
  isSingaporeIncorporated?: boolean;
  isSingaporeTaxResident?: boolean;
  principalActivity?: string;
  shareholderCount?: number;
  allShareholdersAreIndividuals?: boolean;
  hasIndividualShareholderWithAtLeast10Pct?: boolean;
}

export interface StartUpExemptionEligibility {
  eligible: boolean;
  firstYa: number;
  isWithinFirstThreeYas: boolean;
  reasons: string[];
}

export interface ConcessionaryIncomeSlice {
  label: string;
  amount: Cents;
  rateBps: Bps;
}

export interface ComputeCitInput {
  ya: number;
  normalChargeableIncome: Cents;
  concessionaryIncome?: readonly ConcessionaryIncomeSlice[];
  taxSetOffs?: Cents;
  taxDeductedAtSource?: Cents;
  startUpExemption?: boolean | StartUpExemptionProfile;
  isActiveCompany?: boolean;
  localEmployeeCount?: number;
  pillarTwoInScope?: boolean;
  entityIsCompany?: boolean;
}

export interface ComputeCitResult {
  ya: number;
  headlineRateBps: Bps;
  exemptionScheme: TaxExemptionScheme;
  exemptionAmount: Cents;
  chargeableIncomeAfterExemption: Cents;
  taxBeforeRebate: Cents;
  rebate: Cents;
  rebateCashGrant: Cents;
  taxPayable: Cents;
  lines: ComputationLine[];
  findings: Finding[];
  notes: string[];
}

const HEADLINE_RATES: readonly Effective<Bps>[] = [{ from: "2022-01-01", value: 1700 }];

const PTE_SCHEMES: readonly Effective<TaxExemptionScheme>[] = [
  {
    from: "2020-01-01",
    value: {
      id: "PTE",
      label: "Partial tax exemption",
      bands: [
        { upToDollars: 10_000, exemptionBps: 7500 },
        { upToDollars: 200_000, exemptionBps: 5000 },
      ],
      maxExemptAmount: PTE_MAX_EXEMPT_FROM_YA2020,
    },
  },
  {
    from: "1900-01-01",
    to: "2019-12-31",
    value: {
      id: "PTE",
      label: "Partial tax exemption",
      bands: [
        { upToDollars: 10_000, exemptionBps: 7500 },
        { upToDollars: 300_000, exemptionBps: 5000 },
      ],
      maxExemptAmount: PTE_MAX_EXEMPT_BEFORE_YA2020,
    },
  },
];

const SUTE_SCHEMES: readonly Effective<TaxExemptionScheme>[] = [
  {
    from: "2020-01-01",
    value: {
      id: "SUTE",
      label: "Start-up tax exemption",
      bands: [
        { upToDollars: 100_000, exemptionBps: 7500 },
        { upToDollars: 200_000, exemptionBps: 5000 },
      ],
      maxExemptAmount: SUTE_MAX_EXEMPT_FROM_YA2020,
    },
  },
  {
    from: "1900-01-01",
    to: "2019-12-31",
    value: {
      id: "SUTE",
      label: "Start-up tax exemption",
      bands: [
        { upToDollars: 100_000, exemptionBps: 10_000 },
        { upToDollars: 300_000, exemptionBps: 5000 },
      ],
      maxExemptAmount: SUTE_MAX_EXEMPT_BEFORE_YA2020,
    },
  },
];

const REBATES: Readonly<Record<number, CitRebatePolicy>> = {
  2024: { rebateBps: 5000, maxBenefit: 4_000_000, cashGrant: 200_000, requiresActiveCompany: true, requiresLocalEmployee: true, localEmployeeCalendarYearOffset: -1 },
  2025: { rebateBps: 5000, maxBenefit: 4_000_000, cashGrant: 200_000, requiresActiveCompany: true, requiresLocalEmployee: true, localEmployeeCalendarYearOffset: -1 },
  2026: { rebateBps: 5000, maxBenefit: 4_000_000, cashGrant: 200_000, requiresActiveCompany: true, requiresLocalEmployee: true, localEmployeeCalendarYearOffset: -1 },
};
const NO_COMPANY_EXEMPTION_SCHEME: TaxExemptionScheme = { id: "NONE", label: "No company tax exemption scheme applied", bands: [], maxExemptAmount: 0 };

function roundToWholeDollar(amount: Cents): Cents {
  return roundToDollar(amount);
}

function wholeDollars(amount: Cents): number {
  return Math.round(roundToWholeDollar(amount) / DOLLAR);
}

function isInvestmentHoldingLike(kind: EntityKind | undefined, principalActivity: string | undefined): boolean {
  return kind === "PROPERTY_FUND" || /investment\s+holding/i.test(principalActivity ?? "");
}

function isPropertyDevelopmentLike(kind: EntityKind | undefined, principalActivity: string | undefined): boolean {
  return kind === "DEVELOPER" || /property\s+development/i.test(principalActivity ?? "");
}

export function determineStartUpTaxExemptionEligibility(profile: StartUpExemptionProfile): StartUpExemptionEligibility {
  const reasons: string[] = [];
  const firstFyeYear = Number(profile.incorporationDate.slice(0, 4)) +
    (profile.incorporationDate.slice(5, 10) > `${String(profile.financialYearEndMonth).padStart(2, "0")}-${String(profile.financialYearEndDay).padStart(2, "0")}` ? 1 : 0);
  const firstYa = yearOfAssessment(financialYearEnd(firstFyeYear, profile.financialYearEndMonth, profile.financialYearEndDay));
  const isWithinFirstThreeYas = profile.ya >= firstYa && profile.ya <= firstYa + 2;
  if (!isWithinFirstThreeYas) reasons.push("Outside the first 3 consecutive YAs.");
  if (profile.isSingaporeIncorporated === false) reasons.push("Company is not incorporated in Singapore.");
  if (profile.isSingaporeTaxResident === false) reasons.push("Company is not Singapore tax resident for the YA.");
  if (isInvestmentHoldingLike(profile.kind, profile.principalActivity)) reasons.push("Principal activity is investment holding.");
  if (isPropertyDevelopmentLike(profile.kind, profile.principalActivity)) reasons.push("Company undertakes property development for sale, investment, or both.");
  const shareholderCount = profile.shareholderCount;
  if (shareholderCount !== undefined && shareholderCount > 20) reasons.push("Shareholder count exceeds 20 throughout the basis period.");
  const shareholderInfoProvided = profile.allShareholdersAreIndividuals !== undefined || profile.hasIndividualShareholderWithAtLeast10Pct !== undefined;
  if (shareholderInfoProvided && !(profile.allShareholdersAreIndividuals || profile.hasIndividualShareholderWithAtLeast10Pct)) {
    reasons.push("Shareholding condition is not satisfied.");
  }
  return { eligible: reasons.length === 0, firstYa, isWithinFirstThreeYas, reasons };
}

export function qualifiesForCitRebateCashGrant(ya: number, isActiveCompany: boolean | undefined, localEmployeeCount: number | undefined): boolean {
  const policy = REBATES[ya];
  if (!policy || policy.cashGrant <= 0) return false;
  if (policy.requiresActiveCompany && !isActiveCompany) return false;
  if (policy.requiresLocalEmployee && (localEmployeeCount ?? 0) < 1) return false;
  return true;
}

export function computeTaxExemptionAmount(normalChargeableIncome: Cents, scheme: TaxExemptionScheme): Cents {
  const roundedIncome = Math.max(0, wholeDollars(normalChargeableIncome));
  let exemptDollars = 0;
  let lower = 0;
  for (const band of scheme.bands) {
    if (roundedIncome <= lower) break;
    const slice = Math.min(roundedIncome, band.upToDollars) - lower;
    exemptDollars += Math.round((slice * band.exemptionBps) / 10_000);
    lower = band.upToDollars;
  }
  return Math.min(exemptDollars * DOLLAR, scheme.maxExemptAmount);
}

export function computeCit(input: ComputeCitInput): ComputeCitResult {
  if (!Number.isInteger(input.ya) || input.ya < 2000 || input.ya > 2100) throw new RangeError(`Unsupported YA: ${input.ya}`);
  const headlineRateBps = pickEffective(HEADLINE_RATES, YA_DATE(input.ya)) ?? 1700;
  const findings: Finding[] = [];
  const notes: string[] = [ENGINE_DISCLAIMER];
  const entityIsCompany = input.entityIsCompany ?? true;

  let useSute = false;
  if (!entityIsCompany) {
    useSute = false;
  } else if (typeof input.startUpExemption === "boolean") {
    useSute = input.startUpExemption;
  } else if (input.startUpExemption) {
    const eligibility = determineStartUpTaxExemptionEligibility(input.startUpExemption);
    useSute = eligibility.eligible;
    if (!eligibility.eligible) {
      findings.push({
        id: "CIT.SUTE_NOT_AVAILABLE",
        severity: "INFO",
        message: `Start-up tax exemption not applied: ${eligibility.reasons.join(" ")}`,
      });
    }
  }

  const exemptionScheme = entityIsCompany
    ? (pickEffective(useSute ? SUTE_SCHEMES : PTE_SCHEMES, YA_DATE(input.ya)) ?? PTE_SCHEMES[0]!.value)
    : NO_COMPANY_EXEMPTION_SCHEME;
  const normalChargeableIncome = max0(input.normalChargeableIncome);
  const exemptionAmount = entityIsCompany ? computeTaxExemptionAmount(normalChargeableIncome, exemptionScheme) : 0;
  const roundedNormalChargeableIncome = roundToWholeDollar(normalChargeableIncome);
  const chargeableIncomeAfterExemption = max0(roundedNormalChargeableIncome - exemptionAmount);

  let grossTax = mulBps(chargeableIncomeAfterExemption, headlineRateBps);
  for (const slice of input.concessionaryIncome ?? []) {
    if (slice.amount < 0) throw new RangeError(`Concessionary income slice ${slice.label} cannot be negative.`);
    grossTax += mulBps(roundToWholeDollar(slice.amount), slice.rateBps);
  }

  const taxBeforeRebate = max0(grossTax - max0(input.taxSetOffs ?? 0));
  const rebatePolicy = entityIsCompany ? REBATES[input.ya] : undefined;
  if (entityIsCompany && !rebatePolicy && input.ya >= 2024) {
    findings.push({
      id: "CIT.REBATE_NOT_VERIFIED",
      severity: "WARNING",
      message: `No CIT rebate has been verified or applied for YA ${input.ya}. Check the latest Budget announcements and IRAS guidance before filing.`,
    });
  }
  const rebateCashGrant = qualifiesForCitRebateCashGrant(input.ya, input.isActiveCompany, input.localEmployeeCount) ? rebatePolicy?.cashGrant ?? 0 : 0;
  let rebate = 0;
  if (rebatePolicy) {
    const grossRebate = mulBps(taxBeforeRebate, rebatePolicy.rebateBps);
    const cappedBenefit = Math.min(grossRebate, rebatePolicy.maxBenefit);
    rebate = rebateCashGrant > 0 ? Math.max(0, cappedBenefit - rebateCashGrant) : cappedBenefit;
  }
  const taxPayable = max0(taxBeforeRebate - rebate - max0(input.taxDeductedAtSource ?? 0));

  if (input.pillarTwoInScope) {
    findings.push({
      id: "CIT.PILLAR_TWO_INFO",
      severity: "INFO",
      message: "Pillar Two / Domestic Top-up Tax may apply to in-scope MNE groups; this engine only flags the issue and does not compute top-up tax.",
    });
  }
  if (rebateCashGrant > 0) {
    notes.push(`A CIT Rebate Cash Grant of S$${(rebateCashGrant / 100).toFixed(2)} is informational only and is not deducted here because IRAS reflects it separately in the notice of assessment / cash grant process.`);
  }
  if (!entityIsCompany) {
    notes.push("Company-only schemes (PTE, SUTE and CIT rebate) were not applied because this taxpayer was modelled as a non-company entity taxed at the prevailing corporate tax rate.");
  }

  const lines: ComputationLine[] = [
    { code: "CIT.HEADLINE_RATE", label: `Headline corporate income tax rate (${input.ya})`, amount: headlineRateBps, kind: "PERCENT", ref: "IRAS | Corporate Income Tax Rate, Rebates & Tax Exemption Schemes", source: "RULE" },
    { code: "CIT.NORMAL_CHARGEABLE_INCOME", label: "Normal chargeable income before exemption", amount: roundedNormalChargeableIncome, kind: "AMOUNT", source: "RULE" },
    { code: `CIT.EXEMPTION.${exemptionScheme.id}`, label: exemptionScheme.label, amount: -exemptionAmount, kind: "AMOUNT", source: "RULE" },
    { code: "CIT.CHARGEABLE_AFTER_EXEMPTION", label: "Chargeable income after exemption", amount: chargeableIncomeAfterExemption, kind: "SUBTOTAL", source: "RULE" },
    { code: "CIT.TAX_BEFORE_REBATE", label: "Tax before rebate", amount: taxBeforeRebate, kind: "AMOUNT", source: "RULE" },
    { code: "CIT.REBATE", label: "CIT rebate", amount: -rebate, kind: "AMOUNT", source: "RULE", note: rebateCashGrant > 0 ? "Cash grant handled separately by IRAS." : undefined },
    { code: "CIT.TAX_PAYABLE", label: "Tax payable", amount: taxPayable, kind: "TOTAL", source: "RULE" },
  ];
  return {
    ya: input.ya,
    headlineRateBps,
    exemptionScheme,
    exemptionAmount,
    chargeableIncomeAfterExemption,
    taxBeforeRebate,
    rebate,
    rebateCashGrant,
    taxPayable,
    lines,
    findings,
    notes,
  };
}

export const RULES = [
  {
    id: "cit.rate-and-exemptions.2022-plus",
    domain: "CORPORATE_TAX",
    title: "Singapore corporate tax rate and tax exemption schemes",
    summary: "Corporate income tax is 17%. New start-up and partial tax exemption schemes are applied on normal chargeable income using IRAS' YA-based bands.",
    effectiveFrom: "2022-01-01",
    sources: [
      {
        title: "IRAS | Corporate Income Tax Rate, Rebates & Tax Exemption Schemes",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/basics-of-corporate-income-tax/corporate-income-tax-rate-rebates-and-tax-exemption-schemes",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
      {
        title: "IRAS | Basic Guide to Corporate Income Tax for Companies",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/basics-of-corporate-income-tax/basic-guide-to-corporate-income-tax-for-companies",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
    ],
    confidence: "VERIFIED",
    notes: "The detailed shareholder-condition data for SUTE must be supplied by the caller; when omitted, this module does not independently verify beneficial ownership.",
  },
  {
    id: "cit.rebates.2024-2026",
    domain: "CORPORATE_TAX",
    title: "CIT rebates and cash grants for YA 2024 to YA 2026",
    summary: "IRAS currently lists 50% CIT rebates for YA 2024 to YA 2026, capped at S$40,000 less any cash grant where applicable. YA 2026 narrative confirms the active-company and local-employee conditions for the cash grant.",
    effectiveFrom: "2024-01-01",
    effectiveTo: "2026-12-31",
    sources: [
      {
        title: "IRAS | Corporate Income Tax Rate, Rebates & Tax Exemption Schemes",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/basics-of-corporate-income-tax/corporate-income-tax-rate-rebates-and-tax-exemption-schemes",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
    ],
    confidence: "VERIFIED",
    notes: "The current IRAS page states the detailed cash-grant conditions in the YA 2026 section; this module applies the same structure to YA 2024 and YA 2025 because the current rebate table preserves the same 'less cash grant where applicable' mechanics. No primary-source YA 2027 rebate has been verified in this module.",
  },
  {
    id: "cit.pillar-two.info.2025-plus",
    domain: "CORPORATE_TAX",
    title: "Pillar Two Domestic Top-up Tax is informational only",
    summary: "Singapore's IIR and Domestic Top-up Tax apply from financial years starting on or after 1 Jan 2025 for in-scope MNE groups with annual revenue of at least €750 million in at least two of the four preceding financial years.",
    effectiveFrom: "2025-01-01",
    sources: [
      {
        title: "IRAS | Global Anti-Base Erosion (GloBE) Rules and Domestic Top-up Tax (DTT)",
        url: "https://www.iras.gov.sg/taxes/pillar-2-top-up-taxes/global-anti-base-erosion-(globe)-rules-and-domestic-top-up-tax-(dtt)",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
    ],
    confidence: "VERIFIED",
    notes: "The engine only flags potential scope; it does not compute Pillar Two taxes.",
  },
  {
    id: "cit.reit-trustee-prevailing-rate.2025-plus",
    domain: "CORPORATE_TAX",
    title: "Section 43(2) REIT trustee taxable income is modelled at the prevailing corporate tax rate without company-only exemption schemes",
    summary: "For REIT trustees, the engine does not apply PTE, SUTE or CIT rebate when the taxpayer is modelled as a non-company entity; taxable income is charged at the prevailing corporate tax rate.",
    effectiveFrom: "2025-12-04",
    sources: [
      {
        title: "IRAS e-Tax Guide | Income Tax Treatment of REITs and Approved Sub-Trusts (Twelfth Edition)",
        url: "https://www.iras.gov.sg/docs/default-source/e-tax/e-taxguide_income-tax-treatment-of-reits-and-approved-sub-trusts.pdf",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
    ],
    confidence: "VERIFIED_SECONDARY",
    notes: "This is an engine interpretation of para 6.1's 'prevailing corporate tax rate' wording for trustee-level taxable income, read together with the company-only nature of PTE, SUTE and CIT rebates.",
  },
] as const;
