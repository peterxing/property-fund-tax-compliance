import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCapitalWorksDeduction } from "../../../src/engine/au/capitalWorks.ts";
import { computeDepreciation } from "../../../src/engine/au/depreciation.ts";
import { computeCapitalAllowances } from "../../../src/engine/capitalAllowances.ts";
import { appDataProblem } from "../../../src/domain/core/schema.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import { assetRegisterView } from "../../../src/domain/assets/index.ts";
import { applyAssetAction } from "../../../src/domain/assets/reducer.ts";
import type { AppData, Ctx, Fund } from "../../../src/domain/types.ts";
import type { FixedAsset, FixedAssetDraft } from "../../../src/domain/assets/types.ts";

const now = new Date("2026-10-12T09:00:00");

function ctx(data: AppData, userId = "a-moreno"): Ctx {
  const user = data.users.find((u) => u.id === userId);
  assert.ok(user, "test user exists");
  return { now, user };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const div40Draft: FixedAssetDraft = {
  kind: "AU_DIV40",
  propertyId: "coastline-coastline-private-hospital",
  description: "Replacement nurse-call plant",
  cost: 120_000_00,
  startDate: "2025-10-01",
  assetClassId: "OTHER_PLANT",
  method: "PRIME_COST",
  effectiveLifeYears: 10,
};

test("seeded asset register agrees with seeded tax adjustments for all funds", () => {
  const data = seedData();
  for (const fund of data.funds) {
    const view = assetRegisterView(data, fund.id, ctx(data));
    assert.equal(view.comparisons.every((row) => row.agrees), true, fund.id);
    if (fund.market === "AU") {
      assert.equal(view.rows.filter((row) => row.kind === "AU_DIV40").length, 5, `${fund.id} Div 40 count`);
      assert.equal(view.rows.filter((row) => row.kind === "AU_DIV43").length, 5, `${fund.id} Div 43 count`);
    } else {
      assert.equal(view.rows.filter((row) => row.kind === "SG_PLANT").length, 5, `${fund.id} SG count`);
    }
  }
});

test("hand checked Division 40 prime-cost asset", () => {
  // ITAA 1997 s40-75 prime cost: cost × days/365 × 100%/effective life = $36,500 × 365/365 × 1/10 = $3,650.
  const result = computeDepreciation({
    incomeYear: 2026,
    asset: { id: "prime", label: "Prime cost plant", assetClassId: "OTHER_PLANT", cost: 36_500_00, startDate: "2025-07-01", method: "PRIME_COST", effectiveLifeYears: 10 },
  });
  assert.equal(result.line.deductionAllowed, 3_650_00);
  assert.equal(result.line.closingAdjustableValue, 32_850_00);
});

test("hand checked Division 40 diminishing value asset part-year", () => {
  // ITAA 1997 s40-70/s40-72 diminishing value: base value × days/365 × 200%/life = $36,500 × 181/365 × 2/10 = $3,620.
  const result = computeDepreciation({
    incomeYear: 2026,
    asset: { id: "example", label: "Example HVAC", assetClassId: "HVAC_PACKAGED_UNIT", cost: 36_500_00, startDate: "2026-01-01", method: "DIMINISHING_VALUE", effectiveLifeYears: 10 },
  });
  assert.equal(result.line.openingAdjustableValue, 36_500_00);
  assert.equal(result.line.daysHeld, 181);
  assert.equal(result.line.deductionAllowed, 3_620_00);
  assert.equal(result.line.closingAdjustableValue, 32_880_00);
});

test("hand checked Division 43 2.5% capital works asset", () => {
  // ITAA 1997 s43-140/s43-210 qualifying capital works, general 2.5% rate: $4,000,000 × 2.5% = $100,000.
  const result = computeCapitalWorksDeduction({
    incomeYear: 2026,
    asset: {
      id: "building",
      label: "Commercial structure",
      buildingType: "COMMERCIAL",
      constructionStartDate: "2024-07-01",
      constructionCompleteDate: "2025-06-30",
      firstIncomeUseDate: "2025-07-01",
      acquisitionDate: "2025-07-01",
      constructionExpenditure: 4_000_000_00,
    },
  });
  assert.equal(result.line.rateBps, 250);
  assert.equal(result.line.deduction, 100_000_00);
  assert.equal(result.line.closingUndeductedConstructionExpenditure, 3_900_000_00);
});

test("hand checked Division 43 4% industrial building asset", () => {
  // ITAA 1997 s43-140/s43-210 qualifying industrial capital works, 4% band: $2,500,000 × 4% = $100,000.
  const result = computeCapitalWorksDeduction({
    incomeYear: 2026,
    asset: {
      id: "industrial",
      label: "Industrial building",
      buildingType: "INDUSTRIAL",
      constructionStartDate: "2024-07-01",
      constructionCompleteDate: "2025-06-30",
      firstIncomeUseDate: "2025-07-01",
      acquisitionDate: "2025-07-01",
      constructionExpenditure: 2_500_000_00,
    },
  });
  assert.equal(result.line.rateBps, 400);
  assert.equal(result.line.deduction, 100_000_00);
  assert.equal(result.line.closingUndeductedConstructionExpenditure, 2_400_000_00);
});

test("hand checked Australian s25-25 borrowing cost appears in the 10-year schedule", () => {
  // s25-25 spreads $250,000 over the shorter of 5 years and the loan term.
  // 1 Jul 2025 to 30 Jun 2030 has 1,826 days, so the engine's remaining-expenditure method gives:
  // 2026 $250,000 × 365/1,826 = $49,972.62; 2028 is higher because it has 366 relevant days.
  const data = seedData();
  const borrowing: FixedAsset = {
    id: "borrowing-test",
    fundId: "coastline",
    propertyId: null,
    kind: "AU_BORROWING",
    description: "Loan establishment fees",
    cost: 250_000_00,
    startDate: "2025-07-01",
    loanEndDate: "2030-06-30",
  };
  const view = assetRegisterView({ ...data, assets: [borrowing] }, "coastline", ctx(data));
  assert.deepEqual(view.schedule.filter((row) => row.kind === "AU_BORROWING").map((row) => row.deduction), [4_997_262, 4_997_262, 5_010_953, 4_997_262, 4_997_261]);
});

test("hand checked Singapore s19A one-year asset", () => {
  // IRAS s19A one-year write-off: qualifying plant cost S$123,456 is fully written off in YA2027.
  const result = computeCapitalAllowances({
    fromYa: 2027,
    toYa: 2027,
    financialYearEndMonth: 9,
    financialYearEndDay: 30,
    entityKind: "PROPERTY_FUND",
    assets: [{ id: "sg", label: "Specific write-off plant", regime: "S19A_1Y_SPECIFIC", cost: 123_456_00, acquisitionDate: "2026-08-01" }],
  });
  assert.equal(result.yaSummaries[0]?.capitalAllowances, 123_456_00);
  assert.equal(result.assetLines[0]?.closingTaxWrittenDownValue, 0);
});

test("hand checked Singapore s19A three-year asset", () => {
  // IRAS s19A 3-year write-off: S$120,000 / 3 = S$40,000 per YA.
  const result = computeCapitalAllowances({
    fromYa: 2027,
    toYa: 2029,
    financialYearEndMonth: 9,
    financialYearEndDay: 30,
    entityKind: "PROPERTY_FUND",
    assets: [{ id: "sg-3y", label: "Three-year plant", regime: "S19A_3Y", cost: 120_000_00, acquisitionDate: "2026-08-01" }],
  });
  assert.deepEqual(result.yaSummaries.map((s) => s.capitalAllowances), [40_000_00, 40_000_00, 40_000_00]);
});

test("hand checked Singapore s19 working-life asset", () => {
  // IRAS s19 working-life annual allowance path without initial allowance: S$120,000 / 6-year elected life = S$20,000.
  const result = computeCapitalAllowances({
    fromYa: 2027,
    toYa: 2027,
    financialYearEndMonth: 9,
    financialYearEndDay: 30,
    entityKind: "PROPERTY_FUND",
    assets: [{ id: "sg-life", label: "Working-life plant", regime: "S19_WORKING_LIFE", cost: 120_000_00, acquisitionDate: "2026-08-01", electedWorkingLifeYears: 6, claimInitialAllowance: false }],
  });
  assert.equal(result.yaSummaries[0]?.capitalAllowances, 20_000_00);
  assert.equal(result.assetLines[0]?.closingTaxWrittenDownValue, 100_000_00);
});

test("asset reducer refuses view-only, no-fund and non-Preparing apply-to-TB actions", () => {
  const data = seedData();
  const viewOnly = applyAssetAction(data, { type: "asset-add", fundId: "coastline", asset: div40Draft }, ctx(data, "m-castillo"));
  assert.equal(viewOnly.ok, false);
  assert.match(viewOnly.reason, /View only/);
  const noFund = applyAssetAction(data, { type: "asset-add", fundId: "coastline", asset: div40Draft }, ctx(data, "w-l-teo"));
  assert.equal(noFund.ok, false);
  assert.match(noFund.reason, /View only/);
  const signedOff = applyAssetAction(data, { type: "asset-apply-to-trial-balance", fundId: "harbourline" }, ctx(data));
  assert.equal(signedOff.ok, false);
  assert.match(signedOff.reason, /Signed off/);
  const inReview = applyAssetAction(data, { type: "asset-apply-to-trial-balance", fundId: "southbank" }, ctx(data));
  assert.equal(inReview.ok, false);
  assert.match(inReview.reason, /In review/);
});

test("asset apply-to-TB audits and updates Preparing trial-balance adjustments", () => {
  const data = seedData();
  const changed = structuredClone(data);
  changed.taxAdjustments.coastline = { ...changed.taxAdjustments.coastline, div40: 0, div43: 0 };
  const result = applyAssetAction(changed, { type: "asset-apply-to-trial-balance", fundId: "coastline" }, ctx(changed));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.taxAdjustments.coastline.div40, data.taxAdjustments.coastline.div40);
    assert.equal(result.data.taxAdjustments.coastline.div43, data.taxAdjustments.coastline.div43);
    assert.equal(result.data.audit.at(-1)?.action, "Asset register updated");
    assert.equal(result.data.audit.at(-1)?.detail, "Tax adjustments updated from the asset register.");
    assert.equal(appDataProblem(result.data), null);
  }
});

