import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AU_LANDHOLDER_KINDS,
  AU_TRANSFER_DUTY_PROPERTY_KINDS,
  AU_TRANSFER_PURCHASER_KINDS,
  computeLandholderDuty,
  computeTransferDuty,
} from "../../../src/engine/au/transferDuty.ts";
import { AU_STATE_TAX_CATALOGUE } from "../../../src/engine/au/stateCatalogue.ts";

const D = (dollars: number): number => Math.round(dollars * 100);

test("AU transfer-duty catalogues are exhaustive for the modelled module", () => {
  assert.deepEqual(AU_TRANSFER_DUTY_PROPERTY_KINDS.map((entry) => entry.id), ["RESIDENTIAL", "NON_RESIDENTIAL", "MIXED"]);
  assert.deepEqual(AU_TRANSFER_PURCHASER_KINDS.map((entry) => entry.id), ["INDIVIDUAL", "COMPANY", "TRUST", "PARTNERSHIP"]);
  assert.deepEqual(AU_LANDHOLDER_KINDS.map((entry) => entry.id), ["PRIVATE_COMPANY", "PRIVATE_UNIT_TRUST", "WHOLESALE_UNIT_TRUST", "PUBLIC_LANDHOLDER"]);
  assert.deepEqual(
    AU_STATE_TAX_CATALOGUE.filter((entry) => entry.transferDutyCoverage === "FULL").map((entry) => entry.state),
    ["VIC", "QLD"],
  );
});

test("NSW transfer duty matches Revenue NSW published 2026-27 thresholds and worked examples", () => {
  const nsw = (dutiableValue: number, propertyKind: "RESIDENTIAL" | "NON_RESIDENTIAL" = "RESIDENTIAL") =>
    computeTransferDuty({
      state: "NSW",
      contractDate: "2026-10-10",
      dutiableValue: D(dutiableValue),
      propertyKind,
      purchaser: { kind: "INDIVIDUAL" },
    }).totalDuty;

  assert.equal(nsw(18_000), D(225));
  assert.equal(nsw(38_000), D(525));
  assert.equal(nsw(103_000), D(1_662));
  assert.equal(nsw(387_000), D(11_602));
  assert.equal(nsw(1_290_000), D(52_237));
  assert.equal(nsw(1_350_000), D(55_537)); // Revenue NSW auction example
  assert.equal(nsw(450_000), D(14_437)); // Revenue NSW family-transfer example
  assert.equal(nsw(4_000_000), D(203_237)); // Revenue NSW premium-duty example
});

test("NSW transfer-duty effective dates and surcharge purchaser duty rates follow Revenue NSW tables", () => {
  const fy2025 = computeTransferDuty({
    state: "NSW",
    contractDate: "2025-07-01",
    dutiableValue: D(1_240_000),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(fy2025.totalDuty, D(50_212));

  const fy2023 = computeTransferDuty({
    state: "NSW",
    contractDate: "2023-07-01",
    dutiableValue: D(1_168_000),
    propertyKind: "NON_RESIDENTIAL",
    purchaser: { kind: "COMPANY" },
  });
  assert.equal(fy2023.totalDuty, D(47_295));

  const surcharge = computeTransferDuty({
    state: "NSW",
    contractDate: "2026-10-10",
    dutiableValue: D(1_000_000),
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "INDIVIDUAL", foreignPerson: true },
  });
  assert.equal(surcharge.baseDuty, D(39_187));
  assert.equal(surcharge.foreignSurchargeDuty, D(90_000));
  assert.equal(surcharge.totalDuty, D(129_187));

  const oldSurcharge = computeTransferDuty({
    state: "NSW",
    contractDate: "2024-12-31",
    dutiableValue: D(1_000_000),
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "INDIVIDUAL", foreignPerson: true },
  });
  assert.equal(oldSurcharge.foreignSurchargeDuty, D(80_000));
});

test("VIC transfer duty and foreign purchaser additional duty match SRO published rates", () => {
  const vic = (date: string, dutiableValue: number) =>
    computeTransferDuty({
      state: "VIC",
      contractDate: date,
      dutiableValue: D(dutiableValue),
      propertyKind: "NON_RESIDENTIAL",
      purchaser: { kind: "COMPANY" },
    }).totalDuty;

  assert.equal(vic("2026-10-10", 25_000), D(350));
  assert.equal(vic("2026-10-10", 130_000), D(2_870));
  assert.equal(vic("2026-10-10", 960_000), D(52_670));
  assert.equal(vic("2026-10-10", 1_100_000), D(60_500));
  assert.equal(vic("2026-10-10", 2_000_000), D(110_000));
  assert.equal(vic("2026-10-10", 2_100_000), D(116_500));
  assert.equal(vic("2020-06-30", 2_100_000), D(115_500)); // before 6.5% premium band

  const fpad = computeTransferDuty({
    state: "VIC",
    contractDate: "2026-10-10",
    dutiableValue: D(1_000_000),
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "COMPANY", foreignCorporation: true },
  });
  assert.equal(fpad.baseDuty, D(55_000));
  assert.equal(fpad.foreignSurchargeDuty, D(80_000));

  const oldFpad = computeTransferDuty({
    state: "VIC",
    contractDate: "2018-06-30",
    dutiableValue: D(1_000_000),
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "TRUST", foreignPerson: true },
  });
  assert.equal(oldFpad.foreignSurchargeDuty, D(70_000));
});

