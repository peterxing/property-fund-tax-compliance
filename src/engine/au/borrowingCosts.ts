import { addDays, diffDays, parseISO, toISO, type ISODate } from "../dates.ts";
import { allocate, assertCents, mulRatio, type Cents } from "../money.ts";
import { ENGINE_DISCLAIMER_AU, type RuleEntry } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";
import type { AuIncomeYear } from "./types.ts";

const RETRIEVED: ISODate = "2026-10-10";
const FIVE_YEARS_DAYS = 365 * 5 + 1;

function incomeYearStart(incomeYear: AuIncomeYear): ISODate {
  return toISO(incomeYear - 1, 7, 1);
}

function incomeYearEnd(incomeYear: AuIncomeYear): ISODate {
  return toISO(incomeYear, 6, 30);
}

function overlapDays(startA: ISODate, endA: ISODate, startB: ISODate, endB: ISODate): number {
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  return start > end ? 0 : diffDays(start, addDays(end, 1));
}

function incomeYearForDate(date: ISODate): AuIncomeYear {
  const { y, m } = parseISO(date);
  return m >= 7 ? y + 1 : y;
}

export interface BorrowingExpenseInput {
  amount: Cents;
  incurredDate: ISODate;
  loanStartDate?: ISODate;
  loanEndDate: ISODate;
  taxableUseBps?: number;
}

export interface BorrowingExpenseYearLine {
  incomeYear: AuIncomeYear;
  openingUnclaimedAmount: Cents;
  deduction: Cents;
  closingUnclaimedAmount: Cents;
  relevantDays: number;
  remainingLoanDays: number;
}

export interface BorrowingExpenseScheduleResult {
  lines: readonly BorrowingExpenseYearLine[];
  computationLines: readonly ComputationLine[];
  findings: Finding[];
  notes: string[];
}

export interface BlackholeExpenditureInput {
  amount: Cents;
  incurredDate: ISODate;
  taxableUseBps?: number;
}

export interface BlackholeExpenditureYearLine {
  incomeYear: AuIncomeYear;
  deduction: Cents;
}

export interface BlackholeExpenditureScheduleResult {
  lines: readonly BlackholeExpenditureYearLine[];
  computationLines: readonly ComputationLine[];
  findings: Finding[];
  notes: string[];
}

export function computeBorrowingExpenseSchedule(input: BorrowingExpenseInput): BorrowingExpenseScheduleResult {
  if (input.amount < 0) throw new RangeError("amount cannot be negative.");
  const taxableUseBps = input.taxableUseBps ?? 10_000;
  if (taxableUseBps < 0 || taxableUseBps > 10_000) throw new RangeError("taxableUseBps must be between 0 and 10,000.");
  const loanStartDate = input.loanStartDate ?? input.incurredDate;
  if (input.loanEndDate < loanStartDate) throw new RangeError("loanEndDate cannot be before loanStartDate.");
  const deductibleAmount = mulRatio(assertCents(input.amount), taxableUseBps, 10_000);
  const firstYear = incomeYearForDate(loanStartDate);
  const fiveYearEndDate = addDays(toISO(parseISO(loanStartDate).y + 5, parseISO(loanStartDate).m, parseISO(loanStartDate).d), -1);
  const amortisationEnd = input.loanEndDate < fiveYearEndDate ? input.loanEndDate : fiveYearEndDate;
  if (deductibleAmount <= 10_000) {
    return {
      lines: [{ incomeYear: firstYear, openingUnclaimedAmount: deductibleAmount, deduction: deductibleAmount, closingUnclaimedAmount: 0, relevantDays: overlapDays(loanStartDate, amortisationEnd, incomeYearStart(firstYear), incomeYearEnd(firstYear)), remainingLoanDays: diffDays(loanStartDate, addDays(amortisationEnd, 1)) }],
      computationLines: [{ code: `AU.BORROWING.${firstYear}.IMMEDIATE`, label: "Borrowing expenses immediately deductible (≤ $100)", amount: deductibleAmount, kind: "AMOUNT", source: "SCHEDULE", ref: "s25-25(6) ITAA 1997" }],
      findings: [],
      notes: [ENGINE_DISCLAIMER_AU, "Borrowing expenses of $100 or less are immediately deductible to the extent of taxable use in the year incurred."],
    };
  }
  const lines: BorrowingExpenseYearLine[] = [];
  const computationLines: ComputationLine[] = [];
  let remaining = deductibleAmount;
  for (let year = firstYear; incomeYearStart(year) <= amortisationEnd; year += 1) {
    const relevantDays = overlapDays(loanStartDate, amortisationEnd, incomeYearStart(year), incomeYearEnd(year));
    if (relevantDays <= 0) continue;
    const remainingLoanStart = year === firstYear ? loanStartDate : incomeYearStart(year);
    const remainingLoanDays = diffDays(remainingLoanStart, addDays(amortisationEnd, 1));
    const deduction = year === incomeYearForDate(amortisationEnd) ? remaining : mulRatio(remaining, relevantDays, remainingLoanDays);
    const openingUnclaimedAmount = remaining;
    remaining -= deduction;
    lines.push({ incomeYear: year, openingUnclaimedAmount, deduction, closingUnclaimedAmount: remaining, relevantDays, remainingLoanDays });
    computationLines.push({ code: `AU.BORROWING.${year}`, label: `Borrowing expense deduction (${year})`, amount: deduction, kind: "AMOUNT", source: "SCHEDULE", ref: "s25-25(4) ITAA 1997", note: `${relevantDays} relevant day(s) over ${remainingLoanDays} day(s) remaining in the loan period.` });
  }
  return {
    lines,
    computationLines,
    findings: [],
    notes: [
      ENGINE_DISCLAIMER_AU,
      "The schedule follows the statutory remaining-expenditure / remaining-loan-period method in section 25-25(4), using actual day counts for the remaining loan period. Leap years are therefore picked up automatically.",
      "Early repayment accelerates the final deduction because the remaining loan period shortens under section 25-25(5).",
    ],
  };
}