test("asset reducer handles add, update, dispose, delete and import immutably with schema-valid outputs", () => {
  const frozen = deepFreeze(seedData());
  const beforeCount = frozen.assets.length;
  const add = applyAssetAction(frozen, { type: "asset-add", fundId: "coastline", asset: div40Draft }, ctx(frozen));
  assert.equal(add.ok, true);
  assert.equal(frozen.assets.length, beforeCount);
  if (!add.ok) return;
  assert.equal(add.data.assets.length, beforeCount + 1);
  assert.equal(add.data.audit.at(-1)?.detail, "Added Replacement nurse-call plant.");
  assert.equal(appDataProblem(add.data), null);
  const added = add.data.assets.at(-1) as FixedAsset;

  const updateDraft: FixedAssetDraft = { ...div40Draft, description: "Updated nurse-call plant", cost: 130_000_00 };
  const update = applyAssetAction(add.data, { type: "asset-update", fundId: "coastline", assetId: added.id, asset: updateDraft }, ctx(add.data));
  assert.equal(update.ok, true);
  if (!update.ok) return;
  assert.equal(update.data.assets.find((a) => a.id === added.id)?.description, "Updated nurse-call plant");
  assert.equal(update.data.audit.at(-1)?.detail, "Updated Updated nurse-call plant.");
  assert.equal(appDataProblem(update.data), null);

  const dispose = applyAssetAction(update.data, { type: "asset-dispose", fundId: "coastline", assetId: added.id, disposalDate: "2026-09-30", disposalProceeds: 10_000_00 }, ctx(update.data));
  assert.equal(dispose.ok, true);
  if (!dispose.ok) return;
  assert.equal(dispose.data.assets.find((a) => a.id === added.id)?.disposalProceeds, 10_000_00);
  assert.equal(dispose.data.audit.at(-1)?.detail, "Disposed Updated nurse-call plant.");
  assert.equal(appDataProblem(dispose.data), null);

  const deleted = applyAssetAction(dispose.data, { type: "asset-delete", fundId: "coastline", assetId: added.id }, ctx(dispose.data));
  assert.equal(deleted.ok, true);
  if (!deleted.ok) return;
  assert.equal(deleted.data.assets.some((a) => a.id === added.id), false);
  assert.equal(deleted.data.audit.at(-1)?.detail, "Deleted Updated nurse-call plant.");
  assert.equal(appDataProblem(deleted.data), null);

  const imported = applyAssetAction(deleted.data, { type: "asset-import", fundId: "coastline", assets: [div40Draft] }, ctx(deleted.data));
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.data.assets.filter((a) => a.fundId === "coastline").length, 1);
  assert.equal(imported.data.audit.at(-1)?.detail, "Imported 1 asset.");
  assert.equal(appDataProblem(imported.data), null);
});

