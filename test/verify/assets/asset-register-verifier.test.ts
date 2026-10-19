import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assetRegisterView } from "../../../src/domain/assets/index.ts";
import { applyAssetAction } from "../../../src/domain/assets/reducer.ts";
import type { FixedAsset, FixedAssetDraft } from "../../../src/domain/assets/types.ts";
import { appDataProblem } from "../../../src/domain/core/schema.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import { tbView } from "../../../src/domain/selectors.ts";
import type { AppData, Cents, Ctx } from "../../../src/domain/types.ts";

const now = new Date("2026-10-12T09:00:00");

function ctx(data: AppData, userId = "a-moreno"): Ctx {
  const user = data.users.find((candidate) => candidate.id === userId);
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

function roundRatio(amount: Cents, numerator: number, denominator: number): Cents {
  return Math.round((amount * numerator) / denominator);
}

function manualSeedDeduction(asset: FixedAsset): Cents {
  if (asset.kind === "AU_DIV40") {
    assert.equal(asset.method, "PRIME_COST");
    assert.equal(asset.effectiveLifeYears, 1);
    return asset.cost;
  }
  if (asset.kind === "AU_DIV43") {
    assert.equal(asset.buildingType, "COMMERCIAL");
    return roundRatio(asset.constructionExpenditure, 250, 10_000);
  }
  if (asset.kind === "SG_PLANT") {
    assert.equal(asset.regime, "S19A_1Y_SPECIFIC");
    return Math.round(asset.cost / 100) * 100;
  }
  throw new Error(`Unexpected seeded asset kind ${asset.kind}`);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function manualDiv40DvSchedule(cost: Cents, lifeYears: number, fromIncomeYear: number, years: number): Cents[] {
  const deductions: Cents[] = [];
  let opening = cost;
  for (let i = 0; i < years; i += 1) {
    const heldDays = isLeapYear(fromIncomeYear + i) ? 366 : 365;
    const deduction = Math.min(opening, roundRatio(roundRatio(opening, heldDays, 365), 200, Math.round(lifeYears * 100)));
    deductions.push(deduction);
    opening = Math.max(0, opening - deduction);
  }
  return deductions;
}

function manualLowValuePoolSchedule(cost: Cents, years: number): Cents[] {
  const deductions: Cents[] = [];
  let opening = 0;
  for (let i = 0; i < years; i += 1) {
    const addition = i === 0 ? cost : 0;
    const deduction = roundRatio(opening, 3750, 10_000) + roundRatio(addition, 1875, 10_000);
    deductions.push(deduction);
    opening = Math.max(0, opening + addition - deduction);
  }
  return deductions;
}

const div40Draft: FixedAssetDraft = {
  kind: "AU_DIV40",
  propertyId: "coastline-coastline-private-hospital",
  description: "Verifier replacement plant",
  cost: 365_000_00,
  startDate: "2025-10-01",
  assetClassId: "OTHER_PLANT",
  method: "PRIME_COST",
  effectiveLifeYears: 10,
};

describe("asset verifier: seeded register arithmetic", () => {
  for (const fundId of ["harbourline", "coastline", "telok-ayer", "kallang"] as const) {
    test(`${fundId} seeded asset rows equal independently recomputed deductions`, () => {
      const data = seedData();
      const view = assetRegisterView(data, fundId, ctx(data));
      const rowsById = new Map(view.rows.map((row) => [row.id, row]));
      for (const asset of data.assets.filter((candidate) => candidate.fundId === fundId)) {
        assert.equal(rowsById.get(asset.id)?.deduction, manualSeedDeduction(asset), asset.id);
      }
    });
  }

  test("register totals agree with trial-balance adjustments for all nine seeded funds", () => {
    const data = seedData();
    assert.deepEqual(
      data.funds.flatMap((fund) => assetRegisterView(data, fund.id, ctx(data)).comparisons.filter((row) => !row.agrees).map((row) => `${fund.id}:${row.key}:${row.difference}`)),
      [],
    );
  });
});

describe("asset verifier: 10-year schedules", () => {
  test("single AU Division 40 diminishing-value asset schedule follows s40-70 using 200% factor and 365-day denominator", () => {
    const data = seedData();
    const synthetic: FixedAsset = {
      id: "verifier-dv",
      fundId: "coastline",
      propertyId: null,
      kind: "AU_DIV40",
      description: "Verifier DV plant",
      cost: 100_000_00,
      startDate: "2025-07-01",
      assetClassId: "OTHER_PLANT",
      method: "DIMINISHING_VALUE",
      effectiveLifeYears: 10,
    };
    const view = assetRegisterView({ ...data, assets: [synthetic] }, "coastline", ctx(data));
    assert.deepEqual(view.schedule.filter((row) => row.kind === "AU_DIV40").map((row) => row.deduction), manualDiv40DvSchedule(100_000_00, 10, 2026, 10));
  });

  test("single AU Division 43 commercial asset schedule follows s43-140/s43-145 at 2.5%", () => {
    const data = seedData();
    const synthetic: FixedAsset = {
      id: "verifier-div43",
      fundId: "coastline",
      propertyId: null,
      kind: "AU_DIV43",
      description: "Verifier capital works",
      cost: 4_000_000_00,
      startDate: "2025-07-01",
      buildingType: "COMMERCIAL",
      constructionStartDate: "2024-07-01",
      constructionCompleteDate: "2025-06-30",
      firstIncomeUseDate: "2025-07-01",
      constructionExpenditure: 4_000_000_00,
    };
    const view = assetRegisterView({ ...data, assets: [synthetic] }, "coastline", ctx(data));
    assert.deepEqual(view.schedule.filter((row) => row.kind === "AU_DIV43").map((row) => row.deduction), Array.from({ length: 10 }, () => 100_000_00));
  });

  test("single SG s19A three-year asset schedule writes off one-third in each of the first three YAs", () => {
    const data = seedData();
    const synthetic: FixedAsset = {
      id: "verifier-sg-ca",
      fundId: "telok-ayer",
      propertyId: null,
      kind: "SG_PLANT",
      description: "Verifier SG plant",
      cost: 120_000_00,
      startDate: "2026-08-01",
      assetClassId: "P_AND_M_GENERAL",
      regime: "S19A_3Y",
    };
    const view = assetRegisterView({ ...data, assets: [synthetic] }, "telok-ayer", ctx(data));
    assert.deepEqual(view.schedule.filter((row) => row.kind === "SG_PLANT").map((row) => row.deduction).slice(0, 4), [40_000_00, 40_000_00, 40_000_00, 0]);
  });

  test("AU borrowing-cost assets appear in the 10-year schedule", () => {
    const data = seedData();
    const synthetic: FixedAsset = {
      id: "verifier-borrowing",
      fundId: "coastline",
      propertyId: null,
      kind: "AU_BORROWING",
      description: "Verifier loan establishment fees",
      cost: 250_000_00,
      startDate: "2025-07-01",
      loanEndDate: "2030-06-30",
    };
    const view = assetRegisterView({ ...data, assets: [synthetic] }, "coastline", ctx(data));
    assert.equal(view.schedule.some((row) => row.kind === "AU_BORROWING"), true);
  });

  test("single AU low-value pool asset follows 18.75% / 37.5% pool rates", () => {
    const data = seedData();
    const synthetic: FixedAsset = {
      id: "verifier-pool",
      fundId: "coastline",
      propertyId: null,
      kind: "AU_DIV40",
      description: "Verifier low-cost plant",
      cost: 800_00,
      startDate: "2025-07-01",
      assetClassId: "OTHER_PLANT",
      method: "PRIME_COST",
      effectiveLifeYears: 4,
      poolMethod: "LOW_VALUE_POOL",
    };
    const view = assetRegisterView({ ...data, assets: [synthetic] }, "coastline", ctx(data));
    assert.deepEqual(view.schedule.filter((row) => row.kind === "AU_DIV40").slice(0, 4).map((row) => row.deduction), manualLowValuePoolSchedule(800_00, 4));
  });

  test("single Singapore s14N R&R item is independently spread over 3 YAs", () => {
    const data = seedData();
    const synthetic: FixedAsset = {
      id: "verifier-rr",
      fundId: "telok-ayer",
      propertyId: null,
      kind: "SG_RR",
      description: "Verifier renovation",
      cost: 120_000_00,
      startDate: "2026-08-01",
      claimMode: "THREE_YEAR",
    };
    const view = assetRegisterView({ ...data, assets: [synthetic] }, "telok-ayer", ctx(data));
    assert.deepEqual(view.schedule.filter((row) => row.kind === "SG_RR").map((row) => row.deduction), [40_000_00, 40_000_00, 40_000_00]);
  });
});

describe("asset verifier: reducer controls and persistence", () => {
  test("apply-to-trial-balance is permissioned, locked outside Preparing, audited, immutable and reflected in tbView", () => {
    const frozen = deepFreeze(seedData());
    const denied = applyAssetAction(frozen, { type: "asset-apply-to-trial-balance", fundId: "coastline" }, ctx(frozen, "m-castillo"));
    assert.equal(denied.ok, false);
    assert.match(denied.reason, /View only/);

    const signedOff = applyAssetAction(frozen, { type: "asset-apply-to-trial-balance", fundId: "harbourline" }, ctx(frozen));
    assert.equal(signedOff.ok, false);
    assert.match(signedOff.reason, /Signed off/);

    const inReview = applyAssetAction(frozen, { type: "asset-apply-to-trial-balance", fundId: "southbank" }, ctx(frozen));
    assert.equal(inReview.ok, false);
    assert.match(inReview.reason, /In review/);

    const changed = structuredClone(frozen);
    changed.taxAdjustments.coastline = { ...changed.taxAdjustments.coastline, div40: 0, div43: 0 };
    const applied = applyAssetAction(changed, { type: "asset-apply-to-trial-balance", fundId: "coastline" }, ctx(changed));
    assert.equal(applied.ok, true);
    assert.equal(changed.taxAdjustments.coastline.div40, 0);
    if (!applied.ok) return;
    assert.equal(applied.data.audit.at(-1)?.detail, "Tax adjustments updated from the asset register.");
    assert.equal(appDataProblem(applied.data), null);
    const tb = tbView(applied.data, "coastline", now);
    assert.equal(tb.adjustments.find((row) => row.key === "div40")?.amount, assetRegisterView(frozen, "coastline", ctx(frozen)).comparisons.find((row) => row.key === "div40")?.register);
    assert.equal(tb.adjustments.find((row) => row.key === "div43")?.amount, assetRegisterView(frozen, "coastline", ctx(frozen)).comparisons.find((row) => row.key === "div43")?.register);
  });

  test("add/update/dispose/delete/import produce schema-valid immutable states", () => {
    const data = deepFreeze(seedData());
    const beforeCount = data.assets.length;
    const add = applyAssetAction(data, { type: "asset-add", fundId: "coastline", asset: div40Draft }, ctx(data));
    assert.equal(add.ok, true);
    assert.equal(data.assets.length, beforeCount);
    if (!add.ok) return;
    assert.equal(appDataProblem(add.data), null);
    const added = add.data.assets.at(-1);
    assert.ok(added);

    const update = applyAssetAction(add.data, { type: "asset-update", fundId: "coastline", assetId: added.id, asset: { ...div40Draft, description: "Verifier updated plant" } }, ctx(add.data));
    assert.equal(update.ok, true);
    if (!update.ok) return;
    assert.equal(appDataProblem(update.data), null);

    const dispose = applyAssetAction(update.data, { type: "asset-dispose", fundId: "coastline", assetId: added.id, disposalDate: "2026-09-30", disposalProceeds: 12_345_00 }, ctx(update.data));
    assert.equal(dispose.ok, true);
    if (!dispose.ok) return;
    assert.equal(appDataProblem(dispose.data), null);

    const deleted = applyAssetAction(dispose.data, { type: "asset-delete", fundId: "coastline", assetId: added.id }, ctx(dispose.data));
    assert.equal(deleted.ok, true);
    if (!deleted.ok) return;
    assert.equal(appDataProblem(deleted.data), null);

    const imported = applyAssetAction(deleted.data, { type: "asset-import", fundId: "coastline", assets: [div40Draft] }, ctx(deleted.data));
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    assert.equal(appDataProblem(imported.data), null);
    assert.equal(imported.data.assets.filter((asset) => asset.fundId === "coastline").length, 1);
  });
});
