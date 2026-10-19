import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ABSD_BUYER_KINDS,
  SSD_PROPERTY_KINDS,
  STAMP_DUTY_PROPERTY_KINDS,
  computeAbsd,
  computeAcquisitionDuties,
  computeBsd,
  computeLeaseDuty,
  computeSsd,
  stampDutyDeadline,
} from "../../src/engine/stampDuty.ts";

test("computeBsd applies the residential marginal tiers and rounds down to the dollar (S$209,606 gives S$2,392)", () => {
  const result = computeBsd({
    purchaseDate: "2026-10-09",
    purchasePrice: 20_960_600,
    marketValue: 20_960_600,
    propertyKind: "RESIDENTIAL",
  });
  assert.equal(result.duty, 239_200);
});

test("computeBsd handles mixed-use apportionment", () => {
  const result = computeBsd({
    purchaseDate: "2026-10-09",
    purchasePrice: 100_000_000,
    marketValue: 100_000_000,
    propertyKind: "MIXED_COMMERCIAL_RESIDENTIAL",
    apportionedResidentialValue: 60_000_000,
    apportionedNonResidentialValue: 40_000_000,
  });
  assert.equal(result.duty, 1_920_000);
});

test("computeAbsd applies current profile rates", () => {
  const scSecond = computeAbsd({
    purchaseDate: "2026-10-09",
    purchasePrice: 100_000_000,
    marketValue: 100_000_000,
    buyers: [{ kind: "SC", residentialPropertyCountBeforePurchase: 1 }],
  });
  assert.equal(scSecond.upfrontRateBps, 2000);
  assert.equal(scSecond.duty, 20_000_000);

  const foreigner = computeAbsd({
    purchaseDate: "2026-10-09",
    purchasePrice: 100_000_000,
    marketValue: 100_000_000,
    buyers: [{ kind: "FOREIGNER" }],
  });
  assert.equal(foreigner.upfrontRateBps, 6000);
  assert.equal(foreigner.duty, 60_000_000);
});

test("computeAbsd returns zero for Singapore citizen first residential property and acquisition totals follow", () => {
  const absd = computeAbsd({
    purchaseDate: "2026-10-09",
    purchasePrice: 100_000_000,
    marketValue: 100_000_000,
    buyers: [{ kind: "SC", residentialPropertyCountBeforePurchase: 0 }],
  });
  assert.equal(absd.upfrontRateBps, 0);
  assert.equal(absd.effectiveRateBps, 0);
  assert.equal(absd.duty, 0);
  assert.equal(absd.netDuty, 0);

  const acquisition = computeAcquisitionDuties({
    purchaseDate: "2026-10-09",
    purchasePrice: 100_000_000,
    marketValue: 100_000_000,
    propertyKind: "RESIDENTIAL",
    absd: { buyers: [{ kind: "SC", residentialPropertyCountBeforePurchase: 0 }] },
  });
  assert.equal(acquisition.absd?.duty, 0);
  assert.equal(acquisition.totalUpfrontDuty, acquisition.bsd.duty);
  assert.equal(acquisition.totalNetDuty, acquisition.bsd.duty);
});

test("computeSsd respects the 4 Jul 2025 residential regime change", () => {
  const before = computeSsd({
    acquisitionDate: "2025-07-03",
    disposalDate: "2026-01-01",
    sellingPrice: 100_000_000,
    marketValue: 100_000_000,
    propertyKind: "RESIDENTIAL",
  });
  const after = computeSsd({
    acquisitionDate: "2025-07-04",
    disposalDate: "2026-01-01",
    sellingPrice: 100_000_000,
    marketValue: 100_000_000,
    propertyKind: "RESIDENTIAL",
  });
  assert.equal(before.duty, 12_000_000);
  assert.equal(after.duty, 16_000_000);
});

test("computeLeaseDuty applies 0.4% on total rent for terms up to four years", () => {
  const result = computeLeaseDuty({
    leaseDate: "2026-10-09",
    leaseStartDate: "2026-10-09",
    leaseEndDate: "2028-10-08",
    rentSteps: [{ from: "2026-10-09", to: "2028-10-08", rent: 100_000, frequency: "MONTHLY" }],
  });
  assert.equal(result.rentDuty, 9_600);
  assert.equal(result.duty, 9_600);
});

