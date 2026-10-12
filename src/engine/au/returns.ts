import { addMonths, endOfMonth, parseISO, toISO, type ISODate } from "../dates.ts";
import { max0, type Cents } from "../money.ts";
import { ENGINE_DISCLAIMER_AU, type RuleEntry } from "../rules.ts";
import type { Finding } from "../types.ts";
import type { AuIncomeYear, AuTaxRegime } from "./types.ts";
import { AU_DEFAULT_YEAR_END, auIncomeYearEnd, auIncomeYearLabel, auSapCompanyLodgmentDueDate, auSapCompanyPaymentDueDate, auSapTrustLodgmentDueDate, type AuIncomeYearEnd } from "./dates.ts";

const RETRIEVED: ISODate = "2026-10-10";

export type AuReturnType = "AMIT_TAX_RETURN" | "TRUST_TAX_RETURN" | "COMPANY_TAX_RETURN";
export type AuLodgerType = "SELF" | "REGISTERED_AGENT";

export const AU_RETURN_TYPES: readonly { id: AuReturnType; label: string; description: string }[] = [
  { id: "AMIT_TAX_RETURN", label: "AMIT tax return", description: "Electronic Attribution Managed Investment Trust return that also operates as the AMIT election when lodged." },
  { id: "TRUST_TAX_RETURN", label: "Trust tax return", description: "Ordinary trust return for MITs, unit trusts and discretionary trusts that are not taxed as companies." },
  { id: "COMPANY_TAX_RETURN", label: "Company tax return", description: "Company return used by companies and public trading trusts taxed like companies." },
] as const;

export interface AuReturnProfile {
  incomeYear: AuIncomeYear;
  regime: AuTaxRegime;
  lodgedBy?: AuLodgerType;
  yearEnd?: AuIncomeYearEnd;
  priorYearReturnsOutstanding?: boolean;
  prosecutedForNonLodgment?: boolean;
  mayRequireEarlyLodgment?: boolean;
  annualTotalIncome?: Cents;
  latestYearTaxable?: boolean;
  latestYearTaxLiability?: Cents;
  isNewRegistrant?: boolean;
  totalIncomePreviousYear?: Cents;
  nonFullSelfAssessment?: boolean;
  applyFiveJuneConcession?: boolean;
  expectsCurrentYearNonTaxableOrRefund?: boolean;
  expectsPriorYearNonTaxableOrRefund?: boolean;
}

export interface AuReturnDecision {
  returnType: AuReturnType;
  dueDate: ISODate;
  paymentDueDate?: ISODate;
  concessionDueDate?: ISODate;
  findings: readonly Finding[];
  notes: readonly string[];
}

function isStandardYearEnd(yearEnd: AuIncomeYearEnd): boolean {
  return yearEnd.month === 6 && yearEnd.day === 30;
}

function baseReturnType(regime: AuTaxRegime): AuReturnType {
  if (regime === "AMIT") return "AMIT_TAX_RETURN";
  if (regime === "COMPANY" || regime === "PUBLIC_TRADING_TRUST") return "COMPANY_TAX_RETURN";
  return "TRUST_TAX_RETURN";
}

function selfLodgerDueDate(incomeYear: AuIncomeYear, returnType: AuReturnType, yearEnd: AuIncomeYearEnd): AuReturnDecision {
  const findings: Finding[] = [];
  const notes = [ENGINE_DISCLAIMER_AU];
  if (!isStandardYearEnd(yearEnd)) {
    if (returnType === "COMPANY_TAX_RETURN") {
      const dueDate = auSapCompanyLodgmentDueDate(incomeYear, yearEnd);
      const paymentDueDate = auSapCompanyPaymentDueDate(incomeYear, yearEnd);
      notes.push("The substituted accounting period due date is modelled from the ATO SAP program timing used for companies and super funds.");
      return { returnType, dueDate, paymentDueDate, findings, notes };
    }
    const dueDate = returnType === "AMIT_TAX_RETURN"
      ? auSapTrustLodgmentDueDate(incomeYear, yearEnd)
      : auSapTrustLodgmentDueDate(incomeYear, yearEnd);
    notes.push("For non-30 June balancers, trust-style lodgment is modelled to the last day of the fourth month after year end.");
    return { returnType, dueDate, findings, notes };
  }
  const dueDate = `${incomeYear}-10-31` as ISODate;
  if (returnType === "COMPANY_TAX_RETURN") {
    return { returnType, dueDate, paymentDueDate: `${incomeYear}-12-01` as ISODate, findings, notes };
  }
  return { returnType, dueDate, findings, notes };
}

