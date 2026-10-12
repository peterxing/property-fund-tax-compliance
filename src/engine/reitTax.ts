import { addMonths, type ISODate } from "./dates.ts";
import type { Bps, Cents } from "./money.ts";
import { mulBps, ratioBps } from "./money.ts";
import type { RuleEntry } from "./rules.ts";
import { ENGINE_DISCLAIMER } from "./rules.ts";
import type { Finding } from "./types.ts";

export type ReitInvestorClass =
  | "INDIVIDUAL"
  | "SINGAPORE_COMPANY"
  | "SINGAPORE_BRANCH"
  | "SINGAPORE_BODY_OF_PERSONS"
  | "INTERNATIONAL_ORGANISATION"
  | "REIT_ETF"
  | "QUALIFYING_NON_RESIDENT_NON_INDIVIDUAL"
  | "QUALIFYING_NON_RESIDENT_FUND"
  | "OTHER_NON_RESIDENT_NON_INDIVIDUAL";

export type ReitDeclarationStatus = "NOT_REQUIRED" | "FORM_A_VALID" | "FORM_B_VALID" | "MISSING";
export type ReitFundExemptionSection = "13D" | "13OA" | "13U" | "13V";
export type ReitTaxTreatment = "EXEMPT" | "TAXED_AT_OWN_RATE" | "FINAL_WITHHOLDING" | "NON_FINAL_WITHHOLDING" | "NOT_TAXED_AT_RECIPIENT_REIT_ETF";

export interface ReitIncomeInput {
  distributionDate: ISODate;
  taxableSpecifiedIncome: Cents;
  taxableSpecifiedIncomeDistributed: Cents;
  otherTrusteeTaxableIncome?: Cents;
  otherTrusteeTaxableIncomeDistributed?: Cents;
  taxExemptIncome?: Cents;
  taxExemptIncomeDistributed?: Cents;
  capitalDistributionPool?: Cents;
  capitalDistributionDistributed?: Cents;
  trusteeTaxRateBps?: Bps;
  distributedWithinSameYear?: boolean;
  lastQuarterDistributionWithinThreeMonths?: boolean;
  rollOverAdjustments?: Cents;
}

export interface ReitTaxComposition {
  transparentTaxableDistribution: Cents;
  trusteeTaxedDistribution: Cents;
  taxExemptDistribution: Cents;
  capitalDistribution: Cents;
  totalDistribution: Cents;
}

export interface ReitTaxResult {
  passesTransparencyTest: boolean;
  requiredMinimumDistribution: Cents;
  distributedSpecifiedIncomeRatioBps: Bps;
  retainedSpecifiedIncome: Cents;
  retainedTrusteeTaxableIncome: Cents;
  retainedTaxExemptIncome: Cents;
  retainedCapital: Cents;
  trusteeTaxBase: Cents;
  trusteeTaxRateBps: Bps;
  trusteeTax: Cents;
  composition: ReitTaxComposition;
  findings: Finding[];
  notes: string[];
}

export interface ReitInvestorTaxInput {
  distributionDate: ISODate;
  investorClass: ReitInvestorClass;
  declarationStatus: ReitDeclarationStatus;
  throughSingaporePartnership?: boolean;
  fromTradeBusinessOrProfession?: boolean;
  fundExemptionSection?: ReitFundExemptionSection;
}

export interface ReitInvestorTaxResult {
  withholdingRateBps: Bps;
  withholdingApplies: boolean;
  finalTax: boolean;
  treatment: ReitTaxTreatment;
  declarationRequirement: "NONE" | "FORM_A_OR_FORM_B";
  remark: string;
}

const DEFAULT_TRUSTEE_TAX_RATE_BPS = 1700;
const TRANSPARENCY_THRESHOLD_BPS = 9000;

function validDeclaration(status: ReitDeclarationStatus): boolean {
  return status === "FORM_A_VALID" || status === "FORM_B_VALID" || status === "NOT_REQUIRED";
}

function qualifyingFundStart(section?: ReitFundExemptionSection): ISODate {
  return section === "13OA" ? "2025-01-01" : "2019-07-01";
}

export function reitWithholdingDueDate(paymentDate: ISODate): ISODate {
  const secondMonth = addMonths(paymentDate, 2);
  return `${secondMonth.slice(0, 8)}15`;
}

export function reitFormUtDueDate(ya: number): ISODate {
  return `${ya}-04-15`;
}

