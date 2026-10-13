// Formatting helpers shared by the domain (documents, narratives) and the UI. Locale independent: no Intl, so output is identical in
// Node tests and in every browser. All money inputs are integer cents.
import type { Cents, Currency, ISODate, LocalDateTime } from "./types.ts";

export const CURRENCY_SYMBOL: Record<Currency, string> = { AUD: "A$", SGD: "S$" };
const MINUS = "\u2212"; // typographic minus used by the reference app: −A$1,184,233
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** 1234567 -> "1,234,567" (digits only; caller handles sign and decimals). */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Whole units with grouping: 1412680000 -> "1,412,680,000". Negative numbers use the typographic minus. */
export function integer(n: number): string {
  const r = Math.round(Math.abs(n));
  return (n < 0 && r !== 0 ? MINUS : "") + groupDigits(String(r));
}

/** "A$92,446,000" (decimals 0, default) or "A$92,446,000.36" (decimals 2). Negative: "−A$1,184,233". */
export function money(cents: Cents, currency: Currency, decimals: 0 | 2 = 0): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  let body: string;
  if (decimals === 2) {
    const whole = Math.floor(abs / 100);
    const frac = Math.round(abs - whole * 100);
    body = frac === 100 ? `${groupDigits(String(whole + 1))}.00` : `${groupDigits(String(whole))}.${String(frac).padStart(2, "0")}`;
  } else {
    body = groupDigits(String(Math.round(abs / 100)));
  }
  const isZero = /^0(\.0+)?$/.test(body);
  return `${neg && !isZero ? MINUS : ""}${CURRENCY_SYMBOL[currency]}${body}`;
}

/** Accounting style used inside statements for deductions: "(A$1,263,204.00)". Positive amounts format normally. */
export function moneyParen(cents: Cents, currency: Currency, decimals: 0 | 2 = 2): string {
  return cents < 0 ? `(${money(-cents, currency, decimals)})` : money(cents, currency, decimals);
}

/** Compact for chart labels: "A$92.45m", "A$402.6k", "A$212". */
export function moneyCompact(cents: Cents, currency: Currency): string {
  const x = Math.abs(cents) / 100;
  const sym = CURRENCY_SYMBOL[currency];
  const sign = cents < 0 ? MINUS : "";
  if (x >= 1_000_000) return `${sign}${sym}${(x / 1_000_000).toFixed(2)}m`;
  if (x >= 1_000) return `${sign}${sym}${(x / 1_000).toFixed(1)}k`;
  return `${sign}${sym}${Math.round(x)}`;
}

/** "73.9%" from a 0..100 value (not a ratio). */
export function pct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/** Rate 0..1 -> "15%" (whole numbers stay whole, 0.175 -> "17.5%"). */
export function ratePct(rate: number): string {
  const v = Math.round(rate * 10000) / 100;
  return `${Number.isInteger(v) ? v.toFixed(0) : String(v)}%`;
}

/** Cents of distribution per unit held, as a plain number: amount (cents) / units. 4 dp shown in the UI, 6 dp on SG notices. */
export function centsPerUnit(amount: Cents, units: number): number {
  return units > 0 ? amount / units : 0;
}
export function perUnit(value: number, decimals = 4): string {
  return value.toFixed(decimals);
}

function parts(d: ISODate | LocalDateTime): { y: number; m: number; d: number; hh: number; mm: number } {
  const [date = "", time = ""] = d.split("T");
  const [y = "0", m = "1", dd = "1"] = date.split("-");
  const [hh = "0", mm = "0"] = time.split(":");
  return { y: Number(y), m: Number(m), d: Number(dd), hh: Number(hh), mm: Number(mm) };
}

/** "30 Sep 2026" */
export function dateLabel(d: ISODate | LocalDateTime): string {
  const p = parts(d);
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}
/** "Wed 30 Sep 2026" */
export function dateLabelWithWeekday(d: ISODate): string {
  const p = parts(d);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return `${WEEKDAYS[dow]} ${dateLabel(d)}`;
}
/** "7 Oct 2026, 11:30" (wall clock, no time zone conversion) */
export function dateTimeLabel(d: LocalDateTime): string {
  const p = parts(d);
  return `${dateLabel(d)}, ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

/** Wall-clock timestamp for new audit entries: "2026-10-13T09:04:00". */
export function toLocalDateTime(now: Date): LocalDateTime {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}T${z(now.getHours())}:${z(now.getMinutes())}:${z(now.getSeconds())}`;
}
export function toISODate(now: Date): ISODate {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`;
}

/** Whole-day comparison on ISO dates: negative when a is before b. */
export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Slug for file names: "Telok Ayer Commercial REIT" -> "telok-ayer-commercial-reit". */
export function slug(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Parses an amount typed or pasted by a person into cents, or null when it is not a clean amount.
 * Accepts: digits with optional "," or space grouping and up to two decimals; ONE leading currency marker (A$, S$, AUD, SGD or $);
 * a leading minus (hyphen-minus or U+2212) before or after the marker; accounting brackets "(1,200)". Anything else (letters, exponents
 * such as "1e5", a second sign, a negative inside brackets, trailing text, more than two decimals, values beyond 2^53 cents) is rejected.
 */
export function parseMoneyInput(text: string): Cents | null {
  let s = text.trim();
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  let signs = 0;
  const eatSign = (): void => {
    const m = /^[-\u2212]\s*/.exec(s);
    if (m) { signs++; s = s.slice(m[0].length); }
  };
  eatSign();
  s = s.replace(/^(?:A\$|S\$|AUD|SGD|\$)\s*/i, "");
  eatSign();
  if (signs > 1 || (negative && signs > 0)) return null;
  if (signs === 1) negative = true;
  s = s.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = "0", fraction = ""] = s.split(".");
  const exact = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const cents = Number(exact);
  return negative && cents !== 0 ? -cents : cents;
}