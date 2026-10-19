// Western Australia and South Australia land tax and transfer duty, checked against the published tables. The tables below are typed from
// the official pages (retrieved 19 October 2026), not from the engine: each published step's base must equal the engine's tax at the top of
// the step below it, and a little above each step the engine must add that step's rate. Golden figures for the seeded properties were
// worked out separately with plain integer arithmetic.
//   WA: wa.gov.au Department of Treasury and Finance, "Land tax assessment" and "Transfer duty assessment".
//   SA: revenuesa.sa.gov.au "Rates and thresholds" (land tax), "Rate of stamp duty", and Information Circular 103 (qualifying land).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeLandTax, type AuLandTaxOwner } from "../../../src/engine/au/landTax.ts";
import { computeTransferDuty } from "../../../src/engine/au/transferDuty.ts";
import { AU_STATE_TAX_CATALOGUE } from "../../../src/engine/au/stateCatalogue.ts";

const D = (dollars: number): number => Math.round(dollars * 100);
const TRUST: AuLandTaxOwner = { kind: "TRUST", trustSurchargeApplies: true };
const GENERAL_TRUST: AuLandTaxOwner = { kind: "TRUST", trustSurchargeApplies: false };

const waLand = (dollars: number, owner: AuLandTaxOwner = TRUST, metropolitanRegion?: boolean) =>
  computeLandTax({ state: "WA", assessmentYear: 2026, owner, holdings: [{ id: "lot", taxableLandValue: D(dollars), ...(metropolitanRegion === undefined ? {} : { metropolitanRegion }) }] });

describe("Western Australia land tax", () => {
  it("follows the published scale at every step, for every kind of owner", () => {
    // [aggregated value, published tax]: nil to A$300,000, A$300 to A$420,000, then each step's published base.
    const published: Array<[number, number]> = [[300_000, 0], [300_001, 300], [420_000, 300], [1_000_000, 1_750], [1_800_000, 8_950], [5_000_000, 66_550], [11_000_000, 186_550]];
    for (const owner of [TRUST, { kind: "COMPANY" } as AuLandTaxOwner, { kind: "INDIVIDUAL", foreign: true, absentee: true } as AuLandTaxOwner]) {
      for (const [value, tax] of published) assert.equal(waLand(value, owner, false).generalTax, D(tax), `${owner.kind} at A$${value}`);
    }
    // A little above each step adds that step's rate: 0.25%, 0.9%, 1.8%, 2%, 2.67% of the excess.
    assert.equal(waLand(421_000, TRUST, false).generalTax, D(300 + 2.5));
    assert.equal(waLand(1_001_000, TRUST, false).generalTax, D(1_750 + 9));
    assert.equal(waLand(1_801_000, TRUST, false).generalTax, D(8_950 + 18));
    assert.equal(waLand(5_001_000, TRUST, false).generalTax, D(66_550 + 20));
    assert.equal(waLand(11_001_000, TRUST, false).generalTax, D(186_550 + 26.7));
  });

  it("adds the Metropolitan Region Improvement Tax on metropolitan land above A$300,000", () => {
    const metro = waLand(400_000);
    assert.equal(metro.generalTax, D(300));
    assert.equal(metro.surchargeTax, D(140), "0.14% of the A$100,000 above A$300,000");
    assert.equal(metro.totalTax, D(440));
    assert.ok(metro.lines.some((line) => line.label === "Metropolitan Region Improvement Tax (MRIT)" && line.amount === D(140)));
    assert.match(metro.ruleVersion, /^wa\.land-tax\.general\.[\d-]+\+wa\.land-tax\.mrit\.[\d-]+$/);
    assert.equal(waLand(400_000, TRUST, false).surchargeTax, 0, "no MRIT outside the metropolitan region");
    assert.equal(waLand(300_000).surchargeTax, 0, "nothing at the threshold");
  });

  it("charges MRIT on the metropolitan holdings only and apportions both taxes by value", () => {
    const result = computeLandTax({
      state: "WA",
      assessmentYear: 2026,
      owner: TRUST,
      holdings: [
        { id: "perth", taxableLandValue: D(600_000) },
        { id: "kalgoorlie", taxableLandValue: D(400_000), metropolitanRegion: false },
      ],
    });
    assert.equal(result.generalTax, D(1_750), "the scale on the aggregated A$1,000,000");
    assert.equal(result.surchargeTax, D(420), "0.14% of A$300,000: the metropolitan A$600,000 above the threshold");
    assert.deepEqual(result.properties.map((p) => [p.id, p.apportionedGeneralTax, p.apportionedSurchargeTax]), [["perth", D(1_050), D(420)], ["kalgoorlie", D(700), 0]]);
  });

  it("gives the seeded WA properties their golden figures", () => {
    // Banksia Plaza, Joondalup: land value A$266,398,217.50; Fremantle Wharf Offices: A$118,856,820.50 (half the valuation).
    const banksia = computeLandTax({ state: "WA", assessmentYear: 2026, owner: TRUST, holdings: [{ id: "banksia", taxableLandValue: 26_639_821_750 }] });
    assert.deepEqual([banksia.generalTax, banksia.surchargeTax, banksia.totalTax], [700_568_241, 37_253_750, 737_821_991]);
    const fremantle = computeLandTax({ state: "WA", assessmentYear: 2026, owner: TRUST, holdings: [{ id: "fremantle", taxableLandValue: 11_885_682_050 }] });
    assert.deepEqual([fremantle.generalTax, fremantle.surchargeTax, fremantle.totalTax], [306_632_711, 16_597_955, 323_230_666]);
  });
});

