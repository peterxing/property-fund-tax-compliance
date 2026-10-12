/**
 * INDEPENDENT verification of the engine against figures published on IRAS pages (retrieved 2026-10-09) and hand calculations.
 * Expected values here were NOT produced by running the implementation. If one of these fails, the engine (or this
 * expectation) is wrong - resolve against the cited IRAS page, never by copying the engine's output.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAbsd, computeBsd, computeSsd } from "../../src/engine/stampDuty.ts";
import { computePropertyTax } from "../../src/engine/propertyTax.ts";
import { computeWithholdingTax, withholdingTaxDueDate } from "../../src/engine/withholdingTax.ts";
import { computeCit } from "../../src/engine/cit.ts";

const D = (dollars: number): number => Math.round(dollars * 100);

test("BSD - IRAS worked examples (buyer's stamp duty page)", () => {
  // Example 1: terrace house bought 17 Feb 2023 at $4,500,100 -> $209,606
  const ex1 = computeBsd({ purchaseDate: "2023-02-17", purchasePrice: D(4_500_100), marketValue: D(4_500_100), propertyKind: "RESIDENTIAL" });
  assert.equal(ex1.duty, D(209_606));
  // Example 2: $22m commercial & residential land; valuer split $9m residential / $13m non-residential -> $1,099,200
  const ex2 = computeBsd({
    purchaseDate: "2023-03-01", purchasePrice: D(22_000_000), marketValue: D(22_000_000), propertyKind: "MIXED_COMMERCIAL_RESIDENTIAL",
    apportionedResidentialValue: D(9_000_000), apportionedNonResidentialValue: D(13_000_000),
  });
  assert.equal(ex2.duty, D(1_099_200));
});

test("BSD - hand-computed tiers across regimes", () => {
  const bsd = (date: string, price: number, kind: "RESIDENTIAL" | "NON_RESIDENTIAL") =>
    computeBsd({ purchaseDate: date, purchasePrice: D(price), marketValue: D(price), propertyKind: kind }).duty;
  // from 15 Feb 2023
  assert.equal(bsd("2026-10-09", 1_000_000, "RESIDENTIAL"), D(24_600));
  assert.equal(bsd("2026-10-09", 2_000_000, "RESIDENTIAL"), D(69_600));
  assert.equal(bsd("2026-10-09", 3_000_000, "RESIDENTIAL"), D(119_600));
  assert.equal(bsd("2026-10-09", 5_000_000, "RESIDENTIAL"), D(239_600)); // 119,600 + 6% x 2m
  assert.equal(bsd("2026-10-09", 1_000_000, "NON_RESIDENTIAL"), D(24_600));
  assert.equal(bsd("2026-10-09", 5_000_000, "NON_RESIDENTIAL"), D(219_600)); // 44,600 + 5% x 3.5m (top non-residential rate is 5%)
  // 20 Feb 2018 - 14 Feb 2023: residential top rate 4%, non-residential 3%
  assert.equal(bsd("2020-01-01", 2_000_000, "RESIDENTIAL"), D(64_600)); // 24,600 + 4% x 1m
  assert.equal(bsd("2020-01-01", 2_000_000, "NON_RESIDENTIAL"), D(54_600)); // 24,600 + 3% x 1m
  // before 20 Feb 2018: 1%/2%/3% for everything
  assert.equal(bsd("2017-06-01", 2_000_000, "RESIDENTIAL"), D(54_600)); // 1,800 + 3,600 + 3% x 1.64m
  // rounding down to the dollar and $1 minimum
  assert.equal(computeBsd({ purchaseDate: "2026-10-09", purchasePrice: D(180_050), marketValue: D(180_050), propertyKind: "RESIDENTIAL" }).duty, D(1_801)); // 1,800 + 2% x 50 = $1
  assert.equal(computeBsd({ purchaseDate: "2026-10-09", purchasePrice: D(50), marketValue: D(50), propertyKind: "RESIDENTIAL" }).duty, D(1));
  // duty is on the HIGHER of price and market value
  assert.equal(computeBsd({ purchaseDate: "2026-10-09", purchasePrice: D(900_000), marketValue: D(1_000_000), propertyKind: "RESIDENTIAL" }).duty, D(24_600));
});

test("ABSD - rates on or after 27 Apr 2023 (IRAS ABSD page) on a $2m purchase", () => {
  const absd = (date: string, kind: "SC" | "SPR" | "FOREIGNER" | "ENTITY" | "TRUSTEE" | "HOUSING_DEVELOPER", owned = 0) =>
    computeAbsd({ purchaseDate: date, purchasePrice: D(2_000_000), marketValue: D(2_000_000), buyers: [{ kind, residentialPropertyCountBeforePurchase: owned }] });
  assert.equal(absd("2026-10-09", "FOREIGNER").duty, D(1_200_000)); // IRAS example: 60% x $2m
  assert.equal(absd("2026-10-09", "ENTITY").duty, D(1_300_000)); // 65% - includes a trustee of a collective investment scheme
  assert.equal(absd("2026-10-09", "TRUSTEE").duty, D(1_300_000));
  assert.equal(absd("2026-10-09", "SC", 1).duty, D(400_000)); // second property 20%
  assert.equal(absd("2026-10-09", "SC", 2).duty, D(600_000)); // third and subsequent 30%
  assert.equal(absd("2026-10-09", "SPR", 0).duty, D(100_000)); // first property 5%
  assert.equal(absd("2026-10-09", "SPR", 1).duty, D(600_000)); // second 30%
  assert.equal(absd("2026-10-09", "SPR", 2).duty, D(700_000)); // third and subsequent 35%
  const dev = absd("2026-10-09", "HOUSING_DEVELOPER");
  assert.equal(dev.duty, D(800_000)); // 35% upfront (remittable subject to conditions) + 5% non-remittable = 40%
  assert.equal(dev.remittableDuty, D(700_000));
  assert.equal(dev.nonRemittableDuty, D(100_000));
  // earlier regimes
  assert.equal(absd("2023-04-26", "FOREIGNER").duty, D(600_000)); // 30% until 26 Apr 2023
  assert.equal(absd("2021-12-15", "FOREIGNER").duty, D(400_000)); // 20% from 6 Jul 2018 to 15 Dec 2021
  assert.equal(absd("2023-04-26", "ENTITY").duty, D(700_000)); // 35%
});

test("ABSD - a Singapore citizen's first property attracts no ABSD at all (not even the $1 minimum)", () => {
  const r = computeAbsd({ purchaseDate: "2026-10-09", purchasePrice: D(2_000_000), marketValue: D(2_000_000), buyers: [{ kind: "SC", residentialPropertyCountBeforePurchase: 0 }] });
  assert.equal(r.duty, 0);
  assert.equal(r.upfrontRateBps, 0);
});

test("SSD - holding-period bands depend on the ACQUISITION date regime (IRAS SSD page)", () => {
  const ssd = (acq: string, sold: string, price = 1_000_000, kind: "RESIDENTIAL" | "INDUSTRIAL" = "RESIDENTIAL") =>
    computeSsd({ acquisitionDate: acq, disposalDate: sold, sellingPrice: D(price), marketValue: D(price), propertyKind: kind }).duty;
  // acquired on/after 4 Jul 2025: 16 / 12 / 8 / 4 over 4 years
  assert.equal(ssd("2026-01-15", "2026-10-09"), D(160_000));
  assert.equal(ssd("2025-07-04", "2026-08-01"), D(120_000));
  assert.equal(ssd("2025-07-04", "2027-08-01"), D(80_000));
  assert.equal(ssd("2025-07-04", "2028-08-01"), D(40_000));
  assert.equal(ssd("2025-07-04", "2029-08-01"), 0);
  // acquired 11 Mar 2017 - 3 Jul 2025: old 12 / 8 / 4 over 3 years, even if SOLD after 4 Jul 2025
  assert.equal(ssd("2024-06-01", "2025-07-10"), D(80_000)); // 1-2 years -> 8%
  assert.equal(ssd("2023-01-10", "2026-02-01"), 0); // > 3 years under the old regime
  assert.equal(ssd("2020-01-01", "2026-10-09"), 0);
  // industrial: 15 / 10 / 5 over 3 years
  assert.equal(ssd("2025-01-01", "2025-10-09", 2_000_000, "INDUSTRIAL"), D(300_000));
});

test("Property tax - IRAS sample calculations (owner-occupier from 1 Jan 2025)", () => {
  const oo = (av: number, year = 2025) =>
    computePropertyTax({ year, segments: [{ id: "s", from: `${year}-01-01`, to: `${year}-12-31`, annualValue: D(av), usage: "OWNER_OCCUPIED_RESIDENTIAL" }] });
  assert.equal(oo(36_000).grossTax, D(960)); // IRAS example 1
  assert.equal(oo(84_000).grossTax, D(5_480)); // IRAS example 2
  assert.equal(oo(150_000).grossTax, D(19_020 + 32 * 100)); // $19,020 on the first $140,000 + 32% x $10,000
  // 2024 owner-occupier table
  assert.equal(oo(100_000, 2024).grossTax, D(11_980));
});

test("Property tax - non-owner-occupier residential and non-residential", () => {
  const seg = (usage: "NON_OWNER_OCCUPIED_RESIDENTIAL" | "NON_RESIDENTIAL_OR_VACANT", av: number, year: number) =>
    computePropertyTax({ year, segments: [{ id: "s", from: `${year}-01-01`, to: `${year}-12-31`, annualValue: D(av), usage }] }).grossTax;
  assert.equal(seg("NON_OWNER_OCCUPIED_RESIDENTIAL", 100_000, 2025), D(25_200)); // 3,600 + 3,000 + 4,200 + 36% x 40,000
  assert.equal(seg("NON_OWNER_OCCUPIED_RESIDENTIAL", 100_000, 2023), D(19_650)); // 11% / 16% / 21% / 27%
  assert.equal(seg("NON_RESIDENTIAL_OR_VACANT", 1_000_000, 2026), D(100_000)); // flat 10% of annual value
  // part-year: 184 of 365 days
  const part = computePropertyTax({ year: 2025, segments: [{ id: "s", from: "2025-07-01", to: "2025-12-31", annualValue: D(100_000), usage: "NON_RESIDENTIAL_OR_VACANT" }] });
  assert.equal(part.grossTax, Math.round((D(10_000) * 184) / 365));
});

test("Property tax - owner-occupier rebates (IRAS property tax reliefs page)", () => {
  const priv = (year: number, av: number, type: "PRIVATE" | "HDB_4_ROOM") =>
    computePropertyTax({ year, segments: [{ id: "s", from: `${year}-01-01`, to: `${year}-12-31`, annualValue: D(av), usage: "OWNER_OCCUPIED_RESIDENTIAL", residentialType: type }] });
  // 2026: 10% capped at $500 for private; 15% for HDB. Private AV $300,000: tax = 19,020 + 32% x 160,000... use a clearly capped case
  const big = priv(2026, 500_000, "PRIVATE");
  assert.equal(big.rebate, D(500));
  // 2025: 15% capped at $1,000 for private; 20% for HDB
  assert.equal(priv(2025, 500_000, "PRIVATE").rebate, D(1_000));
  const hdb = priv(2025, 36_000, "HDB_4_ROOM");
  assert.equal(hdb.grossTax, D(960));
  assert.equal(hdb.rebate, D(192)); // 20% of $960
  // 2023: 60% capped at $60
  const y23 = computePropertyTax({ year: 2023, segments: [{ id: "s", from: "2023-01-01", to: "2023-12-31", annualValue: D(500_000), usage: "OWNER_OCCUPIED_RESIDENTIAL" }] });
  assert.equal(y23.rebate, D(60));
});

test("Withholding tax - Section 45 rates and due date", () => {
  const wht = (type: Parameters<typeof computeWithholdingTax>[0]["paymentType"], extra: object = {}) =>
    computeWithholdingTax({ paymentDate: "2026-01-10", grossPayment: D(100_000), paymentType: type, ...extra });
  assert.equal(wht("INTEREST").tax, D(15_000));
  assert.equal(wht("ROYALTY").tax, D(10_000));
  assert.equal(wht("TECHNICAL_SERVICE_FEES", { servicePerformedInSingapore: true }).tax, D(17_000));
  assert.equal(wht("TECHNICAL_SERVICE_FEES", { servicePerformedInSingapore: false }).tax, 0);
  assert.equal(wht("RENT_MOVABLE_PROPERTY").tax, D(15_000));
  assert.equal(wht("INTEREST", { treatyRateBps: 1000 }).tax, D(10_000)); // treaty rate below domestic applies
  assert.equal(wht("INTEREST", { treatyRateBps: 2000 }).tax, D(15_000)); // never above the domestic rate
  // payment on 10 Jan -> due 15 March (15th of the second month)
  assert.equal(withholdingTaxDueDate("2026-01-10"), "2026-03-15");
  assert.equal(withholdingTaxDueDate("2026-11-20"), "2027-01-15");
});

test("Corporate tax - partial exemption and start-up exemption against hand calculations (IRAS CIT page)", () => {
  const exempt = (ci: number, startUp = false) =>
    computeCit({ ya: 2027, normalChargeableIncome: D(ci), startUpExemption: startUp }).exemptionAmount;
  // PTE: 75% of first $10,000 + 50% of next $190,000 (max $102,500)
  assert.equal(exempt(10_000), D(7_500));
  assert.equal(exempt(20_000), D(12_500));
  assert.equal(exempt(100_000), D(52_500));
  assert.equal(exempt(200_000), D(102_500));
  assert.equal(exempt(1_000_000), D(102_500));
  // SUTE: 75% of first $100,000 + 50% of next $100,000 (max $125,000)
  assert.equal(exempt(100_000, true), D(75_000));
  assert.equal(exempt(200_000, true), D(125_000));
  assert.equal(exempt(300_000, true), D(125_000));
  // $100,000 chargeable income -> $47,500 taxable -> $8,075 tax at 17%
  const r = computeCit({ ya: 2027, normalChargeableIncome: D(100_000) });
  assert.equal(r.taxBeforeRebate, D(8_075));
  // YA2026: 50% rebate capped at $40,000 (cash grant of $2,000 applies to eligible companies)
  const ya26 = computeCit({ ya: 2026, normalChargeableIncome: D(1_000_000) });
  assert.equal(ya26.taxBeforeRebate, D(152_575));
  assert.equal(ya26.rebate, D(40_000));
});
