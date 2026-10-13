// Notice snapshots taken when a notice is published (what the notice told holders, kept so later edits to the inputs don't rewrite it).
import type { AuFund, AuNotice, SgFund, SgNotice } from "../types.ts";

export type AuNotified = NonNullable<AuNotice["notified"]>;
export type SgNotified = NonNullable<SgNotice["notified"]>;

const AU_KEYS: Array<keyof AuNotified> = ["other", "ncmi", "excludedNcmi", "clean", "interest"];

const zero = (): AuNotified => ({ other: 0, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 0 });

/** The year's components as they are notified: other income includes both halves of the discounted gain (the discount equals the taxed half). */
export function auYearComponents(fund: AuFund): AuNotified {
  const i = fund.inputs;
  return {
    other: i.ausOtherIncome + 2 * i.discountGainTarp + i.otherGainTarp,
    ncmi: i.ncmi,
    excludedNcmi: i.excludedNcmi,
    clean: i.cleanBuilding,
    interest: i.interest,
  };
}

/**
 * What an AU notice notifies: its own snapshot when it has one, otherwise the reference app's estimate. An interim notice takes the
 * year's components pro rata to its cash; the final notice takes the balance of the year not yet notified by the earlier notices.
 */
export function auNoticeAmounts(fund: AuFund, notices: readonly AuNotice[], target: AuNotice): AuNotified {
  if (target.notified) return { ...target.notified };
  const year = auYearComponents(fund);
  const ordered = notices
    .filter((n) => n.fundId === fund.id)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  const totalCash = ordered.reduce((sum, n) => sum + n.cash, 0);
  const running = zero();
  for (const notice of ordered) {
    const amounts = notice.notified
      ? notice.notified
      : notice.final
        ? balanceOf(year, running)
        : prorata(year, notice.cash, totalCash);
    if (notice.id === target.id) return { ...amounts };
    for (const key of AU_KEYS) running[key] += amounts[key];
  }
  return zero();
}

/** Everything notified except interest is a fund payment. */
export function auFundPayment(amounts: AuNotified): number {
  return amounts.other + amounts.ncmi + amounts.excludedNcmi + amounts.clean;
}

function prorata(year: AuNotified, cash: number, totalCash: number): AuNotified {
  const out = zero();
  if (totalCash <= 0) return out;
  for (const key of AU_KEYS) out[key] = Math.round((year[key] * cash) / totalCash);
  return out;
}

function balanceOf(year: AuNotified, running: AuNotified): AuNotified {
  const out = zero();
  for (const key of AU_KEYS) out[key] = Math.max(0, year[key] - running[key]);
  return out;
}

/** An SG notice announces the distribution the fund currently records. */
export function sgNoticeAmounts(fund: SgFund): SgNotified {
  return {
    taxable: fund.inputs.taxableDistributed,
    exempt: fund.inputs.taxExemptDistribution,
    capital: fund.inputs.capitalDistribution,
  };
}