// RevenueSA tables: [financial year, threshold, steps as [step, published base, cents per A$100 or part above the step]].
type SaTable = { year: string; threshold: number; steps: Array<[number, number, number]> };
const SA_GENERAL: SaTable[] = [
  { year: "2021-22", threshold: 482_000, steps: [[482_000, 0, 50], [774_000, 1_460, 125], [1_126_000, 5_860, 200], [1_350_000, 10_340, 240]] },
  { year: "2022-23", threshold: 534_000, steps: [[534_000, 0, 50], [858_000, 1_620, 100], [1_249_000, 5_530, 200], [2_000_000, 20_550, 240]] },
  { year: "2023-24", threshold: 668_000, steps: [[668_000, 0, 50], [1_073_000, 2_025, 100], [1_561_000, 6_905, 200], [2_500_000, 25_685, 240]] },
  { year: "2024-25", threshold: 732_000, steps: [[732_000, 0, 50], [1_176_000, 2_220, 100], [1_711_000, 7_570, 200], [2_738_000, 28_110, 240]] },
  { year: "2025-26", threshold: 833_000, steps: [[833_000, 0, 50], [1_338_000, 2_525, 100], [1_946_000, 8_605, 200], [3_116_000, 32_005, 240]] },
  { year: "2026-27", threshold: 936_000, steps: [[936_000, 0, 50], [1_504_000, 2_840, 100], [2_188_000, 9_680, 200], [3_504_000, 36_000, 240]] },
];
const SA_TRUST: SaTable[] = [
  { year: "2021-22", threshold: 25_000, steps: [[25_000, 125, 50], [482_000, 2_410, 100], [774_000, 5_330, 175], [1_126_000, 11_490, 240], [1_350_000, 16_866, 240]] },
  { year: "2022-23", threshold: 25_000, steps: [[25_000, 125, 50], [534_000, 2_670, 100], [858_000, 5_910, 150], [1_249_000, 11_775, 240], [2_000_000, 29_799, 240]] },
  { year: "2023-24", threshold: 25_000, steps: [[25_000, 125, 50], [668_000, 3_340, 100], [1_073_000, 7_390, 150], [1_561_000, 14_710, 240], [2_500_000, 37_246, 240]] },
  { year: "2024-25", threshold: 25_000, steps: [[25_000, 125, 50], [732_000, 3_660, 100], [1_176_000, 8_100, 150], [1_711_000, 16_125, 240], [2_738_000, 40_773, 240]] },
  { year: "2025-26", threshold: 25_000, steps: [[25_000, 125, 50], [833_000, 4_165, 100], [1_338_000, 9_215, 150], [1_946_000, 18_335, 240], [3_116_000, 46_415, 240]] },
  { year: "2026-27", threshold: 25_000, steps: [[25_000, 125, 50], [936_000, 4_680, 100], [1_504_000, 10_360, 150], [2_188_000, 20_620, 240], [3_504_000, 52_204, 240]] },
];

/** A financial year "2025-26" is assessment year 2026: the engine uses the scale in force on 1 January of the assessment year. */
const assessmentYearOf = (year: string): number => Number(year.slice(0, 4)) + 1;
const saTax = (dollars: number, year: string, owner: AuLandTaxOwner) =>
  computeLandTax({ state: "SA", assessmentYear: assessmentYearOf(year), owner, holdings: [{ id: "lot", taxableLandValue: D(dollars) }] });

