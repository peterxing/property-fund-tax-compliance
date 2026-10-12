import assert from "node:assert/strict";
import { test } from "node:test";
import { AU_DEPRECIABLE_ASSET_CLASSES, computeDepreciation, computeDepreciationSchedule } from "../../../src/engine/au/depreciation.ts";

const dollars = (amount: number): number => amount * 100;

test("prime cost depreciation uses the verified effective life", () => {
  const result = computeDepreciation({
    incomeYear: 2026,
    asset: { id: "carpet", label: "Carpet", assetClassId: "CARPET", cost: dollars(8_000), startDate: "2025-07-01", method: "PRIME_COST" },
  });
  assert.equal(result.line.declineInValue, dollars(1_000));
  assert.equal(result.line.closingAdjustableValue, dollars(7_000));
});

test("catalogue defaults warn when the asset predates the loaded ATO column date", () => {
  const result = computeDepreciation({
    incomeYear: 2016,
    asset: { id: "older-carpet", label: "Older carpet", assetClassId: "CARPET", cost: dollars(8_000), startDate: "2015-07-01", method: "PRIME_COST" },
  });
  assert.equal(result.line.declineInValue, 100274);
  assert.ok(result.findings.some((finding) => finding.id === "AU.DIV40.DEFAULT_LIFE.DATE_REVIEW"));
});

test("leap-year numerator still uses a 365-day denominator", () => {
  const result = computeDepreciation({
    incomeYear: 2024,
    asset: { id: "carpet", label: "Carpet", assetClassId: "CARPET", cost: dollars(8_000), startDate: "2023-07-01", method: "PRIME_COST" },
  });
  assert.equal(result.line.daysHeld, 366);
  assert.equal(result.line.declineInValue, 100274);
});

test("section 40-27 denies second-hand residential plant deductions for individuals", () => {
  const result = computeDepreciation({
    incomeYear: 2026,
    asset: {
      id: "blind-1",
      label: "Blinds",
      assetClassId: "BLINDS_INTERNAL",
      cost: dollars(1_000),
      startDate: "2025-07-01",
      method: "DIMINISHING_VALUE",
      residentialAccommodationUse: true,
      secondHand: true,
      entityTypeForResidentialRestriction: "INDIVIDUAL",
    },
  });
  assert.equal(result.line.declineInValue, dollars(200));
  assert.equal(result.line.deductionAllowed, 0);
  assert.ok(result.findings.some((finding) => finding.id === "AU.DIV40.SECOND_HAND_RESIDENTIAL.RESTRICTED"));
});

test("section 40-27 grandfathering allows assets where the rental property or asset was purchased before budget night", () => {
  const result = computeDepreciation({
    incomeYear: 2018,
    asset: {
      id: "grandfathered-fridge",
      label: "Grandfathered second-hand fridge",
      assetClassId: "OTHER_PLANT",
      cost: dollars(1_500),
      startDate: "2017-04-01",
      method: "PRIME_COST",
      effectiveLifeYears: 5,
      residentialAccommodationUse: true,
      secondHand: true,
      purchasedBeforeBudgetNight2017: true,
      installedInRentalBefore2017_07_01: false,
      entityTypeForResidentialRestriction: "OTHER",
    },
  });
  assert.equal(result.line.deductionAllowed, dollars(300));
});

test("section 40-27 still denies post-budget-night second-hand residential assets even if later installed before 1 July 2017 cannot be shown", () => {
  const result = computeDepreciation({
    incomeYear: 2018,
    asset: {
      id: "post-budget-asset",
      label: "Post-budget second-hand asset",
      assetClassId: "OTHER_PLANT",
      cost: dollars(1_500),
      startDate: "2017-06-01",
      method: "PRIME_COST",
      effectiveLifeYears: 5,
      residentialAccommodationUse: true,
      secondHand: true,
      purchasedBeforeBudgetNight2017: false,
      installedInRentalBefore2017_07_01: true,
      entityTypeForResidentialRestriction: "OTHER",
    },
  });
  assert.equal(result.line.deductionAllowed, 0);
});

test("small-business instant asset write-off uses the effective-dated threshold", () => {
  const result = computeDepreciationSchedule({
    fromIncomeYear: 2026,
    toIncomeYear: 2026,
    smallBusinessInstantAssetWriteOff: { aggregatedTurnoverLessThan10m: true, optedIntoSimplifiedDepreciation: true },
    assets: [{ id: "tool", label: "Small tool", assetClassId: "OTHER_PLANT", cost: dollars(5_000), startDate: "2025-07-01", method: "PRIME_COST", effectiveLifeYears: 5, poolMethod: "SMALL_BUSINESS_POOL" }],
  });
  assert.equal(result.summaries[0]?.totalDeclineInValueDeduction, dollars(5_000));
  assert.equal(result.assetLines[0]?.closingAdjustableValue, 0);
});

test("depreciable asset catalogue exposes verified defaults and placeholders", () => {
  assert.equal(AU_DEPRECIABLE_ASSET_CLASSES.find((row) => row.id === "CARPET")?.defaultEffectiveLifeYears, 8);
  assert.equal(AU_DEPRECIABLE_ASSET_CLASSES.find((row) => row.id === "LIFTS_HYDRAULIC")?.defaultEffectiveLifeYears, 30);
  assert.equal(AU_DEPRECIABLE_ASSET_CLASSES.find((row) => row.id === "LIFTS_HYDRAULIC")?.defaultAppliesFrom, "2003-01-01");
  assert.equal(AU_DEPRECIABLE_ASSET_CLASSES.find((row) => row.id === "IT_EQUIPMENT_OTHER")?.defaultEffectiveLifeYears, undefined);
});
