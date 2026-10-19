import assert from "node:assert/strict";
import test from "node:test";

import { RULES as LAND_TAX_RULES, computeLandTax } from "../../../src/engine/au/landTax.ts";
import {
  AU_MODELLED_LAND_TAX_STATES,
  AU_MODELLED_TRANSFER_DUTY_STATES,
  AU_STATE_TAX_CATALOGUE,
} from "../../../src/engine/au/stateCatalogue.ts";
import { RULES as TRANSFER_DUTY_RULES, computeTransferDuty } from "../../../src/engine/au/transferDuty.ts";
import { computeLandholderDuty } from "../../../src/engine/au/transferDuty.ts";
import { dutiesView, propertyTaxView } from "../../../src/domain/ptax/index.ts";
import { seedData } from "../../../src/domain/seed/index.ts";

const cents = (dollars: number): number => Math.round(dollars * 100);
const bps = (amount: number, rateBps: number): number => Math.round((amount * rateBps) / 10_000);
const floorDollar = (amount: number): number => Math.floor(amount / 100) * 100;
const per100 = (excessCents: number, centsPer100: number): number => Math.ceil(excessCents / 10_000) * centsPer100;

function tasTransferDuty(value: number): number {
  // Official SRO Tasmania rates of duty: https://www.sro.tas.gov.au/property-transfer-duties/rates-of-duty
  // <=$3,000: $50; >$3,000 to $25,000: $50 + $1.75 per $100 or part over $3,000;
  // >$25,000 to $75,000: $435 + $2.25 per $100 or part; >$75,000 to $200,000: $1,560 + $3.50;
  // >$200,000 to $375,000: $5,935 + $4.00; >$375,000 to $725,000: $12,935 + $4.25;
  // >$725,000: $27,810 + $4.50 per $100 or part over $725,000.
  if (value <= cents(3_000)) return cents(50);
  if (value <= cents(25_000)) return cents(50) + per100(value - cents(3_000), 175);
  if (value <= cents(75_000)) return cents(435) + per100(value - cents(25_000), 225);
  if (value <= cents(200_000)) return cents(1_560) + per100(value - cents(75_000), 350);
  if (value <= cents(375_000)) return cents(5_935) + per100(value - cents(200_000), 400);
  if (value <= cents(725_000)) return cents(12_935) + per100(value - cents(375_000), 425);
  return cents(27_810) + per100(value - cents(725_000), 450);
}

function tasLandTax(value: number): number {
  // Official SRO Tasmania land tax rates: https://www.sro.tas.gov.au/land-tax/rates-of-land-tax
  // $0-$124,999.99 nil; $125,000-$499,999.99: $50 + 0.45% above $125,000;
  // $500,000 and above: $1,737.50 + 1.5% above $500,000.
  if (value < cents(125_000)) return 0;
  if (value < cents(500_000)) return cents(50) + bps(value - cents(125_000), 45);
  return cents(1_737.5) + bps(value - cents(500_000), 150);
}

function actResidentialDuty(value: number): number {
  // ACT Revenue Office calculator API: https://www.revenue.act.gov.au/site-configuration/calculators/apis/conveyance-duty-2026-27
  // Residential from 1 Jul 2022/current: 1.2% to $200k; $2,400 + 2.2% above $200k;
  // $4,600 + 3.4% above $300k; $11,400 + 4.32% above $500k; $22,200 + 5.9% above $750k;
  // $36,950 + 6.4% above $1m; $66,070 + 4.54% above $1.455m.
  if (value <= cents(200_000)) return bps(value, 120);
  if (value <= cents(300_000)) return cents(2_400) + bps(value - cents(200_000), 220);
  if (value <= cents(500_000)) return cents(4_600) + bps(value - cents(300_000), 340);
  if (value <= cents(750_000)) return cents(11_400) + bps(value - cents(500_000), 432);
  if (value <= cents(1_000_000)) return cents(22_200) + bps(value - cents(750_000), 590);
  if (value <= cents(1_455_000)) return cents(36_950) + bps(value - cents(1_000_000), 640);
  return cents(66_070) + bps(value - cents(1_455_000), 454);
}

function actCommercialDuty(value: number, threshold: number): number {
  // ACT Revenue Office "About conveyance duty": from 1 Jul 2026, commercial property <=$2.1m nil; above threshold a flat 5% applies.
  // The official API has thresholds $1.7m, $1.8m, $1.9m, $2.0m and $2.1m for 2022-23 through 2026-27.
  return value <= cents(threshold) ? 0 : bps(value - cents(threshold), 500);
}

function actLandTax(value: number): number {
  // ACT Revenue Office land tax calculation: https://www.revenue.act.gov.au/rates-and-property-charges/land-tax/how-land-tax-is-calculated
  // Annual fixed charge from 1 Jul 2026 is $1,778. Valuation charge:
  // 0.54% to $150k; $810 + 0.64% above $150k; $1,610 + 1.24% above $275k;
  // $10,600 + 1.25% above $1m; $23,100 + 1.26% above $2m.
  if (value <= cents(150_000)) return cents(1_778) + bps(value, 54);
  if (value <= cents(275_000)) return cents(1_778 + 810) + bps(value - cents(150_000), 64);
  if (value <= cents(1_000_000)) return cents(1_778 + 1_610) + bps(value - cents(275_000), 124);
  if (value <= cents(2_000_000)) return cents(1_778 + 10_600) + bps(value - cents(1_000_000), 125);
  return cents(1_778 + 23_100) + bps(value - cents(2_000_000), 126);
}

