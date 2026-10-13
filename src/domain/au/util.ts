// Helpers shared by the AU module: exact integer allocation of cents (BigInt, so no float drift), formatting shortcuts and lookups.
import type { AppData, AuFund, AuHolder, AuNotice, Cents, Fund, FundId, Holder, Property, TbRow } from "../types.ts";
import { money, moneyCompact } from "../format.ts";

export const aud = (cents: Cents, decimals: 0 | 2 = 0): string => money(cents, "AUD", decimals);
export const audCompact = (cents: Cents): string => moneyCompact(cents, "AUD");

/** Turns -0 into 0 so documents and comparisons never see a negative zero. */
export const nz = (n: number): number => (n === 0 ? 0 : n);

/** Dollars with two decimals as a plain number (for CSV cells). */
export const dollars = (cents: Cents): number => nz(Math.round(cents) / 100);

export function asAuFund(fund: Fund): AuFund {
  if (fund.market !== "AU") throw new Error(`Fund ${fund.id} is not an Australian fund`);
  return fund;
}

export function isAuHolder(holder: Holder): holder is AuHolder {
  return "auStatus" in holder;
}

export function holdersOf(data: AppData, fundId: FundId): AuHolder[] {
  const out: AuHolder[] = [];
  for (const holder of data.holders) if (holder.fundId === fundId && isAuHolder(holder)) out.push(holder);
  return out;
}

/** The fund's payment notices, oldest first. */
export function noticesOf(data: AppData, fundId: FundId): AuNotice[] {
  return data.auNotices
    .filter((n) => n.fundId === fundId)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.recordDate.localeCompare(b.recordDate));
}

export function tbRowsOf(data: AppData, fundId: FundId): TbRow[] {
  return data.tbRows.filter((r) => r.fundId === fundId);
}

export function propertiesOf(data: AppData, fundId: FundId): Property[] {
  return data.properties.filter((p) => p.fundId === fundId);
}

/** "1 account", "2 accounts". */
export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ------------------------------------------------------------------------------------------------ exact allocation
const big = (n: number): bigint => BigInt(Math.round(n));

/**
 * Rounds the non-negative rationals nums[i] / den to whole cents so that the parts add up to the exact total rounded half up:
 * every part is floored, then the missing cents go to the largest remainders (ties to the lowest index).
 */
export function roundShares(nums: readonly bigint[], den: bigint): number[] {
  if (den <= 0n) return nums.map(() => 0);
  const floors = nums.map((n) => n / den);
  const rems = nums.map((n) => n % den);
  const total = nums.reduce((a, b) => a + b, 0n);
  const target = (2n * total + den) / (2n * den);
  let missing = Number(target - floors.reduce((a, b) => a + b, 0n));
  const out = floors.map((f) => Number(f));
  const order = nums.map((_, i) => i).sort((a, b) => (rems[a] === rems[b] ? a - b : rems[a] > rems[b] ? -1 : 1));
  for (const i of order) {
    if (missing <= 0) break;
    if (rems[i] > 0n) {
      out[i] += 1;
      missing -= 1;
    }
  }
  return out;
}

/** Splits `total` cents in proportion to integer weights; the parts add up to `total` exactly. Non-positive weights get nothing. */
export function splitExact(total: Cents, weights: readonly number[]): Cents[] {
  const w = weights.map((x) => (x > 0 ? big(x) : 0n));
  const sum = w.reduce((a, b) => a + b, 0n);
  if (sum === 0n || total === 0) return weights.map(() => 0);
  const t = big(Math.abs(total));
  const parts = roundShares(w.map((x) => x * t), sum);
  return parts.map((p) => nz(total < 0 ? -p : p));
}

/** a * bps / 10000 rounded half away from zero, exactly. */
export function mulBpsExact(amount: Cents, bps: number): Cents {
  const neg = amount < 0;
  const n = big(Math.abs(amount)) * BigInt(Math.round(bps));
  const r = (2n * n + 10000n) / 20000n;
  return nz(neg ? -Number(r) : Number(r));
}

/** Rounds a non-negative a / b to the nearest whole number (half up) using exact integer arithmetic. */
export function divRound(a: bigint, b: bigint): number {
  if (b <= 0n) return 0;
  return Number((2n * a + b) / (2n * b));
}

/** Whole dollars (as cents), rounding half away from zero. */
export function roundToDollarCents(cents: Cents): Cents {
  const neg = cents < 0;
  const abs = big(Math.abs(cents));
  const dollarsRounded = (abs + 50n) / 100n;
  return nz(neg ? -Number(dollarsRounded * 100n) : Number(dollarsRounded * 100n));
}
