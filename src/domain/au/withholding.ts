// Per-holder allocation of the year's tax characters and the withholding on them. Exact integer arithmetic: every component is split
// across the register by units (largest remainder) and every foreign holder's withholding is rounded once, from the exact rational.
import type { AuFund, AuHolder, Cents } from "../types.ts";
import { ratePct } from "../format.ts";
import type { AuAmounts, AuComponentKey, ComponentDef, HolderRegion } from "./components.ts";
import { COMPONENT_DEFS, rateBps } from "./components.ts";
import type { AuRates } from "./rates.ts";
import { roundShares, splitExact } from "./util.ts";

export interface HolderCell {
  amount: Cents;
  withheld: Cents;
  bps: number;
}

export interface Allocation {
  holders: readonly AuHolder[];
  registerUnits: number;
  unallocatedUnits: number;
  /** max(units on issue, register units): the share denominator. */
  denominator: number;
  /** Each holder's share of the cash distribution, and the cash that sits on units missing from the register. */
  cash: Cents[];
  unallocatedCash: Cents;
  cells: Record<AuComponentKey, HolderCell[]>;
  unallocated: Record<AuComponentKey, Cents>;
}

export const regionOf = (holder: AuHolder): HolderRegion => holder.auStatus;

export function allocate(fund: AuFund, holders: readonly AuHolder[], amounts: AuAmounts, rates: AuRates): Allocation {
  const registerUnits = holders.reduce((sum, h) => sum + h.units, 0);
  const denominator = Math.max(fund.unitsOnIssue, registerUnits);
  const unallocatedUnits = Math.max(0, fund.unitsOnIssue - registerUnits);
  const weights = [...holders.map((h) => h.units), unallocatedUnits];

  const cashParts = splitExact(amounts.cash, weights);

  // Withholding: one rational per (component, holder), rounded together so the total is the exact total rounded to the cent.
  const den = BigInt(denominator) * 10000n;
  const nums: bigint[] = [];
  const slots: Array<{ def: ComponentDef; holder: number; bps: number }> = [];
  for (const def of COMPONENT_DEFS) {
    const amount = BigInt(Math.max(0, amounts.components[def.key]));
    holders.forEach((holder, i) => {
      const bps = rateBps(def, regionOf(holder), rates);
      slots.push({ def, holder: i, bps });
      nums.push(bps > 0 && amount > 0n && holder.units > 0 ? amount * BigInt(holder.units) * BigInt(bps) : 0n);
    });
  }
  const withheld = roundShares(nums, den);

  const cells = {} as Record<AuComponentKey, HolderCell[]>;
  const unallocated = {} as Record<AuComponentKey, Cents>;
  let slot = 0;
  for (const def of COMPONENT_DEFS) {
    const parts = splitExact(amounts.components[def.key], weights);
    cells[def.key] = holders.map((_, i) => {
      const s = slots[slot++];
      return { amount: parts[i], withheld: withheld[slot - 1], bps: s.bps };
    });
    unallocated[def.key] = parts[holders.length];
  }

  return {
    holders,
    registerUnits,
    unallocatedUnits,
    denominator,
    cash: cashParts.slice(0, holders.length),
    unallocatedCash: cashParts[holders.length],
    cells,
    unallocated,
  };
}

// ------------------------------------------------------------------------------------------------ wording of a holder's withholding
const pct = (bps: number): string => ratePct(bps / 10000);

/** How the reference app names a holder's withholding: interest, clean building and NCMI have their own labels for EOI holders. */
export function partLabel(key: AuComponentKey, region: HolderRegion, bps: number): { label: string; short: string } {
  const r = pct(bps);
  if (key === "interest") return { label: `Interest withholding at ${r}`, short: `${r} interest` };
  if (region === "foreign-eoi" && key === "cleanBuilding") return { label: `Clean building fund payment at ${r}`, short: `${r} clean building` };
  if (region === "foreign-eoi" && key === "ncmi") return { label: `NCMI fund payment at ${r}`, short: `${r} NCMI` };
  return { label: `Fund payment withholding at ${r}`, short: `${r} fund payment` };
}
