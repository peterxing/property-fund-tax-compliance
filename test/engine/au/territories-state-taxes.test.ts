import assert from "node:assert/strict";
import test from "node:test";

import { computeLandTax } from "../../../src/engine/au/landTax.ts";
import { AU_MODELLED_LAND_TAX_STATES, AU_MODELLED_TRANSFER_DUTY_STATES, AU_STATE_TAX_CATALOGUE } from "../../../src/engine/au/stateCatalogue.ts";
import { computeTransferDuty } from "../../../src/engine/au/transferDuty.ts";

const D = (dollars: number): number => Math.round(dollars * 100);

test("TAS transfer duty and FIDS match SRO Tasmania current tables and boundaries", () => {
  // SRO Tasmania rates of duty and FIDS rates, fetched 2026-10-19:
  // https://www.sro.tas.gov.au/property-transfer-duties/rates-of-duty
  // https://www.sro.tas.gov.au/property-transfer-duties/foreign-investor-duty-surcharge/rates-of-surcharge
  const cases = [
    { value: 1, duty: 50 },
    { value: 3_000, duty: 50 },
    { value: 3_001, duty: 51.75 },
    { value: 25_000, duty: 435 },
    { value: 25_001, duty: 437.25 },
    { value: 75_000, duty: 1_560 },
    { value: 75_001, duty: 1_563.50 },
    { value: 200_000, duty: 5_935 },
    { value: 375_000, duty: 12_935 },
    { value: 725_000, duty: 27_810 },
    { value: 1_000_000, duty: 40_185 },
  ] as const;
  for (const item of cases) {
    const actual = computeTransferDuty({
      state: "TAS",
      contractDate: "2026-10-19",
      dutiableValue: D(item.value),
      propertyKind: "RESIDENTIAL",
      purchaser: { kind: "COMPANY" },
    });
    assert.equal(actual.baseDuty, D(item.duty), `TAS duty for A$${item.value.toLocaleString("en-AU")}`);
  }

  const foreign = computeTransferDuty({
    state: "TAS",
    contractDate: "2026-10-19",
    dutiableValue: D(1_000_000),
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "TRUST", foreignPerson: true },
  });
  assert.equal(foreign.baseDuty, D(40_185));
  assert.equal(foreign.foreignSurchargeDuty, D(80_000));
  assert.equal(foreign.totalDuty, D(120_185));
  assert.equal(foreign.ruleVersion, "tas.transfer.2013-10-21+tas.surcharge.2020-04-01");
});

test("TAS land tax and foreign investor land tax surcharge match SRO Tasmania current rates", () => {
  // SRO Tasmania land tax and FILTS pages, fetched 2026-10-19:
  // https://www.sro.tas.gov.au/land-tax/rates-of-land-tax
  // https://www.sro.tas.gov.au/land-tax/foreign-investor-land-tax-surcharge/rate-of-surcharge
  const boundary = (value: number) =>
    computeLandTax({
      state: "TAS",
      assessmentYear: 2026,
      holdings: [{ id: "tas", taxableLandValue: D(value), residential: true }],
      owner: { kind: "COMPANY" },
    }).generalTax;
  assert.equal(boundary(124_999), 0);
  assert.equal(boundary(125_000), D(50));
  assert.equal(boundary(125_100), D(50.45));
  assert.equal(boundary(500_000), D(1_737.50));
  assert.equal(boundary(600_000), D(3_237.50));

  const foreign = computeLandTax({
    state: "TAS",
    assessmentYear: 2026,
    holdings: [{ id: "tas", taxableLandValue: D(600_000), residential: true }],
    owner: { kind: "COMPANY", foreign: true },
  });
  assert.equal(foreign.generalTax, D(3_237.50));
  assert.equal(foreign.surchargeTax, D(12_000));
  assert.equal(foreign.totalTax, D(15_237.50));
  assert.equal(foreign.ruleVersion, "tas.land-tax.general.2025-07-01+tas.land-tax.foreign.2025-07-01");
});

