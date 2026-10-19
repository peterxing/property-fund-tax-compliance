import assert from "node:assert/strict";
import { test } from "node:test";
import { computePropertyTax } from "../../src/engine/propertyTax.ts";
import { money } from "../../src/domain/format.ts";
import { seedData } from "../../src/domain/seed/index.ts";
import { propertyTaxView } from "../../src/domain/ptax/index.ts";
import { assertDocQuotes, assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const DOC = "sg-property-tax";
const D = (dollars: number): number => Math.round(dollars * 100);
const pct = (bps: number): string => `${Number.isInteger(bps / 100) ? (bps / 100).toFixed(0) : String(bps / 100)}%`;

function bandSummary(year: number, usage: "OWNER_OCCUPIED_RESIDENTIAL" | "NON_OWNER_OCCUPIED_RESIDENTIAL", rule: string): string[] {
  const result = computePropertyTax({
    year,
    segments: [{ id: "s", from: `${year}-01-01`, to: `${year}-12-31`, annualValue: D(200_000), usage }],
  });
  assert.equal(result.ruleVersion, rule);
  return result.segments[0]!.bands.map((band) => `${band.label} @ ${pct(band.rateBps)}`);
}

function pt(year: number, annualValue: number, usage: "OWNER_OCCUPIED_RESIDENTIAL" | "NON_OWNER_OCCUPIED_RESIDENTIAL" | "NON_RESIDENTIAL_OR_VACANT", extra = {}) {
  return computePropertyTax({ year, segments: [{ id: "s", from: `${year}-01-01`, to: `${year}-12-31`, annualValue: D(annualValue), usage, ...extra }] });
}

test("sg property tax document covers exactly the tested examples", () => {
  assert.deepEqual(exampleIds(readRuleDoc(DOC)), ["PT-1", "PT-2", "PT-3", "PT-4"]);
});

test("owner-occupier rate table is rendered from engine band breakdowns", () => {
  assertSectionQuotes(DOC, "Owner-occupier residential property tax rates and thresholds", [
    tableRow(["2015-2022", "property-tax.ootr.2015", bandSummary(2015, "OWNER_OCCUPIED_RESIDENTIAL", "property-tax.ootr.2015").join("; ")]),
    tableRow(["2023", "property-tax.ootr.2023", bandSummary(2023, "OWNER_OCCUPIED_RESIDENTIAL", "property-tax.ootr.2023").join("; ")]),
    tableRow(["2024", "property-tax.ootr.2024", bandSummary(2024, "OWNER_OCCUPIED_RESIDENTIAL", "property-tax.ootr.2024").join("; ")]),
    tableRow(["2025 onward", "property-tax.ootr.2025", bandSummary(2025, "OWNER_OCCUPIED_RESIDENTIAL", "property-tax.ootr.2025").join("; ")]),
  ]);
});

test("non-owner and other rate tables and rebate settings are pinned", () => {
  assertSectionQuotes(DOC, "Non-owner-occupier residential property tax rates and thresholds", [
    tableRow(["2015-2022", "property-tax.noor.2015", bandSummary(2015, "NON_OWNER_OCCUPIED_RESIDENTIAL", "property-tax.noor.2015").join("; ")]),
    tableRow(["2023", "property-tax.noor.2023", bandSummary(2023, "NON_OWNER_OCCUPIED_RESIDENTIAL", "property-tax.noor.2023").join("; ")]),
    tableRow(["2024 onward", "property-tax.noor.2024", bandSummary(2024, "NON_OWNER_OCCUPIED_RESIDENTIAL", "property-tax.noor.2024").join("; ")]),
  ]);

  const nonResidential = pt(2026, 1_000_000, "NON_RESIDENTIAL_OR_VACANT");
  assert.equal(nonResidential.grossTax, D(100_000));
  const y23 = pt(2023, 500_000, "OWNER_OCCUPIED_RESIDENTIAL");
  assert.equal(y23.rebate, D(60));
  const y25Private = pt(2025, 500_000, "OWNER_OCCUPIED_RESIDENTIAL", { residentialType: "PRIVATE" });
  assert.equal(y25Private.rebate, D(1_000));
  const y26Private = pt(2026, 500_000, "OWNER_OCCUPIED_RESIDENTIAL", { residentialType: "PRIVATE" });
  assert.equal(y26Private.rebate, D(500));
  const y24Hdb4 = pt(2024, 36_000, "OWNER_OCCUPIED_RESIDENTIAL", { residentialType: "HDB_4_ROOM" });
  assert.equal(y24Hdb4.rebate, Math.round(y24Hdb4.grossTax * 0.5));
  const y25Hdb4 = pt(2025, 36_000, "OWNER_OCCUPIED_RESIDENTIAL", { residentialType: "HDB_4_ROOM" });
  assert.equal(y25Hdb4.rebate, Math.round(y25Hdb4.grossTax * 0.2));
  const y26Hdb4 = pt(2026, 36_000, "OWNER_OCCUPIED_RESIDENTIAL", { residentialType: "HDB_4_ROOM" });
  assert.equal(y26Hdb4.rebate, Math.round(y26Hdb4.grossTax * 0.15));
  assertSectionQuotes(DOC, "Other property tax rate and rebate settings", [
    tableRow(["Non-residential / vacant / other 10% class", "All modelled years", "10% of annual value; rule `property-tax.other.10pct`"]),
    tableRow(["2023 owner-occupier rebate", "2023", "60% of owner-occupier tax, capped at S$60.00"]),
    tableRow(["2024 HDB rebates", "2024", "HDB 1/2-room 100%; HDB 3-room 70%; HDB 4-room 50%; HDB 5-room 40%; HDB executive 30%"]),
    tableRow(["2024 private / other owner-occupied rebate", "2024", "15% capped at S$1,000.00"]),
    tableRow(["2025 HDB rebates", "2025", "20% for all HDB categories"]),
    tableRow(["2025 private / other owner-occupied rebate", "2025", "15% capped at S$1,000.00"]),
    tableRow(["2026 HDB rebates", "2026", "15% for all HDB categories"]),
    tableRow(["2026 private / other owner-occupied rebate", "2026", "10% capped at S$500.00"]),
  ]);
});

test("PT examples are recomputed and quoted", () => {
  const pt1 = computePropertyTax({ year: 2025, segments: [{ id: "iras", from: "2025-01-01", to: "2025-12-31", annualValue: D(36_000), usage: "OWNER_OCCUPIED_RESIDENTIAL" }] });
  const pt1Private = computePropertyTax({ year: 2025, segments: [{ id: "iras", from: "2025-01-01", to: "2025-12-31", annualValue: D(36_000), usage: "OWNER_OCCUPIED_RESIDENTIAL", residentialType: "PRIVATE" }] });
  assert.equal(pt1.grossTax, D(960));
  assert.equal(pt1Private.netTax, D(816));
  assertExampleQuotes(DOC, "PT-1", [money(pt1.grossTax, "SGD", 2), money(pt1.rebate, "SGD", 2), money(pt1.netTax, "SGD", 2), money(pt1Private.rebate, "SGD", 2), money(pt1Private.netTax, "SGD", 2)]);

  const pt2 = computePropertyTax({ year: 2026, segments: [{ id: "calc", from: "2026-01-01", to: "2026-12-31", annualValue: D(240_000), usage: "NON_RESIDENTIAL_OR_VACANT", ownerShareBps: 10_000 }], notice: { kind: "ANNUAL_BILL", noticeDate: "2026-01-01" } });
  assert.equal(pt2.netTax, D(24_000));
  assert.equal(pt2.deadlines.paymentDueDate, "2026-01-31");
  assertExampleQuotes(DOC, "PT-2", [money(pt2.grossTax, "SGD", 2), money(pt2.rebate, "SGD", 2), money(pt2.netTax, "SGD", 2), pt2.deadlines.paymentDueDate]);

  const pt3 = computePropertyTax({ year: 2025, segments: [{ id: "half", from: "2025-07-01", to: "2025-12-31", annualValue: D(100_000), usage: "NON_RESIDENTIAL_OR_VACANT", ownerShareBps: 5_000 }] });
  assert.equal(pt3.segments[0]!.bands[0]!.proratedTax, 504_110);
  assert.equal(pt3.netTax, 252_055);
  assertExampleQuotes(DOC, "PT-3", ["184 days", money(pt3.segments[0]!.bands[0]!.proratedTax, "SGD", 2), money(pt3.netTax, "SGD", 2), "owner-share split is for internal reconciliation only"]);
});

test("PT-4 demo rows match the seeded workspace view", () => {
  const rows = propertyTaxView(seedData(), "telok-ayer", { now: new Date("2026-10-12T09:00:00") }).rows;
  for (const id of ["telok-ayer-telok-ayer-tower", "telok-ayer-cecil-exchange", "telok-ayer-bugis-gateway-mall"]) {
    const row = rows.find((entry) => entry.propertyId === id);
    assert.ok(row);
    assert.equal(row.status, "modelled");
    assert.equal(row.total, Math.round((row.value ?? 0) * 0.1));
  }
  const quotes = rows.flatMap((row) => [row.propertyName, money(row.value ?? 0, "SGD", 2), money(row.tax, "SGD", 2), money(row.surcharge, "SGD", 2), money(row.total, "SGD", 2)]);
  assertExampleQuotes(DOC, "PT-4", [...quotes, "No notice", "variance check says the assessed amount matches modelled"]);
});

test("document quotes evidence and limitations", () => {
  assertDocQuotes(DOC, [
    "The app uses the annual value entered; it does not estimate annual value.",
    "Part-year and owner-share apportionment is an implementation assumption",
    "test/engine/independent-verification.test.ts",
    "test/docs/sg-property-tax.test.ts",
  ]);
});
