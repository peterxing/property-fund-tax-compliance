import test from "node:test";
import assert from "node:assert/strict";

import { computeLandTax } from "../../../src/engine/au/landTax.ts";
import { AU_MODELLED_LAND_TAX_STATES, AU_MODELLED_TRANSFER_DUTY_STATES, AU_STATE_TAX_CATALOGUE } from "../../../src/engine/au/stateCatalogue.ts";
import { computeLandholderDuty, computeTransferDuty } from "../../../src/engine/au/transferDuty.ts";

test("NSW transfer duty matches Revenue NSW current and 2025-26 published tables", () => {
  // Revenue NSW current transfer-duty table and premium-duty table:
  // https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/understanding-transfer-duty/calculate-transfer-duty
  // fetched 2026-10-10, lines 256-281 and 309-315.
  // Revenue NSW past premium table:
  // https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/understanding-transfer-duty/calculate-transfer-duty/past-thresholds-and-rates
  // fetched 2026-10-10, lines 551-555.
  const currentCases = [
    { valueDollars: 1, expectedBaseDuty: 2_000 },
    { valueDollars: 17_999, expectedBaseDuty: 22_400 },
    { valueDollars: 18_000, expectedBaseDuty: 22_500 },
    { valueDollars: 18_001, expectedBaseDuty: 22_500 },
    { valueDollars: 37_999, expectedBaseDuty: 52_400 },
    { valueDollars: 38_000, expectedBaseDuty: 52_500 },
    { valueDollars: 38_001, expectedBaseDuty: 52_500 },
    { valueDollars: 102_999, expectedBaseDuty: 166_200 },
    { valueDollars: 103_000, expectedBaseDuty: 166_200 },
    { valueDollars: 103_001, expectedBaseDuty: 166_200 },
    { valueDollars: 386_999, expectedBaseDuty: 1_160_100 },
    { valueDollars: 387_000, expectedBaseDuty: 1_160_200 },
    { valueDollars: 387_001, expectedBaseDuty: 1_160_200 },
    { valueDollars: 1_000_000, expectedBaseDuty: 3_918_700 },
    { valueDollars: 1_290_000, expectedBaseDuty: 5_223_700 },
    { valueDollars: 1_290_001, expectedBaseDuty: 5_223_700 },
    { valueDollars: 4_000_000, expectedBaseDuty: 20_323_700 },
    { valueDollars: 5_000_000, expectedBaseDuty: 27_323_700 },
    { valueDollars: 20_000_000, expectedBaseDuty: 132_323_700 },
  ] as const;

  for (const item of currentCases) {
    const actual = computeTransferDuty({
      state: "NSW",
      contractDate: "2026-10-10",
      dutiableValue: item.valueDollars * 100,
      propertyKind: "RESIDENTIAL",
      purchaser: { kind: "INDIVIDUAL" },
    });
    assert.equal(actual.baseDuty, item.expectedBaseDuty, `NSW 2026-10-10 base duty for A$${item.valueDollars.toLocaleString("en-AU")}`);
  }

  const historicGeneral = computeTransferDuty({
    state: "NSW",
    contractDate: "2026-06-30",
    dutiableValue: 1_000_000_00,
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "INDIVIDUAL" },
  });
  assert.equal(historicGeneral.baseDuty, 3_941_200, "NSW 2025-26 duty on A$1,000,000 should use the past table");

  const historicPremium = computeTransferDuty({
    state: "NSW",
    contractDate: "2025-10-10",
    dutiableValue: 4_000_000_00,
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "INDIVIDUAL" },
  });
  assert.equal(historicPremium.baseDuty, 20_619_700, "NSW 2025-10-10 premium duty on A$4,000,000 should use the 1 July 2025 table");

  // Revenue NSW surcharge purchaser duty page:
  // https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/surcharge-purchaser-duty/what-is-surcharge-purchaser-duty
  // fetched 2026-10-10, lines 248-264.
  const foreignBuyer = computeTransferDuty({
    state: "NSW",
    contractDate: "2026-10-10",
    dutiableValue: 1_000_000_00,
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "INDIVIDUAL", foreignPerson: true },
  });
  assert.equal(foreignBuyer.baseDuty, 3_918_700);
  assert.equal(foreignBuyer.foreignSurchargeDuty, 9_000_000);
  assert.equal(foreignBuyer.totalDuty, 12_918_700);
});