test("ACT conveyance duty models residential rates, commercial phase-out and no foreign purchaser surcharge", () => {
  // ACT Revenue Office calculator data, fetched 2026-10-19:
  // https://www.revenue.act.gov.au/site-configuration/calculators/apis/conveyance-duty-2026-27
  const residential = computeTransferDuty({
    state: "ACT",
    contractDate: "2026-10-19",
    dutiableValue: D(1_000_000),
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "COMPANY", foreignPerson: true },
  });
  assert.equal(residential.baseDuty, D(36_950));
  assert.equal(residential.foreignSurchargeDuty, 0);
  assert.equal(residential.totalDuty, D(36_950));
  assert.equal(residential.ruleVersion, "act.transfer.residential.2022-07-01");

  const commercial2025 = computeTransferDuty({
    state: "ACT",
    contractDate: "2025-10-19",
    dutiableValue: D(2_500_000),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(commercial2025.baseDuty, D(25_000));
  assert.equal(commercial2025.ruleVersion, "act.transfer.commercial.2025-07-01");

  const commercial2026Threshold = computeTransferDuty({
    state: "ACT",
    contractDate: "2026-10-19",
    dutiableValue: D(2_100_000),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(commercial2026Threshold.baseDuty, 0);
});

test("ACT land tax applies to residential AUV, adds foreign surcharge and returns cited nil for commercial land", () => {
  // ACT Revenue Office land tax pages, fetched 2026-10-19:
  // https://www.revenue.act.gov.au/rates-and-property-charges/land-tax/about-land-tax
  // https://www.revenue.act.gov.au/rates-and-property-charges/land-tax/how-land-tax-is-calculated
  // https://www.revenue.act.gov.au/rates-and-property-charges/land-tax/foreign-ownership-surcharge-for-land-tax
  // 2025-26: Taxation Administration (Amounts Payable—Land Tax) Determination 2025 (DI2025-153), s 6: FC $1,693, same rate table.
  // Land-tax year 2026 is 2025-26: $1,693 + ($1,610 + 1.24% x $25,000 = $1,920) = $3,613; surcharge 0.75% x $300,000 = $2,250.
  const residential = computeLandTax({
    state: "ACT",
    assessmentYear: 2026,
    holdings: [{ id: "act-res", taxableLandValue: D(300_000), residential: true }],
    owner: { kind: "TRUST", foreign: true },
  });
  assert.equal(residential.generalTax, D(3_613));
  assert.equal(residential.surchargeTax, D(2_250));
  assert.equal(residential.totalTax, D(5_863));
  assert.equal(residential.ruleVersion, "act.land-tax.residential.2025-07-01+act.land-tax.foreign.2018-07-01");

  // Land-tax year 2027 is 2026-27: fixed charge $1,778 from 1 July 2026, marginal rates unchanged.
  const residential2027 = computeLandTax({
    state: "ACT",
    assessmentYear: 2027,
    holdings: [{ id: "act-res", taxableLandValue: D(300_000), residential: true }],
    owner: { kind: "TRUST", foreign: true },
  });
  assert.equal(residential2027.generalTax, D(3_698));
  assert.equal(residential2027.totalTax, D(5_948));
  assert.equal(residential2027.ruleVersion, "act.land-tax.residential.2026-07-01+act.land-tax.foreign.2018-07-01");

  // Quarterly assessment dates map to the financial year they fall in.
  for (const [assessmentDate, fixedCharge] of [["2025-07-01", 1_693], ["2026-06-30", 1_693], ["2026-07-01", 1_778]] as const) {
    const quarter = computeLandTax({
      state: "ACT",
      assessmentDate,
      holdings: [{ id: "act-res", taxableLandValue: D(100_000), residential: true }],
      owner: { kind: "TRUST" },
    });
    assert.equal(quarter.generalTax, D(fixedCharge + 540), assessmentDate);
  }
  assert.throws(
    () => computeLandTax({ state: "ACT", assessmentDate: "2025-06-30", holdings: [{ id: "act-res", taxableLandValue: D(100_000), residential: true }], owner: { kind: "TRUST" } }),
    /ACT land tax/,
  );

  const commercial = computeLandTax({
    state: "ACT",
    assessmentYear: 2026,
    holdings: [{ id: "act-commercial", taxableLandValue: D(3_000_000), residential: false }],
    owner: { kind: "COMPANY", foreign: true },
  });
  assert.equal(commercial.totalTax, 0);
  assert.equal(commercial.findings[0]?.id, "AU_LAND_TAX.ACT_COMMERCIAL_LAND_NIL");
});

test("NT stamp duty uses the official formula and NT land tax / foreign surcharge are cited nils", () => {
  // NT Government and Territory Revenue Office stamp duty pages, fetched 2026-10-19:
  // https://nt.gov.au/employ/money-and-taxes/taxes-royalties-and-grants/stamp-duty/examples-of-duty-and-rates
  // https://treasury.nt.gov.au/dtf/territory-revenue-office/stamp-duty
  const formula = computeTransferDuty({
    state: "NT",
    contractDate: "2026-10-19",
    dutiableValue: D(350_000),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY", foreignPerson: true },
  });
  assert.equal(formula.baseDuty, D(13_300));
  assert.equal(formula.foreignSurchargeDuty, 0);
  assert.equal(formula.ruleVersion, "nt.transfer.2022-07-01");

  const midBand = computeTransferDuty({
    state: "NT",
    contractDate: "2026-10-19",
    dutiableValue: D(1_000_000),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(midBand.baseDuty, D(49_500));

  // Stamp Duty Act 1978 (NT) Schedule 1 clause 1(2)(c)-(d): 5.75% from A$3m and below A$5m; 5.95% from A$5m.
  const highBand = computeTransferDuty({
    state: "NT",
    contractDate: "2026-10-19",
    dutiableValue: D(3_000_000),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(highBand.baseDuty, D(172_500));

  const belowTopBand = computeTransferDuty({
    state: "NT",
    contractDate: "2026-10-19",
    dutiableValue: D(4_999_999),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(belowTopBand.baseDuty, D(287_499));

  const topBand = computeTransferDuty({
    state: "NT",
    contractDate: "2026-10-19",
    dutiableValue: D(5_000_000),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(topBand.baseDuty, D(297_500));

  const landTax = computeLandTax({
    state: "NT",
    assessmentYear: 2026,
    holdings: [{ id: "darwin", taxableLandValue: D(2_000_000), residential: true }],
    owner: { kind: "COMPANY", foreign: true },
  });
  assert.equal(landTax.totalTax, 0);
  assert.equal(landTax.ruleVersion, "nt.land-tax.nil.current");
  assert.equal(landTax.findings[0]?.id, "AU_LAND_TAX.NT_NOT_LEVIED");
});

test("territory coverage, rule ids and out-of-range refusals are explicit", () => {
  assert.deepEqual(
    AU_MODELLED_TRANSFER_DUTY_STATES.map((item) => item.id),
    ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
  );
  assert.deepEqual(
    AU_MODELLED_LAND_TAX_STATES.map((item) => item.id),
    ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
  );
  assert.deepEqual(
    AU_STATE_TAX_CATALOGUE.filter((entry) => entry.transferDutyCoverage === "NOT_MODELLED" || entry.landTaxCoverage === "NOT_MODELLED").map((entry) => entry.state),
    [],
  );

  assert.throws(
    () => computeTransferDuty({ state: "ACT", contractDate: "2022-06-30", dutiableValue: D(1_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }),
    /ACT commercial conveyance duty/,
  );
  assert.throws(
    () => computeTransferDuty({ state: "NT", contractDate: "2022-06-30", dutiableValue: D(1_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }),
    /Northern Territory stamp duty is modelled for contracts from 1 July 2022/,
  );
  assert.throws(
    () => computeLandTax({ state: "TAS", assessmentYear: 2025, holdings: [{ id: "tas", taxableLandValue: D(500_000), residential: true }], owner: { kind: "COMPANY" } }),
    /Tasmanian land tax/,
  );
});
