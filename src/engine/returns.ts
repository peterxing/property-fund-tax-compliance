import { addDays, addMonths, diffDays, financialYearEnd, yearOfAssessment, type ISODate } from "./dates.ts";
import { ENGINE_DISCLAIMER } from "./rules.ts";
import type { Cents } from "./money.ts";
import type { ComputationLine, EntityKind, Finding } from "./types.ts";
import type { TaxComputationSummary, TaxComputationEntityProfile } from "./taxComputation.ts";

const RETRIEVED: ISODate = "2026-10-09";
const FORM_CS_REVENUE_CAP: Cents = 500_000_000;
const FORM_CS_LITE_REVENUE_CAP: Cents = 20_000_000;

const REIT_TRUSTEE_FORM_NOTE = "Under the IRAS REIT e-Tax Guide (Twelfth Edition, 4 Dec 2025) para 16.1, the trustee files Form UT with audited accounts and a tax computation by 15 April of the YA.";
const REIT_TRUSTEE_ECI_NOTE = "Under the IRAS REIT e-Tax Guide (Twelfth Edition, 4 Dec 2025) paras 16.1 and 16.2, a section 43(2) REIT trustee generally does not need to file ECI unless it seeks an extension / has non-specified income requiring Comptroller review.";

export type CorporateReturnForm = "FORM_C_S_LITE" | "FORM_C_S" | "FORM_C" | "FORM_UT" | "NOT_COMPANY_RETURN";

export interface ReturnEntityProfile {
  kind: EntityKind;
  isSingaporeIncorporated: boolean;
  annualRevenue: Cents;
  onlyIncomeTaxedAt17Percent?: boolean;
  hasExemptForeignIncomeUnder13_9?: boolean;
  hasOneTierSingaporeDividendsOnlyException?: boolean;
  isClaimingCarryBack?: boolean;
  isClaimingGroupRelief?: boolean;
  isClaimingInvestmentAllowance?: boolean;
  isClaimingForeignTaxCreditOrTds?: boolean;
  financialYearEnd: ISODate;
  hasSection43_2ReitTreatment?: boolean;
}

export interface ReturnFormResult {
  form: CorporateReturnForm;
  dueDate: ISODate;
  findings: Finding[];
}

export interface EciResult {
  required: boolean;
  waived: boolean;
  dueDate: ISODate;
  formStyleSummary: readonly ComputationLine[];
  findings: readonly Finding[];
}

export interface EciEstimateInput {
  entity: ReturnEntityProfile;
  chargeableIncomeBeforeExemptions?: Cents;
  estimatedChargeableIncome?: Cents;
  computationSummary?: TaxComputationSummary;
}

export interface BasisPeriodSlice {
  ya: number;
  basisPeriodStart: ISODate;
  basisPeriodEnd: ISODate;
}

export function determineReturnForm(entity: ReturnEntityProfile): ReturnFormResult {
  const findings: Finding[] = [];
  const dueDate = `${yearOfAssessment(entity.financialYearEnd)}-11-30` as ISODate;
  const ya = yearOfAssessment(entity.financialYearEnd);
  const transparencyTrustee = entity.hasSection43_2ReitTreatment && (entity.kind === "REIT" || entity.kind === "PROPERTY_FUND");
  if (transparencyTrustee) {
    findings.push({ id: "RETURNS.FORM_UT", severity: "INFO", message: REIT_TRUSTEE_FORM_NOTE });
    return { form: "FORM_UT", dueDate: `${ya}-04-15` as ISODate, findings };
  }
  if (entity.kind === "PROPERTY_FUND") {
    findings.push({ id: "RETURNS.NOT_COMPANY_FORM", severity: "INFO", message: "Form C-S / Form C-S (Lite) / Form C are company-return concepts; trust-level REIT / fund filing should be reviewed separately." });
    return { form: "NOT_COMPANY_RETURN", dueDate, findings };
  }
  const formCSConditionsMet = entity.isSingaporeIncorporated
    && entity.annualRevenue <= FORM_CS_REVENUE_CAP
    && Boolean(entity.onlyIncomeTaxedAt17Percent || entity.hasExemptForeignIncomeUnder13_9 || entity.hasOneTierSingaporeDividendsOnlyException)
    && !entity.isClaimingCarryBack
    && !entity.isClaimingGroupRelief
    && !entity.isClaimingInvestmentAllowance
    && !entity.isClaimingForeignTaxCreditOrTds;
  if (formCSConditionsMet && entity.annualRevenue <= FORM_CS_LITE_REVENUE_CAP) {
    return { form: "FORM_C_S_LITE", dueDate, findings };
  }
  if (formCSConditionsMet) {
    return { form: "FORM_C_S", dueDate, findings };
  }
  return { form: "FORM_C", dueDate, findings };
}

