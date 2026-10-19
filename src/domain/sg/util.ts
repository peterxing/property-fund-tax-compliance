// Shared helpers for the Singapore market module: typed lookups, exact (to-the-cent) allocation and wording helpers.
import type { AppData, Cents, Fund, FundId, Holder, ISODate, SgFund, SgFundSection, SgHolder, SgHolderClass, SgNotice } from "../types.ts";
import { dateLabel } from "../format.ts";

export function requireSgFund(fund: Fund): SgFund {
  if (fund.market !== "SG") throw new Error(`The Singapore module was called for ${fund.market} fund "${fund.name}"`);
  return fund;
}

export function sgHolders(data: AppData, fundId: FundId): SgHolder[] {
  return data.holders.filter((h): h is SgHolder => h.fundId === fundId && "sgClass" in h);
}

/** The Singapore class of a holder line (a line in an SG calculation always has one). */
export function sgClassOf(h: Holder): SgHolderClass {
  return "sgClass" in h ? h.sgClass : "other";
}

/** The fund's distribution notice (the latest record date when more than one exists). */
export function sgNoticeFor(data: AppData, fundId: FundId): SgNotice | null {
  let found: SgNotice | null = null;
  for (const n of data.sgNotices) {
    if (n.fundId === fundId && (found === null || n.recordDate > found.recordDate)) found = n;
  }
  return found;
}

/** Date the distribution is paid, which fixes the tax rates and the s45G due date. */
export function paymentDateOf(fund: SgFund, notice: SgNotice | null): ISODate {
  return notice?.paymentDate ?? fund.periodEnd;
}

export const SG_CLASS_LABEL: Record<SgHolderClass, string> = {
  individual: "Individual",
  qualifying: "Qualifying unitholder",
  nrni: "Qualifying non-resident non-individual",
  "nr-fund": "Qualifying non-resident fund",
  other: "Other unitholder",
};

export function sgFundSectionLabel(section?: SgFundSection): string {
  return section ? `section ${section}` : "section 13D/13U/13V";
}

export function sgHolderStatusLabel(holder: Pick<SgHolder, "sgClass" | "sgFundSection">): string {
  const label = SG_CLASS_LABEL[holder.sgClass];
  return holder.sgClass === "nr-fund" ? `${label} · ${sgFundSectionLabel(holder.sgFundSection)}` : label;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "15 April" from an ISO date. */
export function dayMonthLabel(d: ISODate): string {
  const [, m, day] = d.slice(0, 10).split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1] ?? ""}`;
}

/** "31 December 2030" from an ISO date. */
export function longDateLabel(d: ISODate): string {
  return `${dayMonthLabel(d)} ${d.slice(0, 4)}`;
}

/** "1 Jul – 30 Sep 2026" within one year, "1 Jul 2026 – 30 Jun 2027" across years. */
export function rangeLabel(start: ISODate, end: ISODate): string {
  const from = dateLabel(start);
  const to = dateLabel(end);
  const fromParts = from.split(" ");
  const toParts = to.split(" ");
  if (fromParts.length === 3 && toParts.length === 3 && fromParts[2] === toParts[2]) return `${fromParts[0]} ${fromParts[1]} – ${to}`;
  return `${from} – ${to}`;
}

export const sumOf = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** Major units for CSV cells. */
export const toMajor = (cents: Cents): number => (cents === 0 ? 0 : cents / 100);

/**
 * Splits `total` cents across `weights` so that the parts add up to `total` exactly (largest remainder, ties to the earlier
 * entry). Integer (BigInt) arithmetic throughout, so register-sized weights times a large amount never pass through a float
 * product; it agrees with the engine's `allocate` wherever that is exact (test/domain/sg/calc.test.ts compares the two).
 */
export function allocateExact(total: Cents, weights: readonly number[]): Cents[] {
  const out: Cents[] = weights.map(() => 0);
  const whole = Math.round(total);
  if (out.length === 0 || whole === 0) return out;
  const w = weights.map((x) => BigInt(x > 0 ? Math.round(x) : 0));
  const sumW = w.reduce((a, b) => a + b, 0n);
  if (sumW === 0n) return out;
  const t = BigInt(Math.abs(whole));
  const parts = w.map((x) => (t * x) / sumW);
  const rems = w.map((x) => (t * x) % sumW);
  let left = t - parts.reduce((a, b) => a + b, 0n);
  const order = rems.map((_, i) => i).sort((i, j) => (rems[i] === rems[j] ? i - j : rems[i] > rems[j] ? -1 : 1));
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  return parts.map((p) => (whole < 0 && p !== 0n ? -Number(p) : Number(p)));
}

export interface RegisterShares {
  /** One amount per register holder, in the order given. */
  holders: Cents[];
  /** The share of units issued but not on the register. */
  unallocated: Cents;
}

/**
 * Allocates `total` over the unit register. Units on issue that are not on the register form their own bucket, so a register
 * that is short never pushes another holder's share onto the holders present (an over-allocated register shares pro rata).
 */
export function allocateAcrossRegister(total: Cents, units: readonly number[], unitsOnIssue: number): RegisterShares {
  const registerUnits = sumOf(units);
  const missing = Math.max(0, unitsOnIssue - registerUnits);
  if (registerUnits + missing <= 0) return { holders: units.map(() => 0), unallocated: Math.round(total) };
  const parts = allocateExact(total, [...units, missing]);
  return { holders: parts.slice(0, units.length), unallocated: parts[units.length] ?? 0 };
}
