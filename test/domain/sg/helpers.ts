// Shared fixtures for the Singapore module tests. Every test builds its own data with seedData(), which returns a fresh deep clone.
import { seedData } from "../../../src/domain/seed/index.ts";
import { sgModule } from "../../../src/domain/sg/index.ts";
import type { AppData, Ctx, FundCalc, SgFund } from "../../../src/domain/types.ts";

/** The reference "today" for the golden values: 12 Oct 2026 (local time, as the app reads it). */
export const NOW = new Date(2026, 9, 12, 9, 0, 0);

export const SG_IDS = ["telok-ayer", "loyang", "meranti", "kallang"] as const;
export type SgId = (typeof SG_IDS)[number];

export function freshData(): AppData {
  return seedData();
}

export function sgFund(data: AppData, id: string): SgFund {
  const fund = data.funds.find((f) => f.id === id);
  if (!fund || fund.market !== "SG") throw new Error(`No SG fund ${id}`);
  return fund;
}

export function ctxFor(data: AppData, userId = "a-moreno", now: Date = NOW): Ctx {
  const user = data.users.find((u) => u.id === userId);
  if (!user) throw new Error(`No user ${userId}`);
  return { user, now };
}

export function calcFor(data: AppData, id: string, now: Date = NOW): FundCalc {
  return sgModule.fundCalc(data, sgFund(data, id), now);
}

/** Whole dollars, for comparing against the reference app's figures. */
export const dollars = (cents: number): number => Math.round(cents / 100);

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** Stable text for deep comparison of view models. */
export function snapshot(value: unknown): string {
  return JSON.stringify(value);
}
