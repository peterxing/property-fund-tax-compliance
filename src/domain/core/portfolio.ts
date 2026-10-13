// The visible funds of a portfolio view with their calculations, shared by Analytics and the workbook export.
import type { AppData, Ctx, DeadlineRow, Fund, FundCalc, JurisdictionFilter } from "../types.ts";
import { compareDates } from "../format.ts";
import { moduleFor } from "../modules.ts";
import { calcFor } from "./calc.ts";
import { visibleFundsOf } from "./visible.ts";

export interface PortfolioEntry {
  fund: Fund;
  calc: FundCalc;
}

export function portfolioEntries(data: AppData, ctx: Ctx, jurisdiction: JurisdictionFilter): PortfolioEntry[] {
  return visibleFundsOf(data, ctx.user, jurisdiction).map((fund) => ({ fund, calc: calcFor(data, fund, ctx.now) }));
}

/** Every visible fund's obligations, earliest first; equal dates keep the fund order (and each module's own order). */
export function portfolioDeadlines(data: AppData, entries: readonly PortfolioEntry[], now: Date): DeadlineRow[] {
  const rows = entries.flatMap(({ fund, calc }) => moduleFor(fund.market).deadlines(data, fund, calc, now));
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compareDates(a.row.date, b.row.date) || a.index - b.index)
    .map((x) => x.row);
}
