import assert from "node:assert/strict";
import { test } from "node:test";

import { computeLandTax } from "../../src/engine/au/landTax.ts";
import { money } from "../../src/domain/format.ts";
import { propertyTaxView } from "../../src/domain/ptax/index.ts";
import { seedData } from "../../src/domain/seed/index.ts";
import { calculatorById, defaultValues } from "../../src/app/workspaces/calculators/model.ts";
import { assertDocQuotes, assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const DOC = "au-land-tax";
const D = (dollars: number): number => Math.round(dollars * 100);
const aud = (cents: number, decimals: 0 | 2 = 2): string => money(cents, "AUD", decimals);

function q(id: string, quotes: readonly string[]): void {
  assertExampleQuotes(DOC, id, quotes);
}

test("AU land tax document has exactly the tested worked examples", () => {
  assert.deepEqual(exampleIds(readRuleDoc(DOC)), [
    "LT-1",
    "LT-2",
    "LT-NSW-1",
    "LT-VIC-1",
    "LT-QLD-1",
    "LT-WA-1",
    "LT-SA-1",
    "LT-TAS-1",
    "LT-ACT-1",
    "LT-NT-1",
  ]);
});

test("worked examples quote engine and domain results", () => {
  const qldYear = computeLandTax({ state: "QLD", assessmentDate: "2026-07-01", owner: { kind: "INDIVIDUAL" }, holdings: [{ id: "q", taxableLandValue: D(680_000) }] });
  const nswYear = computeLandTax({ state: "NSW", assessmentDate: "2026-07-01", owner: { kind: "INDIVIDUAL" }, holdings: [{ id: "n", taxableLandValue: D(1_100_000) }] });
  q("LT-1", ["assessment year 2027", aud(qldYear.totalTax), "assessment year 2026", aud(nswYear.totalTax)]);

  const wattle = propertyTaxView(seedData(), "wattle", { now: new Date(2026, 9, 12, 9, 0, 0) });
  const row = (id: string) => {
    const found = wattle.rows.find((candidate) => candidate.propertyId === id);
    assert.ok(found, id);
    return found;
  };
  q("LT-2", [
    aud(row("wattle-wattle-grove-shopping-centre").tax),
    aud(row("wattle-banksia-plaza").surcharge),
    aud(row("wattle-lakeside-marketplace").total),
    aud(wattle.totals.tax),
    aud(wattle.totals.surcharge),
    aud(wattle.kpis.annualTax),
    "Not calculated",
    "0",
    row("wattle-wattle-grove-shopping-centre").dueLabel,
    row("wattle-banksia-plaza").assessedLabel,
    row("wattle-lakeside-marketplace").dueLabel,
  ]);

  const nsw = computeLandTax({ state: "NSW", assessmentYear: 2026, owner: { kind: "COMPANY", foreign: true }, holdings: [{ id: "a", taxableLandValue: D(600_000), residential: true }, { id: "b", taxableLandValue: D(600_000), residential: true }] });
  q("LT-NSW-1", [aud(nsw.generalTax), aud(nsw.surchargeTax), aud(nsw.totalTax), aud(nsw.properties[0]!.totalTax), aud(nsw.totalTax, 0)]);

  const vic = computeLandTax({ state: "VIC", assessmentYear: 2026, owner: { kind: "INDIVIDUAL" }, holdings: [{ id: "ballarat", taxableLandValue: D(620_000) }, { id: "bright", taxableLandValue: D(480_000) }] });
  q("LT-VIC-1", [aud(vic.totalTax), aud(vic.properties[0]!.totalTax), aud(vic.properties[1]!.totalTax), aud(vic.totalTax, 0)]);

  const qld = computeLandTax({ state: "QLD", assessmentYear: 2026, owner: { kind: "COMPANY", foreign: true }, holdings: [{ id: "fco", taxableLandValue: D(400_000) }] });
  q("LT-QLD-1", [aud(qld.generalTax), aud(qld.surchargeTax), aud(qld.totalTax), aud(qld.totalTax, 0)]);

  const wa = computeLandTax({ state: "WA", assessmentYear: 2026, owner: { kind: "TRUST" }, holdings: [{ id: "perth", taxableLandValue: D(400_000) }] });
  q("LT-WA-1", [aud(wa.generalTax), aud(wa.surchargeTax), aud(wa.totalTax), aud(wa.totalTax, 0), "A$0.00"]);

  const sa = computeLandTax({ state: "SA", assessmentYear: 2026, owner: { kind: "TRUST", trustSurchargeApplies: false }, holdings: [{ id: "sa", taxableLandValue: D(2_000_000) }] });
  q("LT-SA-1", [aud(sa.totalTax), aud(sa.totalTax, 0), "540 parts"]);

  const tas = computeLandTax({ state: "TAS", assessmentYear: 2026, owner: { kind: "COMPANY", foreign: true }, holdings: [{ id: "tas", taxableLandValue: D(600_000), residential: true }] });
  q("LT-TAS-1", [aud(tas.generalTax), aud(tas.surchargeTax), aud(tas.totalTax), aud(tas.totalTax, 0)]);

  const act = computeLandTax({ state: "ACT", assessmentDate: "2026-07-01", owner: { kind: "COMPANY", foreign: true }, holdings: [{ id: "act", taxableLandValue: D(300_000), residential: true }] });
  q("LT-ACT-1", ["assessment year 2027", aud(act.generalTax), aud(act.surchargeTax), aud(act.totalTax), aud(act.totalTax, 0)]);

  const nt = computeLandTax({ state: "NT", assessmentYear: 2026, owner: { kind: "COMPANY", foreign: true }, holdings: [{ id: "nt", taxableLandValue: D(2_000_000), residential: true }] });
  q("LT-NT-1", [aud(nt.generalTax), aud(nt.surchargeTax), aud(nt.totalTax), aud(nt.totalTax, 0), "AU_LAND_TAX.NT_NOT_LEVIED"]);
});

test("rate and threshold sections quote the coded tables", () => {
  assertSectionQuotes(DOC, "NSW coded rates and thresholds", [
    tableRow(["2022", "General", "Nil below A$822,000; A$100 + 1.6% above A$822,000 to A$5,026,000; A$67,364 + 2.0% above A$5,026,000"]),
    tableRow(["2023", "General", "Nil below A$969,000; A$100 + 1.6% above A$969,000 to A$5,925,000; A$79,396 + 2.0% above A$5,925,000"]),
    tableRow(["2024+", "General", "Nil below A$1,075,000; A$100 + 1.6% above A$1,075,000 to A$6,571,000; A$88,036 + 2.0% above A$6,571,000"]),
    tableRow(["2024+", "Special trust", "No threshold; 1.6% up to A$6,571,000; A$105,136 + 2.0% above A$6,571,000"]),
    tableRow(["2025+", "Foreign-owner surcharge", "5.0% of residential surchargeable value; no threshold"]),
  ]);

  assertSectionQuotes(DOC, "Victoria coded rates and thresholds", [
    tableRow(["2024+", "General", "Nil below A$50,000; A$500 flat from A$50,000; A$975 flat from A$100,000; A$1,350 + 0.3% above A$300,000; A$2,250 + 0.6% above A$600,000; A$4,650 + 0.9% above A$1,000,000; A$11,850 + 1.65% above A$1,800,000; A$31,650 + 2.65% above A$3,000,000"]),
    tableRow(["2024+", "Trust", "Nil below A$25,000; A$82 + 0.375% above A$25,000; A$676 + 0.375% above A$50,000; A$1,338 + 0.375% above A$100,000; A$1,901 + 0.675% above A$250,000; A$4,263 + 0.975% above A$600,000; A$8,163 + 1.275% above A$1,000,000; A$18,363 + 1.1072% above A$1,800,000; A$31,650 + 2.65% above A$3,000,000"]),
    tableRow(["2024+", "Absentee surcharge", "4.0% of taxable value once the relevant general or trust threshold is met"]),
  ]);

  assertSectionQuotes(DOC, "Queensland coded rates and thresholds", [
    tableRow(["Individual", "Nil below A$600,000; A$500 + 1.0% above A$600,000; A$4,500 + 1.65% above A$1,000,000; A$37,500 + 1.25% above A$3,000,000; A$62,500 + 1.75% above A$5,000,000; A$150,000 + 2.25% above A$10,000,000"]),
    tableRow(["Company or trust", "Nil below A$350,000; A$1,450 + 1.7% above A$350,000; A$33,750 + 1.5% above A$2,250,000; A$75,000 + 2.25% above A$5,000,000; A$187,500 + 2.75% above A$10,000,000"]),
    tableRow(["Foreign company or trust surcharge", "Additional 3.0% of taxable value above A$350,000"]),
  ]);

  assertSectionQuotes(DOC, "Western Australia coded rates and thresholds", [
    tableRow(["Land tax", "Nil to A$300,000; A$300 from A$300,001 to A$420,000; A$300 + 0.25% above A$420,000; A$1,750 + 0.9% above A$1,000,000; A$8,950 + 1.8% above A$1,800,000; A$66,550 + 2.0% above A$5,000,000; A$186,550 + 2.67% above A$11,000,000"]),
    tableRow(["MRIT", "0.14% of metropolitan-region land value above A$300,000"]),
  ]);

  assertSectionQuotes(DOC, "South Australia coded general rates and thresholds", [
    tableRow(["2025-26", "Nil to A$833,000; 50c per A$100 above A$833,000; A$2,525 + A$1.00 per A$100 above A$1,338,000; A$8,605 + A$2.00 per A$100 above A$1,946,000; A$32,005 + A$2.40 per A$100 above A$3,116,000"]),
    tableRow(["2026-27", "Nil to A$936,000; 50c per A$100 above A$936,000; A$2,840 + A$1.00 per A$100 above A$1,504,000; A$9,680 + A$2.00 per A$100 above A$2,188,000; A$36,000 + A$2.40 per A$100 above A$3,504,000"]),
  ]);
  assertSectionQuotes(DOC, "South Australia coded trust rates and thresholds", [
    tableRow(["2025-26", "Nil to A$25,000; A$125 + 50c per A$100 above A$25,000; A$4,165 + A$1.00 per A$100 above A$833,000; A$9,215 + A$1.50 per A$100 above A$1,338,000; A$18,335 + A$2.40 per A$100 above A$1,946,000; A$46,415 + A$2.40 per A$100 above A$3,116,000"]),
  ]);

  assertSectionQuotes(DOC, "Tasmania coded rates and thresholds", [
    tableRow(["General Land from 1 July 2025", "Nil below A$125,000; A$50 + 0.45% above A$125,000 to A$500,000; A$1,737.50 + 1.5% above A$500,000"]),
    tableRow(["Foreign investor land tax surcharge", "2.0% of foreign-owned General Land value marked residential or supplied as surchargeable value"]),
  ]);

  assertSectionQuotes(DOC, "ACT coded rates and thresholds", [
    tableRow(["2025-26", "Annual fixed charge A$1,693 plus valuation charge bands"]),
    tableRow(["2026-27", "Annual fixed charge A$1,778 plus valuation charge bands"]),
    tableRow(["Valuation bands", "0.54% to A$150,000; A$810 + 0.64% above A$150,000; A$1,610 + 1.24% above A$275,000; A$10,600 + 1.25% above A$1,000,000; A$23,100 + 1.26% above A$2,000,000"]),
    tableRow(["Commercial land", "Cited nil: ACT land tax does not apply to holdings not marked residential"]),
  ]);

  assertSectionQuotes(DOC, "Northern Territory coded nil treatment", [
    tableRow(["Northern Territory", "No annual land tax; all owner kinds and foreign flags return A$0.00 with finding `AU_LAND_TAX.NT_NOT_LEVIED`"]),
  ]);
});

test("documented table rows are checked against the engine at boundaries", () => {
  assert.equal(computeLandTax({ state: "NSW", assessmentYear: 2026, owner: { kind: "INDIVIDUAL" }, holdings: [{ id: "n", taxableLandValue: D(1_075_000) }] }).totalTax, 0);
  assert.equal(computeLandTax({ state: "NSW", assessmentYear: 2026, owner: { kind: "INDIVIDUAL" }, holdings: [{ id: "n", taxableLandValue: D(6_571_001) }] }).totalTax, D(88_036.02));
  assert.equal(computeLandTax({ state: "NSW", assessmentYear: 2026, owner: { kind: "SPECIAL_TRUST" }, holdings: [{ id: "n", taxableLandValue: D(600_000) }] }).totalTax, D(9_600));

  assert.equal(computeLandTax({ state: "VIC", assessmentYear: 2026, owner: { kind: "INDIVIDUAL" }, holdings: [{ id: "v", taxableLandValue: D(50_000) }] }).totalTax, D(500));
  assert.equal(computeLandTax({ state: "VIC", assessmentYear: 2026, owner: { kind: "TRUST" }, holdings: [{ id: "v", taxableLandValue: D(25_000) }] }).totalTax, D(82));
  assert.equal(computeLandTax({ state: "VIC", assessmentYear: 2026, owner: { kind: "INDIVIDUAL", absentee: true }, holdings: [{ id: "v", taxableLandValue: D(50_000) }] }).surchargeTax, D(2_000));

  assert.equal(computeLandTax({ state: "QLD", assessmentYear: 2026, owner: { kind: "INDIVIDUAL" }, holdings: [{ id: "q", taxableLandValue: D(600_000) }] }).totalTax, D(500));
  assert.equal(computeLandTax({ state: "QLD", assessmentYear: 2026, owner: { kind: "COMPANY" }, holdings: [{ id: "q", taxableLandValue: D(350_000) }] }).totalTax, D(1_450));
  assert.equal(computeLandTax({ state: "QLD", assessmentYear: 2026, owner: { kind: "TRUST", foreign: true }, holdings: [{ id: "q", taxableLandValue: D(400_000) }] }).surchargeTax, D(1_500));

  assert.equal(computeLandTax({ state: "WA", assessmentYear: 2026, owner: { kind: "TRUST" }, holdings: [{ id: "w", taxableLandValue: D(300_000) }] }).totalTax, 0);
  assert.equal(computeLandTax({ state: "WA", assessmentYear: 2026, owner: { kind: "TRUST" }, holdings: [{ id: "w", taxableLandValue: D(400_000) }] }).surchargeTax, D(140));
  assert.equal(computeLandTax({ state: "WA", assessmentYear: 2026, owner: { kind: "TRUST" }, holdings: [{ id: "w", taxableLandValue: D(400_000), metropolitanRegion: false }] }).surchargeTax, 0);

  assert.equal(computeLandTax({ state: "SA", assessmentYear: 2026, owner: { kind: "TRUST", trustSurchargeApplies: false }, holdings: [{ id: "s", taxableLandValue: D(2_000_000) }] }).totalTax, D(9_685));
  assert.equal(computeLandTax({ state: "SA", assessmentYear: 2026, owner: { kind: "TRUST" }, holdings: [{ id: "s", taxableLandValue: D(2_000_000) }] }).totalTax, D(19_631));
  assert.equal(computeLandTax({ state: "SA", assessmentYear: 2026, owner: { kind: "TRUST", trustSurchargeApplies: false }, holdings: [{ id: "s", taxableLandValue: D(836_900) }] }).totalTax, 0);

  assert.equal(computeLandTax({ state: "TAS", assessmentYear: 2026, owner: { kind: "COMPANY" }, holdings: [{ id: "t", taxableLandValue: D(600_000), residential: true }] }).generalTax, D(3_237.50));
  assert.equal(computeLandTax({ state: "TAS", assessmentYear: 2026, owner: { kind: "COMPANY", foreign: true }, holdings: [{ id: "t", taxableLandValue: D(600_000), residential: true }] }).surchargeTax, D(12_000));

  assert.equal(computeLandTax({ state: "ACT", assessmentDate: "2026-06-30", owner: { kind: "TRUST" }, holdings: [{ id: "a", taxableLandValue: D(300_000), residential: true }] }).generalTax, D(3_613));
  assert.equal(computeLandTax({ state: "ACT", assessmentDate: "2026-07-01", owner: { kind: "TRUST" }, holdings: [{ id: "a", taxableLandValue: D(300_000), residential: true }] }).generalTax, D(3_698));
  assert.equal(computeLandTax({ state: "ACT", assessmentDate: "2026-07-01", owner: { kind: "TRUST", foreign: true }, holdings: [{ id: "a", taxableLandValue: D(300_000), residential: true }] }).surchargeTax, D(2_250));
  assert.equal(computeLandTax({ state: "ACT", assessmentDate: "2026-07-01", owner: { kind: "TRUST", foreign: true }, holdings: [{ id: "a", taxableLandValue: D(3_000_000), residential: false }] }).totalTax, 0);

  assert.equal(computeLandTax({ state: "NT", assessmentYear: 2026, owner: { kind: "COMPANY", foreign: true }, holdings: [{ id: "nt", taxableLandValue: D(2_000_000), residential: true }] }).totalTax, 0);
});

test("document quotes workspace, notice and calculator behaviour", () => {
  const calculator = calculatorById("au-land-tax");
  const result = calculator.compute(defaultValues(calculator));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assertDocQuotes(DOC, [
    "Total annual tax this year",
    "Not calculated",
    "more than A$1.00",
    "30 September",
    "period `land-tax-YYYY`",
    "default values are NSW, assessment year 2026, A$8,000,000, owner kind Trust, trust rates on and foreign off",
    result.lines.find((line) => line.label === "Total tax")!.value,
  ]);
});