test("VIC transfer duty and FPAD match SRO published rates", () => {
  // SRO VIC current non-PPR table:
  // https://www.sro.vic.gov.au/about-us/rates-and-statistics/current-rates/land-transfer-duty-non-principal-place-residence-current-rates
  // fetched 2026-10-10, lines 22-38.
  // Premium duty page:
  // https://www.sro.vic.gov.au/about-us/rates-and-statistics/current-rates/premium-duty-rate-agreements-or-arrangements-entered-or-after-1-july-2021
  // fetched 2026-10-10, lines 10-16.
  const cases = [
    { valueDollars: 1, expectedBaseDuty: 1 },
    { valueDollars: 24_999, expectedBaseDuty: 34_999 },
    { valueDollars: 25_000, expectedBaseDuty: 35_000 },
    { valueDollars: 25_001, expectedBaseDuty: 35_002 },
    { valueDollars: 129_999, expectedBaseDuty: 286_998 },
    { valueDollars: 130_000, expectedBaseDuty: 287_000 },
    { valueDollars: 130_001, expectedBaseDuty: 287_006 },
    { valueDollars: 959_999, expectedBaseDuty: 5_266_994 },
    { valueDollars: 960_000, expectedBaseDuty: 5_267_000 },
    { valueDollars: 960_001, expectedBaseDuty: 5_280_006 },
    { valueDollars: 1_000_000, expectedBaseDuty: 5_500_000 },
    { valueDollars: 2_000_000, expectedBaseDuty: 11_000_000 },
    { valueDollars: 2_000_001, expectedBaseDuty: 11_000_007 },
    { valueDollars: 5_000_000, expectedBaseDuty: 30_500_000 },
    { valueDollars: 20_000_000, expectedBaseDuty: 128_000_000 },
  ] as const;

  for (const item of cases) {
    const actual = computeTransferDuty({
      state: "VIC",
      contractDate: "2026-10-10",
      dutiableValue: item.valueDollars * 100,
      propertyKind: "RESIDENTIAL",
      purchaser: { kind: "INDIVIDUAL" },
    });
    assert.equal(actual.baseDuty, item.expectedBaseDuty, `VIC 2026-10-10 base duty for A$${item.valueDollars.toLocaleString("en-AU")}`);
  }

  // SRO VIC FPAD current rates:
  // https://www.sro.vic.gov.au/about-us/rates-and-statistics/current-rates/foreign-purchaser-additional-duty-current-rates
  // fetched 2026-10-10, lines 10-16.
  const foreignBuyer = computeTransferDuty({
    state: "VIC",
    contractDate: "2026-10-10",
    dutiableValue: 1_000_000_00,
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "INDIVIDUAL", foreignPerson: true },
  });
  assert.equal(foreignBuyer.baseDuty, 5_500_000);
  assert.equal(foreignBuyer.foreignSurchargeDuty, 8_000_000);
  assert.equal(foreignBuyer.totalDuty, 13_500_000);
});