function registeredAgentDueDate(profile: AuReturnProfile, returnType: AuReturnType, yearEnd: AuIncomeYearEnd): AuReturnDecision {
  const findings: Finding[] = [];
  const notes = [ENGINE_DISCLAIMER_AU];
  const endDate = auIncomeYearEnd(profile.incomeYear, yearEnd);
  if (!isStandardYearEnd(yearEnd)) {
    if (returnType === "COMPANY_TAX_RETURN") {
      return { returnType, dueDate: auSapCompanyLodgmentDueDate(profile.incomeYear, yearEnd), paymentDueDate: auSapCompanyPaymentDueDate(profile.incomeYear, yearEnd), findings, notes };
    }
    return { returnType, dueDate: auSapTrustLodgmentDueDate(profile.incomeYear, yearEnd), findings, notes };
  }
  if (returnType === "AMIT_TAX_RETURN") {
    findings.push({ id: "AURET.AMIT_ELECTION", severity: "INFO", message: "Lodging the AMIT return is taken to make the irrevocable AMIT choice for the income year." });
    return { returnType, dueDate: `${profile.incomeYear}-10-31` as ISODate, findings, notes };
  }
  if (returnType === "TRUST_TAX_RETURN") {
    if (profile.priorYearReturnsOutstanding || profile.prosecutedForNonLodgment) return { returnType, dueDate: `${profile.incomeYear}-10-31` as ISODate, findings, notes };
    if ((profile.annualTotalIncome ?? 0) > 1_000_000_000 && profile.latestYearTaxable) return { returnType, dueDate: `${profile.incomeYear + 1}-01-31` as ISODate, findings, notes };
    if ((profile.annualTotalIncome ?? 0) > 1_000_000_000 && (profile.latestYearTaxable === false || profile.isNewRegistrant)) return { returnType, dueDate: `${profile.incomeYear + 1}-02-28` as ISODate, findings, notes };
    if (max0(profile.latestYearTaxLiability ?? 0) >= 2_000_000) return { returnType, dueDate: `${profile.incomeYear + 1}-03-31` as ISODate, findings, notes };
    const concessionDueDate = profile.applyFiveJuneConcession && Boolean(profile.expectsCurrentYearNonTaxableOrRefund && profile.expectsPriorYearNonTaxableOrRefund)
      ? `${profile.incomeYear + 1}-06-05` as ISODate
      : undefined;
    return {
      returnType,
      dueDate: `${profile.incomeYear + 1}-05-15` as ISODate,
      ...(concessionDueDate ? { concessionDueDate } : {}),
      findings,
      notes,
    };
  }
  if (profile.priorYearReturnsOutstanding || profile.prosecutedForNonLodgment || profile.mayRequireEarlyLodgment) {
    return { returnType, dueDate: `${profile.incomeYear}-10-31` as ISODate, paymentDueDate: `${profile.incomeYear}-12-01` as ISODate, findings, notes };
  }
  if (profile.nonFullSelfAssessment) {
    return { returnType, dueDate: `${profile.incomeYear}-12-01` as ISODate, findings, notes };
  }
  if ((profile.annualTotalIncome ?? 0) > 1_000_000_000 && profile.latestYearTaxable) {
    return { returnType, dueDate: `${profile.incomeYear + 1}-01-31` as ISODate, paymentDueDate: `${profile.incomeYear}-12-01` as ISODate, findings, notes };
  }
  if ((profile.annualTotalIncome ?? 0) > 1_000_000_000 && (profile.latestYearTaxable === false || profile.isNewRegistrant)) {
    return { returnType, dueDate: `${profile.incomeYear + 1}-02-28` as ISODate, paymentDueDate: `${profile.incomeYear + 1}-02-28` as ISODate, findings, notes };
  }
  if (max0(profile.totalIncomePreviousYear ?? 0) > 200_000_000) {
    return { returnType, dueDate: `${profile.incomeYear + 1}-03-31` as ISODate, paymentDueDate: `${profile.incomeYear + 1}-03-31` as ISODate, findings, notes };
  }
  const baseDueDate = `${profile.incomeYear + 1}-05-15` as ISODate;
  const concessionDueDate = profile.applyFiveJuneConcession && Boolean(profile.expectsCurrentYearNonTaxableOrRefund && profile.expectsPriorYearNonTaxableOrRefund)
    ? `${profile.incomeYear + 1}-06-05` as ISODate
    : undefined;
  return {
    returnType,
    dueDate: baseDueDate,
    paymentDueDate: concessionDueDate ?? baseDueDate,
    ...(concessionDueDate ? { concessionDueDate } : {}),
    findings,
    notes,
  };
}