export function determineReitInvestorTax(input: ReitInvestorTaxInput): ReitInvestorTaxResult {
  const declared = validDeclaration(input.declarationStatus);
  if (input.investorClass === "INDIVIDUAL") {
    if (input.throughSingaporePartnership || input.fromTradeBusinessOrProfession) {
      return {
        withholdingRateBps: 0,
        withholdingApplies: false,
        finalTax: false,
        treatment: "TAXED_AT_OWN_RATE",
        declarationRequirement: "NONE",
        remark: "Individuals are exempt unless they derive the REIT distribution through a Singapore partnership or from a trade, business or profession.",
      };
    }
    return {
      withholdingRateBps: 0,
      withholdingApplies: false,
      finalTax: false,
      treatment: "EXEMPT",
      declarationRequirement: "NONE",
      remark: "Other individuals are exempt under section 13(1)(zh) of the ITA.",
    };
  }

  const declarationRequirement = "FORM_A_OR_FORM_B" as const;
  const standardNoDeduction = ["SINGAPORE_COMPANY", "SINGAPORE_BRANCH", "SINGAPORE_BODY_OF_PERSONS", "INTERNATIONAL_ORGANISATION"] as const;
  if (standardNoDeduction.includes(input.investorClass as (typeof standardNoDeduction)[number])) {
    if (!declared) {
      return {
        withholdingRateBps: DEFAULT_TRUSTEE_TAX_RATE_BPS,
        withholdingApplies: true,
        finalTax: false,
        treatment: "NON_FINAL_WITHHOLDING",
        declarationRequirement,
        remark: "Missing Form A / Form B support means the trustee should default to withholding until the investor's status is substantiated.",
      };
    }
    return {
      withholdingRateBps: 0,
      withholdingApplies: false,
      finalTax: false,
      treatment: "TAXED_AT_OWN_RATE",
      declarationRequirement,
      remark: "The investor class receives REIT distributions without deduction of tax, but may still be taxable at its own rate unless separately exempt.",
    };
  }

  if (input.investorClass === "REIT_ETF") {
    if (!declared) {
      return {
        withholdingRateBps: DEFAULT_TRUSTEE_TAX_RATE_BPS,
        withholdingApplies: true,
        finalTax: false,
        treatment: "NON_FINAL_WITHHOLDING",
        declarationRequirement,
        remark: "Without a valid declaration, the trustee should not assume REIT ETF status.",
      };
    }
    return {
      withholdingRateBps: 0,
      withholdingApplies: false,
      finalTax: false,
      treatment: "NOT_TAXED_AT_RECIPIENT_REIT_ETF",
      declarationRequirement,
      remark: "REIT ETFs accorded transparency treatment are not taxed in the hands of the trustee of the REIT ETF for distributions made from 1 Jul 2018 to 31 Dec 2030.",
    };
  }

  if (input.investorClass === "QUALIFYING_NON_RESIDENT_NON_INDIVIDUAL") {
    if (declared && input.distributionDate >= "2005-02-18" && input.distributionDate <= "2030-12-31") {
      return {
        withholdingRateBps: 1000,
        withholdingApplies: true,
        finalTax: true,
        treatment: "FINAL_WITHHOLDING",
        declarationRequirement,
        remark: "Qualifying non-resident non-individuals get the 10% final withholding-tax concession through 31 Dec 2030.",
      };
    }
    return {
      withholdingRateBps: DEFAULT_TRUSTEE_TAX_RATE_BPS,
      withholdingApplies: true,
      finalTax: false,
      treatment: "NON_FINAL_WITHHOLDING",
      declarationRequirement,
      remark: declared
        ? "Outside the concession period, the prevailing corporate rate applies and the withholding is not final."
        : "Missing Form A / Form B support means the 10% concession cannot be applied.",
    };
  }

  if (input.investorClass === "QUALIFYING_NON_RESIDENT_FUND") {
    const startDate = qualifyingFundStart(input.fundExemptionSection);
    if (declared && input.distributionDate >= startDate && input.distributionDate <= "2030-12-31") {
      return {
        withholdingRateBps: 1000,
        withholdingApplies: true,
        finalTax: true,
        treatment: "FINAL_WITHHOLDING",
        declarationRequirement,
        remark: `Qualifying non-resident funds under section ${input.fundExemptionSection ?? "13D/13U/13V"} get the 10% final withholding-tax concession from ${startDate} to 31 Dec 2030.`,
      };
    }
    return {
      withholdingRateBps: DEFAULT_TRUSTEE_TAX_RATE_BPS,
      withholdingApplies: true,
      finalTax: false,
      treatment: "NON_FINAL_WITHHOLDING",
      declarationRequirement,
      remark: declared
        ? "Outside the section-specific concession period, the prevailing corporate rate applies and the withholding is not final."
        : "Missing Form A / Form B support means the qualifying-fund concession cannot be applied.",
    };
  }

  return {
    withholdingRateBps: DEFAULT_TRUSTEE_TAX_RATE_BPS,
    withholdingApplies: true,
    finalTax: false,
    treatment: "NON_FINAL_WITHHOLDING",
    declarationRequirement,
    remark: "Other non-resident non-individuals are subject to withholding at the prevailing corporate rate and the withholding is not final.",
  };
}