test("QLD transfer duty and AFAD match QRO published rates", () => {
  // QRO transfer-duty rates:
  // https://qro.qld.gov.au/duties/transfer-duty/calculate/rates/
  // fetched 2026-10-10, lines 72-108.
  // QRO AFAD overview:
  // https://qro.qld.gov.au/duties/investors/afad/
  // fetched 2026-10-10, lines 14-16.
  const cases = [
    { valueDollars: 1, expectedBaseDuty: 0 },
    { valueDollars: 5_000, expectedBaseDuty: 0 },
    { valueDollars: 5_001, expectedBaseDuty: 150 },
    { valueDollars: 74_999, expectedBaseDuty: 105_000 },
    { valueDollars: 75_000, expectedBaseDuty: 105_000 },
    { valueDollars: 75_001, expectedBaseDuty: 105_350 },
    { valueDollars: 539_999, expectedBaseDuty: 1_732_500 },
    { valueDollars: 540_000, expectedBaseDuty: 1_732_500 },
    { valueDollars: 540_001, expectedBaseDuty: 1_732_950 },
    { valueDollars: 1_000_000, expectedBaseDuty: 3_802_500 },
    { valueDollars: 1_000_001, expectedBaseDuty: 3_803_075 },
    { valueDollars: 5_000_000, expectedBaseDuty: 26_802_500 },
    { valueDollars: 20_000_000, expectedBaseDuty: 113_052_500 },
  ] as const;

  for (const item of cases) {
    const actual = computeTransferDuty({
      state: "QLD",
      contractDate: "2026-10-10",
      dutiableValue: item.valueDollars * 100,
      propertyKind: "RESIDENTIAL",
      purchaser: { kind: "INDIVIDUAL" },
    });
    assert.equal(actual.baseDuty, item.expectedBaseDuty, `QLD 2026-10-10 base duty for A$${item.valueDollars.toLocaleString("en-AU")}`);
  }

  const foreignBuyer = computeTransferDuty({
    state: "QLD",
    contractDate: "2026-10-10",
    dutiableValue: 1_000_000_00,
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "INDIVIDUAL", foreignPerson: true },
  });
  assert.equal(foreignBuyer.baseDuty, 3_802_500);
  assert.equal(foreignBuyer.foreignSurchargeDuty, 8_000_000);
  assert.equal(foreignBuyer.totalDuty, 11_802_500);
});

test("NSW land tax matches Revenue NSW thresholds, trust example and surcharge examples", () => {
  // Revenue NSW land-tax thresholds/rates:
  // https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/thresholds-and-rates
  // fetched 2026-10-10, lines 232-334.
  const belowThreshold = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 1_074_999_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(belowThreshold.totalTax, 0);

  const atThreshold = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 1_075_000_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(atThreshold.totalTax, 0);

  const oneDollarAboveThreshold = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 1_075_001_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(oneDollarAboveThreshold.totalTax, 10_002);

  const onePointOneMillion = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 1_100_000_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(onePointOneMillion.totalTax, 50_000);

  const atPremiumThreshold = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 6_571_000_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(atPremiumThreshold.totalTax, 8_803_600);

  const oneDollarAbovePremium = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 6_571_001_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(oneDollarAbovePremium.totalTax, 8_803_602);

  // Revenue NSW trust page:
  // https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/types-of-landowners/trusts
  // fetched 2026-10-10, lines 197-205 and 222-243.
  const specialTrust = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [{ id: "f", taxableLandValue: 600_000_00 }],
    owner: { kind: "SPECIAL_TRUST" },
  });
  assert.equal(specialTrust.totalTax, 960_000);

  // Revenue NSW surcharge page:
  // https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/surcharge-land-tax/what-is-surcharge-land-tax
  // fetched 2026-10-10, lines 301-317, 360-378 and 411-462.
  const foreignResidential = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 1_200_000_00, residential: true }],
    owner: { kind: "INDIVIDUAL", foreign: true },
  });
  assert.equal(foreignResidential.generalTax, 210_000);
  assert.equal(foreignResidential.surchargeTax, 6_000_000);
  assert.equal(foreignResidential.totalTax, 6_210_000);

  const foreignSingleResidential = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 500_000_00, residential: true }],
    owner: { kind: "INDIVIDUAL", foreign: true },
  });
  assert.equal(foreignSingleResidential.generalTax, 0);
  assert.equal(foreignSingleResidential.surchargeTax, 2_500_000);
  assert.equal(foreignSingleResidential.totalTax, 2_500_000);

  const foreignMixed = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [
      { id: "d", taxableLandValue: 500_000_00, residential: true },
      { id: "e", taxableLandValue: 700_000_00, residential: false },
    ],
    owner: { kind: "INDIVIDUAL", foreign: true },
  });
  assert.equal(foreignMixed.generalTax, 210_000);
  assert.equal(foreignMixed.surchargeTax, 2_500_000);
  assert.equal(foreignMixed.totalTax, 2_710_000);
  assert.deepEqual(
    foreignMixed.properties.map((item) => ({ id: item.id, totalTax: item.totalTax })),
    [
      { id: "d", totalTax: 2_587_500 },
      { id: "e", totalTax: 122_500 },
    ],
  );

  const foreignHalfShare = computeLandTax({
    state: "NSW",
    assessmentYear: 2026,
    holdings: [{ id: "joint", taxableLandValue: 2_100_000_00, surchargeableValue: 1_050_000_00 }],
    owner: { kind: "INDIVIDUAL", foreign: true },
  });
  assert.equal(foreignHalfShare.generalTax, 1_650_000);
  assert.equal(foreignHalfShare.surchargeTax, 5_250_000);
  assert.equal(foreignHalfShare.totalTax, 6_900_000);

  const year2023 = computeLandTax({
    state: "NSW",
    assessmentYear: 2023,
    holdings: [{ id: "a", taxableLandValue: 1_200_000_00, residential: true }],
    owner: { kind: "INDIVIDUAL", foreign: true },
  });
  assert.equal(year2023.generalTax, 379_600);
  assert.equal(year2023.surchargeTax, 4_800_000);
  assert.equal(year2023.totalTax, 5_179_600);
});