function ntDutyFormula(value: number): number {
  // NT Government stamp-duty calculator and examples page:
  // https://nt.gov.au/property/buying-and-selling-a-home/settle-the-sale/stamp-duty-buying-or-selling-a-home/conveyance-calculator
  // https://nt.gov.au/employ/money-and-taxes/taxes-royalties-and-grants/stamp-duty/examples-of-duty-and-rates
  // Up to $525,000, D = (0.06571441 x V^2) + 15V, where V is value / 1,000; the calculator reports whole dollars.
  const v = value / 100_000;
  return floorDollar(Math.round(((0.06571441 * v * v) + (15 * v)) * 100));
}

function waTransferDuty(value: number): number {
  // WA Department of Treasury and Finance transfer duty assessment:
  // https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty-assessment
  // General rate: $1.90 per $100 up to $120k; $2,280 + $2.85 above $120k; $3,135 + $3.80 above $150k;
  // $11,115 + $4.75 above $360k; $28,453 + $5.15 above $725k.
  if (value <= cents(120_000)) return per100(value, 190);
  if (value <= cents(150_000)) return cents(2_280) + per100(value - cents(120_000), 285);
  if (value <= cents(360_000)) return cents(3_135) + per100(value - cents(150_000), 380);
  if (value <= cents(725_000)) return cents(11_115) + per100(value - cents(360_000), 475);
  return cents(28_453) + per100(value - cents(725_000), 515);
}

function saConveyanceDuty(value: number): number {
  // RevenueSA rate of stamp duty: https://www.revenuesa.sa.gov.au/stamp-duty/rate-of-stamp-duty
  // The page links a "Stamp Duty Rate Chart 05/09/2002" PDF at ratechart050902.pdf; direct script download returned 403.
  // $1 per $100 up to $12k; then $120 + $2 per $100 above $12k; $480 + $3 above $30k;
  // $1,080 + $3.50 above $50k; $2,830 + $4 above $100k; $6,830 + $4.25 above $200k;
  // $8,955 + $4.75 above $250k; $11,330 + $5 above $300k; $21,330 + $5.50 above $500k.
  if (value <= cents(12_000)) return per100(value, 100);
  if (value <= cents(30_000)) return cents(120) + per100(value - cents(12_000), 200);
  if (value <= cents(50_000)) return cents(480) + per100(value - cents(30_000), 300);
  if (value <= cents(100_000)) return cents(1_080) + per100(value - cents(50_000), 350);
  if (value <= cents(200_000)) return cents(2_830) + per100(value - cents(100_000), 400);
  if (value <= cents(250_000)) return cents(6_830) + per100(value - cents(200_000), 425);
  if (value <= cents(300_000)) return cents(8_955) + per100(value - cents(250_000), 475);
  if (value <= cents(500_000)) return cents(11_330) + per100(value - cents(300_000), 500);
  return cents(21_330) + per100(value - cents(500_000), 550);
}

test("Tasmania transfer duty covers every official band boundary and the foreign investor duty surcharge", () => {
  const cases = [
    1, 3_000, 3_001, 12_345, 24_999, 25_000, 25_001, 50_000, 74_999, 75_000, 75_001, 150_000,
    199_999, 200_000, 200_001, 300_000, 374_999, 375_000, 375_001, 500_000, 724_999, 725_000, 725_001, 1_000_000, 10_000_000,
  ];
  for (const dollars of cases) {
    const actual = computeTransferDuty({
      state: "TAS",
      contractDate: "2026-10-19",
      dutiableValue: cents(dollars),
      propertyKind: "RESIDENTIAL",
      purchaser: { kind: "COMPANY" },
    });
    assert.equal(actual.baseDuty, tasTransferDuty(cents(dollars)), `TAS transfer duty at A$${dollars.toLocaleString("en-AU")}`);
  }

  // Official FIDS page: https://www.sro.tas.gov.au/property-transfer-duties/foreign-investor-duty-surcharge/rates-of-surcharge
  // Residential FIDS: 3% from 1 Jul 2018, 8% from 1 Apr 2020. $1,000,000 x 8% = $80,000.
  const currentForeign = computeTransferDuty({
    state: "TAS",
    contractDate: "2026-10-19",
    dutiableValue: cents(1_000_000),
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "TRUST", foreignPerson: true },
  });
  assert.equal(currentForeign.baseDuty, cents(40_185));
  assert.equal(currentForeign.foreignSurchargeDuty, cents(80_000));
  assert.equal(currentForeign.totalDuty, cents(120_185));

  // Historic edge: written agreements on 31 Mar 2020 remain at 3%. $1,000,000 x 3% = $30,000.
  const historicForeign = computeTransferDuty({
    state: "TAS",
    contractDate: "2020-03-31",
    dutiableValue: cents(1_000_000),
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "COMPANY", foreignPerson: true },
  });
  assert.equal(historicForeign.foreignSurchargeDuty, cents(30_000));

  assert.throws(
    () => computeTransferDuty({ state: "TAS", contractDate: "2013-10-20", dutiableValue: cents(10_000), propertyKind: "RESIDENTIAL", purchaser: { kind: "COMPANY" } }),
    /Tasmanian property transfer duty/,
  );
});

