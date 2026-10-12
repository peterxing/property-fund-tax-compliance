/**
 * Calendar-date helpers. Dates are ISO strings "YYYY-MM-DD" and every calculation is done in UTC
 * so results never depend on the server's or browser's time zone. Singapore is UTC+8 with no DST,
 * so a business date in Singapore is represented by the same ISO string everywhere.
 */

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string") return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parseISO(s: ISODate): { y: number; m: number; d: number } {
  const m = ISO_RE.exec(s);
  if (!m || !isISODate(s)) throw new RangeError(`Invalid ISO date: ${s}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MS_PER_DAY = 86_400_000;

function toEpochDay(s: ISODate): number {
  const { y, m, d } = parseISO(s);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

function fromEpochDay(n: number): ISODate {
  const dt = new Date(n * MS_PER_DAY);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export const compareISO = (a: ISODate, b: ISODate): number => (a < b ? -1 : a > b ? 1 : 0);
export const isBefore = (a: ISODate, b: ISODate): boolean => a < b;
export const isOnOrBefore = (a: ISODate, b: ISODate): boolean => a <= b;
export const isAfter = (a: ISODate, b: ISODate): boolean => a > b;
export const isOnOrAfter = (a: ISODate, b: ISODate): boolean => a >= b;
export const maxDate = (a: ISODate, b: ISODate): ISODate => (a > b ? a : b);
export const minDate = (a: ISODate, b: ISODate): ISODate => (a < b ? a : b);

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toEpochDay(b) - toEpochDay(a);
}

export function addDays(s: ISODate, n: number): ISODate {
  return fromEpochDay(toEpochDay(s) + n);
}

/** Adds calendar months; clamps to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s: ISODate, n: number): ISODate {
  const { y, m, d } = parseISO(s);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12 + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addYears(s: ISODate, n: number): ISODate {
  return addMonths(s, n * 12);
}

export function endOfMonth(s: ISODate): ISODate {
  const { y, m } = parseISO(s);
  return toISO(y, m, daysInMonth(y, m));
}

export const yearOf = (s: ISODate): number => parseISO(s).y;
export const monthOf = (s: ISODate): number => parseISO(s).m;

/** Whole months elapsed from a to b (negative if b < a). 31 Jan -> 28 Feb counts as 1 month. */
export function monthsBetween(a: ISODate, b: ISODate): number {
  if (b < a) return -monthsBetween(b, a);
  const pa = parseISO(a);
  const pb = parseISO(b);
  let months = (pb.y - pa.y) * 12 + (pb.m - pa.m);
  if (addMonths(a, months) > b) months -= 1;
  return months;
}

/** Today's date in Singapore (UTC+8, no DST) as an ISO string. */
export function todaySG(now: Date = new Date()): ISODate {
  const sg = new Date(now.getTime() + 8 * 3_600_000);
  return toISO(sg.getUTCFullYear(), sg.getUTCMonth() + 1, sg.getUTCDate());
}

/**
 * Year of Assessment for a financial year ending on `fye`.
 * Singapore income tax: the YA is the calendar year AFTER the year in which the basis period ends
 * (e.g. FY ending 31 Dec 2025 -> YA 2026; FY ending 30 Jun 2026 -> YA 2027).
 */
export function yearOfAssessment(fye: ISODate): number {
  return yearOf(fye) + 1;
}

/** Financial year end date for a company with the given FYE month/day that falls in calendar year `year`. */
export function financialYearEnd(year: number, month: number, day?: number): ISODate {
  const d = day ?? daysInMonth(year, month);
  return toISO(year, month, Math.min(d, daysInMonth(year, month)));
}

/** Financial year start = day after the previous year end. */
export function financialYearStart(fye: ISODate): ISODate {
  return addDays(addYears(fye, -1), 1);
}