test("QLD transfer duty and AFAD follow the published QRO schedule", () => {
  const qld = (dutiableValue: number) =>
    computeTransferDuty({
      state: "QLD",
      contractDate: "2026-10-10",
      dutiableValue: D(dutiableValue),
      propertyKind: "NON_RESIDENTIAL",
      purchaser: { kind: "COMPANY" },
    }).totalDuty;

  assert.equal(qld(5_000), 0);
  assert.equal(qld(5_001), D(1.5));
  assert.equal(qld(75_000), D(1_050));
  assert.equal(qld(540_000), D(17_325));
  assert.equal(qld(850_000), D(31_275)); // QRO published example
  assert.equal(qld(1_000_000), D(38_025));
  assert.equal(qld(1_680_000), D(77_125));

  const afad = computeTransferDuty({
    state: "QLD",
    contractDate: "2026-10-10",
    dutiableValue: D(850_000),
    propertyKind: "RESIDENTIAL",
    purchaser: { kind: "COMPANY", foreignCorporation: true },
  });
  assert.equal(afad.baseDuty, D(31_275));
  assert.equal(afad.foreignSurchargeDuty, D(68_000));
  assert.equal(afad.totalDuty, D(99_275));
});

test("Landholder duty matches published NSW, VIC and QLD examples", () => {
  const nsw = computeLandholderDuty({
    state: "NSW",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_UNIT_TRUST",
    landholdingsValue: D(2_000_000),
    acquiredInterestBps: 2_000,
  });
  assert.equal(nsw.relevantAcquisition, true);
  assert.equal(nsw.dutiableValue, D(400_000));
  assert.equal(nsw.baseDuty, D(12_187)); // Revenue NSW webinar Q&A: 20% x A$2m

  const vicPrivate = computeLandholderDuty({
    state: "VIC",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_COMPANY",
    landholdingsValue: D(10_000_000),
    acquiredInterestBps: 7_000,
  });
  assert.equal(vicPrivate.dutiableValue, D(7_000_000));
  assert.equal(vicPrivate.baseDuty, D(435_000)); // SRO example

  const vicPhased = computeLandholderDuty({
    state: "VIC",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_COMPANY",
    landholdingsValue: D(1_500_000),
    acquiredInterestBps: 5_000,
  });
  assert.equal(vicPhased.baseDuty, D(20_035)); // SRO phasing example

  const vicForeign = computeLandholderDuty({
    state: "VIC",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_COMPANY",
    landholdingsValue: D(10_000_000),
    residentialLandValue: D(10_000_000),
    acquiredInterestBps: 7_000,
    foreignAcquirer: true,
  });
  assert.equal(vicForeign.baseDuty, D(435_000));
  assert.equal(vicForeign.foreignSurchargeDuty, D(560_000)); // SRO FPAD residential-share rule
  assert.equal(vicForeign.totalDuty, D(995_000));

  const vicPublic = computeLandholderDuty({
    state: "VIC",
    acquisitionDate: "2026-10-10",
    landholderKind: "PUBLIC_LANDHOLDER",
    landholdingsValue: D(20_000_000),
    acquiredInterestBps: 9_500,
  });
  assert.equal(vicPublic.baseDuty, D(128_000)); // SRO example

  const qldPrivate = computeLandholderDuty({
    state: "QLD",
    acquisitionDate: "2026-10-10",
    landholderKind: "PRIVATE_COMPANY",
    landholdingsValue: D(2_800_000),
    residentialLandValue: D(1_000_000),
    acquiredInterestBps: 6_000,
    foreignAcquirer: true,
  });
  assert.equal(qldPrivate.dutiableValue, D(1_680_000));
  assert.equal(qldPrivate.baseDuty, D(77_125)); // QRO example
  assert.equal(qldPrivate.foreignSurchargeDuty, D(48_000)); // QRO AFAD example
  assert.equal(qldPrivate.totalDuty, D(125_125));

  const qldPublic = computeLandholderDuty({
    state: "QLD",
    acquisitionDate: "2026-10-10",
    landholderKind: "PUBLIC_LANDHOLDER",
    landholdingsValue: D(10_000_000),
    acquiredInterestBps: 9_500,
  });
  assert.equal(qldPublic.baseDuty, D(55_552.5)); // QRO example: 10% of A$555,525
});

test("NSW catalogue coverage discloses manual-review landholder surcharge gap", () => {
  const nsw = AU_STATE_TAX_CATALOGUE.find((entry) => entry.state === "NSW");
  assert.ok(nsw);
  assert.equal(nsw.transferDutyCoverage, "PARTIAL");
  assert.match(nsw.description, /manual review/i);
});