describe("South Australia land tax", () => {
  for (const [scale, tables, owner] of [["general", SA_GENERAL, GENERAL_TRUST], ["trust", SA_TRUST, TRUST]] as const) {
    it(`applies every published ${scale} table from 2021-22 to 2026-27`, () => {
      for (const table of tables) {
        const where = `${scale} ${table.year}`;
        assert.equal(saTax(table.threshold, table.year, owner).generalTax, 0, `${where}: nil at the threshold`);
        table.steps.forEach(([step, base, centsPer100], index) => {
          // The top of the step below must reach this step's published base exactly...
          if (index > 0) assert.equal(saTax(step, table.year, owner).generalTax, D(base), `${where}: A$${step} reaches the published base`);
          // ...and A$10,000 above the step adds 100 parts of A$100 at this step's rate (well above the A$20 minimum).
          assert.equal(saTax(step + 10_000, table.year, owner).generalTax, D(base) + 100 * centsPer100, `${where}: rate above A$${step}`);
        });
        assert.match(saTax(table.threshold + 10_000, table.year, owner).ruleVersion, new RegExp(`^sa\\.land-tax\\.${scale}\\.${table.year.slice(0, 4)}-07-01$`));
      }
    });
  }

  it("charges every A$100 or part of A$100 in full, and issues nothing under A$20", () => {
    assert.equal(saTax(25_000.01, "2025-26", TRUST).generalTax, D(125.5), "one cent over the trust threshold is a whole A$100");
    const under = saTax(836_900, "2025-26", GENERAL_TRUST);
    assert.equal(under.generalTax, 0, "39 parts at 50 cents is A$19.50: no assessment");
    assert.ok(under.findings.some((finding) => finding.id === "AU_LAND_TAX.SA_BELOW_MINIMUM_ASSESSMENT"));
    assert.equal(saTax(836_900.01, "2025-26", GENERAL_TRUST).generalTax, D(20), "40 parts is A$20.00");
  });

  it("uses the trust rates only for a trust that is not assessed at the general rates", () => {
    const value = 2_000_000;
    assert.equal(saTax(value, "2025-26", TRUST).generalTax, D(18_335 + 2.4 * 540), "trust rates: A$18,335 plus A$2.40 for 540 parts");
    assert.equal(saTax(value, "2025-26", GENERAL_TRUST).generalTax, D(8_605 + 2 * 540), "a listed public unit trust: general rates");
    assert.equal(saTax(value, "2025-26", { kind: "COMPANY" }).generalTax, D(8_605 + 2 * 540));
    assert.equal(saTax(value, "2025-26", { kind: "SPECIAL_TRUST" }).generalTax, D(18_335 + 2.4 * 540));
  });

  it("gives the seeded SA property its golden figure", () => {
    // Lakeside Marketplace, Mawson Lakes: land value A$277,980,749.50, general rates 2025-26 (Wattle is a listed trust).
    const lakeside = computeLandTax({ state: "SA", assessmentYear: 2026, owner: GENERAL_TRUST, holdings: [{ id: "lakeside", taxableLandValue: 27_798_074_950 }] });
    assert.equal(lakeside.totalTax, 662_876_020, "A$32,005 plus A$2.40 for 2,748,648 parts");
    assert.equal(lakeside.surchargeTax, 0);
  });
});

const duty = (state: "WA" | "SA", dollars: number, contractDate: string, extra: Partial<Parameters<typeof computeTransferDuty>[0]> = {}) =>
  computeTransferDuty({ state, contractDate, dutiableValue: D(dollars), propertyKind: "RESIDENTIAL", purchaser: { kind: "TRUST" }, ...extra });

