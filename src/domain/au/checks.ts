// The checks behind a fund's exception count. Ids are stable (au-*) so the UI and tests can address them.
import type { AppData, AuFund, Check, Cents, ISODate, WithholdingRecon } from "../types.ts";
import { UNMAPPED_CATEGORY } from "../types.ts";
import { compareDates, dateLabel, integer, ratePct, toISODate } from "../format.ts";
import type { AuAmounts } from "./components.ts";
import type { AuRates } from "./rates.ts";
import { compareNotices, noticeItems } from "./notices.ts";
import { aud, plural, tbRowsOf } from "./util.ts";

export interface ChecksInput {
  data: AppData;
  fund: AuFund;
  amounts: AuAmounts;
  rates: AuRates;
  registerUnits: number;
  nonEoiHolders: number;
  recon: WithholdingRecon;
  ammaDue: ISODate;
  now: Date;
}

const exception = (id: string, title: string, detail: string): Check => ({ id, severity: "exception", title, detail });
const note = (id: string, title: string, detail: string): Check => ({ id, severity: "note", title, detail });

/** Cents above or below which two notified or year amounts are treated as different (the reference uses A$0.50). */
const NOTICE_TOLERANCE = 50;

export function registerCheck(fund: AuFund, registerUnits: number): Check[] {
  if (registerUnits === fund.unitsOnIssue) return [];
  const diff = fund.unitsOnIssue - registerUnits;
  return [
    exception(
      "au-register",
      "Unit register out of balance",
      `Register holds ${integer(registerUnits)} units against ${integer(fund.unitsOnIssue)} on issue (${integer(Math.abs(diff))} ${diff > 0 ? "units not allocated to a holder" : "units over-allocated"}).`,
    ),
  ];
}

export function reconCheck(recon: WithholdingRecon): Check[] {
  if (recon.remitted === null || recon.variance === null || recon.variance === 0) return [];
  return [
    exception(
      "au-wht-variance",
      "Withholding reconciliation variance",
      `Computed ${aud(recon.computed, 0)} against ${aud(recon.remitted, 0)} remitted — ${recon.variance > 0 ? "under-remitted" : "over-remitted"} by ${aud(Math.abs(recon.variance), 0)}.`,
    ),
  ];
}

export function noticeChecks(data: AppData, fund: AuFund, now: Date): Check[] {
  const items = noticeItems(data, fund);
  if (items.length === 0) return [];
  const today = toISODate(now);
  const out: Check[] = [];

  for (const { notice, published } of items) {
    if (published) {
      const on = notice.publishedOn as ISODate;
      if (compareDates(on, notice.paymentDate) > 0) {
        out.push(
          exception(
            `au-notice-after-${notice.id}`,
            `Fund payment notice given after payment — ${notice.label}`,
            `Published ${dateLabel(on)}, after the ${dateLabel(notice.paymentDate)} payment.`,
          ),
        );
      }
    } else if (compareDates(today, notice.paymentDate) > 0) {
      out.push(
        exception(
          `au-notice-late-${notice.id}`,
          `Fund payment notice not given — ${notice.label}`,
          `Paid ${dateLabel(notice.paymentDate)}. The notice has to be given at or before payment so custodians can withhold.`,
        ),
      );
    } else {
      out.push(
        note(
          `au-notice-due-${notice.id}`,
          `Fund payment notice due by ${dateLabel(notice.paymentDate)}`,
          `${notice.label}: publish it at or before the payment date.`,
        ),
      );
    }
  }

  const comparison = compareNotices(fund, items);
  const differing = comparison.rows.filter((r) => Math.abs(r.difference) >= NOTICE_TOLERANCE);
  if (comparison.allPublished && differing.length > 0) {
    const net = differing.filter((r) => r.key !== "interest").reduce((sum, r) => sum + r.difference, 0);
    const lines = differing.map((r) => `${r.label}: notified ${aud(r.published, 0)}, year ${aud(r.year, 0)}`).join("; ");
    out.push(
      note(
        "au-notices-understate",
        Math.abs(net) >= NOTICE_TOLERANCE
          ? `Notices ${net > 0 ? "understate" : "overstate"} the year's fund payment by ${aud(Math.abs(net), 0)}`
          : "Notices classify the fund payment differently from the year's components",
        net >= NOTICE_TOLERANCE ? `${lines}. Withholding on the shortfall may be payable by the trustee as a deemed payment.` : `${lines}.`,
      ),
    );
  }

  const paid: Cents = items.reduce((sum, i) => sum + i.notice.cash, 0);
  if (Math.abs(paid - fund.inputs.cashDistribution) >= NOTICE_TOLERANCE) {
    out.push(
      note(
        "au-payments-cash",
        "Payments differ from the cash distribution",
        `Payments for the year total ${aud(paid, 0)}; the cash distribution is ${aud(fund.inputs.cashDistribution, 0)}.`,
      ),
    );
  }
  return out;
}

export function buildChecks(input: ChecksInput): Check[] {
  const { data, fund, amounts, rates, registerUnits, nonEoiHolders, recon, ammaDue, now } = input;
  const checks: Check[] = [...registerCheck(fund, registerUnits)];

  if (fund.status !== "Signed off" && compareDates(toISODate(now), ammaDue) > 0) {
    checks.push(
      exception(
        "au-amma-overdue",
        "AMMA statements overdue",
        `Due ${dateLabel(ammaDue)}, three months after the income year ended ${dateLabel(fund.periodEnd)}.`,
      ),
    );
  }

  checks.push(...reconCheck(recon));

  const unmapped = tbRowsOf(data, fund.id).filter((row) => row.category === UNMAPPED_CATEGORY).length;
  if (unmapped > 0) {
    checks.push(
      exception(
        "au-tb-unmapped",
        `${plural(unmapped, "trial balance account")} without a tax category`,
        "Map every account on the Trial balance tab. Accounts without a tax category are left out of the distribution components.",
      ),
    );
  }

  if (amounts.costBaseNet < 0) {
    const shortfall = -amounts.costBaseNet;
    checks.push(
      note(
        "au-costbase-shortfall",
        "AMIT cost base shortfall",
        `Attributed amounts and the AMIT CGT gross-up amount exceed the cash distribution by ${aud(shortfall, 0)} (${(fund.unitsOnIssue > 0 ? shortfall / fund.unitsOnIssue : 0).toFixed(4)} c/unit); members increase their cost base.`,
      ),
    );
  }

  if (nonEoiHolders > 0) {
    checks.push(
      note(
        "au-non-eoi-30",
        `${ratePct(rates.ordinary.nonEoi / 10000)} fund payment rate for ${plural(nonEoiHolders, "holder")}`,
        "Address or place of payment is outside the information exchange countries.",
      ),
    );
  }

  checks.push(...noticeChecks(data, fund, now));
  return checks;
}
