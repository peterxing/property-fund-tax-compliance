// WA and SA landholder duty and SA foreign ownership surcharge, against official RevenueWA / RevenueSA examples and tables
// retrieved 19 October 2026. WA: landholder value threshold A$2m, 50% unlisted / 90% listed thresholds, general rate on the
// acquirer's interest for every landholder (Duties Act 2008 (WA) ss 184 and 188; no listed concession).
// SA: RevenueSA land holder examples (commercial only = no duty; 35% residential = no prescribed interest; 75% residential = duty),
// and foreign ownership surcharge examples/rule (7% of the foreign entity's residential land interest from 1 January 2018).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeLandholderDuty, computeTransferDuty } from "../../../src/engine/au/transferDuty.ts";

const D = (dollars: number): number => Math.round(dollars * 100);

describe("Western Australia landholder duty", () => {
  it("requires WA land assets of at least A$2m", () => {
    const result = computeLandholderDuty({
      state: "WA",
      acquisitionDate: "2026-10-01",
      landholderKind: "PRIVATE_UNIT_TRUST",
      landholdingsValue: D(1_999_999),
      acquiredInterestBps: 5500,
    });

    assert.equal(result.relevantAcquisition, false);
    assert.equal(result.totalDuty, 0);
    assert.ok(result.findings.some((finding) => finding.id === "AU_LANDHOLDER.BELOW_LAND_VALUE_THRESHOLD"));
  });

  it("charges transfer duty on the acquired WA landholding interest for an unlisted landholder", () => {
    const result = computeLandholderDuty({
      state: "WA",
      acquisitionDate: "2026-10-01",
      landholderKind: "PRIVATE_UNIT_TRUST",
      landholdingsValue: D(5_000_000),
      acquiredInterestBps: 5500,
    });

    assert.equal(result.relevantAcquisition, true);
    assert.equal(result.significantInterestThresholdBps, 5000);
    assert.equal(result.dutiableValue, D(2_750_000));
    assert.equal(result.baseDuty, D(132_740.50), "A$28,453 plus A$5.15 for each A$100 or part above A$725,000");
    assert.equal(result.totalDuty, D(132_740.50));
    assert.match(result.ruleVersion, /^wa\.landholder\.2008-07-01\+wa\.transfer\.2014-07-02$/);
  });

  it("applies the listed landholder threshold and the general rate on the acquirer's interest (no listed concession)", () => {
    const below = computeLandholderDuty({
      state: "WA",
      acquisitionDate: "2026-10-01",
      landholderKind: "PUBLIC_LANDHOLDER",
      landholdingsValue: D(5_000_000),
      acquiredInterestBps: 8900,
    });
    assert.equal(below.relevantAcquisition, false, "listed landholders use the 90% significant-interest threshold");

    // Duties Act 2008 (WA) s 184(1): general rate; s 188(3): value of the acquirer's interest = 90% x A$5m = A$4.5m.
    const listed = computeLandholderDuty({
      state: "WA",
      acquisitionDate: "2026-10-01",
      landholderKind: "PUBLIC_LANDHOLDER",
      landholdingsValue: D(5_000_000),
      acquiredInterestBps: 9000,
    });
    assert.equal(listed.dutiableValue, D(4_500_000));
    assert.equal(listed.baseDuty, D(222_865.50), "A$28,453 plus A$5.15 for each A$100 or part above A$725,000");
    assert.equal(listed.totalDuty, D(222_865.50));
  });
});

describe("South Australia foreign ownership surcharge", () => {
  it("applies 7% only to the foreign purchaser's residential land interest", () => {
    const half = computeTransferDuty({
      state: "SA",
      contractDate: "2018-02-01",
      dutiableValue: D(500_000),
      propertyKind: "RESIDENTIAL",
      purchaser: { kind: "INDIVIDUAL", foreignPerson: true, foreignOwnerShareBps: 5000 },
    });

    assert.equal(half.foreignSurchargeDuty, D(17_500), "RevenueSA joint-interest example: 7% of a 50% residential interest");
    assert.equal(half.totalDuty, D(38_830));

    const mixed = computeTransferDuty({
      state: "SA",
      contractDate: "2026-10-01",
      dutiableValue: D(2_200_000),
      propertyKind: "MIXED",
      residentialDutiableValue: D(1_200_000),
      purchaser: { kind: "COMPANY", foreignCorporation: true },
    });
    assert.equal(mixed.foreignSurchargeDuty, D(84_000), "7% of the residential component only");
    assert.equal(mixed.baseDuty, D(62_634.55));
  });
});

describe("South Australia landholder duty", () => {
  it("reproduces RevenueSA's land holder examples for qualifying land and prescribed interests", () => {
    const commercial = computeLandholderDuty({
      state: "SA",
      acquisitionDate: "2026-10-01",
      landholderKind: "PRIVATE_UNIT_TRUST",
      landholdingsValue: D(2_500_000),
      residentialLandValue: 0,
      acquiredInterestBps: 5000,
    });
    assert.equal(commercial.relevantAcquisition, false, "commercial-only qualifying land has no SA landholder duty from 1 July 2018");

    const belowThreshold = computeLandholderDuty({
      state: "SA",
      acquisitionDate: "2026-10-01",
      landholderKind: "PRIVATE_UNIT_TRUST",
      landholdingsValue: D(525_000),
      residentialLandValue: D(525_000),
      acquiredInterestBps: 3500,
    });
    assert.equal(belowThreshold.relevantAcquisition, false, "35% is not a prescribed interest in a private unit trust");

    const prescribed = computeLandholderDuty({
      state: "SA",
      acquisitionDate: "2026-10-01",
      landholderKind: "PRIVATE_UNIT_TRUST",
      landholdingsValue: D(850_000),
      residentialLandValue: D(850_000),
      acquiredInterestBps: 7500,
    });
    assert.equal(prescribed.relevantAcquisition, true);
    assert.equal(prescribed.dutiableValue, D(637_500));
    assert.equal(prescribed.baseDuty, D(28_892.50), "SA conveyance duty on the 75% notional residential land acquisition");
    assert.equal(prescribed.totalDuty, D(28_892.50));
  });

  it("adds SA foreign ownership surcharge to foreign landholder acquisitions of residential land", () => {
    const result = computeLandholderDuty({
      state: "SA",
      acquisitionDate: "2026-10-01",
      landholderKind: "PRIVATE_UNIT_TRUST",
      landholdingsValue: D(850_000),
      residentialLandValue: D(850_000),
      acquiredInterestBps: 7500,
      foreignAcquirer: true,
    });

    assert.equal(result.baseDuty, D(28_892.50));
    assert.equal(result.foreignSurchargeDuty, D(44_625), "7% of the 75% notional residential land interest");
    assert.equal(result.totalDuty, D(73_517.50));
    assert.match(result.ruleVersion, /sa\.surcharge\.2018-01-01/);
  });
});