describe("Western Australia transfer duty", () => {
  it("follows the general rate, charging every A$100 or part", () => {
    assert.equal(duty("WA", 120_000, "2026-10-01").baseDuty, D(2_280));
    assert.equal(duty("WA", 120_000.01, "2026-10-01").baseDuty, D(2_282.85));
    assert.equal(duty("WA", 150_000, "2026-10-01").baseDuty, D(3_135));
    assert.equal(duty("WA", 360_000, "2026-10-01").baseDuty, D(11_115));
    assert.equal(duty("WA", 725_000, "2026-10-01").baseDuty, D(28_452.5), "the formula below the top step; WA publishes the next base rounded to A$28,453");
    assert.equal(duty("WA", 725_000.01, "2026-10-01").baseDuty, D(28_453 + 5.15));
  });

  it("adds 7% foreign transfer duty on residential property from 1 January 2019 only", () => {
    const foreign = duty("WA", 1_000_000, "2019-01-01", { purchaser: { kind: "INDIVIDUAL", foreignPerson: true } });
    assert.deepEqual([foreign.baseDuty, foreign.foreignSurchargeDuty, foreign.totalDuty], [D(42_615.5), D(70_000), D(112_615.5)]);
    assert.equal(duty("WA", 1_000_000, "2018-12-31", { purchaser: { kind: "INDIVIDUAL", foreignPerson: true } }).foreignSurchargeDuty, 0);
    assert.equal(duty("WA", 1_000_000, "2026-10-01", { propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY", foreignCorporation: true } }).foreignSurchargeDuty, 0, "commercial land pays none");
  });

  it("refuses transactions before 2 July 2014 with a reason a person can read", () => {
    assert.throws(() => duty("WA", 500_000, "2014-07-01"), /modelled for transactions from 2 July 2014; this contract is dated 1 July 2014\./);
  });

  it("gives the seeded WA acquisitions their golden figures", () => {
    assert.equal(duty("WA", 522_492_875, "2019-09-30", { propertyKind: "NON_RESIDENTIAL" }).totalDuty, 2_689_949_985, "Banksia Plaza: A$28,453 plus A$5.15 for 5,217,679 parts");
    assert.equal(duty("WA", 273_532_755, "2020-03-02", { propertyKind: "NON_RESIDENTIAL" }).totalDuty, 1_407_805_470, "Fremantle Wharf Offices");
  });
});

describe("South Australia transfer duty", () => {
  it("reproduces RevenueSA Information Circular 103's worked example", () => {
    // Contracts dated 10 December 2022: duty on A$2,200,000 is A$114,830; the residential A$1,200,000 bears A$62,634.55 and the retail
    // complex (qualifying land) none.
    assert.equal(duty("SA", 2_200_000, "2022-12-10").totalDuty, D(114_830));
    const mixed = duty("SA", 2_200_000, "2022-12-10", { propertyKind: "MIXED", residentialDutiableValue: D(1_200_000) });
    assert.equal(mixed.totalDuty, D(62_634.55));
    assert.match(mixed.ruleVersion, /sa\.qualifying-land\.2018-07-01/);
  });

  it("charges no duty on qualifying (non-residential) land from 1 July 2018, and every A$100 or part otherwise", () => {
    const shops = duty("SA", 5_000_000, "2018-07-01", { propertyKind: "NON_RESIDENTIAL" });
    assert.equal(shops.totalDuty, 0);
    assert.ok(shops.lines.some((line) => line.code === "AU.SA.TRANSFER.QUALIFYING_LAND"));
    assert.equal(duty("SA", 500_000, "2026-10-01").totalDuty, D(21_330));
    assert.equal(duty("SA", 500_000.01, "2026-10-01").totalDuty, D(21_335.5));
    assert.equal(duty("SA", 12_000, "2026-10-01").totalDuty, D(120));
  });

  it("refuses earlier contracts and flags the foreign ownership surcharge it does not model", () => {
    assert.throws(() => duty("SA", 500_000, "2018-06-30"), /modelled for contracts from 1 July 2018, when duty on non-residential land ended; this contract is dated 30 June 2018\./);
    assert.throws(() => duty("SA", 648_381_847, "2012-05-21", { propertyKind: "NON_RESIDENTIAL" }), /dated 21 May 2012/, "Lakeside Marketplace stays unmodelled");
    const foreign = duty("SA", 1_000_000, "2026-10-01", { purchaser: { kind: "INDIVIDUAL", foreignPerson: true } });
    assert.equal(foreign.foreignSurchargeDuty, 0);
    assert.ok(foreign.findings.some((finding) => finding.id === "AU_TRANSFER_DUTY.SA_FOREIGN_SURCHARGE_NOT_MODELLED"));
  });
});

describe("the state catalogue", () => {
  it("lists WA and SA land tax as full and their duty as partial", () => {
    const entry = (state: string) => AU_STATE_TAX_CATALOGUE.find((item) => item.state === state)!;
    assert.deepEqual([entry("WA").landTaxCoverage, entry("WA").transferDutyCoverage], ["FULL", "PARTIAL"]);
    assert.deepEqual([entry("SA").landTaxCoverage, entry("SA").transferDutyCoverage], ["FULL", "PARTIAL"]);
  });
});
