import assert from "node:assert/strict";
import { test } from "node:test";

import { AU_LAND_TAX_OWNER_KINDS, computeLandTax } from "../../../src/engine/au/landTax.ts";
import { AU_COVERAGE_LEVELS, AU_STATE_TAX_CATALOGUE } from "../../../src/engine/au/stateCatalogue.ts";

const D = (dollars: number): number => Math.round(dollars * 100);

test("AU land-tax catalogues are exhaustive", () => {
  assert.deepEqual(AU_LAND_TAX_OWNER_KINDS.map((entry) => entry.id), ["INDIVIDUAL", "COMPANY", "TRUST", "SPECIAL_TRUST"]);
  assert.deepEqual(AU_COVERAGE_LEVELS.map((entry) => entry.id), ["FULL", "PARTIAL", "NOT_MODELLED"]);
  assert.equal(AU_STATE_TAX_CATALOGUE.length, 8);
});

test("NSW land tax matches Revenue NSW published examples and special-trust treatment", () => {
  const simple = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    owner: { kind: "COMPANY" },
    holdings: [{ id: "single", taxableLandValue: D(1_100_000) }],
  });
  assert.equal(simple.generalTax, D(500)); // Revenue NSW 3-year-average example
  assert.equal(simple.totalTax, D(500));

  const foreign = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    owner: { kind: "COMPANY", foreign: true },
    holdings: [
      { id: "a", taxableLandValue: D(600_000), residential: true },
      { id: "b", taxableLandValue: D(600_000), residential: true },
    ],
  });
  assert.equal(foreign.generalTax, D(2_100)); // Revenue NSW example 1
  assert.equal(foreign.surchargeTax, D(60_000));
  assert.equal(foreign.totalTax, D(62_100));
  assert.deepEqual(
    foreign.properties.map((property) => property.totalTax),
    [D(31_050), D(31_050)],
  );

  const specialTrust = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    owner: { kind: "SPECIAL_TRUST" },
    holdings: [{ id: "trust", taxableLandValue: D(600_000) }],
  });
  assert.equal(specialTrust.generalTax, D(9_600)); // 1.6% with no threshold

  const oldThreshold = computeLandTax({
    state: "NSW",
    assessmentYear: 2023,
    owner: { kind: "COMPANY" },
    holdings: [{ id: "threshold", taxableLandValue: D(969_000) }],
  });
  assert.equal(oldThreshold.totalTax, 0);
});

test("VIC land tax current, trust and absentee cases match SRO worked examples and tables", () => {
  const anika = computeLandTax({
    state: "VIC",
    assessmentYear: 2025,
    owner: { kind: "INDIVIDUAL" },
    holdings: [
      { id: "ballarat", taxableLandValue: D(620_000) },
      { id: "bright", taxableLandValue: D(480_000) },
    ],
  });
  assert.equal(anika.generalTax, D(5_550)); // SRO example
  assert.deepEqual(
    anika.properties.map((property) => property.totalTax),
    [D(3_128.18), D(2_421.82)],
  );

  const brackets = (value: number) =>
    computeLandTax({
      state: "VIC",
      assessmentYear: 2026,
      owner: { kind: "INDIVIDUAL" },
      holdings: [{ id: "single", taxableLandValue: D(value) }],
    }).generalTax;
  assert.equal(brackets(50_000), D(500));
  assert.equal(brackets(100_000), D(975));
  assert.equal(brackets(300_000), D(1_350));
  assert.equal(brackets(600_000), D(2_250));
  assert.equal(brackets(1_000_000), D(4_650));
  assert.equal(brackets(3_000_000), D(31_650));

  const trust = computeLandTax({
    state: "VIC",
    assessmentYear: 2026,
    owner: { kind: "TRUST" },
    holdings: [{ id: "trust", taxableLandValue: D(760_000) }],
  });
  assert.equal(trust.generalTax, D(5_823)); // A$4,263 + 0.975% x A$160,000

  const absentee = computeLandTax({
    state: "VIC",
    assessmentYear: 2026,
    owner: { kind: "COMPANY", absentee: true },
    holdings: [{ id: "abs", taxableLandValue: D(100_000) }],
  });
  assert.equal(absentee.generalTax, D(975));
  assert.equal(absentee.surchargeTax, D(4_000));
  assert.equal(absentee.totalTax, D(4_975));
});

test("QLD land tax matches published individual, company, foreign and absentee examples", () => {
  const individual = computeLandTax({
    state: "QLD",
    assessmentYear: 2026,
    owner: { kind: "INDIVIDUAL" },
    holdings: [{ id: "ind", taxableLandValue: D(680_000) }],
  });
  assert.equal(individual.generalTax, D(1_300)); // QRO example 1

  const individualHigh = computeLandTax({
    state: "QLD",
    assessmentYear: 2026,
    owner: { kind: "INDIVIDUAL" },
    holdings: [{ id: "ind2", taxableLandValue: D(6_400_000) }],
  });
  assert.equal(individualHigh.generalTax, D(87_000)); // QRO example 2

  const company = computeLandTax({
    state: "QLD",
    assessmentYear: 2026,
    owner: { kind: "COMPANY" },
    holdings: [{ id: "co", taxableLandValue: D(6_400_000) }],
  });
  assert.equal(company.generalTax, D(106_500)); // QRO example

  const foreignCompany = computeLandTax({
    state: "QLD",
    assessmentYear: 2026,
    owner: { kind: "COMPANY", foreign: true },
    holdings: [{ id: "fco", taxableLandValue: D(400_000) }],
  });
  assert.equal(foreignCompany.generalTax, D(2_300));
  assert.equal(foreignCompany.surchargeTax, D(1_500));
  assert.equal(foreignCompany.totalTax, D(3_800)); // QRO example

  const absentee = computeLandTax({
    state: "QLD",
    assessmentYear: 2026,
    owner: { kind: "INDIVIDUAL", absentee: true },
    holdings: [{ id: "abs", taxableLandValue: D(400_000) }],
  });
  assert.equal(absentee.generalTax, D(2_300));
  assert.equal(absentee.surchargeTax, D(1_500));
  assert.equal(absentee.totalTax, D(3_800)); // QRO example

  const apportioned = computeLandTax({
    state: "QLD",
    assessmentYear: 2026,
    owner: { kind: "COMPANY" },
    holdings: [
      { id: "a", taxableLandValue: D(400_000) },
      { id: "b", taxableLandValue: D(600_000) },
    ],
  });
  assert.equal(apportioned.generalTax, D(12_500));
  assert.deepEqual(
    apportioned.properties.map((property) => property.totalTax),
    [D(5_000), D(7_500)],
  );
});