test("VIC land tax matches SRO current tables, trust table and worked apportionment example", () => {
  // SRO current rates:
  // https://www.sro.vic.gov.au/about-us/rates-and-statistics/current-rates/land-tax-current-rates
  // fetched 2026-10-10, lines 16-43, 51-81, 89-116 and 124-154.
  const below50k = computeLandTax({
    state: "VIC",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 49_999_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(below50k.totalTax, 0);

  const at50k = computeLandTax({
    state: "VIC",
    assessmentDate: "2026-10-10",
    holdings: [{ id: "a", taxableLandValue: 50_000_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(at50k.totalTax, 50_000);

  const at100k = computeLandTax({
    state: "VIC",
    assessmentDate: "2025-10-10",
    holdings: [{ id: "a", taxableLandValue: 100_000_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(at100k.totalTax, 97_500);

  const at300k = computeLandTax({
    state: "VIC",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 300_000_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(at300k.totalTax, 135_000);

  const at600k = computeLandTax({
    state: "VIC",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 600_000_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(at600k.totalTax, 225_000);

  // SRO worked example:
  // https://www.sro.vic.gov.au/owning-property/land-tax/new-land-tax/example-land-tax-calculation
  // fetched 2026-10-10, lines 22-52.
  const anika = computeLandTax({
    state: "VIC",
    assessmentYear: 2026,
    holdings: [
      { id: "ballarat", taxableLandValue: 620_000_00 },
      { id: "bright", taxableLandValue: 480_000_00 },
    ],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(anika.generalTax, 555_000);
  assert.equal(anika.totalTax, 555_000);
  assert.deepEqual(
    anika.properties.map((item) => ({ id: item.id, totalTax: item.totalTax })),
    [
      { id: "ballarat", totalTax: 312_818 },
      { id: "bright", totalTax: 242_182 },
    ],
  );

  const trust25k = computeLandTax({
    state: "VIC",
    assessmentYear: 2026,
    holdings: [{ id: "t", taxableLandValue: 25_000_00 }],
    owner: { kind: "TRUST" },
  });
  assert.equal(trust25k.totalTax, 8_200);

  const trust50k = computeLandTax({
    state: "VIC",
    assessmentYear: 2026,
    holdings: [{ id: "t", taxableLandValue: 50_000_00 }],
    owner: { kind: "TRUST" },
  });
  assert.equal(trust50k.totalTax, 67_600);

  const absentee50k = computeLandTax({
    state: "VIC",
    assessmentYear: 2026,
    holdings: [{ id: "a", taxableLandValue: 50_000_00 }],
    owner: { kind: "INDIVIDUAL", absentee: true },
  });
  assert.equal(absentee50k.generalTax, 50_000);
  assert.equal(absentee50k.surchargeTax, 200_000);
  assert.equal(absentee50k.totalTax, 250_000);

  // SRO trust page:
  // https://www.sro.vic.gov.au/owning-property/land-tax/companies-and-trusts/trusts-and-land-tax
  // fetched 2026-10-10, lines 66-90.
  const absenteeTrust25k = computeLandTax({
    state: "VIC",
    assessmentYear: 2026,
    holdings: [{ id: "t", taxableLandValue: 25_000_00 }],
    owner: { kind: "TRUST", absentee: true },
  });
  assert.equal(absenteeTrust25k.generalTax, 8_200);
  assert.equal(absenteeTrust25k.surchargeTax, 100_000);
  assert.equal(absenteeTrust25k.totalTax, 108_200);
});

test("QLD land tax matches QRO owner-specific tables, examples and apportionment", () => {
  // QRO individual / company-trust / absentee / foreign-company-trust pages:
  // https://qro.qld.gov.au/land-tax/calculate/individual/ lines 57-116
  // https://qro.qld.gov.au/land-tax/calculate/company-trust/ lines 43-107 and 129-169
  // https://qro.qld.gov.au/land-tax/calculate/absentee/ lines 59-107
  // https://qro.qld.gov.au/land-tax/calculate/foreign-company-trust/ lines 45-111
  // all fetched 2026-10-10.
  const below600k = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 599_999_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(below600k.totalTax, 0);

  const at600k = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 600_000_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(at600k.totalTax, 50_000);

  const example680k = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 680_000_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(example680k.totalTax, 130_000);

  const example64mIndividual = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 6_400_000_00 }],
    owner: { kind: "INDIVIDUAL" },
  });
  assert.equal(example64mIndividual.totalTax, 8_700_000);

  const below350kCompany = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 349_999_00 }],
    owner: { kind: "COMPANY" },
  });
  assert.equal(below350kCompany.totalTax, 0);

  const example760kCompany = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 760_000_00 }],
    owner: { kind: "COMPANY" },
  });
  assert.equal(example760kCompany.totalTax, 842_000);

  const example64mCompany = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 6_400_000_00 }],
    owner: { kind: "COMPANY" },
  });
  assert.equal(example64mCompany.totalTax, 10_650_000);

  const specialDisabilityTrust = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 680_000_00 }],
    owner: { kind: "TRUST", specialDisabilityTrust: true },
  });
  assert.equal(specialDisabilityTrust.totalTax, 130_000);

  const absentee400k = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 400_000_00 }],
    owner: { kind: "INDIVIDUAL", absentee: true },
  });
  assert.equal(absentee400k.generalTax, 230_000);
  assert.equal(absentee400k.surchargeTax, 150_000);
  assert.equal(absentee400k.totalTax, 380_000);

  const foreignTrust400k = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [{ id: "a", taxableLandValue: 400_000_00 }],
    owner: { kind: "TRUST", foreign: true },
  });
  assert.equal(foreignTrust400k.generalTax, 230_000);
  assert.equal(foreignTrust400k.surchargeTax, 150_000);
  assert.equal(foreignTrust400k.totalTax, 380_000);

  const companyTwoHoldings = computeLandTax({
    state: "QLD",
    assessmentDate: "2026-06-30",
    holdings: [
      { id: "a", taxableLandValue: 400_000_00 },
      { id: "b", taxableLandValue: 600_000_00 },
    ],
    owner: { kind: "COMPANY" },
  });
  assert.equal(companyTwoHoldings.generalTax, 1_250_000);
  assert.deepEqual(
    companyTwoHoldings.properties.map((item) => ({ id: item.id, totalTax: item.totalTax })),
    [
      { id: "a", totalTax: 500_000 },
      { id: "b", totalTax: 750_000 },
    ],
  );
});

