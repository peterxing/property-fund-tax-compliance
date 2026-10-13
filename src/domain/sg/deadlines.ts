// Filing and notice obligations for a Singapore fund. The dates come from the notice record and the engine's REIT filing rules.
import { reitFormUtDueDate, reitWithholdingDueDate } from "../../engine/reitTax.ts";
import { toISODate } from "../format.ts";
import type { AppData, DeadlineRow, DeadlineStatus, Fund, FundCalc, ISODate } from "../types.ts";
import { paymentDateOf, requireSgFund, sgNoticeFor } from "./util.ts";

export function sgDeadlines(data: AppData, fundIn: Fund, calc: FundCalc, now: Date): DeadlineRow[] {
  const fund = requireSgFund(fundIn);
  const notice = sgNoticeFor(data, fund.id);
  const today = toISODate(now);
  const statusOf = (date: ISODate, done: boolean): DeadlineStatus => (done ? "done" : date < today ? "overdue" : "open");
  const row = (date: ISODate, obligation: string, done: boolean): DeadlineRow => ({
    date,
    fundId: fund.id,
    fundName: fund.name,
    obligation,
    status: statusOf(date, done),
  });

  // With nothing withheld there is nothing to file or pay under s45G.
  const withholdingDone = fund.whtRemitted !== null || calc.withheld < 1;
  const formUtLodged = data.lodgments.some((l) => l.fundId === fund.id && l.kind === "form-ut");

  // The tax notice is dated at the record date, which is the manager's own schedule: IRAS sets no date for the notice (see the Rules tab).
  // The row text stays as in the reference app so the deadline rows match it by date, fund and obligation.
  return [
    row(notice?.recordDate ?? fund.periodEnd, "Distribution tax notice", notice?.publishedOn != null),
    row(reitWithholdingDueDate(paymentDateOf(fund, notice)), "Withholding tax (s45G)", withholdingDone),
    row(reitFormUtDueDate(fund.assessmentYear), "Form UT", formUtLodged),
  ];
}
