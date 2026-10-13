// Memoised distribution calculation. Keyed by (AppData identity, fund id, calendar day): AppData is immutable by convention (reducers
// return new objects), so identity stands in for value. Never mutate an AppData you have already read a view from.
import type { AppData, Fund, FundCalc } from "../types.ts";
import { toISODate } from "../format.ts";
import { moduleFor } from "../modules.ts";

const memo = new WeakMap<AppData, Map<string, FundCalc>>();

export function calcFor(data: AppData, fund: Fund, now: Date): FundCalc {
  let perData = memo.get(data);
  if (!perData) {
    perData = new Map();
    memo.set(data, perData);
  }
  const key = `${fund.id}|${toISODate(now)}`;
  let calc = perData.get(key);
  if (!calc) {
    calc = moduleFor(fund.market).fundCalc(data, fund, now);
    perData.set(key, calc);
  }
  return calc;
}

export function exceptionsFor(data: AppData, fund: Fund, now: Date): number {
  return calcFor(data, fund, now).exceptions;
}