export function determineAuReturn(profile: AuReturnProfile): AuReturnDecision {
  const yearEnd = profile.yearEnd ?? AU_DEFAULT_YEAR_END;
  const returnType = baseReturnType(profile.regime);
  return (profile.lodgedBy ?? "SELF") === "REGISTERED_AGENT"
    ? registeredAgentDueDate(profile, returnType, yearEnd)
    : selfLodgerDueDate(profile.incomeYear, returnType, yearEnd);
}

export function auReturnDueDate(profile: AuReturnProfile): ISODate {
  return determineAuReturn(profile).dueDate;
}

export const RULES: readonly RuleEntry[] = [
  {
    id: "au-returns.amit-trust-company.2026-07-01",
    domain: "AU_FILING",
    title: "Australian entity return selection for property vehicles",
    summary: "AMITs use the AMIT tax return, MITs and ordinary trusts use a trust tax return, and companies plus public trading trusts use a company tax return.",
    effectiveFrom: "2026-07-01",
    sources: [
      {
        title: "ATO | Attribution Managed Investment Trust tax return instructions 2026 – how to lodge your AMIT tax return and pay",
        url: "https://www.ato.gov.au/forms-and-instructions/attribution-managed-investment-trust-tax-return-instructions-2026/how-to-lodge-your-amit-tax-return-and-pay",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Company tax return 2026 instructions – how to lodge your company tax return and pay",
        url: "https://www.ato.gov.au/forms-and-instructions/company-tax-return-2026-instructions/how-to-lodge-your-company-tax-return-and-pay",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Trust tax return 2025 instructions – how to lodge and pay the trust tax return 2025",
        url: "https://www.ato.gov.au/forms-and-instructions/trust-tax-return-2025-instructions/how-to-lodge-and-pay-the-trust-tax-return-2025",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
    ],
    confidence: "VERIFIED",
    notes: "AMIT election consequences are surfaced as filing notes only; AMMA statements and MIT withholding are handled in separate modules.",
  },
  {
    id: "au-returns.due-dates.2026-07-01",
    domain: "AU_FILING",
    title: "Australian income-tax return due dates for June balancers and substituted accounting periods",
    summary: "Self-lodger June balancers are modelled at 31 October. Registered-agent due dates depend on lodgment history, size, tax liability and SAP status, with specific ATO dates for companies and trusts.",
    effectiveFrom: "2026-07-01",
    sources: [
      {
        title: "ATO | Due dates by topic – income tax",
        url: "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/reports-and-returns/due-dates-for-lodging-and-paying/due-dates-by-topic/income-tax",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Registered agent lodgment program – individuals and trusts",
        url: "https://www.ato.gov.au/tax-and-super-professionals/for-tax-professionals/prepare-and-lodge/registered-agent-lodgment-program/due-dates-for-tax-returns-by-client-type/individuals-and-trusts",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Registered agent lodgment program – companies and super funds",
        url: "https://www.ato.gov.au/tax-and-super-professionals/for-tax-professionals/prepare-and-lodge/registered-agent-lodgment-program/due-dates-for-tax-returns-by-client-type/companies-and-super-funds",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Substituted accounting periods",
        url: "https://www.ato.gov.au/tax-and-super-professionals/for-tax-professionals/prepare-and-lodge/registered-agent-lodgment-program/due-dates-for-tax-returns-by-client-type/substituted-accounting-periods",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
    ],
    confidence: "VERIFIED",
    notes: "The standard 31 October self-lodger date for June balancers is kept as product policy for this platform. Some ATO programs provide later dates for specific populations; callers should override where a different legislative instrument or deferral applies. This module shows the statutory ATO date only and does not adjust weekends or public holidays to the next business day.",
  },
] as const;
