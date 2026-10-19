import assert from "node:assert/strict";
import { test } from "node:test";

import { computeLandholderDuty, computeTransferDuty } from "../../src/engine/au/transferDuty.ts";
import { dutiesView, propertyTaxKpis } from "../../src/domain/ptax/index.ts";
import { seedData } from "../../src/domain/seed/index.ts";
import { money } from "../../src/domain/format.ts";
import { assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const DOC = "au-duties.md";
const D = (dollars: number): number => Math.round(dollars * 100);
const AUD = "AUD" as const;
const fmt = (cents: number) => money(cents, AUD, 2);

function transfer(input: Parameters<typeof computeTransferDuty>[0]) {
  return computeTransferDuty(input);
}

function landholder(input: Parameters<typeof computeLandholderDuty>[0]) {
  return computeLandholderDuty(input);
}

test("au duties doc has exactly the worked examples covered by this test", () => {
  assert.deepEqual(exampleIds(readRuleDoc(DOC)), [
    "DUTY-WA-1",
    "DUTY-SA-2",
    "DUTY-NSW-1",
    "DUTY-NSW-2",
    "DUTY-VIC-1",
    "DUTY-QLD-1",
    "DUTY-SA-1",
    "DUTY-TAS-1",
    "DUTY-ACT-1",
    "DUTY-NT-1",
    "LH-NSW-1",
    "LH-NSW-2",
    "LH-VIC-1",
    "LH-QLD-1",
    "LH-QLD-2",
    "LH-WA-1",
    "LH-SA-1",
  ]);
});

test("workspace examples and KPI values are quoted from dutiesView", () => {
  const data = seedData();
  const wattle = dutiesView(data, "wattle", { now: new Date(2026, 9, 12, 9, 0, 0) });
  const kpis = propertyTaxKpis(data, "wattle", { now: new Date(2026, 9, 12, 9, 0, 0) });
  const banksia = wattle.rows.find((row) => row.propertyId === "wattle-banksia-plaza")!;
  const lakeside = wattle.rows.find((row) => row.propertyId === "wattle-lakeside-marketplace")!;

  assert.equal(banksia.totalDuty, 2_689_949_985);
  assert.equal(lakeside.totalDuty, 3_565_483_450);
  assert.deepEqual([kpis.dutyPaid, kpis.dutyModelled, kpis.dutyTotal, kpis.dutyNotModelled], [10_158_056_785, 3, 4, 1]);

  assertExampleQuotes(DOC, "DUTY-WA-1", [
    "A$522,492,875.00",
    `base duty ${fmt(banksia.baseDuty)}`,
    `foreign surcharge ${fmt(banksia.surchargeDuty)}`,
    `total duty ${fmt(banksia.totalDuty)}`,
    fmt(wattle.totals.totalDuty),
  ]);
  assertExampleQuotes(DOC, "DUTY-SA-2", [
    "A$648,381,847.00",
    `base duty ${fmt(lakeside.baseDuty)}`,
    `total duty ${fmt(lakeside.totalDuty)}`,
    "sa.transfer.2002-09-05+sa.qualifying-land.phaseout.2015-12-07",
  ]);
});

test("transfer-duty worked examples recompute through the engine", () => {
  const cases = [
    ["DUTY-NSW-1", transfer({ state: "NSW", contractDate: "2026-10-10", dutiableValue: D(1_350_000), propertyKind: "RESIDENTIAL", purchaser: { kind: "INDIVIDUAL" } }), ["A$1,350,000.00", "A$55,537.00"]],
    ["DUTY-NSW-2", transfer({ state: "NSW", contractDate: "2026-10-10", dutiableValue: D(1_000_000), propertyKind: "RESIDENTIAL", purchaser: { kind: "INDIVIDUAL", foreignPerson: true } }), ["A$39,187.00", "A$90,000.00", "A$129,187.00"]],
    ["DUTY-VIC-1", transfer({ state: "VIC", contractDate: "2026-10-10", dutiableValue: D(2_100_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }), ["A$2,100,000.00", "A$116,500.00"]],
    ["DUTY-QLD-1", transfer({ state: "QLD", contractDate: "2026-10-10", dutiableValue: D(850_000), propertyKind: "RESIDENTIAL", purchaser: { kind: "COMPANY", foreignCorporation: true } }), ["A$31,275.00", "A$68,000.00", "A$99,275.00"]],
    ["DUTY-SA-1", transfer({ state: "SA", contractDate: "2022-12-10", dutiableValue: D(2_200_000), propertyKind: "MIXED", residentialDutiableValue: D(1_200_000), purchaser: { kind: "COMPANY" } }), ["A$114,830.00", "A$62,634.55"]],
    ["DUTY-TAS-1", transfer({ state: "TAS", contractDate: "2026-10-10", dutiableValue: D(1_000_000), propertyKind: "RESIDENTIAL", purchaser: { kind: "TRUST", foreignPerson: true } }), ["A$40,185.00", "A$80,000.00", "A$120,185.00"]],
    ["DUTY-ACT-1", transfer({ state: "ACT", contractDate: "2026-10-10", dutiableValue: D(2_500_000), propertyKind: "MIXED", residentialDutiableValue: D(1_000_000), purchaser: { kind: "TRUST", foreignPerson: true } }), ["A$2,500,000.00", "A$36,950.00", "A$0.00"]],
    ["DUTY-NT-1", transfer({ state: "NT", contractDate: "2026-10-10", dutiableValue: D(500_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }), ["A$500,000.00", "A$23,928.00"]],
  ] as const;

  const expectedTotals: Record<string, number> = {
    "DUTY-NSW-1": D(55_537),
    "DUTY-NSW-2": D(129_187),
    "DUTY-VIC-1": D(116_500),
    "DUTY-QLD-1": D(99_275),
    "DUTY-SA-1": D(62_634.55),
    "DUTY-TAS-1": D(120_185),
    "DUTY-ACT-1": D(36_950),
    "DUTY-NT-1": D(23_928),
  };

  for (const [id, result, quotes] of cases) {
    assert.equal(result.totalDuty, expectedTotals[id]);
    assertExampleQuotes(DOC, id, quotes);
  }
});

test("landholder-duty worked examples recompute through the engine", () => {
  const cases = [
    ["LH-NSW-1", landholder({ state: "NSW", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_UNIT_TRUST", landholdingsValue: D(2_000_000), acquiredInterestBps: 2_000 }), ["A$400,000.00", "A$12,187.00"]],
    ["LH-NSW-2", landholder({ state: "NSW", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_COMPANY", landholdingsValue: D(1_999_999.99), acquiredInterestBps: 6_000 }), ["A$1,999,999.99", "60%", "A$0.00", "AU_LANDHOLDER.BELOW_LAND_VALUE_THRESHOLD"]],
    ["LH-VIC-1", landholder({ state: "VIC", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_COMPANY", landholdingsValue: D(10_000_000), residentialLandValue: D(10_000_000), acquiredInterestBps: 7_000, foreignAcquirer: true }), ["A$7,000,000.00", "A$435,000.00", "A$560,000.00", "A$995,000.00"]],
    ["LH-QLD-1", landholder({ state: "QLD", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_COMPANY", landholdingsValue: D(2_800_000), residentialLandValue: D(1_000_000), acquiredInterestBps: 6_000, foreignAcquirer: true }), ["A$1,680,000.00", "A$77,125.00", "A$48,000.00", "A$125,125.00"]],
    ["LH-QLD-2", landholder({ state: "QLD", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_UNIT_TRUST", landholdingsValue: D(1_000_000), acquiredInterestBps: 2_000 }), ["A$1,000,000.00", "20%", "A$200,000.00", "A$5,425.00", "AU_LANDHOLDER.TRUST_ACQUISITION"]],
    ["LH-WA-1", landholder({ state: "WA", acquisitionDate: "2026-10-01", landholderKind: "PUBLIC_LANDHOLDER", landholdingsValue: D(5_000_000), acquiredInterestBps: 9_000 }), ["A$4,500,000.00", "A$222,865.50"]],
    ["LH-SA-1", landholder({ state: "SA", acquisitionDate: "2026-10-01", landholderKind: "PRIVATE_UNIT_TRUST", landholdingsValue: D(850_000), residentialLandValue: D(850_000), acquiredInterestBps: 7_500, foreignAcquirer: true }), ["A$637,500.00", "A$28,892.50", "A$44,625.00", "A$73,517.50"]],
  ] as const;

  const expectedTotals: Record<string, number> = {
    "LH-NSW-1": D(12_187),
    "LH-NSW-2": 0,
    "LH-VIC-1": D(995_000),
    "LH-QLD-1": D(125_125),
    "LH-QLD-2": D(5_425),
    "LH-WA-1": D(222_865.50),
    "LH-SA-1": D(73_517.50),
  };

  for (const [id, result, quotes] of cases) {
    assert.equal(result.totalDuty, expectedTotals[id]);
    assertExampleQuotes(DOC, id, quotes);
  }
});

test("documented rate and threshold rows are present and representative band edges match code", () => {
  assertSectionQuotes(DOC, "Transfer-duty rates and thresholds", [
    tableRow(["NSW", "2026-07-01 onwards", "Over A$1,290,000", "A$52,237 + 5.5% over A$1,290,000", "nsw.transfer.2026-07-01"]),
    tableRow(["NSW", "2025-07-01 to 2026-06-30", "Top ordinary threshold / premium threshold", "Over A$1,240,000 uses A$50,212 + 5.5%; premium above A$3,721,000 uses A$186,667 + 7%", "nsw.transfer.2025-07-01 / nsw.premium.2025-07-01"]),
    tableRow(["VIC", "2021-07-01 onwards", "More than A$2,000,000", "A$110,000 + 6.5% over A$2,000,000", "vic.transfer.2021-07-01"]),
    tableRow(["QLD", "2012-09-21 onwards", "More than A$1,000,000", "A$38,025 + A$5.75 per A$100 or part over A$1,000,000", "qld.transfer.2012-09-21"]),
    tableRow(["WA", "2014-07-02 onwards", "A$725,001 and over", "A$28,453 + A$5.15 per A$100 or part over A$725,000", "wa.transfer.2014-07-02"]),
    tableRow(["SA", "2018-07-01 onwards", "Qualifying non-residential land", "Nil duty; mixed land pays residential share of duty on the whole value", "sa.qualifying-land.2018-07-01"]),
    tableRow(["TAS", "2013-10-21 onwards", "More than A$725,000", "A$27,810 + A$4.50 per A$100 or part over A$725,000", "tas.transfer.2013-10-21"]),
    tableRow(["ACT residential", "2022-07-01 onwards", "More than A$1,455,000", "A$66,070 + 4.54% over A$1,455,000", "act.transfer.residential.2022-07-01"]),
    tableRow(["ACT commercial", "2022-23 to 2026-27", "Annual nil threshold", "A$1.7m, A$1.8m, A$1.9m, A$2.0m and A$2.1m respectively; 5% above threshold", "act.transfer.commercial.*"]),
    tableRow(["NT", "2022-07-01 onwards", "A$3m and below A$5m", "5.75% of dutiable value, floored to whole dollars", "nt.transfer.2022-07-01"]),
  ]);

  assert.equal(transfer({ state: "NSW", contractDate: "2026-10-10", dutiableValue: D(1_290_000), propertyKind: "RESIDENTIAL", purchaser: { kind: "INDIVIDUAL" } }).baseDuty, D(52_237));
  assert.equal(transfer({ state: "VIC", contractDate: "2026-10-10", dutiableValue: D(2_100_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }).baseDuty, D(116_500));
  assert.equal(transfer({ state: "QLD", contractDate: "2026-10-10", dutiableValue: D(1_000_001), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }).baseDuty, D(38_030.75));
  assert.equal(transfer({ state: "WA", contractDate: "2026-10-10", dutiableValue: D(725_000.01), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }).baseDuty, D(28_458.15));
  assert.equal(transfer({ state: "SA", contractDate: "2026-10-10", dutiableValue: D(5_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }).baseDuty, 0);
  assert.equal(transfer({ state: "TAS", contractDate: "2026-10-10", dutiableValue: D(1_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }).baseDuty, D(40_185));
  assert.equal(transfer({ state: "ACT", contractDate: "2026-10-10", dutiableValue: D(2_200_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }).baseDuty, D(5_000));
  assert.equal(transfer({ state: "NT", contractDate: "2026-10-10", dutiableValue: D(3_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }).baseDuty, D(172_500));
});

test("documented surcharge and landholder tables quote the code paths", () => {
  assertSectionQuotes(DOC, "Foreign purchaser surcharges", [
    tableRow(["NSW", "2025-01-01 onwards", "9%", "Residential component × foreign share", "nsw.surcharge.2025-01-01"]),
    tableRow(["VIC", "2019-07-01 onwards", "8%", "Residential component × foreign share", "vic.surcharge.2019-07-01"]),
    tableRow(["QLD", "2016-10-01 onwards", "8%", "Residential component × foreign share", "qld.surcharge.2016-10-01"]),
    tableRow(["WA", "2019-01-01 onwards", "7%", "Residential component × foreign share", "wa.surcharge.2019-01-01"]),
    tableRow(["SA", "2018-01-01 onwards", "7%", "Residential component × foreign share", "sa.surcharge.2018-01-01"]),
    tableRow(["TAS", "2020-04-01 onwards", "8%", "Residential component × foreign share", "tas.surcharge.2020-04-01"]),
    tableRow(["ACT", "2022-07-01 onwards", "Nil", "No foreign purchaser duty surcharge in transfer calculator", "act.foreign.nil"]),
    tableRow(["NT", "2022-07-01 onwards", "Nil", "No foreign purchaser duty surcharge in transfer calculator", "nt.foreign.nil"]),
  ]);

  assertSectionQuotes(DOC, "Landholder duty thresholds and charge modes", [
    tableRow(["NSW", "2024-02-01 onwards", "50%", "20%", "50%", "90%", "A$2,000,000", "Private: interest share; public: full land value from 2023-07-01", "Manual-review finding only"]),
    tableRow(["VIC", "2021-07-01 onwards", "50%", "20%", "50%", "90%", "A$1,000,000; phasing applies A$1m-A$2m, nil at exactly A$1m", "Private: interest share; public: 10% of full duty", "8% of acquired residential share from 2019-07-01"]),
    tableRow(["QLD", "2011-07-01 onwards", "50%", "Any interest as trust acquisition", "Not modelled", "90%", "A$2,000,000 for corporations and listed unit trusts; no land-value test for unlisted unit-trust trust acquisitions", "Private company: interest share; private unit trust: trust acquisition at transfer-duty rates on the acquired share (check the consideration); public: 10% of full duty", "8% AFAD on acquired residential share; public uses 10% of full AFAD"]),
    tableRow(["WA", "2008-07-01 onwards", "50%", "50%", "50%", "90%", "A$2,000,000", "All, including listed: general rate on acquirer's interest share under Duties Act 2008 (WA) ss 184 and 188", "Manual-review finding only"]),
    tableRow(["SA", "2018-07-01 onwards", "50%", "50%", "50%", "90%", "Nil if no residential land value", "Residential land only; public: full residential land value", "7% on acquired residential interest; public uses 10% of full surcharge"]),
    tableRow(["TAS", "All dates", "Not modelled", "Not modelled", "Not modelled", "Not modelled", "Not modelled", "Excluded from totals", "Not modelled"]),
    tableRow(["ACT", "All dates", "Not modelled", "Not modelled", "Not modelled", "Not modelled", "Not modelled", "Excluded from totals", "Not modelled"]),
    tableRow(["NT", "All dates", "Not modelled", "Not modelled", "Not modelled", "Not modelled", "Not modelled", "Excluded from totals", "Not modelled"]),
  ]);

  const nswForeignLandholder = landholder({ state: "NSW", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_COMPANY", landholdingsValue: D(3_000_000), residentialLandValue: D(3_000_000), acquiredInterestBps: 6_000, foreignAcquirer: true });
  assert.equal(nswForeignLandholder.foreignSurchargeDuty, 0);
  assert.ok(nswForeignLandholder.findings.some((finding) => finding.id === "AU_LANDHOLDER.FOREIGN_SURCHARGE_REVIEW"));
  assert.throws(() => landholder({ state: "TAS", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_COMPANY", landholdingsValue: D(3_000_000), acquiredInterestBps: 6_000 }), /Landholder duty is not modelled/);
});
