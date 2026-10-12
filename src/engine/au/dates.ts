import { addDays, addMonths, daysInMonth, endOfMonth, parseISO, toISO, type ISODate } from "../dates.ts";
import type { Effective, RuleEntry } from "../rules.ts";

export interface AuIncomeYearEnd {
  month: number;
  day: number;
}

export interface AuIncomeYearQuarter {
  quarter: 1 | 2 | 3 | 4;
  start: ISODate;
  end: ISODate;
  label: string;
}

export const AU_DEFAULT_YEAR_END: AuIncomeYearEnd = { month: 6, day: 30 };
const RETRIEVED: ISODate = "2026-10-10";

function assertYearEnd(yearEnd: AuIncomeYearEnd): AuIncomeYearEnd {
  if (!Number.isInteger(yearEnd.month) || yearEnd.month < 1 || yearEnd.month > 12) {
    throw new RangeError(`Invalid income-year end month: ${yearEnd.month}`);
  }
  if (!Number.isInteger(yearEnd.day) || yearEnd.day < 1 || yearEnd.day > daysInMonth(2000, yearEnd.month)) {
    throw new RangeError(`Invalid income-year end day: ${yearEnd.day}`);
  }
  return yearEnd;
}

function clampYearEndDay(year: number, yearEnd: AuIncomeYearEnd): number {
  return Math.min(yearEnd.day, daysInMonth(year, yearEnd.month));
}

function yearEndDate(year: number, yearEnd: AuIncomeYearEnd): ISODate {
  const rule = assertYearEnd(yearEnd);
  return toISO(year, rule.month, clampYearEndDay(year, rule));
}

export function auIncomeYearEnding(date: ISODate, yearEnd: AuIncomeYearEnd = AU_DEFAULT_YEAR_END): number {
  const parsed = parseISO(date);
  const endThisYear = yearEndDate(parsed.y, yearEnd);
  return date <= endThisYear ? parsed.y : parsed.y + 1;
}

export function auIncomeYearEnd(year: number, yearEnd: AuIncomeYearEnd = AU_DEFAULT_YEAR_END): ISODate {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new RangeError(`Unsupported Australian income year: ${year}`);
  return yearEndDate(year, yearEnd);
}

export function auIncomeYearStart(year: number, yearEnd: AuIncomeYearEnd = AU_DEFAULT_YEAR_END): ISODate {
  return addDays(auIncomeYearEnd(year - 1, yearEnd), 1);
}

export function auIncomeYearLabel(year: number, yearEnd: AuIncomeYearEnd = AU_DEFAULT_YEAR_END): string {
  const startYear = parseISO(auIncomeYearStart(year, yearEnd)).y;
  const endYear = parseISO(auIncomeYearEnd(year, yearEnd)).y;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

export function auQuarterForDate(date: ISODate, yearEnd: AuIncomeYearEnd = AU_DEFAULT_YEAR_END): AuIncomeYearQuarter {
  const year = auIncomeYearEnding(date, yearEnd);
  const quarters = auIncomeYearQuarters(year, yearEnd);
  const match = quarters.find((quarter) => date >= quarter.start && date <= quarter.end);
  if (!match) throw new RangeError(`Date ${date} is not within an Australian income-year quarter.`);
  return match;
}

export function auIncomeYearQuarters(year: number, yearEnd: AuIncomeYearEnd = AU_DEFAULT_YEAR_END): readonly AuIncomeYearQuarter[] {
  const start = auIncomeYearStart(year, yearEnd);
  const items: AuIncomeYearQuarter[] = [];
  for (const quarter of [1, 2, 3, 4] as const) {
    const quarterStart = addMonths(start, (quarter - 1) * 3);
    const quarterEnd = addDays(addMonths(quarterStart, 3), -1);
    items.push({ quarter, start: quarterStart, end: quarterEnd, label: `Q${quarter} ${auIncomeYearLabel(year, yearEnd)}` });
  }
  return items;
}

export function auQuarterStart(year: number, quarter: 1 | 2 | 3 | 4, yearEnd: AuIncomeYearEnd = AU_DEFAULT_YEAR_END): ISODate {
  return auIncomeYearQuarters(year, yearEnd)[quarter - 1]!.start;
}

export function auQuarterEnd(year: number, quarter: 1 | 2 | 3 | 4, yearEnd: AuIncomeYearEnd = AU_DEFAULT_YEAR_END): ISODate {
  return auIncomeYearQuarters(year, yearEnd)[quarter - 1]!.end;
}

export function auNextIncomeYearEnd(after: ISODate, yearEnd: AuIncomeYearEnd = AU_DEFAULT_YEAR_END): ISODate {
  return auIncomeYearEnd(auIncomeYearEnding(after, yearEnd), yearEnd);
}

export function auSapTrustLodgmentDueDate(year: number, yearEnd: AuIncomeYearEnd): ISODate {
  return endOfMonth(addMonths(auIncomeYearEnd(year, yearEnd), 4));
}

export function auSapCompanyPaymentDueDate(year: number, yearEnd: AuIncomeYearEnd): ISODate {
  const monthSix = addMonths(auIncomeYearEnd(year, yearEnd), 6);
  const parsed = parseISO(monthSix);
  return toISO(parsed.y, parsed.m, 1);
}

export function auSapCompanyLodgmentDueDate(year: number, yearEnd: AuIncomeYearEnd): ISODate {
  const monthSeven = addMonths(auIncomeYearEnd(year, yearEnd), 7);
  const parsed = parseISO(monthSeven);
  return toISO(parsed.y, parsed.m, 15);
}

const DUE_DATE_METHODS: readonly Effective<string>[] = [
  { from: "2025-07-01", value: "ATO registered-agent substituted-accounting-period guidance uses trust lodgment by the last day of the fourth month after year end, company payment by the first day of the sixth month, and company lodgment by the 15th day of the seventh month." },
];

export const RULES: readonly RuleEntry[] = [
  {
    id: "au-dates.income-year-and-sap-dates.2025-07-01",
    domain: "AU_FILING",
    title: "Australian income-year and substituted accounting period date conventions",
    summary: "The default Australian income year runs from 1 July to 30 June. For approved substituted accounting periods, trust lodgment is modelled to the last day of the fourth month after year end and company lodgment/payment to the seventh/sixth month milestones.",
    effectiveFrom: "2025-07-01",
    sources: [
      {
        title: "ATO | Due dates by topic – income tax",
        url: "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/reports-and-returns/due-dates-for-lodging-and-paying/due-dates-by-topic/income-tax",
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
    notes: DUE_DATE_METHODS[0]!.value,
  },
] as const;
