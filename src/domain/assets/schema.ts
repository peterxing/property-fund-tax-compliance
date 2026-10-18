// OWNER: Assets & allowances agent (F3). Exact-shape rules for saved asset records, plus cross-record checks.
import type { AppData, Market } from "../types.ts";
import type { FixedAsset } from "./types.ts";
import { bad, bool, fundKey, id, int, isoDate, label, list, literal, nullable, oneOf, optional, shape, text, tick, unique, type Rule } from "../core/schemaKit.ts";

const bps = int(0, 10_000);
const electedLife: Rule = (value, at) => {
  tick(at);
  if (value !== 6 && value !== 12 && value !== 16) bad(at, "must be 6, 12 or 16");
};
const positiveNumber: Rule = (value, at) => {
  tick(at);
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) bad(at, "must be a positive number");
};
const amount = int(0);
const notes = text(500);
const base = {
  id,
  fundId: fundKey,
  propertyId: nullable(id),
  description: label,
  cost: amount,
  startDate: isoDate,
  disposalDate: optional(isoDate),
  disposalProceeds: optional(amount),
  notes: optional(notes),
};

const div40 = shape({
  ...base,
  kind: literal("AU_DIV40"),
  assetClassId: id,
  method: oneOf(["DIMINISHING_VALUE", "PRIME_COST"]),
  effectiveLifeYears: optional(positiveNumber),
  taxableUseBps: optional(bps),
});

const div43 = shape({
  ...base,
  kind: literal("AU_DIV43"),
  buildingType: oneOf(["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "SHORT_TERM_TRAVELLER_ACCOMMODATION", "STRUCTURAL_IMPROVEMENT", "BUILD_TO_RENT"]),
  constructionStartDate: isoDate,
  constructionCompleteDate: isoDate,
  firstIncomeUseDate: isoDate,
  constructionExpenditure: amount,
  priorDivision43Claims: optional(amount),
  taxableUseBps: optional(bps),
});

const sgPlant = shape({
  ...base,
  kind: literal("SG_PLANT"),
  assetClassId: id,
  regime: oneOf(["S19_WORKING_LIFE", "S19A_3Y", "S19A_2Y", "S19A_1Y_SPECIFIC", "S19A_1Y_LOW_VALUE", "S19B_5Y", "S19B_10Y", "S19B_15Y", "IBA", "LIA"]),
  claimStartYa: optional(int(2000, 2200)),
  prescribedWorkingLifeYears: optional(int(1, 100)),
  electedWorkingLifeYears: optional(electedLife),
  claimInitialAllowance: optional(bool),
});

const borrowing = shape({
  ...base,
  kind: literal("AU_BORROWING"),
  loanEndDate: isoDate,
  taxableUseBps: optional(bps),
});

export const fixedAsset: Rule = (value, at) => {
  const kind = (value as { kind?: unknown })?.kind;
  if (kind === "AU_DIV40") div40(value, at);
  else if (kind === "AU_DIV43") div43(value, at);
  else if (kind === "SG_PLANT") sgPlant(value, at);
  else if (kind === "AU_BORROWING") borrowing(value, at);
  else bad(`${at}.kind`, "must be AU_DIV40, AU_DIV43, SG_PLANT or AU_BORROWING");
};

/** Cross-record checks run after the shapes pass: ids unique, fund ids exist, markets match, properties belong to the same fund. */
export function assetsRelations(data: AppData, marketFor: (fundId: string, at: string) => Market): void {
  unique(data.assets, (r) => r.id ?? "", "assets");
  const propertyFund = new Map(data.properties.map((p) => [p.id, p.fundId]));
  data.assets.forEach((r: FixedAsset, i) => {
    const market = marketFor(r.fundId, `assets[${i}].fundId`);
    if ((r.kind === "AU_DIV40" || r.kind === "AU_DIV43" || r.kind === "AU_BORROWING") && market !== "AU") bad(`assets[${i}].kind`, "is only for Australian funds");
    if (r.kind === "SG_PLANT" && market !== "SG") bad(`assets[${i}].kind`, "is only for Singapore funds");
    if (r.propertyId !== null) {
      const owner = propertyFund.get(r.propertyId);
      if (!owner) bad(`assets[${i}].propertyId`, "names a property that does not exist");
      if (owner !== r.fundId) bad(`assets[${i}].propertyId`, "names a property from another fund");
    }
    if (r.disposalDate && r.disposalDate < r.startDate) bad(`assets[${i}].disposalDate`, "is before the asset start date");
  });
}