export function determineEciRequirement(entity: ReturnEntityProfile, eciBeforeExemption: Cents): EciResult {
  const findings: Finding[] = [];
  const dueDate = addMonths(entity.financialYearEnd, 3);
  const formStyleSummary: ComputationLine[] = [
    { code: "ECI.ESTIMATE", label: "Estimated chargeable income before exemptions", amount: eciBeforeExemption, kind: "TOTAL", source: "RULE" },
  ];
  if (entity.kind === "REIT" && entity.hasSection43_2ReitTreatment) {
    findings.push({ id: "ECI.REIT_WAIVER", severity: "INFO", message: REIT_TRUSTEE_ECI_NOTE });
    return { required: false, waived: true, dueDate, formStyleSummary, findings };
  }
  const waived = entity.annualRevenue <= FORM_CS_REVENUE_CAP && eciBeforeExemption <= 0;
  if (waived) {
    findings.push({ id: "ECI.WAIVER", severity: "INFO", message: "The ECI filing waiver applies because annual revenue is S$5 million or below and ECI before exemptions is nil." });
  }
  return { required: !waived, waived, dueDate, formStyleSummary, findings };
}

export function estimateEci(input: EciEstimateInput): EciResult {
  const estimate = input.estimatedChargeableIncome
    ?? input.chargeableIncomeBeforeExemptions
    ?? input.computationSummary?.chargeableIncomeBeforeExemptions
    ?? 0;
  return determineEciRequirement(input.entity, estimate);
}

export function buildReturnSummary(summary: TaxComputationSummary, entity: TaxComputationEntityProfile): readonly ComputationLine[] {
  const lines: ComputationLine[] = [
    { code: "RET.YA", label: `Year of Assessment ${summary.ya}`, amount: 0, kind: "HEADING", source: "RULE" },
    { code: "RET.REVENUE_STYLE_NOTE", label: "Form-style summary (not IRAS XML/API field names)", amount: 0, kind: "INFO", source: "RULE" },
    { code: "RET.PBT", label: "Profit / (loss) before tax", amount: summary.accountingProfitBeforeTax, kind: "AMOUNT", source: "RULE" },
    { code: "RET.ADJUSTED_PROFIT", label: "Adjusted profit", amount: summary.adjustedProfit, kind: "AMOUNT", source: "RULE" },
    { code: "RET.CI_BEFORE_EXEMPT", label: "Chargeable income (before exempt amount)", amount: summary.chargeableIncomeBeforeExemptions, kind: "AMOUNT", source: "RULE" },
    { code: "RET.EXEMPT_AMOUNT", label: "Exempt amount", amount: summary.exemptAmount, kind: "AMOUNT", source: "RULE" },
    { code: "RET.CI_AFTER_EXEMPT", label: "Chargeable income (after exempt amount)", amount: summary.chargeableIncome, kind: "AMOUNT", source: "RULE" },
    { code: "RET.TAX_PAYABLE", label: "Tax payable", amount: summary.taxPayable, kind: "TOTAL", source: "RULE" },
  ];
  if (entity.kind === "REIT") {
    lines.push({ code: "RET.REIT_INFO", label: "Trustee-level / distribution treatment to be handled outside this form-style summary", amount: 0, kind: "INFO", source: "RULE" });
  }
  return lines;
}

