// Seed data: the reference app's fictional demo dataset in the shapes of ../types.ts (integer cents). The sibling modules hold the literals;
// this file assembles them once into a frozen template and hands out a deep copy per call.
import type { AppData, UiState } from "../types.ts";
import { STATE_VERSION } from "../types.ts";
import { FUNDS } from "./funds.ts";
import { HOLDERS } from "./holders.ts";
import { TB_CATEGORIES } from "./tbCategories.ts";
import { TB_ROWS } from "./trialBalance.ts";
import { ADJUSTMENT_DEFS, TAX_ADJUSTMENTS } from "./taxAdjustments.ts";
import { PROPERTIES } from "./properties.ts";
import { SG_LEDGER, UNIT_COST_BASE } from "./costBase.ts";
import { AU_NOTICES, SG_NOTICES } from "./notices.ts";
import { APPROVALS, AUDIT, LODGMENTS, QUERIES, USERS } from "./workflow.ts";

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}

const TEMPLATE: AppData = {
  version: STATE_VERSION,
  funds: FUNDS,
  holders: HOLDERS,
  tbRows: TB_ROWS,
  tbCategories: TB_CATEGORIES,
  taxAdjustments: TAX_ADJUSTMENTS,
  adjustmentDefs: ADJUSTMENT_DEFS,
  properties: PROPERTIES,
  unitCostBase: UNIT_COST_BASE,
  sgLedger: SG_LEDGER,
  auNotices: AU_NOTICES,
  sgNotices: SG_NOTICES,
  queries: QUERIES,
  audit: AUDIT,
  approvals: APPROVALS,
  lodgments: LODGMENTS,
  users: USERS,
};
deepFreeze(TEMPLATE);

/** A fresh, deep-copied AppData. Calling it twice returns independent objects. */
export function seedData(): AppData {
  return structuredClone(TEMPLATE);
}

/** Initial UI state: current user "a-moreno" (Head of Tax), jurisdiction "all", first fund selected. */
export function defaultUi(): UiState {
  return { currentUserId: "a-moreno", jurisdiction: "all", selectedFundId: "harbourline" };
}