export function computeReitTax(input: ReitIncomeInput): ReitTaxResult {
  const findings: Finding[] = [];
  const notes: string[] = [];
  const trusteeTaxRateBps = input.trusteeTaxRateBps ?? DEFAULT_TRUSTEE_TAX_RATE_BPS;
  const otherTrusteeTaxableIncome = input.otherTrusteeTaxableIncome ?? 0;
  const otherTrusteeTaxableIncomeDistributed = input.otherTrusteeTaxableIncomeDistributed ?? 0;
  const taxExemptIncome = input.taxExemptIncome ?? 0;
  const taxExemptIncomeDistributed = input.taxExemptIncomeDistributed ?? 0;
  const capitalDistributionPool = input.capitalDistributionPool ?? 0;
  const capitalDistributionDistributed = input.capitalDistributionDistributed ?? 0;
  const rollOverAdjustments = input.rollOverAdjustments ?? 0;
  const adjustedSpecifiedIncome = input.taxableSpecifiedIncome + rollOverAdjustments;
  const distributedInTime = input.distributedWithinSameYear !== false || input.lastQuarterDistributionWithinThreeMonths === true;
  const requiredMinimumDistribution = mulBps(adjustedSpecifiedIncome, TRANSPARENCY_THRESHOLD_BPS);
  const passesTransparencyTest = distributedInTime && input.taxableSpecifiedIncomeDistributed >= requiredMinimumDistribution;
  const distributedSpecifiedIncomeRatioBps = adjustedSpecifiedIncome === 0 ? 10000 : ratioBps(input.taxableSpecifiedIncomeDistributed, adjustedSpecifiedIncome);

  const retainedSpecifiedIncome = adjustedSpecifiedIncome - input.taxableSpecifiedIncomeDistributed;
  const retainedTrusteeTaxableIncome = otherTrusteeTaxableIncome - otherTrusteeTaxableIncomeDistributed;
  const retainedTaxExemptIncome = taxExemptIncome - taxExemptIncomeDistributed;
  const retainedCapital = capitalDistributionPool - capitalDistributionDistributed;

  if (retainedSpecifiedIncome < 0 || retainedTrusteeTaxableIncome < 0 || retainedTaxExemptIncome < 0 || retainedCapital < 0) {
    findings.push({ id: "REIT.INPUT.OVER_DISTRIBUTION_POOL", severity: "ERROR", message: "A distribution component exceeds the corresponding income or capital pool." });
  }

  const transparentTaxableDistribution = passesTransparencyTest ? input.taxableSpecifiedIncomeDistributed : 0;
  const trusteeTaxedDistribution = passesTransparencyTest ? otherTrusteeTaxableIncomeDistributed : otherTrusteeTaxableIncomeDistributed + input.taxableSpecifiedIncomeDistributed;
  const trusteeTaxBase = passesTransparencyTest
    ? Math.max(0, retainedSpecifiedIncome) + Math.max(0, otherTrusteeTaxableIncome)
    : Math.max(0, adjustedSpecifiedIncome) + Math.max(0, otherTrusteeTaxableIncome);
  const trusteeTax = mulBps(trusteeTaxBase, trusteeTaxRateBps);

  if (rollOverAdjustments !== 0) {
    findings.push({
      id: "REIT.RIA.APPLIED",
      severity: "INFO",
      message: "Rollover income adjustments have been applied to the specified-income pool for this distribution period.",
      data: { rollOverAdjustments, adjustedSpecifiedIncome },
    });
  }
  if (!passesTransparencyTest && adjustedSpecifiedIncome > 0) {
    findings.push({
      id: "REIT.TRANSPARENCY.FAIL",
      severity: "WARNING",
      message: "The 90% same-year distribution threshold is not met. The engine therefore models the worst-case outcome that the Comptroller denies transparency for the year's specified income and taxes it at trustee level.",
      data: { requiredMinimumDistribution, actualDistributedSpecifiedIncome: input.taxableSpecifiedIncomeDistributed },
    });
  }
  if (passesTransparencyTest && retainedSpecifiedIncome > 0) {
    findings.push({
      id: "REIT.TRANSPARENCY.RETAINED_INCOME",
      severity: "INFO",
      message: "Specified income distributed above the 90% threshold is tax-transparent, but retained specified income remains taxable to the trustee.",
      data: { retainedSpecifiedIncome },
    });
  }
  notes.push("Section 45G withholding is modelled only on the tax-transparent taxable distribution component.");
  notes.push("Return-of-capital distributions should reduce the investor's cost base; if return of capital exceeds cost, the excess can become taxable trading income.");

  return {
    passesTransparencyTest,
    requiredMinimumDistribution,
    distributedSpecifiedIncomeRatioBps,
    retainedSpecifiedIncome,
    retainedTrusteeTaxableIncome,
    retainedTaxExemptIncome,
    retainedCapital,
    trusteeTaxBase,
    trusteeTaxRateBps,
    trusteeTax,
    composition: {
      transparentTaxableDistribution,
      trusteeTaxedDistribution,
      taxExemptDistribution: taxExemptIncomeDistributed,
      capitalDistribution: capitalDistributionDistributed,
      totalDistribution: transparentTaxableDistribution + trusteeTaxedDistribution + taxExemptIncomeDistributed + capitalDistributionDistributed,
    },
    findings,
    notes,
  };
}

