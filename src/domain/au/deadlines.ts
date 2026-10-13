// Filing and notice obligations for one AMIT, with their status at `now`.
import type { AppData, DeadlineRow, DeadlineStatus, Fund, FundCalc, ISODate } from "../types.ts";
import { mitAiirDueDate } from "../../engine/au/mitWithholding.ts";
import { compareDates, toISODate } from "../format.ts";
import { aiirDueDate } from "./investor.ts";
import { facts, lodgmentOf } from "./returns.ts";
import { asAuFund, noticesOf } from "./util.ts";

export function deadlines(data: AppData, fundIn: Fund, calc: FundCalc, now: Date): DeadlineRow[] {
  const fund = asAuFund(fundIn);
  const today = toISODate(now);
  const aiirLodged = lodgmentOf(data, fund, "aiir") !== null;
  const row = (date: ISODate, obligation: string, done: boolean): DeadlineRow => {
    const status: DeadlineStatus = done ? "done" : compareDates(date, today) < 0 ? "overdue" : "open";
    return { date, fundId: fund.id, fundName: fund.name, obligation, status };
  };

  const rows: DeadlineRow[] = [row(facts(calc).ammaDue, "AMMA statements", fund.status === "Signed off")];
  const aiirDue = aiirDueDate(fund.periodEnd);
  if (aiirDue !== "") rows.push(row(aiirDue, "AIIR", aiirLodged));
  for (const notice of noticesOf(data, fund.id)) {
    rows.push(row(notice.paymentDate, `Fund payment notice - ${notice.label}`, notice.publishedOn !== null));
  }
  rows.push(row(mitAiirDueDate(fund.periodEnd), "Fund payment withholding report", aiirLodged));
  return rows.sort((a, b) => compareDates(a.date, b.date));
}
