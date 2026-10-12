/**
 * Money primitives for the tax engine.
 *
 * All monetary amounts are INTEGER CENTS (SGD unless a module says otherwise).
 * All rates are INTEGER BASIS POINTS (1% = 100 bps, 17% = 1700 bps, 0.4% = 40 bps).
 * Never use floating point for money. Multiplications go through BigInt so that
 * S$10bn x 17% does not lose precision.
 *
 * This module is pure (no Node-only imports) so it can run in the browser too.
 */

export type Cents = number;
export type Bps = number;

export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of cents, got ${value}`);
  }
  return value;
}

/** Parse "1,234.56", "$1,234.56", "(1,234.56)", "-1234.5", 1234.56 into cents (half away from zero on the 3rd decimal). */
export function toCents(input: number | string): Cents {
  let s = typeof input === "number" ? numberToPlainString(input) : input.trim();
  if (s === "") return 0;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]|SGD|AUD|S\$|A\$/gi, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") {
    throw new RangeError(`Cannot parse "${input}" as a money amount`);
  }
  const [whole = "0", frac = ""] = s.split(".");
  const cents3 = (frac + "000").slice(0, 3);
  let cents = Number(whole) * 100 + Number(cents3.slice(0, 2));
  if (Number(cents3[2]) >= 5) cents += 1;
  return assertCents(negative ? -cents : cents);
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`Not a finite number: ${n}`);
  if (Math.abs(n) < 1e21) {
    // toFixed(6) avoids exponent notation and float artefacts such as 1.005 -> 1.00499999
    return n.toFixed(6);
  }
  throw new RangeError(`Amount too large: ${n}`);
}

export const fromCents = (cents: Cents): number => cents / 100;

/** Round-half-away-from-zero integer division of BigInts. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const neg = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return neg ? -q : q;
}

/** amount x (bps / 10_000), rounded half away from zero to the nearest cent. */
export function mulBps(amount: Cents, bps: Bps): Cents {
  return Number(divRound(BigInt(assertCents(amount)) * BigInt(Math.round(bps)), 10000n));
}

/** amount x numerator / denominator, rounded half away from zero. numerator/denominator may be cents or counts. */
export function mulRatio(amount: Cents, numerator: number, denominator: number): Cents {
  if (denominator === 0) return 0;
  return Number(divRound(BigInt(assertCents(amount)) * BigInt(Math.round(numerator)), BigInt(Math.round(denominator))));
}

/** ratio as basis points (rounded), e.g. ratioBps(25, 100) === 2500. Returns 0 when denominator is 0. */
export function ratioBps(numerator: number, denominator: number): Bps {
  if (denominator === 0) return 0;
  return Number(divRound(BigInt(Math.round(numerator)) * 10000n, BigInt(Math.round(denominator))));
}

export const floorToDollar = (c: Cents): Cents => Math.floor(c / 100) * 100;
export const ceilToDollar = (c: Cents): Cents => Math.ceil(c / 100) * 100;
/** Round half away from zero to a whole dollar. */
export const roundToDollar = (c: Cents): Cents => (c < 0 ? -Math.round(-c / 100) : Math.round(c / 100)) * 100;

export const sum = (values: readonly Cents[]): Cents => values.reduce((a, b) => a + b, 0);
export const max0 = (c: Cents): Cents => (c > 0 ? c : 0);
export const min = (a: Cents, b: Cents): Cents => (a < b ? a : b);
export const max = (a: Cents, b: Cents): Cents => (a > b ? a : b);

/** Split `total` across `weights` (largest-remainder) so the parts always add up exactly to `total`. */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  const w = weights.map((x) => (x > 0 ? x : 0));
  const totalWeight = w.reduce((a, b) => a + b, 0);
  if (w.length === 0) return [];
  if (totalWeight === 0) return w.map(() => 0);
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = w.map((x) => (abs * x) / totalWeight);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    remainder -= 1;
  }
  return floors.map((x) => x * sign);
}

export interface FormatOptions {
  /** show the cents (default true) */
  cents?: boolean;
  /** (1,234.00) instead of -1,234.00 (default false) */
  parens?: boolean;
  /** prefix with the currency symbol (default true) */
  symbol?: boolean;
  /** the symbol to print, e.g. "A$" for Australian dollars (default "S$") */
  symbolText?: string;
}

export function formatSGD(amount: Cents, opts: FormatOptions = {}): string {
  const { cents = true, parens = false, symbol = true, symbolText = "S$" } = opts;
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  let body = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (cents) body += "." + rem.toString().padStart(2, "0");
  const withSymbol = (symbol ? symbolText : "") + body;
  if (!neg) return withSymbol;
  return parens ? `(${withSymbol})` : `-${withSymbol}`;
}

export function formatBps(bps: Bps, maxDecimals = 2): string {
  const pct = bps / 100;
  return `${Number(pct.toFixed(maxDecimals))}%`;
}