test("Tasmania land tax covers the current general scale, surcharge on/off, allocation and pre-schedule refusal", () => {
  for (const dollars of [124_999.99, 125_000, 125_100, 300_000, 499_999.99, 500_000, 500_100, 600_000, 5_000_000]) {
    const actual = computeLandTax({
      state: "TAS",
      assessmentYear: 2026,
      holdings: [{ id: "hobart", taxableLandValue: cents(dollars), residential: true }],
      owner: { kind: "COMPANY" },
    });
    assert.equal(actual.generalTax, tasLandTax(cents(dollars)), `TAS land tax at A$${dollars.toLocaleString("en-AU")}`);
    assert.equal(actual.surchargeTax, 0);
  }

  // Official FILTS page: 2% of foreign-owned General Land acquired on/after 1 Jul 2022.
  // At $600,000: ordinary $1,737.50 + (($600,000 - $500,000) x 1.5%) = $3,237.50; surcharge $600,000 x 2% = $12,000.
  const foreign = computeLandTax({
    state: "TAS",
    assessmentYear: 2026,
    holdings: [{ id: "hobart", taxableLandValue: cents(600_000), residential: true }],
    owner: { kind: "COMPANY", foreign: true },
  });
  assert.equal(foreign.generalTax, cents(3_237.5));
  assert.equal(foreign.surchargeTax, cents(12_000));
  assert.equal(foreign.totalTax, cents(15_237.5));

  assert.throws(
    () => computeLandTax({ state: "TAS", assessmentYear: 2025, holdings: [{ id: "hobart", taxableLandValue: cents(500_000), residential: true }], owner: { kind: "COMPANY" } }),
    /Tasmanian land tax/,
  );
});