export const RULES = [
  {
    id: "reit-tax.transparency-and-distribution.2022-plus",
    domain: "REIT_TAX",
    title: "REIT tax-transparency, trustee taxation, rollover adjustments and return-of-capital treatment",
    summary:
      "The engine models the 90% same-year distribution condition, specified-income transparency, rollover income adjustments, trustee-level taxation of retained / non-specified income, and the distinction between tax-transparent, trustee-taxed, tax-exempt and capital distributions.",
    effectiveFrom: "2022-01-01",
    sources: [
      { title: "IRAS | Income Tax Treatment of REITs and Approved Sub-Trusts (Twelfth Edition)", url: "https://www.iras.gov.sg/docs/default-source/e-tax/e-taxguide_income-tax-treatment-of-reits-and-approved-sub-trusts.pdf", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
    confidence: "VERIFIED",
    notes:
      "The engine conservatively treats a failure of the 90% threshold as a worst-case transparency denial for the period's specified income.",
  },
  {
    id: "reit-tax.withholding-and-declarations.2022-plus",
    domain: "WITHHOLDING_TAX",
    title: "REIT investor-class withholding and declaration rules",
    summary:
      "Individuals, Singapore-incorporated entities, qualifying Singapore branches, specified Singapore bodies, qualifying international organisations and qualifying REIT ETFs receive no tax deduction; qualifying non-resident non-individuals and qualifying non-resident funds get 10% final withholding within the concession windows; other non-resident non-individuals are withheld at the prevailing corporate rate.",
    effectiveFrom: "2022-01-01",
    sources: [
      { title: "IRAS | Income Tax Treatment of REITs and Approved Sub-Trusts (Twelfth Edition)", url: "https://www.iras.gov.sg/docs/default-source/e-tax/e-taxguide_income-tax-treatment-of-reits-and-approved-sub-trusts.pdf", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
    confidence: "VERIFIED",
    notes:
      "The 10% concessions are modelled through 31 Dec 2030. Form A (Declaration for Singapore Tax Purposes) and Form B (Declaration by Depository Agents) are treated as the practical support for applying zero-deduction or concessionary treatment; paragraph 12.2(b) requires withholding where the beneficiary's status is not confirmed.",
  },
  {
    id: "reit-tax.filing.2022-plus",
    domain: "FILING",
    title: "REIT Form UT and Section 45G filing mechanics",
    summary:
      "The trustee files Form UT with audited accounts and tax computation by 15 April each year. The guide states there is no need to file ECI, and the engine continues to expose the Section 45G remittance helper for distributions.",
    effectiveFrom: "2022-01-01",
    sources: [
      { title: "IRAS | Income Tax Treatment of REITs and Approved Sub-Trusts (Twelfth Edition)", url: "https://www.iras.gov.sg/docs/default-source/e-tax/e-taxguide_income-tax-treatment-of-reits-and-approved-sub-trusts.pdf", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | Withholding tax", url: "https://www.iras.gov.sg/taxes/withholding-tax", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
    confidence: "VERIFIED_SECONDARY",
    notes:
      "Form UT and the no-ECI position are directly stated in paragraph 16.1 of the guide. The Section 45G remittance helper remains mechanically set to the 15th of the second month from payment, but users should confirm the operational filing screen / notice wording where needed.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER];
