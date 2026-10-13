// Headline sentences for the Analytics charts, worded like the reference app.
import type { LeakageRow, MixRow } from "../types.ts";
import { pct } from "../format.ts";

const LEAKAGE_PARTS: Array<{ label: string; pick: (row: LeakageRow) => number }> = [
  { label: "final withholding", pick: (row) => row.finalWithholding },
  { label: "withholding holders can recover", pick: (row) => row.recoverable },
  { label: "tax paid by the trustee", pick: (row) => row.trusteeTax },
];

/** "<Fund> loses the most, 8.2% of its distribution, mostly final withholding (8.2%)." The first fund wins a tie. */
export function leakageHeadline(rows: readonly LeakageRow[]): string {
  if (rows.length === 0) return "There are no funds to compare.";
  let worst = rows[0];
  for (const row of rows) if (row.totalPct > worst.totalPct) worst = row;
  if (!(worst.totalPct > 0)) return "None of these funds loses any of its distribution to tax.";
  let main = LEAKAGE_PARTS[0];
  for (const part of LEAKAGE_PARTS) if (part.pick(worst) > main.pick(worst)) main = part;
  const share = worst.distribution > 0 ? (main.pick(worst) / worst.distribution) * 100 : 0;
  return `${worst.fundName} loses the most, ${pct(worst.totalPct)} of its distribution, mostly ${main.label} (${pct(share)}).`;
}

/** "Taxable income ranges from 60% of the distribution (<Fund>) to 100% (<Fund>)." Funds that round to the same percentage read as one figure. */
export function mixHeadline(rows: readonly MixRow[]): string {
  if (rows.length === 0) return "There are no funds to compare.";
  let low = rows[0];
  let high = rows[0];
  for (const row of rows) {
    if (row.taxable < low.taxable) low = row;
    if (row.taxable > high.taxable) high = row;
  }
  const whole = (value: number) => `${Math.round(value)}%`;
  if (rows.length === 1) return `Taxable income is ${whole(low.taxable)} of the distribution (${low.fundName}).`;
  if (whole(low.taxable) === whole(high.taxable)) return `Taxable income is ${whole(low.taxable)} of the distribution in every fund.`;
  return `Taxable income ranges from ${whole(low.taxable)} of the distribution (${low.fundName}) to ${whole(high.taxable)} (${high.fundName}).`;
}