test("NSW landholder duty current direct-acquisition formulas align with Revenue NSW guidance", () => {
  // Revenue NSW landholder overview/liability/calculation pages:
  // https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/landholder-duty/what-is-landholder-duty lines 163-180
  // https://www.revenue.nsw.gov.au/property-professionals-resource-centre/guides-rulings-cpns/topics/landholder-duty/calculating-landholder-duty lines 187-204
  // fetched 2026-10-10.
  const privateCompany = computeLandholderDuty({
    state: "NSW",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_COMPANY",
    landholdingsValue: 3_000_000_00,
    acquiredInterestBps: 6_000,
  });
  assert.equal(privateCompany.relevantAcquisition, true);
  assert.equal(privateCompany.dutiableValue, 1_800_000_00);
  assert.equal(privateCompany.baseDuty, 8_028_700);

  const publicLandholder = computeLandholderDuty({
    state: "NSW",
    acquisitionDate: "2026-10-10",
    landholderKind: "PUBLIC_LANDHOLDER",
    landholdingsValue: 3_000_000_00,
    acquiredInterestBps: 9_500,
  });
  assert.equal(publicLandholder.relevantAcquisition, true);
  assert.equal(publicLandholder.dutiableValue, 3_000_000_00);
  assert.equal(publicLandholder.baseDuty, 14_628_700);
});