export function computeBlackholeExpenditureSchedule(input: BlackholeExpenditureInput): BlackholeExpenditureScheduleResult {
  if (input.amount < 0) throw new RangeError("amount cannot be negative.");
  const taxableUseBps = input.taxableUseBps ?? 10_000;
  if (taxableUseBps < 0 || taxableUseBps > 10_000) throw new RangeError("taxableUseBps must be between 0 and 10,000.");
  const deductibleAmount = mulRatio(assertCents(input.amount), taxableUseBps, 10_000);
  const startYear = incomeYearForDate(input.incurredDate);
  const annual = allocate(deductibleAmount, [1, 1, 1, 1, 1]);
  const lines: BlackholeExpenditureYearLine[] = annual.map((deduction, index) => ({ incomeYear: startYear + index, deduction }));
  return {
    lines,
    computationLines: lines.map((line) => ({ code: `AU.BLACKHOLE.${line.incomeYear}`, label: `Section 40-880 deduction (${line.incomeYear})`, amount: line.deduction, kind: "AMOUNT", source: "SCHEDULE", ref: "s40-880(2) ITAA 1997" })),
    findings: [],
    notes: [ENGINE_DISCLAIMER_AU, "This module models the standard five-income-year straight-line deduction under section 40-880(2). Immediate start-up deductions for qualifying small businesses under section 40-880(2A) are not separately modelled."],
  };
}

export const RULES: readonly RuleEntry[] = [
  {
    id: "au-borrowing-expenses.25-25",
    domain: "AU_CAPITAL_ALLOWANCES",
    title: "Section 25-25 borrowing expenses",
    summary: "Borrowing expenses are deducted over the shorter of 5 years and the actual loan period, unless the deductible amount is $100 or less in the year incurred. The statutory method recalculates the remaining expenditure by reference to the remaining loan period each year, so early repayment accelerates the final claim.",
    effectiveFrom: "1997-07-01",
    sources: [
      { title: "ATO legal database | ITAA 1997 section 25-25", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/25-25", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Borrowing expenses", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties/rental-expenses/borrowing-expenses", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "Federal Register of Legislation | Income Tax Assessment Act 1997", url: "https://www.legislation.gov.au/C2004A05138/latest/text", retrieved: RETRIEVED, publisher: "Federal Register of Legislation" },
    ],
    confidence: "VERIFIED",
    notes: "The module returns cents and assumes the caller has already identified the deductible portion of mixed-purpose borrowings via taxableUseBps.",
  },
  {
    id: "au-blackhole-expenditure.40-880",
    domain: "AU_CAPITAL_ALLOWANCES",
    title: "Section 40-880 business-related capital expenditure",
    summary: "Section 40-880 generally spreads eligible business-related capital expenditure over 5 income years starting in the year incurred, provided the expenditure is not otherwise deductible or included in a depreciating asset, land, lease/right or CGT cost base.",
    effectiveFrom: "2005-07-01",
    sources: [
      { title: "ATO legal database | ITAA 1997 section 40-880", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/40-880", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "Federal Register of Legislation | Income Tax Assessment Act 1997", url: "https://www.legislation.gov.au/C2004A05138/latest/text", retrieved: RETRIEVED, publisher: "Federal Register of Legislation" },
    ],
    confidence: "VERIFIED",
    notes: "This module is limited to the standard five-year rule in section 40-880(2); the immediate start-up deduction for qualifying smaller businesses is left to manual review.",
  },
] as const;
