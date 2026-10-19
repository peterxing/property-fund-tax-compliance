// Landholder tests per jurisdiction, and Queensland's trust acquisitions. Found while documenting the duty rules for reviewers: the engine's
// rule entries stated the NSW (A$2m), Victorian (A$1m) and Queensland (A$2m) landholder tests but the calculation did not apply them, and
// it charged units in an unlisted Queensland unit trust as landholder duty (50% threshold) instead of as a trust acquisition.
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeLandholderDuty, computeTransferDuty } from "../../../src/engine/au/transferDuty.ts";

const D = (dollars: number): number => Math.round(dollars * 100);

test("NSW: an entity with less than A$2m of NSW land is not a landholder (Duties Act 1997 (NSW) s 146)", () => {
  const below = computeLandholderDuty({ state: "NSW", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_COMPANY", landholdingsValue: D(1_999_999.99), acquiredInterestBps: 6_000 });
  assert.equal(below.relevantAcquisition, false);
  assert.equal(below.totalDuty, 0);
  assert.ok(below.findings.some((finding) => finding.id === "AU_LANDHOLDER.BELOW_LAND_VALUE_THRESHOLD" && /below the A\$2,000,000 landholder threshold/.test(finding.message)));

  const at = computeLandholderDuty({ state: "NSW", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_COMPANY", landholdingsValue: D(2_000_000), acquiredInterestBps: 6_000 });
  assert.equal(at.relevantAcquisition, true, "A$2m or more is a landholder");
  assert.equal(at.dutiableValue, D(1_200_000));
  assert.equal(at.baseDuty, computeTransferDuty({ state: "NSW", contractDate: "2026-10-10", dutiableValue: D(1_200_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }).baseDuty);
});

test("Victoria: no landholder below A$1m, nil duty at exactly A$1m, phased in to A$2m (s 89), full duty from A$2m", () => {
  const vic = (value: number) => computeLandholderDuty({ state: "VIC", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_COMPANY", landholdingsValue: D(value), acquiredInterestBps: 5_000 });
  const below = vic(999_999.99);
  assert.equal(below.relevantAcquisition, false);
  assert.equal(below.totalDuty, 0);
  assert.ok(below.findings.some((finding) => finding.id === "AU_LANDHOLDER.BELOW_LAND_VALUE_THRESHOLD"));
  assert.equal(vic(1_000_000).totalDuty, 0, "the phasing formula gives nil at A$1m");
  assert.equal(vic(1_500_000).baseDuty, D(20_035), "SRO phasing example: (1.5m - 1m) / 1m x A$40,070");
  const full = computeTransferDuty({ state: "VIC", contractDate: "2026-10-10", dutiableValue: D(1_000_000), propertyKind: "NON_RESIDENTIAL", purchaser: { kind: "COMPANY" } }).baseDuty;
  assert.equal(vic(2_000_000).baseDuty, full, "no phasing from A$2m");
});

test("Queensland: a corporation with less than A$2m of Queensland land is not a landholder", () => {
  const below = computeLandholderDuty({ state: "QLD", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_COMPANY", landholdingsValue: D(1_999_999.99), acquiredInterestBps: 6_000 });
  assert.equal(below.relevantAcquisition, false);
  assert.equal(below.totalDuty, 0);
  const at = computeLandholderDuty({ state: "QLD", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_COMPANY", landholdingsValue: D(2_000_000), acquiredInterestBps: 6_000 });
  assert.equal(at.relevantAcquisition, true);
});

test("Queensland: units in an unlisted unit trust are a trust acquisition, dutiable whatever the interest (QRO worked example)", () => {
  // QRO, Trust interest, acquisitions and surrenders (read 19 October 2026): the Land Unit Trust holds A$1,000,000 of Queensland land and
  // Christine buys a 20% trust interest for A$150,000. The dutiable value is the higher of A$150,000 and 20% x A$1,000,000 = A$200,000.
  // Duty at the general rates: A$1,050 + A$3.50 per A$100 over A$75,000 = A$1,050 + 1,250 x A$3.50 = A$5,425.
  const christine = computeLandholderDuty({ state: "QLD", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_UNIT_TRUST", landholdingsValue: D(1_000_000), acquiredInterestBps: 2_000 });
  assert.equal(christine.relevantAcquisition, true, "below both the A$2m landholder test and the 50% interest test, but still dutiable");
  assert.equal(christine.significantInterestThresholdBps, 0);
  assert.equal(christine.dutiableValue, D(200_000));
  assert.equal(christine.totalDuty, D(5_425));
  assert.ok(christine.findings.some((finding) => finding.id === "AU_LANDHOLDER.TRUST_ACQUISITION" && /consideration/.test(finding.message)), "the user is told to check the consideration");
  assert.deepEqual(christine.lines.map((row) => row.label), ["Unencumbered value of the trust's land", "Trust interest dutiable value", "Trust acquisition duty", "Total trust acquisition duty"]);

  const small = computeLandholderDuty({ state: "QLD", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_UNIT_TRUST", landholdingsValue: D(1_000_000), acquiredInterestBps: 500 });
  assert.equal(small.dutiableValue, D(50_000));
  assert.equal(small.totalDuty, D(675), "A$1.50 per A$100 over A$5,000 on A$50,000");

  const none = computeLandholderDuty({ state: "QLD", acquisitionDate: "2026-10-10", landholderKind: "PRIVATE_UNIT_TRUST", landholdingsValue: D(1_000_000), acquiredInterestBps: 0 });
  assert.equal(none.relevantAcquisition, false);
  assert.equal(none.totalDuty, 0);
});

test("Queensland: unlisted wholesale unit trusts are refused as not modelled rather than guessed", () => {
  assert.throws(
    () => computeLandholderDuty({ state: "QLD", acquisitionDate: "2026-10-10", landholderKind: "WHOLESALE_UNIT_TRUST", landholdingsValue: D(5_000_000), acquiredInterestBps: 6_000 }),
    /wholesale unit trust.*not model/,
  );
});

test("WA and SA keep their own tests: WA A$2m of land; SA residential land only, no value test, from 1 July 2018", () => {
  const wa = computeLandholderDuty({ state: "WA", acquisitionDate: "2026-10-01", landholderKind: "PRIVATE_UNIT_TRUST", landholdingsValue: D(1_999_999.99), acquiredInterestBps: 6_000 });
  assert.equal(wa.relevantAcquisition, false);
  const sa = computeLandholderDuty({ state: "SA", acquisitionDate: "2026-10-01", landholderKind: "PRIVATE_UNIT_TRUST", landholdingsValue: D(850_000), residentialLandValue: D(850_000), acquiredInterestBps: 7_500 });
  assert.equal(sa.relevantAcquisition, true, "RevenueSA: XYZ Unit Trust, 75% of A$850,000 of residential land is caught");
});
