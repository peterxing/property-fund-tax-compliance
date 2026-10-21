import assert from "node:assert/strict";
import { test } from "node:test";
import { computeAbsd, computeAcquisitionDuties, computeBsd, computeLeaseDuty, computeSsd, stampDutyDeadline } from "../../src/engine/stampDuty.ts";
import { money } from "../../src/domain/format.ts";
import { dutiesView } from "../../src/domain/ptax/index.ts";
import { seedData } from "../../src/domain/seed/index.ts";
import { assertDocQuotes, assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const DOC = "sg-stamp-duty";
const D = (dollars: number): number => Math.round(dollars * 100);
const pct = (bps: number): string => `${Number.isInteger(bps / 100) ? (bps / 100).toFixed(0) : String(bps / 100)}%`;

type Kind = "RESIDENTIAL" | "NON_RESIDENTIAL";

function bsdBands(date: string, kind: Kind): string {
  const result = computeBsd({ purchaseDate: date, purchasePrice: D(5_000_000), marketValue: D(5_000_000), propertyKind: kind });
  return result.bands.map((band) => `${band.label} @ ${pct(band.rateBps)}`).join("; ");
}

function absdRate(date: string, kind: "SC" | "SPR" | "FOREIGNER" | "ENTITY" | "HOUSING_DEVELOPER" | "TRUSTEE", owned = 0): string {
  const result = computeAbsd({ purchaseDate: date, purchasePrice: D(1_000_000), marketValue: D(1_000_000), buyers: [{ kind, residentialPropertyCountBeforePurchase: owned }] });
  return pct(result.upfrontRateBps);
}

test("sg stamp duty document covers exactly the tested examples", () => {
  assert.deepEqual(exampleIds(readRuleDoc(DOC)), ["BSD-1", "BSD-2", "ABSD-1", "ABSD-2", "SSD-1", "SSD-2", "LEASE-1", "LEASE-2"]);
});

test("BSD rate table is rendered from computeBsd band breakdowns", () => {
  assertSectionQuotes(DOC, "BSD rates and thresholds", [
    tableRow(["Before 20 Feb 2018", "bsd.pre-2018-02-20", bsdBands("2017-06-01", "RESIDENTIAL"), bsdBands("2017-06-01", "NON_RESIDENTIAL")]),
    tableRow(["20 Feb 2018 to 14 Feb 2023", "bsd.2018-02-20", bsdBands("2020-01-01", "RESIDENTIAL"), bsdBands("2020-01-01", "NON_RESIDENTIAL")]),
    tableRow(["On or after 15 Feb 2023", "bsd.2023-02-15", bsdBands("2026-10-09", "RESIDENTIAL"), bsdBands("2026-10-09", "NON_RESIDENTIAL")]),
  ]);
});

test("ABSD rate table is pinned by computeAbsd probes", () => {
  assertSectionQuotes(DOC, "ABSD rates by effective date", [
    tableRow(["12 Jan 2013 to 5 Jul 2018", `${absdRate("2013-01-12", "SC", 0)} / ${absdRate("2013-01-12", "SC", 1)} / ${absdRate("2013-01-12", "SC", 2)}`, `${absdRate("2013-01-12", "SPR", 0)} / ${absdRate("2013-01-12", "SPR", 1)} / ${absdRate("2013-01-12", "SPR", 2)}`, absdRate("2013-01-12", "FOREIGNER"), absdRate("2013-01-12", "ENTITY"), absdRate("2013-01-12", "HOUSING_DEVELOPER"), "Not modelled"]),
    tableRow(["6 Jul 2018 to 15 Dec 2021", `${absdRate("2018-07-06", "SC", 0)} / ${absdRate("2018-07-06", "SC", 1)} / ${absdRate("2018-07-06", "SC", 2)}`, `${absdRate("2018-07-06", "SPR", 0)} / ${absdRate("2018-07-06", "SPR", 1)} / ${absdRate("2018-07-06", "SPR", 2)}`, absdRate("2018-07-06", "FOREIGNER"), absdRate("2018-07-06", "ENTITY"), absdRate("2018-07-06", "HOUSING_DEVELOPER"), "Not modelled"]),
    tableRow(["16 Dec 2021 to 26 Apr 2023", `${absdRate("2022-05-09", "SC", 0)} / ${absdRate("2022-05-09", "SC", 1)} / ${absdRate("2022-05-09", "SC", 2)}`, `${absdRate("2022-05-09", "SPR", 0)} / ${absdRate("2022-05-09", "SPR", 1)} / ${absdRate("2022-05-09", "SPR", 2)}`, absdRate("2022-05-09", "FOREIGNER"), absdRate("2022-05-09", "ENTITY"), "40%", "35% from 9 May 2022"]),
    tableRow(["27 Apr 2023 onward", `${absdRate("2026-10-09", "SC", 0)} / ${absdRate("2026-10-09", "SC", 1)} / ${absdRate("2026-10-09", "SC", 2)}`, `${absdRate("2026-10-09", "SPR", 0)} / ${absdRate("2026-10-09", "SPR", 1)} / ${absdRate("2026-10-09", "SPR", 2)}`, absdRate("2026-10-09", "FOREIGNER"), absdRate("2026-10-09", "ENTITY"), "40%", absdRate("2026-10-09", "TRUSTEE")]),
  ]);
});

test("SSD and lease duty tables are pinned by probes", () => {
  assert.equal(computeSsd({ acquisitionDate: "2025-07-04", disposalDate: "2026-08-01", sellingPrice: D(1_000_000), marketValue: D(1_000_000), propertyKind: "RESIDENTIAL" }).rateBps, 1200);
  assert.equal(computeSsd({ acquisitionDate: "2024-06-01", disposalDate: "2025-07-10", sellingPrice: D(1_000_000), marketValue: D(1_000_000), propertyKind: "RESIDENTIAL" }).rateBps, 800);
  assert.equal(computeSsd({ acquisitionDate: "2025-01-01", disposalDate: "2025-10-09", sellingPrice: D(2_000_000), marketValue: D(2_000_000), propertyKind: "INDUSTRIAL" }).rateBps, 1500);
  assertSectionQuotes(DOC, "SSD rates by acquisition date", [
    tableRow(["Residential", "4 Jul 2025 onward", "Up to 1 year 16%; >1 to 2 years 12%; >2 to 3 years 8%; >3 to 4 years 4%; more than 4 years 0%"]),
    tableRow(["Industrial", "12 Jan 2013 onward", "Up to 1 year 15%; >1 to 2 years 10%; >2 to 3 years 5%; more than 3 years 0%"]),
  ]);
  const lease = computeLeaseDuty({ leaseDate: "2026-10-09", leaseStartDate: "2026-10-09", leaseEndDate: "2028-10-08", rentSteps: [{ from: "2026-10-09", to: "2028-10-08", rent: D(100_000), frequency: "MONTHLY" }] });
  assert.equal(lease.bands[0]!.rateBps, 40);
  assertSectionQuotes(DOC, "Lease duty rates and thresholds", [
    tableRow(["Average annual rent threshold", "No rent duty if AAR is S$1,000.00 or less"]),
    tableRow(["Lease term up to 4 years", "0.4% of total rent"]),
    tableRow(["Lease term over 4 years or indefinite", "0.4% of 4 x average annual rent"]),
    tableRow(["Premium", "BSD on premium as non-residential property"]),
  ]);
});

test("BSD examples are recomputed and quoted", () => {
  const bsd1 = computeBsd({ purchaseDate: "2023-02-17", purchasePrice: D(4_500_100), marketValue: D(4_500_100), propertyKind: "RESIDENTIAL" });
  assert.equal(bsd1.duty, D(209_606));
  assertExampleQuotes(DOC, "BSD-1", [money(bsd1.dutiableValue, "SGD", 2), money(bsd1.duty, "SGD", 2), money(bsd1.bands.at(-1)!.taxableAmount, "SGD", 2), money(bsd1.bands.at(-1)!.duty, "SGD", 2)]);

  const bsd2 = computeBsd({ purchaseDate: "2023-03-01", purchasePrice: D(22_000_000), marketValue: D(22_000_000), propertyKind: "MIXED_COMMERCIAL_RESIDENTIAL", apportionedResidentialValue: D(9_000_000), apportionedNonResidentialValue: D(13_000_000) });
  assert.equal(bsd2.duty, D(1_099_200));
  assertExampleQuotes(DOC, "BSD-2", [money(bsd2.dutiableValue, "SGD", 2), money(bsd2.residentialDutiableValue, "SGD", 2), money(bsd2.nonResidentialDutiableValue, "SGD", 2), "S$479,600.00", "S$619,600.00", money(bsd2.duty, "SGD", 2)]);
});

test("ABSD examples are recomputed and quoted", () => {
  const acq = computeAcquisitionDuties({ purchaseDate: "2026-10-09", purchasePrice: D(2_000_000), marketValue: D(2_000_000), propertyKind: "RESIDENTIAL", absd: { buyers: [{ kind: "ENTITY" }] } });
  assert.equal(acq.bsd.duty, D(69_600));
  assert.equal(acq.absd?.duty, D(1_300_000));
  assert.equal(acq.totalNetDuty, D(1_369_600));
  assertExampleQuotes(DOC, "ABSD-1", [money(acq.bsd.duty, "SGD", 2), money(acq.absd!.duty, "SGD", 2), money(acq.totalNetDuty, "SGD", 2), "S-REIT trustee"]);

  const trust = computeAbsd({ purchaseDate: "2026-10-09", purchasePrice: D(2_000_000), marketValue: D(2_000_000), buyers: [{ kind: "TRUSTEE" }], trustBeneficialOwners: [{ kind: "SC", residentialPropertyCountBeforePurchase: 0 }] });
  assert.equal(trust.duty, D(1_300_000));
  assert.equal(trust.netDuty, 0);
  assert.equal(trust.refundableDuty, D(1_300_000));
  assertExampleQuotes(DOC, "ABSD-2", [money(trust.duty, "SGD", 2), money(trust.netDuty, "SGD", 2), money(trust.refundableDuty, "SGD", 2), "mechanical calculation"]);
});

test("SSD, lease and deadline examples are recomputed and quoted", () => {
  const ssd1 = computeSsd({ acquisitionDate: "2025-07-07", disposalDate: "2026-05-09", sellingPrice: D(1_800_000), marketValue: D(1_800_000), propertyKind: "RESIDENTIAL" });
  assert.equal(ssd1.duty, D(288_000));
  assertExampleQuotes(DOC, "SSD-1", [ssd1.holdingPeriodBand, "16%", money(ssd1.dutiableValue, "SGD", 2), money(ssd1.duty, "SGD", 2)]);

  const ssd2 = computeSsd({ acquisitionDate: "2025-01-01", disposalDate: "2025-10-09", sellingPrice: D(2_000_000), marketValue: D(2_000_000), propertyKind: "INDUSTRIAL" });
  assert.equal(ssd2.duty, D(300_000));
  assertExampleQuotes(DOC, "SSD-2", [ssd2.holdingPeriodBand, "15%", money(ssd2.dutiableValue, "SGD", 2), money(ssd2.duty, "SGD", 2)]);

  const lease = computeLeaseDuty({ leaseDate: "2026-10-09", leaseStartDate: "2026-10-09", leaseEndDate: "2028-10-08", rentSteps: [{ from: "2026-10-09", to: "2028-10-08", rent: D(100_000), frequency: "MONTHLY" }] });
  assert.equal(lease.totalRent, D(2_400_000));
  assert.equal(lease.duty, D(9_600));
  assertExampleQuotes(DOC, "LEASE-1", ["24 monthly rent periods", "2 years", money(lease.totalRent, "SGD", 2), money(lease.averageAnnualRent, "SGD", 2), money(lease.duty, "SGD", 2)]);

  const longLease = computeLeaseDuty({ leaseDate: "2026-10-09", leaseStartDate: "2026-10-09", leaseEndDate: "2032-10-08", rentSteps: [{ from: "2026-10-09", to: "2032-10-08", rent: D(100_000), frequency: "MONTHLY" }] });
  assert.equal(longLease.totalRent, D(7_200_000));
  assert.equal(longLease.averageAnnualRent, D(1_200_000));
  assert.equal(longLease.duty, D(19_200));
  assertExampleQuotes(DOC, "LEASE-2", ["72 monthly rent periods", money(longLease.totalRent, "SGD", 2), money(longLease.averageAnnualRent, "SGD", 2), money(longLease.averageAnnualRent * 4, "SGD", 2), money(longLease.duty, "SGD", 2)]);

  assert.equal(stampDutyDeadline({ executionDate: "2026-10-09", executedInSingapore: true }).dueDate, "2026-10-23");
  assert.equal(stampDutyDeadline({ executionDate: "2026-10-09", executedInSingapore: false, firstReceivedInSingaporeDate: "2026-10-20" }).dueDate, "2026-11-19");
  assertSectionQuotes(DOC, "Stamping deadlines", ["execution date plus 14 days", "first received in Singapore date and returns that date plus 30 days"]);
});

test("seeded duties and document evidence are quoted", () => {
  const rows = dutiesView(seedData(), "telok-ayer", { now: new Date("2026-10-12T09:00:00") }).rows;
  assert.equal(rows.find((row) => row.propertyId === "telok-ayer-telok-ayer-tower")?.baseDuty, 6_535_750_500);
  assertDocQuotes(DOC, [
    "Entity includes a trustee of a collective investment scheme / S-REIT trustee as modelled.",
    "The workspace uses purchase price as market value.",
    "test/engine/independent-verification.test.ts",
    "test/docs/sg-stamp-duty.test.ts",
  ]);
});