export function deriveBasisPeriods(incorporationDate: ISODate, financialYearEndMonth: number, financialYearEndDay: number, firstAccountsClosedOn: ISODate): readonly BasisPeriodSlice[] {
  const incorporationYear = Number(incorporationDate.slice(0, 4));
  const fyeCutoff = `${String(financialYearEndMonth).padStart(2, "0")}-${String(financialYearEndDay).padStart(2, "0")}`;
  const firstFyeYear = incorporationYear + (incorporationDate.slice(5, 10) > fyeCutoff ? 1 : 0);
  const firstFye = financialYearEnd(firstFyeYear, financialYearEndMonth, financialYearEndDay);
  if (firstAccountsClosedOn <= firstFye) {
    return [{ ya: yearOfAssessment(firstAccountsClosedOn), basisPeriodStart: incorporationDate, basisPeriodEnd: firstAccountsClosedOn }];
  }
  const secondBasisStart = addDays(firstFye, 1);
  const secondFye = financialYearEnd(firstFyeYear + 1, financialYearEndMonth, financialYearEndDay);
  if (firstAccountsClosedOn <= secondFye) {
    return [
      { ya: yearOfAssessment(firstFye), basisPeriodStart: incorporationDate, basisPeriodEnd: firstFye },
      { ya: yearOfAssessment(firstAccountsClosedOn), basisPeriodStart: secondBasisStart, basisPeriodEnd: firstAccountsClosedOn },
    ];
  }
  return [
    { ya: yearOfAssessment(firstFye), basisPeriodStart: incorporationDate, basisPeriodEnd: firstFye },
    { ya: yearOfAssessment(firstAccountsClosedOn), basisPeriodStart: secondBasisStart, basisPeriodEnd: firstAccountsClosedOn },
  ];
}

export function explainInstalmentFact(financialYearEnd: ISODate, filingDate: ISODate): ComputationLine {
  const days = diffDays(financialYearEnd, filingDate);
  const months = Math.max(0, Math.ceil(days / 30));
  const instalments = days <= 31 ? 10 : days <= 62 ? 8 : days <= 92 ? 6 : 0;
  return { code: "ECI.INSTALMENTS", label: `Indicative GIRO instalments (${months} months after FYE)`, amount: instalments, kind: "INFO", source: "RULE", note: "IRAS grants instalments only where the company is Singapore-registered, files within 3 months and is on GIRO." };
}

export const RULES = [
  {
    id: "returns.forms-and-eci.2022-plus",
    domain: "FILING",
    title: "Corporate return form selection and ECI filing",
    summary: "Form C-S (Lite), Form C-S and Form C depend on incorporation status, revenue, income profile and relief claims. ECI is due within 3 months from FYE unless a waiver or specific exemption applies.",
    effectiveFrom: "2022-01-01",
    sources: [
      {
        title: "IRAS | Overview of Form C-S/ Form C-S (Lite)/ Form C",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/form-c-s-form-c-s-(lite)-form-c-filing/overview-of-form-c-s-form-c-s-(lite)-form-c",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
      {
        title: "IRAS | Guidance on Filing Form C-S/ Form C-S (Lite)/ Form C",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/form-c-s-form-c-s-(lite)-form-c-filing/guidance-on-filing-form-c-s-form-c-s-(lite)-form-c",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
      {
        title: "IRAS | Estimated Chargeable Income (ECI) Filing",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/estimated-chargeable-income-(eci)-filing",
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
    notes: "This module returns a 'form-style summary' only and deliberately does not invent IRAS XML or API field names.",
  },
] as const;

export const NOTES = [ENGINE_DISCLAIMER];