test("asset reducer sanitises records and refuses reload-breaking invalid fields", () => {
  const data = seedData();
  const withPoison = { ...div40Draft, id: "evil", fundId: "harbourline", description: "Whitelisted plant" } as FixedAssetDraft & { id: string; fundId: string };
  const added = applyAssetAction(data, { type: "asset-add", fundId: "coastline", asset: withPoison }, ctx(data));
  assert.equal(added.ok, true);
  if (added.ok) {
    const saved = added.data.assets.at(-1);
    assert.equal(saved?.fundId, "coastline");
    assert.notEqual(saved?.id, "evil");
    assert.equal(appDataProblem(added.data), null);
  }

  const longDescription = applyAssetAction(data, { type: "asset-add", fundId: "coastline", asset: { ...div40Draft, description: "x".repeat(201) } }, ctx(data));
  assert.equal(longDescription.ok, false);
  assert.match(longDescription.reason, /Description/);

  const badLife = applyAssetAction(data, { type: "asset-add", fundId: "coastline", asset: { ...div40Draft, effectiveLifeYears: Number.NaN } }, ctx(data));
  assert.equal(badLife.ok, false);
  assert.match(badLife.reason, /Effective life/);

  const badClass = applyAssetAction(data, { type: "asset-add", fundId: "coastline", asset: { ...div40Draft, assetClassId: "NOT_A_CLASS" } }, ctx(data));
  assert.equal(badClass.ok, false);
  assert.match(badClass.reason, /asset class/);

  const wrongProperty = applyAssetAction(data, { type: "asset-add", fundId: "coastline", asset: { ...div40Draft, propertyId: "harbourline-harbourline-tower" } }, ctx(data));
  assert.equal(wrongProperty.ok, false);
  assert.match(wrongProperty.reason, /same fund/);

  const oversizedImport = applyAssetAction(data, { type: "asset-import", fundId: "coastline", assets: Array.from({ length: 2001 }, () => div40Draft) }, ctx(data));
  assert.equal(oversizedImport.ok, false);
  assert.match(oversizedImport.reason, /2,000|2000/);
});

test("seeded asset records pass exact persisted schema", () => {
  const data = seedData();
  assert.equal(appDataProblem(data), null);
});
