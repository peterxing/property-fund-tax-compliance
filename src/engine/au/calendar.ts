import { addDays, addMonths, compareISO, endOfMonth, monthOf, parseISO, toISO, type ISODate } from "../dates.ts";
import type { Effective, RuleEntry } from "../rules.ts";
import { ENGINE_DISCLAIMER_AU } from "../rules.ts";
import type { AuIncomeYear } from "./types.ts";

export type AuBasFrequency = "MONTHLY" | "QUARTERLY" | "ANNUAL";
export type AuAnnualDueMode = "STANDARD_31_OCTOBER" | "NO_TAX_RETURN_28_FEB" | "INCOME_TAX_RETURN_DUE_DATE";
export type AuPaygInstalmentType = "STANDARD_QUARTERLY" | "HEAD_COMPANY_QUARTERLY";

export interface AuBasDueDateInput {
  periodStart: ISODate;
  periodEnd: ISODate;
  frequency: AuBasFrequency;
  taxAgentConcession?: boolean;
  electronicLodgmentConcession?: boolean;
  annualTurnoverCents?: number;
  annualDueMode?: AuAnnualDueMode;
  incomeTaxReturnDueDate?: ISODate;
  extraPublicHolidays?: readonly ISODate[];
}

export interface AuReportingPeriod {
  periodStart: ISODate;
  periodEnd: ISODate;
  dueDate: ISODate;
  frequency: AuBasFrequency;
}

export const AU_BAS_FREQUENCIES = [
  { id: "MONTHLY", label: "Monthly", description: "Monthly BAS or IAS GST cycle." },
  { id: "QUARTERLY", label: "Quarterly", description: "Quarterly BAS GST cycle." },
  { id: "ANNUAL", label: "Annual", description: "Annual GST return cycle." },
] as const;

const AU_GST_MONTHLY_DECEMBER_CONCESSION: Effective<{ dueMonthOffset: number; dueDay: number; turnoverCapCents: number }>[]= [
  { from: "2000-07-01", value: { dueMonthOffset: 2, dueDay: 21, turnoverCapCents: 1_000_000_000 } },
];

const AU_BAS_QUARTERLY_DUE_DATES: Effective<readonly { quarterEndingMonth: number; originalMonthOffset: number; originalDay: number; agentDay?: number; agentMonthOffset?: number; onlineDay?: number; onlineMonthOffset?: number }[]>[] = [
  {
    from: "2000-07-01",
    value: [
      { quarterEndingMonth: 9, originalMonthOffset: 1, originalDay: 28, agentMonthOffset: 2, agentDay: 25, onlineMonthOffset: 2, onlineDay: 11 },
      { quarterEndingMonth: 12, originalMonthOffset: 2, originalDay: 28 },
      { quarterEndingMonth: 3, originalMonthOffset: 1, originalDay: 28, agentMonthOffset: 2, agentDay: 26, onlineMonthOffset: 2, onlineDay: 12 },
      { quarterEndingMonth: 6, originalMonthOffset: 1, originalDay: 28, agentMonthOffset: 2, agentDay: 25, onlineMonthOffset: 2, onlineDay: 11 },
    ],
  },
];

const AU_PENULTIMATE_ANNUAL_DUE_RULES: Effective<{ standardMonth: number; standardDay: number; noReturnMonthOffset: number; noReturnDay: number }>[]= [
  { from: "2000-07-01", value: { standardMonth: 10, standardDay: 31, noReturnMonthOffset: 8, noReturnDay: 28 } },
];

function assertDateRange(periodStart: ISODate, periodEnd: ISODate): void {
  if (compareISO(periodStart, periodEnd) > 0) throw new RangeError(`periodStart must be on or before periodEnd, got ${periodStart} > ${periodEnd}`);
}

function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISO(year, month, day);
}