test("VIC landholder duty matches SRO private and public worked examples", () => {
  // SRO landholder examples page:
  // https://www.sro.vic.gov.au/buying-property/landholder-duty/examples-landholder-duty-calculations
  // fetched 2026-10-10, lines 46-58 and 136-158.
  const privateLandholder = computeLandholderDuty({
    state: "VIC",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_COMPANY",
    landholdingsValue: 10_000_000_00,
    acquiredInterestBps: 7_000,
  });
  assert.equal(privateLandholder.dutiableValue, 7_000_000_00);
  assert.equal(privateLandholder.baseDuty, 43_500_000);

  const publicLandholder = computeLandholderDuty({
    state: "VIC",
    acquisitionDate: "2026-10-10",
    landholderKind: "PUBLIC_LANDHOLDER",
    landholdingsValue: 20_000_000_00,
    acquiredInterestBps: 9_500,
  });
  assert.equal(publicLandholder.baseDuty, 12_800_000);
});

test("VIC landholder duty should apply the published phasing formula between A$1m and A$2m", () => {
  // SRO phasing formula:
  // https://www.sro.vic.gov.au/buying-property/landholder-duty/examples-landholder-duty-calculations
  // fetched 2026-10-10, lines 168-174.
  // For A = A$1.5m and a 50% private-company acquisition:
  // dutiable value = A$750,000 and B = A$40,070 from the current transfer-duty table
  // (SRO non-PPR rates page lines 22-38), so duty = ((1.5m - 1m) / 1m) x 40,070 = A$20,035.
  const phased = computeLandholderDuty({
    state: "VIC",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_COMPANY",
    landholdingsValue: 1_500_000_00,
    acquiredInterestBps: 5_000,
  });
  assert.equal(phased.baseDuty, 2_003_500);
});

test("VIC foreign landholder acquisitions should include FPAD on the residential share", () => {
  // SRO FPAD guidance:
  // https://www.sro.vic.gov.au/buying-property/foreign-purchasers-property/understanding-foreign-purchaser-additional-duty
  // fetched 2026-10-10, lines 102-122.
  // The page says FPAD is 8% and, for a relevant acquisition in a landholder, it applies to the residential share only.
  // Using the SRO private-landholder example (A$10m landholdings, 70% interest: A$435,000 base duty at lines 46-58),
  // a fully residential landholding gives FPAD of 8% x A$7m = A$560,000; total duty = A$995,000.
  const foreignPrivate = computeLandholderDuty({
    state: "VIC",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_COMPANY",
    landholdingsValue: 10_000_000_00,
    acquiredInterestBps: 7_000,
    residentialLandValue: 10_000_000_00,
    foreignAcquirer: true,
  });
  assert.equal(foreignPrivate.baseDuty, 43_500_000);
  assert.equal(foreignPrivate.foreignSurchargeDuty, 56_000_000);
  assert.equal(foreignPrivate.totalDuty, 99_500_000);
});