test("ACT transfer duty covers residential bands, commercial threshold edges, mixed use and no foreign surcharge", () => {
  const residentialCases = [
    1, 200_000, 200_001, 250_000, 300_000, 300_001, 400_000, 500_000, 500_001, 625_000, 750_000, 750_001,
    875_000, 1_000_000, 1_000_001, 1_227_500, 1_455_000, 1_455_001, 3_000_000,
  ];
  for (const dollars of residentialCases) {
    const actual = computeTransferDuty({
      state: "ACT",
      contractDate: "2026-10-19",
      dutiableValue: cents(dollars),
      propertyKind: "RESIDENTIAL",
      purchaser: { kind: "COMPANY", foreignPerson: true },
    });
    assert.equal(actual.baseDuty, actResidentialDuty(cents(dollars)), `ACT residential duty at A$${dollars.toLocaleString("en-AU")}`);
    assert.equal(actual.foreignSurchargeDuty, 0, "ACT publishes no foreign purchaser duty surcharge");
  }

  const commercial2025 = computeTransferDuty({
    state: "ACT",
    contractDate: "2025-07-01",
    dutiableValue: cents(2_000_001),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(commercial2025.baseDuty, actCommercialDuty(cents(2_000_001), 2_000_000));

  const commercial2026 = computeTransferDuty({
    state: "ACT",
    contractDate: "2026-07-01",
    dutiableValue: cents(2_100_001),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(commercial2026.baseDuty, actCommercialDuty(cents(2_100_001), 2_100_000));

  // Mixed-use: residential $1,000,000 gives $36,950; commercial $2,200,000 in 2026-27 gives 5% x ($2.2m - $2.1m) = $5,000.
  const mixed = computeTransferDuty({
    state: "ACT",
    contractDate: "2026-10-19",
    dutiableValue: cents(3_200_000),
    residentialDutiableValue: cents(1_000_000),
    propertyKind: "MIXED",
    purchaser: { kind: "TRUST" },
  });
  assert.equal(mixed.baseDuty, cents(41_950));

  assert.throws(
    () => computeTransferDuty({ state: "ACT", contractDate: "2022-06-30", dutiableValue: cents(1_000_000), propertyKind: "RESIDENTIAL", purchaser: { kind: "COMPANY" } }),
    /ACT residential conveyance duty/,
  );
});

test("ACT land tax covers valuation bands, foreign surcharge and commercial cited nil", () => {
  for (const dollars of [1, 150_000, 150_001, 212_500, 275_000, 275_001, 637_500, 1_000_000, 1_000_001, 1_500_000, 2_000_000, 2_000_001, 3_000_000]) {
    const actual = computeLandTax({
      state: "ACT",
      assessmentDate: "2026-07-01",
      holdings: [{ id: "canberra", taxableLandValue: cents(dollars), residential: true }],
      owner: { kind: "TRUST" },
    });
    assert.equal(actual.generalTax, actLandTax(cents(dollars)), `ACT land tax at AUV A$${dollars.toLocaleString("en-AU")}`);
  }

  // Official foreign ownership surcharge page: 0.75% of AUV per year, in addition to land tax.
  // At AUV $300,000: fixed $1,778 + ($1,610 + 1.24% x ($300,000 - $275,000) = $1,920) = $3,698; surcharge $2,250.
  const foreign = computeLandTax({
    state: "ACT",
    assessmentDate: "2026-07-01",
    holdings: [{ id: "canberra", taxableLandValue: cents(300_000), residential: true }],
    owner: { kind: "COMPANY", foreign: true },
  });
  assert.equal(foreign.generalTax, cents(3_698));
  assert.equal(foreign.surchargeTax, cents(2_250));

  const commercial = computeLandTax({
    state: "ACT",
    assessmentDate: "2026-07-01",
    holdings: [{ id: "fyshwick", taxableLandValue: cents(3_000_000), residential: false }],
    owner: { kind: "COMPANY", foreign: true },
  });
  assert.equal(commercial.totalTax, 0);
  assert.equal(commercial.findings[0]?.id, "AU_LAND_TAX.ACT_COMMERCIAL_LAND_NIL");
});

test("ACT land tax uses the 2025-26 determination before 1 July 2026 (verifier defect, fixed)", () => {
  // Official URL: https://www.revenue.act.gov.au/rates-and-property-charges/land-tax/how-land-tax-is-calculated
  // The page says "From 1 July 2026, the fixed charge for land tax is $1,778" and the valuation rates are for 2026-27.
  // Originally observed: computeLandTax applied act.land-tax.residential.2026-07-01 on 2026-06-30 ($5,948 on AUV $300,000 foreign-owned).
  // Fix: 2025-26 is modelled from DI2025-153 (https://www.legislation.act.gov.au/di/2025-153/), s 6: FC $1,693, same rate table;
  // s 7: foreign ownership surcharge 0.75%. At AUV $300,000: $1,693 + $1,920 = $3,613; surcharge $2,250.
  const actual = computeLandTax({ state: "ACT", assessmentDate: "2026-06-30", holdings: [{ id: "canberra", taxableLandValue: cents(300_000), residential: true }], owner: { kind: "COMPANY", foreign: true } });
  assert.equal(actual.generalTax, cents(3_613));
  assert.equal(actual.surchargeTax, cents(2_250));
  assert.match(actual.ruleVersion, /^act\.land-tax\.residential\.2025-07-01\+/);
  assert.throws(
    () => computeLandTax({ state: "ACT", assessmentDate: "2025-06-30", holdings: [{ id: "canberra", taxableLandValue: cents(300_000), residential: true }], owner: { kind: "COMPANY", foreign: true } }),
    /ACT land tax/,
  );
});

test("Northern Territory transfer duty covers official formula and nil land-tax / foreign-surcharge cases", () => {
  // Formula arithmetic at $350,000: V=350; D=(0.06571441 x 350^2) + 15 x 350 = 13,300.015225, reported as $13,300.
  const formula = computeTransferDuty({
    state: "NT",
    contractDate: "2026-10-19",
    dutiableValue: cents(350_000),
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "COMPANY", foreignPerson: true },
  });
  assert.equal(formula.baseDuty, ntDutyFormula(cents(350_000)));
  assert.equal(formula.foreignSurchargeDuty, 0);

  // Boundary under formula: $525,000 => V=525; D=(0.06571441 x 525^2) + 15 x 525 = $25,987.15, whole-dollar $25,987.
  const topFormula = computeTransferDuty({
    state: "NT",
    contractDate: "2026-10-19",
    dutiableValue: cents(525_000),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(topFormula.baseDuty, ntDutyFormula(cents(525_000)));

  // Official rate above $525,000 and below $3,000,000: 4.95% of value. At $1,000,000 = $49,500.
  const midBand = computeTransferDuty({
    state: "NT",
    contractDate: "2026-10-19",
    dutiableValue: cents(1_000_000),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "TRUST" },
  });
  assert.equal(midBand.baseDuty, cents(49_500));

  assert.throws(
    () => computeTransferDuty({ state: "NT", contractDate: "2022-06-30", dutiableValue: cents(1_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }),
    /Northern Territory stamp duty is modelled for contracts from 1 July 2022/,
  );

  const landTax = computeLandTax({
    state: "NT",
    assessmentYear: 2026,
    holdings: [{ id: "darwin", taxableLandValue: cents(20_000_000), residential: true }],
    owner: { kind: "COMPANY", foreign: true },
  });
  assert.equal(landTax.totalTax, 0);
  assert.equal(landTax.findings[0]?.id, "AU_LAND_TAX.NT_NOT_LEVIED");
});

test("NT high-value stamp duty applies the official 5.75% band from $3m to under $5m (verifier defect, fixed)", () => {
  // Official ready reckoner surfaced at https://treasury.nt.gov.au/pms/tro/information/I-SD-006.docx
  // (script download was Cloudflare-challenged) states: $3,000,000 or more but less than $5,000,000 is 5.75%;
  // $5,000,000 or more is 5.95%. At $4,000,000 expected $4,000,000 x 5.75% = $230,000.
  // Originally observed: engine returned $238,000 (5.95% x $4,000,000). Also confirmed in Stamp Duty Act 1978 (NT) Sch 1 cl 1(2).
  const actual = computeTransferDuty({ state: "NT", contractDate: "2026-10-19", dutiableValue: cents(4_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } });
  assert.equal(actual.baseDuty, cents(230_000));
});

test("territory rules and catalogue entries reflect the modelled public surfaces", () => {
  const transferRules = new Map(TRANSFER_DUTY_RULES.map((rule) => [rule.id, rule]));
  const landRules = new Map(LAND_TAX_RULES.map((rule) => [rule.id, rule]));

  for (const id of [
    "au-transfer-duty.tas.general.2013-10-21",
    "au-transfer-duty.tas.foreign.2020-04-01",
    "au-transfer-duty.act.residential.2022-07-01",
    "au-transfer-duty.act.commercial.2022-07-01",
    "au-transfer-duty.act.foreign.nil",
    "au-transfer-duty.nt.general.2022-07-01",
    "au-transfer-duty.nt.foreign.nil",
  ]) {
    const rule = transferRules.get(id);
    assert.ok(rule, id);
    assert.equal(rule.confidence, "VERIFIED", id);
    assert.ok(rule.sources.every((source) => /^https:\/\//.test(source.url)), id);
  }

  for (const id of [
    "au-land-tax.tas.general.2025-07-01",
    "au-land-tax.tas.foreign.2025-07-01",
    "au-land-tax.act.residential.2026-07-01",
    "au-land-tax.act.foreign.2018-07-01",
    "au-land-tax.act.commercial.nil",
    "au-land-tax.nt.nil",
  ]) {
    const rule = landRules.get(id);
    assert.ok(rule, id);
    assert.ok(rule.sources.every((source) => /^https:\/\//.test(source.url)), id);
  }
  assert.equal(landRules.get("au-land-tax.nt.nil")?.confidence, "VERIFIED_SECONDARY");

  assert.deepEqual(AU_MODELLED_TRANSFER_DUTY_STATES.map((entry) => entry.id), ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);
  assert.deepEqual(AU_MODELLED_LAND_TAX_STATES.map((entry) => entry.id), ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);
  assert.equal(AU_STATE_TAX_CATALOGUE.find((entry) => entry.state === "TAS")?.transferDutyCoverage, "PARTIAL");
  assert.equal(AU_STATE_TAX_CATALOGUE.find((entry) => entry.state === "ACT")?.landTaxCoverage, "PARTIAL");
  assert.equal(AU_STATE_TAX_CATALOGUE.find((entry) => entry.state === "NT")?.description.includes("no land tax and no foreign-purchaser surcharge"), true);
});

test("ACT land-tax rule effective date matches the official page (verifier defect, fixed)", () => {
  // Official URL: https://www.revenue.act.gov.au/rates-and-property-charges/land-tax/how-land-tax-is-calculated
  // Expected: rule effectiveFrom should be 2026-07-01 (or confidence downgraded/notes clearer if annualised from a financial-year table).
  // Originally observed in RULES/catalogue: effectiveFrom was 2026-01-01 while summary says "From 1 July 2026".
  assert.equal(LAND_TAX_RULES.find((rule) => rule.id === "au-land-tax.act.residential.2026-07-01")?.effectiveFrom, "2026-07-01");
});

test("property tax selectors surface TAS, ACT and NT values as modelled or cited nil without using zero as a silent fallback", () => {
  const data = seedData();
  const profile = data.propertyProfiles.find((entry) => entry.propertyId === "harbourline-harbourline-tower");
  assert.ok(profile);

  Object.assign(profile, {
    auState: "TAS",
    auLandValue: cents(600_000),
    auResidential: true,
    auResidentialShareBps: 10_000,
    auOwnerKind: "COMPANY",
    auOwnerForeign: true,
    purchaseDate: "2026-10-19",
    purchasePrice: cents(1_000_000),
    auPropertyKind: "RESIDENTIAL",
    auPurchaserKind: "COMPANY",
    auForeignPurchaser: true,
  });

  let annual = propertyTaxView(data, "harbourline", { now: new Date("2026-10-19T00:00:00Z") }).rows.find((row) => row.propertyId === profile.propertyId);
  let duty = dutiesView(data, "harbourline", { now: new Date("2026-10-19T00:00:00Z") }).rows.find((row) => row.propertyId === profile.propertyId);
  assert.equal(annual?.status, "modelled");
  assert.equal(annual?.tax, cents(3_237.5));
  assert.equal(annual?.surcharge, cents(12_000));
  assert.equal(duty?.status, "modelled");
  assert.equal(duty?.baseDuty, cents(40_185));
  assert.equal(duty?.surchargeDuty, cents(80_000));

  Object.assign(profile, {
    auState: "ACT",
    auLandValue: cents(300_000),
    auResidential: true,
    purchaseDate: "2026-10-19",
    purchasePrice: cents(3_200_000),
    auPropertyKind: "RESIDENTIAL",
    auResidentialShareBps: 10_000,
    auOwnerForeign: true,
    auForeignPurchaser: true,
  });
  annual = propertyTaxView(data, "harbourline", { now: new Date("2026-10-19T00:00:00Z") }).rows.find((row) => row.propertyId === profile.propertyId);
  // The app's AU land-tax year is the calendar year of the fund period end (2026); for the ACT that is 2025-26 (DI2025-153: FC $1,693).
  assert.equal(annual?.tax, cents(3_613));
  assert.equal(annual?.surcharge, cents(2_250));
  Object.assign(profile, {
    auPropertyKind: "MIXED",
    auResidentialShareBps: 3_125,
  });
  duty = dutiesView(data, "harbourline", { now: new Date("2026-10-19T00:00:00Z") }).rows.find((row) => row.propertyId === profile.propertyId);
  assert.equal(duty?.baseDuty, cents(41_950));
  assert.equal(duty?.surchargeDuty, 0);

  Object.assign(profile, {
    auState: "NT",
    auLandValue: cents(20_000_000),
    auResidential: true,
    purchaseDate: "2026-10-19",
    purchasePrice: cents(1_000_000),
    auPropertyKind: "NON_RESIDENTIAL",
    auResidentialShareBps: null,
    auOwnerForeign: true,
    auForeignPurchaser: true,
  });
  annual = propertyTaxView(data, "harbourline", { now: new Date("2026-10-19T00:00:00Z") }).rows.find((row) => row.propertyId === profile.propertyId);
  duty = dutiesView(data, "harbourline", { now: new Date("2026-10-19T00:00:00Z") }).rows.find((row) => row.propertyId === profile.propertyId);
  assert.equal(annual?.status, "modelled");
  assert.equal(annual?.total, 0);
  assert.match(annual?.notes.join(" ") ?? "", /does not levy annual land tax/);
  assert.equal(duty?.baseDuty, cents(49_500));
  assert.equal(duty?.surchargeDuty, 0);
});


test("WA landholder duty applies the official A$2m landholder threshold and 50% / 90% significant-interest tests", () => {
    // WA Government landholder duty requirements:
    // https://www.wa.gov.au/government/multi-step-guides/duties-information-requirements/landholder-duty-duty-requirements
    // Landholder = corporation/unit trust with WA land assets of $2m or more; significant interest = 50% unlisted, 90% listed.
    const belowLandValueThreshold = computeLandholderDuty({
      state: "WA",
      acquisitionDate: "2026-10-19",
      landholderKind: "PRIVATE_UNIT_TRUST",
      landholdingsValue: cents(1_999_999),
      acquiredInterestBps: 10_000,
    });
    assert.equal(belowLandValueThreshold.relevantAcquisition, false);
    assert.equal(belowLandValueThreshold.totalDuty, 0);

    const belowInterestThreshold = computeLandholderDuty({
      state: "WA",
      acquisitionDate: "2026-10-19",
      landholderKind: "PRIVATE_COMPANY",
      landholdingsValue: cents(10_000_000),
      acquiredInterestBps: 4_999,
    });
    assert.equal(belowInterestThreshold.relevantAcquisition, false);

    // 50% of $10m = $5m dutiable value; WA ordinary transfer scale at $5m:
    // $28,453 + ceil(($5,000,000 - $725,000) / $100) x $5.15 = $248,615.50.
    const unlisted = computeLandholderDuty({
      state: "WA",
      acquisitionDate: "2026-10-19",
      landholderKind: "PRIVATE_COMPANY",
      landholdingsValue: cents(10_000_000),
      acquiredInterestBps: 5_000,
    });
    assert.equal(unlisted.relevantAcquisition, true);
    assert.equal(unlisted.dutiableValue, cents(5_000_000));
    assert.equal(unlisted.baseDuty, waTransferDuty(cents(5_000_000)));

    const listedBelowThreshold = computeLandholderDuty({
      state: "WA",
      acquisitionDate: "2026-10-19",
      landholderKind: "PUBLIC_LANDHOLDER",
      landholdingsValue: cents(10_000_000),
      acquiredInterestBps: 8_999,
    });
    assert.equal(listedBelowThreshold.relevantAcquisition, false);

    // Listed/public pathway: Duties Act 2008 (WA) s 184(1) general rate on the s 188(3) value of the acquirer's 90% interest.
    const listed = computeLandholderDuty({
      state: "WA",
      acquisitionDate: "2026-10-19",
      landholderKind: "PUBLIC_LANDHOLDER",
      landholdingsValue: cents(10_000_000),
      acquiredInterestBps: 9_000,
    });
    assert.equal(listed.relevantAcquisition, true);
    assert.equal(listed.baseDuty, waTransferDuty(cents(9_000_000)));
  });

  test("WA listed/public landholders pay the general rate on the acquirer's interest, with no 10% concession (verifier defect, fixed)", () => {
    // Official WA page verifies $2m landholder threshold and 50%/90% significant-interest tests:
    // https://www.wa.gov.au/government/multi-step-guides/duties-information-requirements/landholder-duty-duty-requirements
    // Searches of WA Government landholder publication/fact sheet and Duties Act references did not verify a "listed 10% concession";
    // official-source snippets instead say duty is assessed at the general rate on the value of the acquirer's interest.
    // Expected if assessed on 90% interest in $10m: WA duty on $9m = $454,615.50. Actual engine: 10% of full $10m duty = $50,011.55.
    const actual = computeLandholderDuty({
      state: "WA",
      acquisitionDate: "2026-10-19",
      landholderKind: "PUBLIC_LANDHOLDER",
      landholdingsValue: cents(10_000_000),
      acquiredInterestBps: 9_000,
    });
    assert.equal(actual.baseDuty, waTransferDuty(cents(9_000_000)));
  });

  test("SA conveyance rates apply from the 5 September 2002 rate chart and cover every band boundary", () => {
    const cases = [
      1, 12_000, 12_001, 21_000, 30_000, 30_001, 40_000, 50_000, 50_001, 75_000, 100_000, 100_001,
      150_000, 200_000, 200_001, 225_000, 250_000, 250_001, 275_000, 300_000, 300_001, 400_000, 500_000, 500_001, 648_381_847,
    ];
    for (const dollars of cases) {
      const actual = computeTransferDuty({
        state: "SA",
        contractDate: "2002-09-05",
        dutiableValue: cents(dollars),
        propertyKind: "RESIDENTIAL",
        purchaser: { kind: "COMPANY" },
      });
      assert.equal(actual.baseDuty, saConveyanceDuty(cents(dollars)), `SA conveyance duty at A$${dollars.toLocaleString("en-AU")}`);
    }

    // The same official rate scale, no qualifying-land reduction because the contract is on/before 6 Dec 2015:
    // Lakeside Marketplace: $21,330 + ceil(($648,381,847 - $500,000) / $100) x $5.50
    // = $21,330 + 6,478,819 x $5.50 = $35,654,834.50.
    const seeded = dutiesView(seedData(), "wattle", { now: new Date("2026-10-19T00:00:00Z") }).rows.find((row) => row.propertyId === "wattle-lakeside-marketplace");
    assert.equal(seeded?.baseDuty, cents(35_654_834.5));

    assert.throws(
      () => computeTransferDuty({ state: "SA", contractDate: "2002-09-04", dutiableValue: cents(500_000), propertyKind: "RESIDENTIAL", purchaser: { kind: "COMPANY" } }),
      /South Australian transfer duty is modelled for contracts from 5 September 2002/,
    );
  });

  test("SA qualifying-land phase-out follows RevenueSA Information Circular 103 for each period and worked example", () => {
    // RevenueSA Information Circular 103:
    // https://www.revenuesa.sa.gov.au/resources/publications/information-circulars/information-circulars/ic_103/information-circular-103_21112022
    // No reduction on/before 6 Dec 2015; 1/3 reduction 7 Dec 2015-30 Jun 2017; 2/3 reduction 1 Jul 2017-30 Jun 2018; full reduction from 1 Jul 2018.
    const ordinary = saConveyanceDuty(cents(1_000_000));
    const onOrBefore = computeTransferDuty({ state: "SA", contractDate: "2015-12-06", dutiableValue: cents(1_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "TRUST" } });
    assert.equal(onOrBefore.baseDuty, ordinary);

    const oneThirdReduction = computeTransferDuty({ state: "SA", contractDate: "2015-12-07", dutiableValue: cents(1_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "TRUST" } });
    assert.equal(oneThirdReduction.baseDuty, Math.round((ordinary * 2) / 3));

    const oneThirdReductionLastDay = computeTransferDuty({ state: "SA", contractDate: "2017-06-30", dutiableValue: cents(1_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "TRUST" } });
    assert.equal(oneThirdReductionLastDay.baseDuty, Math.round((ordinary * 2) / 3));

    const twoThirdReduction = computeTransferDuty({ state: "SA", contractDate: "2017-07-01", dutiableValue: cents(1_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "TRUST" } });
    assert.equal(twoThirdReduction.baseDuty, Math.round(ordinary / 3));

    const nil = computeTransferDuty({ state: "SA", contractDate: "2018-07-01", dutiableValue: cents(1_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "TRUST" } });
    assert.equal(nil.baseDuty, 0);

    // IC103 worked example: contracts dated 10 Dec 2022, residential $1.2m + retail complex $1m = $2.2m;
    // duty on $2.2m = $114,830. Residential share $1.2m / $2.2m x $114,830 = $62,634.545..., rounded to $62,634.55.
    const mixed = computeTransferDuty({
      state: "SA",
      contractDate: "2022-12-10",
      dutiableValue: cents(2_200_000),
      residentialDutiableValue: cents(1_200_000),
      propertyKind: "MIXED",
      purchaser: { kind: "COMPANY" },
    });
    assert.equal(saConveyanceDuty(cents(2_200_000)), cents(114_830));
    assert.equal(mixed.baseDuty, cents(62_634.55));
  });

  test("SA foreign ownership surcharge is 7% on residential land from 1 January 2018, including Part 4 landholder acquisitions", () => {
    // RevenueSA foreign ownership surcharge pages:
    // https://www.revenuesa.sa.gov.au/stamp-duty/foreign-ownership-surcharge
    // https://www.revenuesa.sa.gov.au/stamp-duty/foreign-ownership-surcharge/applicable-transactions
    // Official text: 7% from 1 Jan 2018 on acquisitions of interests in residential land, including prescribed interests in land holding entities.
    const before = computeTransferDuty({
      state: "SA",
      contractDate: "2017-12-31",
      dutiableValue: cents(1_000_000),
      propertyKind: "RESIDENTIAL",
      purchaser: { kind: "COMPANY", foreignPerson: true },
    });
    assert.equal(before.foreignSurchargeDuty, 0);

    const transfer = computeTransferDuty({
      state: "SA",
      contractDate: "2018-01-01",
      dutiableValue: cents(1_000_000),
      propertyKind: "RESIDENTIAL",
      purchaser: { kind: "COMPANY", foreignPerson: true },
    });
    assert.equal(transfer.foreignSurchargeDuty, cents(70_000));

    const mixed = computeTransferDuty({
      state: "SA",
      contractDate: "2026-10-19",
      dutiableValue: cents(2_000_000),
      residentialDutiableValue: cents(500_000),
      propertyKind: "MIXED",
      purchaser: { kind: "TRUST", trustWithForeignBeneficiaries: true },
    });
    assert.equal(mixed.foreignSurchargeDuty, cents(35_000));

    const landholder = computeLandholderDuty({
      state: "SA",
      acquisitionDate: "2026-10-19",
      landholderKind: "PRIVATE_UNIT_TRUST",
      landholdingsValue: cents(2_000_000),
      residentialLandValue: cents(800_000),
      acquiredInterestBps: 7_500,
      foreignAcquirer: true,
    });
    assert.equal(landholder.foreignSurchargeDuty, cents(42_000), "75% x $800,000 x 7%");
  });

  test("SA landholder duty is residential-land only after 1 July 2018 and all-land with phase-out before then", () => {
    // RevenueSA land holder page:
    // https://www.revenuesa.sa.gov.au/stamp-duty/land-holder
    // From 1 July 2018, Part 4 applies only to residential/primary-production land; entities holding only qualifying land have no duty.
    const qualifyingOnly = computeLandholderDuty({
      state: "SA",
      acquisitionDate: "2026-10-19",
      landholderKind: "PRIVATE_COMPANY",
      landholdingsValue: cents(5_000_000),
      residentialLandValue: 0,
      acquiredInterestBps: 10_000,
    });
    assert.equal(qualifyingOnly.relevantAcquisition, false);
    assert.equal(qualifyingOnly.totalDuty, 0);

    // Private company/unit trust prescribed interest is 50%; listed/public is 90% per RevenueSA guide to legislation.
    const belowThreshold = computeLandholderDuty({
      state: "SA",
      acquisitionDate: "2026-10-19",
      landholderKind: "PRIVATE_UNIT_TRUST",
      landholdingsValue: cents(5_000_000),
      residentialLandValue: cents(850_000),
      acquiredInterestBps: 4_999,
    });
    assert.equal(belowThreshold.relevantAcquisition, false);

    // 75% of $850,000 residential land = $637,500; duty = $21,330 + ceil(($637,500 - $500,000)/$100) x $5.50 = $28,892.50.
    const residential = computeLandholderDuty({
      state: "SA",
      acquisitionDate: "2026-10-19",
      landholderKind: "PRIVATE_UNIT_TRUST",
      landholdingsValue: cents(5_000_000),
      residentialLandValue: cents(850_000),
      acquiredInterestBps: 7_500,
    });
    assert.equal(residential.relevantAcquisition, true);
    assert.equal(residential.dutiableValue, cents(637_500));
    assert.equal(residential.baseDuty, saConveyanceDuty(cents(637_500)));

    // IC103 treats notional acquisitions under Part 4 as conveyances/transfers for qualifying-land phase-out purposes.
    // Pre-1 July 2018, all land value is in scope with the same 1/3 reduction period: 60% of $2m = $1.2m;
    // ordinary duty $59,830; one-third reduction leaves 2/3 payable = $39,886.67.
    const pre2018 = computeLandholderDuty({
      state: "SA",
      acquisitionDate: "2016-06-30",
      landholderKind: "PRIVATE_COMPANY",
      landholdingsValue: cents(2_000_000),
      residentialLandValue: 0,
      acquiredInterestBps: 6_000,
    });
    assert.equal(pre2018.dutiableValue, cents(1_200_000));
    assert.equal(pre2018.baseDuty, Math.round((saConveyanceDuty(cents(1_200_000)) * 2) / 3));
  });