test("lease terms are counted in calendar months, so leap days and month-end starts do not distort the rent or the term", () => {
  // A two-year lease spanning 29 Feb 2028: S$100,000 a month for 24 months, average annual rent exactly S$1,200,000 (it used to divide the
  // 731 inclusive days by 365 and show S$1,198,358.41).
  const twoYears = computeLeaseDuty({ leaseDate: "2026-10-09", leaseStartDate: "2026-10-09", leaseEndDate: "2028-10-08", rentSteps: [{ from: "2026-10-09", to: "2028-10-08", rent: 100_000_00, frequency: "MONTHLY" }] });
  assert.equal(twoYears.totalRent, 2_400_000_00);
  assert.equal(twoYears.averageAnnualRent, 1_200_000_00);
  assert.equal(twoYears.duty, 9_600_00, "0.4% of total rent");

  // A lease starting on 31 January runs 12 monthly periods to 30 January, not 13 (counting from each previous month end used to drift to the 28th).
  const monthEnd = computeLeaseDuty({ leaseDate: "2026-01-31", leaseStartDate: "2026-01-31", leaseEndDate: "2027-01-30", rentSteps: [{ from: "2026-01-31", to: "2027-01-30", rent: 10_000_00, frequency: "MONTHLY" }] });
  assert.equal(monthEnd.totalRent, 120_000_00);
  assert.equal(monthEnd.averageAnnualRent, 120_000_00);

  // A four-year lease that spans a leap day is still a lease of four years or less (0.4% of total rent), and an annual rent step over four
  // years is four years' rent.
  const fourYears = computeLeaseDuty({ leaseDate: "2026-01-01", leaseStartDate: "2026-01-01", leaseEndDate: "2029-12-31", rentSteps: [{ from: "2026-01-01", to: "2029-12-31", rent: 500_000_00, frequency: "ANNUAL" }] });
  assert.equal(fourYears.totalRent, 2_000_000_00);
  assert.equal(fourYears.bands[0]!.label, "0.4% of total rent");
  assert.equal(fourYears.duty, 8_000_00);

  // Five years: 0.4% of four times the average annual rent.
  const fiveYears = computeLeaseDuty({ leaseDate: "2026-01-01", leaseStartDate: "2026-01-01", leaseEndDate: "2030-12-31", rentSteps: [{ from: "2026-01-01", to: "2030-12-31", rent: 500_000_00, frequency: "ANNUAL" }] });
  assert.equal(fiveYears.averageAnnualRent, 500_000_00);
  assert.equal(fiveYears.duty, 8_000_00, "0.4% x 4 x S$500,000");
});

test("stampDutyDeadline and computeAcquisitionDuties combine deadline and taxes", () => {
  assert.equal(stampDutyDeadline({ executionDate: "2026-10-09", executedInSingapore: true }).dueDate, "2026-10-23");
  assert.equal(
    stampDutyDeadline({ executionDate: "2026-10-09", executedInSingapore: false, firstReceivedInSingaporeDate: "2026-10-20" }).dueDate,
    "2026-11-19",
  );
  const result = computeAcquisitionDuties({
    purchaseDate: "2026-10-09",
    purchasePrice: 100_000_000,
    marketValue: 100_000_000,
    propertyKind: "RESIDENTIAL",
    absd: { buyers: [{ kind: "SC", residentialPropertyCountBeforePurchase: 1 }] },
    execution: { executionDate: "2026-10-09", executedInSingapore: true },
  });
  assert.equal(result.bsd.duty, 2_460_000);
  assert.equal(result.absd?.duty, 20_000_000);
  assert.equal(result.totalUpfrontDuty, 22_460_000);
  assert.equal(result.totalNetDuty, 22_460_000);
});

test("stamp duty UI catalogues cover all supported ids", () => {
  assert.deepEqual(
    ABSD_BUYER_KINDS.map((item) => item.id).sort(),
    ["ENTITY", "FOREIGNER", "HOUSING_DEVELOPER", "SC", "SPR", "TRUSTEE", "TRUSTEE_HOUSING_DEVELOPER"],
  );
  assert.deepEqual(
    STAMP_DUTY_PROPERTY_KINDS.map((item) => item.id).sort(),
    ["MIXED_COMMERCIAL_RESIDENTIAL", "NON_RESIDENTIAL", "RESIDENTIAL"],
  );
  assert.deepEqual(
    SSD_PROPERTY_KINDS.map((item) => item.id).sort(),
    ["INDUSTRIAL", "RESIDENTIAL"],
  );
});