function weekday(date: ISODate): number {
  const { y, m, d } = parseISO(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function observedFixedHoliday(year: number, month: number, day: number): ISODate[] {
  const actual = toISO(year, month, day);
  const dow = weekday(actual);
  if (dow === 6) return [actual, addDays(actual, 2)];
  if (dow === 0) return [actual, addDays(actual, 1)];
  return [actual];
}

export function getAuNationalPublicHolidays(year: number): ISODate[] {
  const easter = easterSunday(year);
  return [
    ...observedFixedHoliday(year, 1, 1),
    ...observedFixedHoliday(year, 1, 26),
    addDays(easter, -2),
    addDays(easter, 1),
    ...observedFixedHoliday(year, 4, 25),
    ...observedFixedHoliday(year, 12, 25),
    ...observedFixedHoliday(year, 12, 26),
  ].sort();
}

export function rollForwardToBusinessDay(date: ISODate, extraPublicHolidays: readonly ISODate[] = []): ISODate {
  let current = date;
  const years = new Set([parseISO(date).y, parseISO(date).y + 1]);
  const holidays = new Set<string>(extraPublicHolidays);
  for (const year of years) {
    for (const holiday of getAuNationalPublicHolidays(year)) holidays.add(holiday);
  }
  while (weekday(current) === 0 || weekday(current) === 6 || holidays.has(current)) {
    current = addDays(current, 1);
  }
  return current;
}

export function calculateAuBasDueDate(input: AuBasDueDateInput): ISODate {
  const { periodStart, periodEnd, frequency, taxAgentConcession = false, electronicLodgmentConcession = false, annualTurnoverCents = 0, annualDueMode = "STANDARD_31_OCTOBER", incomeTaxReturnDueDate, extraPublicHolidays = [] } = input;
  assertDateRange(periodStart, periodEnd);
  let due: ISODate;

  if (frequency === "MONTHLY") {
    const candidate = addMonths(endOfMonth(periodEnd), 1);
    const decemberConcession = monthOf(periodEnd) === 12 && taxAgentConcession && annualTurnoverCents <= AU_GST_MONTHLY_DECEMBER_CONCESSION[0]!.value.turnoverCapCents;
    const row = AU_GST_MONTHLY_DECEMBER_CONCESSION[0]!.value;
    due = decemberConcession ? toISO(parseISO(candidate).y, parseISO(candidate).m + 1, row.dueDay) : toISO(parseISO(candidate).y, parseISO(candidate).m, 21);
  } else if (frequency === "QUARTERLY") {
    const quarter = AU_BAS_QUARTERLY_DUE_DATES[0]!.value.find((entry) => entry.quarterEndingMonth === monthOf(periodEnd));
    if (!quarter) throw new RangeError(`periodEnd ${periodEnd} is not a standard quarter end`);
    const monthOffset = taxAgentConcession && quarter.agentMonthOffset !== undefined ? quarter.agentMonthOffset : electronicLodgmentConcession && quarter.onlineMonthOffset !== undefined ? quarter.onlineMonthOffset : quarter.originalMonthOffset;
    const dueDay = taxAgentConcession && quarter.agentDay !== undefined ? quarter.agentDay : electronicLodgmentConcession && quarter.onlineDay !== undefined ? quarter.onlineDay : quarter.originalDay;
    const base = addMonths(endOfMonth(periodEnd), monthOffset);
    due = toISO(parseISO(base).y, parseISO(base).m, dueDay);
  } else {
    if (annualDueMode === "INCOME_TAX_RETURN_DUE_DATE") {
      if (!incomeTaxReturnDueDate) throw new RangeError("incomeTaxReturnDueDate is required when annualDueMode is INCOME_TAX_RETURN_DUE_DATE");
      due = incomeTaxReturnDueDate;
    } else if (annualDueMode === "NO_TAX_RETURN_28_FEB") {
      const base = addMonths(endOfMonth(periodEnd), AU_PENULTIMATE_ANNUAL_DUE_RULES[0]!.value.noReturnMonthOffset);
      due = toISO(parseISO(base).y, parseISO(base).m, AU_PENULTIMATE_ANNUAL_DUE_RULES[0]!.value.noReturnDay);
    } else {
      due = toISO(parseISO(periodEnd).y, AU_PENULTIMATE_ANNUAL_DUE_RULES[0]!.value.standardMonth, AU_PENULTIMATE_ANNUAL_DUE_RULES[0]!.value.standardDay);
    }
  }

  return rollForwardToBusinessDay(due, extraPublicHolidays);
}

export function calculateAuPaygInstalmentDueDate(periodEnd: ISODate, type: AuPaygInstalmentType = "STANDARD_QUARTERLY", extraPublicHolidays: readonly ISODate[] = []): ISODate {
  const month = monthOf(periodEnd);
  if (![3, 6, 9, 12].includes(month)) throw new RangeError(`periodEnd ${periodEnd} is not a quarter end`);
  const base = addMonths(endOfMonth(periodEnd), 1);
  const dueDay = type === "HEAD_COMPANY_QUARTERLY" ? 21 : month === 12 ? 28 : 28;
  return rollForwardToBusinessDay(toISO(parseISO(base).y, parseISO(base).m, dueDay), extraPublicHolidays);
}

export function listAuReportingPeriods(input: {
  incomeYearEnd: AuIncomeYear;
  frequency: AuBasFrequency;
  taxAgentConcession?: boolean;
  electronicLodgmentConcession?: boolean;
  annualTurnoverCents?: number;
  annualDueMode?: AuAnnualDueMode;
  incomeTaxReturnDueDate?: ISODate;
  extraPublicHolidays?: readonly ISODate[];
}): AuReportingPeriod[] {
  const { incomeYearEnd, frequency, taxAgentConcession, electronicLodgmentConcession, annualTurnoverCents, annualDueMode, incomeTaxReturnDueDate, extraPublicHolidays } = input;
  const fyStart = toISO(incomeYearEnd - 1, 7, 1);
  const fyEnd = toISO(incomeYearEnd, 6, 30);
  if (frequency === "ANNUAL") {
    return [{ periodStart: fyStart, periodEnd: fyEnd, dueDate: calculateAuBasDueDate({ periodStart: fyStart, periodEnd: fyEnd, frequency, taxAgentConcession, electronicLodgmentConcession, annualTurnoverCents, annualDueMode, incomeTaxReturnDueDate, extraPublicHolidays }), frequency }];
  }

  const periods: AuReportingPeriod[] = [];
  let current = fyStart;
  while (compareISO(current, fyEnd) <= 0) {
    const end = frequency === "MONTHLY" ? endOfMonth(current) : endOfMonth(addMonths(current, 2));
    periods.push({
      periodStart: current,
      periodEnd: end,
      dueDate: calculateAuBasDueDate({ periodStart: current, periodEnd: end, frequency, taxAgentConcession, electronicLodgmentConcession, annualTurnoverCents, annualDueMode, incomeTaxReturnDueDate, extraPublicHolidays }),
      frequency,
    });
    current = addDays(end, 1);
  }
  return periods;
}

export const RULES = [
  {
    id: "au-gst.calendar.bas-due-dates.2026-10-10",
    domain: "AU_FILING",
    title: "ATO BAS and annual GST return due dates",
    summary: "Monthly BAS is generally due on the 21st of the following month; quarterly BAS is generally due 28 days after quarter end except quarter 2 on 28 February; annual GST returns are due on 31 October or 28 February where no income-tax return is required, subject to next-business-day rollover and agent concessions.",
    effectiveFrom: "2000-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "ATO | Due dates for lodging and paying your BAS", url: "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas/due-dates-for-lodging-and-paying-your-bas", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Activity statements", url: "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/reports-and-returns/due-dates-for-lodging-and-paying/due-dates-by-topic/activity-statements", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Activity statements (registered agent lodgment program)", url: "https://www.ato.gov.au/tax-and-super-professionals/for-tax-professionals/prepare-and-lodge/registered-agent-lodgment-program/due-dates-by-obligation-type/activity-statements", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Annual GST reporting", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/lodging-your-bas-or-annual-gst-return/options-for-reporting-and-paying-gst/annual-gst-reporting", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    notes: "The agent-program quarterly dates are modelled as data for the 2025-26 and 2026-27 published program years. Annual GST returns that follow the client's income-tax return due date require that due date to be supplied by the caller.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER_AU];
