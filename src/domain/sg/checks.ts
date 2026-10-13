// Distribution checks for a Singapore fund, in the order the Checks tab lists them.
import { reitWithholdingDueDate } from "../../engine/reitTax.ts";
import { dateLabel, integer, money, pct, ratePct, toISODate } from "../format.ts";
import type { Cents, Check, SgFund, SgNotice, WithholdingRecon } from "../types.ts";
import { holderTreatment } from "./withholding.ts";
import type { TrusteePosition } from "./withholding.ts";
import { paymentDateOf } from "./util.ts";

export interface SgCheckInput {
  fund: SgFund;
  notice: SgNotice | null;
  now: Date;
  registerUnits: number;
  withheld: Cents;
  undeclaredHolders: number;
  recon: WithholdingRecon;
  position: TrusteePosition;
}

const FORM_RULE = "IRAS requires Form A (depository agents: Form B) before every distribution (e-Tax Guide para 13.1)";

/** The record date and the declaration cut-off are the manager's own dates. IRAS asks only for the declaration before the distribution, and sets no date for the tax notice. */
export function sgChecks(input: SgCheckInput): Check[] {
  const { fund, notice, now, registerUnits, withheld, undeclaredHolders, recon, position } = input;
  const out: Check[] = [];
  const today = toISODate(now);
  const { taxableDistributed, taxExemptDistribution, capitalDistribution, taxableSpecifiedIncome } = fund.inputs;

  if (registerUnits !== fund.unitsOnIssue) {
    const diff = fund.unitsOnIssue - registerUnits;
    out.push({
      id: "register",
      severity: "exception",
      title: "Unit register out of balance",
      detail: `Register holds ${integer(registerUnits)} units against ${integer(fund.unitsOnIssue)} on issue (${integer(Math.abs(diff))} ${diff > 0 ? "units not allocated to a holder" : "units over-allocated"}).`,
    });
  }

  if (position.payoutRatio !== null && !position.passes) {
    const threshold = pct(position.thresholdPct, 0);
    const trusteeRate = ratePct(position.rate);
    // The figures before this sentence are the reference app's. This one is the law: a failed test taxes all the specified income at the trustee, and
    // distributions out of income the trustee has already paid tax on are not taxed again, so s45G withholding would not apply.
    const fallsAway = withheld >= 1 ? `, so the ${money(withheld, "SGD")} of withholding computed here would fall away` : "";
    const worstCase = `If the Comptroller denies tax transparency for the year, the trustee would instead be taxed on all of the taxable specified income at ${trusteeRate}: ${money(position.engineTrusteeTax, "SGD")} (the engine's worst case), and no s45G withholding would apply to distributions out of income already taxed at the trustee (IRAS e-Tax Guide para 8.4)${fallsAway}; this needs a tax adviser's view.`;
    out.push({
      id: "payout",
      severity: "exception",
      title: `Taxable payout below ${threshold}`,
      detail: `${pct(position.payoutRatio * 100, 1)} of taxable specified income is distributed. Tax transparency needs at least ${threshold} for the year; ${money(position.retained, "SGD")} retained is taxed at the trustee at ${trusteeRate} (${money(position.trusteeTax, "SGD")}). ${worstCase}`,
    });
  }

  if (taxableDistributed > taxableSpecifiedIncome) {
    out.push({
      id: "over-distribution",
      severity: "exception",
      title: "Taxable distribution exceeds taxable specified income",
      detail: `The excess of ${money(taxableDistributed - taxableSpecifiedIncome, "SGD")} is a return of capital for tax purposes, not taxable income.`,
    });
  }

  if (recon.remitted !== null && recon.variance !== null && recon.variance !== 0) {
    out.push({
      id: "wht-rec",
      severity: "exception",
      title: "Withholding reconciliation variance",
      detail: `Computed ${money(recon.computed, "SGD")} against ${money(recon.remitted, "SGD")} remitted — ${recon.variance > 0 ? "under-remitted" : "over-remitted"} by ${money(Math.abs(recon.variance), "SGD")}.`,
    });
  }

  if (undeclaredHolders > 0) {
    const rate = holderTreatment("other", paymentDateOf(fund, notice)).rate;
    out.push({
      id: "no-declaration",
      severity: "note",
      title: `${ratePct(rate)} deducted for ${undeclaredHolders} holder${undeclaredHolders === 1 ? "" : "s"} without a qualifying declaration`,
      detail: "Not a final tax — the holder can claim a refund of tax over-deducted once a declaration is received.",
    });
  }

  if (notice) {
    if (notice.publishedOn === null || notice.notified === null) {
      if (today > notice.recordDate) {
        out.push({
          id: "sg-notice-late",
          severity: "exception",
          title: "Distribution tax notice not announced before the record date",
          detail: `Record date ${dateLabel(notice.recordDate)}. Unitholders need the tax breakdown to submit their declarations. ${FORM_RULE}; announcing the notice before the record date is market practice, not an IRAS rule.`,
        });
      } else {
        out.push({
          id: "sg-notice-due",
          severity: "note",
          title: `Announce the tax notice before the record date, ${dateLabel(notice.recordDate)}`,
          detail: `Declaration cut-off set by the manager: ${dateLabel(notice.declarationDeadline)}. ${FORM_RULE}; announcing the notice before the record date is market practice, not an IRAS rule.`,
        });
      }
    } else {
      const compared: Array<[string, Cents, Cents]> = [
        ["Taxable income distribution", notice.notified.taxable, taxableDistributed],
        ["Tax-exempt income distribution", notice.notified.exempt, taxExemptDistribution],
        ["Capital distribution", notice.notified.capital, capitalDistribution],
      ];
      const changed = compared.filter(([, announced, current]) => Math.abs(announced - current) >= 50);
      if (changed.length > 0) {
        out.push({
          id: "sg-notice-changed",
          severity: "exception",
          title: "Distribution differs from the announced tax notice",
          detail: changed.map(([label, announced, current]) => `${label}: announced ${money(announced, "SGD")}, now ${money(current, "SGD")}`).join("; "),
        });
      }
    }
  }

  const due = reitWithholdingDueDate(paymentDateOf(fund, notice));
  if (withheld >= 1 && fund.whtRemitted === null && today > due) {
    out.push({
      id: "sg-wht-overdue",
      severity: "exception",
      title: "Withholding tax overdue",
      detail: `${money(withheld, "SGD")} was due to IRAS by ${dateLabel(due)}.`,
    });
  }

  return out;
}
