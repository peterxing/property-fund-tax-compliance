// Shared helpers for the domain-core tests (format, permissions, sankey, workflow, actions, access, bulk, store, selectors, analytics).
// Not a test file: `npm run test:domain` only runs *.test.ts.
import assert from "node:assert/strict";
import { applyAction } from "../../src/domain/actions.ts";
import { moduleFor } from "../../src/domain/modules.ts";
import { seedData } from "../../src/domain/seed/index.ts";
import type { Action, AppData, Ctx, Fund, FundId, Market, User } from "../../src/domain/types.ts";

/** The fixed "today" of every test: Tuesday 13 Oct 2026, 11:30 local time. */
export const NOW = new Date(2026, 9, 13, 11, 30, 0);
export const NOW_STAMP = "2026-10-13T11:30:00";
export const TODAY = "2026-10-13";

export const PERSONAS = ["a-moreno", "l-brennan", "n-pillai", "r-okafor", "w-l-teo", "d-harrow", "s-lim", "m-castillo"] as const;

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** A fresh, mutable copy of the seed. */
export const seed = (): AppData => seedData();
/** The seed, deeply frozen: any reducer that mutates its input throws. */
export const frozenSeed = (): AppData => deepFreeze(seedData());

export function userOf(data: AppData, id: string): User {
  const user = data.users.find((u) => u.id === id);
  assert.ok(user, `no user ${id}`);
  return user;
}

export function fundOf(data: AppData, id: FundId): Fund {
  const fund = data.funds.find((f) => f.id === id);
  assert.ok(fund, `no fund ${id}`);
  return fund;
}

/** The user is looked up in `data`, so pass the latest data after access changes. */
export function ctxOf(data: AppData, userId: string, now: Date = NOW): Ctx {
  return { user: userOf(data, userId), now };
}

/** Applies the action as that user and asserts it succeeded. */
export function ok(data: AppData, userId: string, action: Action): AppData {
  const result = applyAction(data, action, ctxOf(data, userId));
  assert.ok(result.ok, result.ok ? "" : `${userId} ${action.type}: ${result.reason}`);
  return result.data;
}

/** Applies the action as that user, asserts it was refused and returns the reason. */
export function denied(data: AppData, userId: string, action: Action): string {
  const result = applyAction(data, action, ctxOf(data, userId));
  assert.equal(result.ok, false, `${userId} ${action.type} should have been refused`);
  return result.ok ? "" : result.reason;
}

/** Applies several steps in a row as (userId, action) pairs. */
export function chain(data: AppData, steps: ReadonlyArray<readonly [string, Action]>): AppData {
  return steps.reduce((current, [userId, action]) => ok(current, userId, action), data);
}

function moduleWorks(market: Market): boolean {
  try {
    const data = seedData();
    const fund = data.funds.find((f) => f.market === market);
    if (!fund) return false;
    const module = moduleFor(market);
    module.rules(fund);
    module.fundCalc(data, fund, NOW);
    return true;
  } catch {
    return false;
  }
}

/** Whether the market module can calculate (it throws "not implemented" while it is a stub). */
export const modulesReady: Record<Market, boolean> = { AU: moduleWorks("AU"), SG: moduleWorks("SG") };

/** `skip` option for tests that need market modules: false when they are ready, otherwise the reason printed in the test report. */
export function skipUnlessReady(...markets: Market[]): string | false {
  const missing = markets.filter((market) => !modulesReady[market]);
  return missing.length === 0 ? false : `${missing.join(" and ")} market module is not implemented yet`;
}

export const AU_FUNDS = ["harbourline", "southbank", "wattle", "kurrajong", "coastline"];
export const SG_FUNDS = ["telok-ayer", "loyang", "meranti", "kallang"];

/** A few workflow states (seed, submitted, approved, signed off and reopened) for tests that sweep every persona and fund. */
export function sampleStates(): Array<[string, AppData]> {
  const approve = (fundId: FundId, level: "review" | "agent"): Action => ({ type: "approve", fundId, level });
  const s0 = deepFreeze(seedData());
  const s1 = chain(s0, [
    ["a-moreno", { type: "submit", fundId: "telok-ayer" }],
    ["w-l-teo", { type: "submit", fundId: "kallang" }],
    ["r-okafor", { type: "submit", fundId: "coastline" }],
  ]);
  const s2 = chain(s1, [
    ["n-pillai", approve("telok-ayer", "review")],
    ["n-pillai", approve("kallang", "review")],
    ["s-lim", approve("telok-ayer", "agent")],
    ["l-brennan", approve("coastline", "review")],
    ["l-brennan", approve("southbank", "review")],
  ]);
  const queried = ok(s2, "n-pillai", { type: "raise-query", fundId: "telok-ayer", subject: "Withholding rate", message: "Please confirm the rate used." });
  const s3 = chain(s2, [
    ["a-moreno", { type: "sign-off", fundId: "kallang" }],
    ["a-moreno", { type: "reopen", fundId: "loyang" }],
    ["a-moreno", { type: "set-user-funds", userId: "s-lim", funds: ["telok-ayer", "meranti", "kallang"] }],
  ]);
  const resubmitted = chain(s0, [
    ["a-moreno", { type: "reopen", fundId: "harbourline" }],
    ["a-moreno", { type: "reopen", fundId: "wattle" }],
    ["r-okafor", { type: "submit", fundId: "harbourline" }],
    ["r-okafor", { type: "submit", fundId: "wattle" }],
  ]);
  const reapproved = chain(resubmitted, [
    ["l-brennan", approve("harbourline", "review")],
    ["d-harrow", approve("harbourline", "agent")],
    ["l-brennan", approve("wattle", "review")],
  ]);
  return [
    ["seed", s0],
    ["submitted", s1],
    ["approved", s2],
    ["approved with an open query", queried],
    ["signed off and reopened", s3],
    ["reopened funds resubmitted", resubmitted],
    ["reopened funds approved again", reapproved],
  ];
}