test("QLD landholder duty and AFAD match QRO worked examples", () => {
  // QRO landholder/AFAD pages:
  // https://qro.qld.gov.au/duties/investors/landholder/relevant-acquisitions/ lines 64-124
  // https://qro.qld.gov.au/duties/investors/landholder/calculating/ lines 40-126
  // https://qro.qld.gov.au/duties/investors/landholder/afad/ lines 72-112
  // fetched 2026-10-10.
  const privateLandholder = computeLandholderDuty({
    state: "QLD",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_COMPANY",
    landholdingsValue: 2_800_000_00,
    acquiredInterestBps: 6_000,
  });
  assert.equal(privateLandholder.dutiableValue, 1_680_000_00);
  assert.equal(privateLandholder.baseDuty, 7_712_500);

  const publicLandholder = computeLandholderDuty({
    state: "QLD",
    acquisitionDate: "2026-10-10",
    landholderKind: "PUBLIC_LANDHOLDER",
    landholdingsValue: 10_000_000_00,
    acquiredInterestBps: 9_500,
  });
  assert.equal(publicLandholder.baseDuty, 5_555_250);

  const privateAfad = computeLandholderDuty({
    state: "QLD",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_COMPANY",
    landholdingsValue: 2_800_000_00,
    acquiredInterestBps: 6_000,
    residentialLandValue: 1_000_000_00,
    foreignAcquirer: true,
  });
  assert.equal(privateAfad.baseDuty, 7_712_500);
  assert.equal(privateAfad.foreignSurchargeDuty, 4_800_000);
  assert.equal(privateAfad.totalDuty, 12_512_500);

  const publicAfad = computeLandholderDuty({
    state: "QLD",
    acquisitionDate: "2026-10-10",
    landholderKind: "PUBLIC_LANDHOLDER",
    landholdingsValue: 200_000_000_00,
    acquiredInterestBps: 9_000,
    residentialLandValue: 50_000_000_00,
    foreignAcquirer: true,
  });
  assert.equal(publicAfad.baseDuty, 114_805_250);
  assert.equal(publicAfad.foreignSurchargeDuty, 40_000_000);
  assert.equal(publicAfad.totalDuty, 154_805_250);
});

test("NOT_MODELLED states are excluded from modelled catalogues and throw clear errors", () => {
  assert.deepEqual(
    AU_MODELLED_TRANSFER_DUTY_STATES.map((item) => item.id),
    ["NSW", "VIC", "QLD"],
  );
  assert.deepEqual(
    AU_MODELLED_LAND_TAX_STATES.map((item) => item.id),
    ["NSW", "VIC", "QLD"],
  );

  const notModelled = AU_STATE_TAX_CATALOGUE.filter((entry) => entry.transferDutyCoverage === "NOT_MODELLED").map((entry) => entry.state);
  assert.deepEqual(notModelled, ["WA", "SA", "TAS", "ACT", "NT"]);

  assert.throws(
    () => computeTransferDuty({
      state: "WA",
      contractDate: "2026-10-10",
      dutiableValue: 1_000_000_00,
      propertyKind: "RESIDENTIAL",
      purchaser: { kind: "INDIVIDUAL" },
    }),
    /Transfer duty is not modelled for WA/,
  );

  assert.throws(
    () => computeLandTax({
      state: "WA",
      assessmentYear: 2026,
      holdings: [{ id: "a", taxableLandValue: 1_000_000_00 }],
      owner: { kind: "INDIVIDUAL" },
    }),
    /Land tax is not modelled for WA/,
  );
});
