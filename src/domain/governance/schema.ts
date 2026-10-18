// OWNER: Governance agent (F8: versions, manual adjustments, prior-year view). Exact-shape rules for this feature's saved records, plus cross-record checks. core/schema.ts calls these.
import type { AppData, Market } from "../types.ts";
import type { CalcSnapshotInput, CalcSnapshotLine, CalcVersion, ManualAdjustment } from "./types.ts";
import { bad, fundKey, id, label, list, longText, nullable, oneOf, shape, signed, stamp, text, tick, unique, type Rule } from "../core/schemaKit.ts";

const trigger = oneOf(["manual", "submit", "sign-off", "reopen"]);
const component = oneOf([
  "ausOtherIncome",
  "ncmi",
  "excludedNcmi",
  "cleanBuilding",
  "interest",
  "discountGainTarp",
  "otherGainTarp",
  "foreignIncome",
  "taxableSpecifiedIncome",
]);
const hash = text(32, 1);
const inputValue: Rule = (value, at) => {
  tick(at);
  if (value === null || typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value))) return;
  bad(at, "must be text, a whole number or null");
};

const snapshotLine = shape<CalcSnapshotLine>({ ref: id, label, amount: signed });
const snapshotInput = shape<CalcSnapshotInput>({ ref: id, label, value: inputValue });

export const calcVersion = shape<CalcVersion>({
  id,
  fundId: fundKey,
  label,
  at: stamp,
  by: label,
  trigger,
  reason: nullable(longText),
  inputHash: hash,
  snapshot: list(snapshotLine),
  inputs: list(snapshotInput),
});
export const manualAdjustment = shape<ManualAdjustment>({ id, fundId: fundKey, label, amount: signed, component, reason: longText, by: label, at: stamp });

/** Cross-record checks run after the shapes pass: ids unique, fund ids exist (marketFor throws for unknown funds), markets match. */
export function governanceRelations(data: AppData, marketFor: (fundId: string, at: string) => Market): void {
  unique(data.versions, (r) => r.id ?? "", "versions");
  data.versions.forEach((r, i) => marketFor(r.fundId, `versions[${i}].fundId`));
  unique(data.manualAdjustments, (r) => r.id ?? "", "manualAdjustments");
  data.manualAdjustments.forEach((r, i) => marketFor(r.fundId, `manualAdjustments[${i}].fundId`));
}
