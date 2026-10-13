// Shared fixtures for the Investor reporting tests. Every test builds its own data with seedData(), which returns a fresh deep clone.
import { seedData } from "../../../src/domain/seed/index.ts";
import type { AppData, AuFund, Ctx, SgFund } from "../../../src/domain/types.ts";

/** The reference "today" for the golden values: 12 Oct 2026 (local time, as the app reads it). */
export const NOW = new Date(2026, 9, 12, 9, 0, 0);

export const freshData = (): AppData => seedData();

export function ctxFor(data: AppData, userId = "a-moreno", now: Date = NOW): Ctx {
  const user = data.users.find((u) => u.id === userId);
  if (!user) throw new Error(`No user ${userId}`);
  return { user, now };
}

export function auFund(data: AppData, id: string): AuFund {
  const fund = data.funds.find((f) => f.id === id);
  if (!fund || fund.market !== "AU") throw new Error(`No AU fund ${id}`);
  return fund;
}

export function sgFund(data: AppData, id: string): SgFund {
  const fund = data.funds.find((f) => f.id === id);
  if (!fund || fund.market !== "SG") throw new Error(`No SG fund ${id}`);
  return fund;
}

export const AU_IDS = ["harbourline", "southbank", "wattle", "kurrajong", "coastline"] as const;
export const SG_IDS = ["telok-ayer", "loyang", "meranti", "kallang"] as const;
