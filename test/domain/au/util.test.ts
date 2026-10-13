import assert from "node:assert/strict";
import { test } from "node:test";
import { ammaDue } from "../../../src/domain/au/calc.ts";
import { aiirDueDate } from "../../../src/domain/au/investor.ts";
import { auRates, BUILD_TO_RENT_FROM, buildToRentRates, COMPLYING_SUPER_RATE_BPS, heldForDiscount, INTEREST_WITHHOLDING_BPS, superNetGain, trustNetGain } from "../../../src/domain/au/rates.ts";
import {
  asAuFund,
  aud,
  audCompact,
  divRound,
  dollars,
  holdersOf,
  isAuHolder,
  mulBpsExact,
  noticesOf,
  nz,
  plural,
  propertiesOf,
  roundShares,
  roundToDollarCents,
  splitExact,
  tbRowsOf,
} from "../../../src/domain/au/util.ts";
import { ammaDueDate } from "../../../src/engine/au/amit.ts";
import { computeCgt } from "../../../src/engine/au/cgt.ts";
import { determineMemberWithholding } from "../../../src/engine/au/members.ts";
import { mitAiirDueDate } from "../../../src/engine/au/mitWithholding.ts";
import { addDays, addYears } from "../../../src/engine/dates.ts";
import { freshData, sum } from "./helpers.ts";

// ------------------------------------------------------------------------------------------------ exact allocation
test("roundShares: parts add up to the exact total, remainders go to the largest fraction, ties to the lowest index", () => {
  assert.deepEqual(roundShares([100n, 100n, 100n], 3n), [34, 33, 33]);
  assert.deepEqual(roundShares([1n, 1n, 1n], 3n), [1, 0, 0]);
  assert.deepEqual(roundShares([1n], 2n), [1], "half rounds up");
  assert.deepEqual(roundShares([1n, 0n], 2n), [1, 0]);
  assert.deepEqual(roundShares([7n, 21n, 14n], 10n), [1, 2, 1], "0.7 + 2.1 + 1.4 = 4.2 rounds to 4, and the largest fraction takes the extra cent");
  assert.deepEqual(roundShares([5n, 5n], 0n), [0, 0], "no denominator, nothing to share");
  assert.deepEqual(roundShares([], 7n), []);
});

test("roundShares stays exact beyond 2^53", () => {
  const big = 10n ** 20n;
  assert.deepEqual(roundShares([big, big, big], 3n * 10n ** 18n), [34, 33, 33]);
  const parts = roundShares([123456789012345678901n, 987654321098765432109n], 10n ** 18n);
  assert.deepEqual(parts, [123, 988]);
});

test("roundShares: random inputs always add up to the rounded total", () => {
  let seed = 12345;
  const next = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed;
  };
  for (let i = 0; i < 500; i++) {
    const n = 1 + (next() % 7);
    const nums = Array.from({ length: n }, () => BigInt(next() % 100000) * BigInt(next() % 100000));
    const den = BigInt(1 + (next() % 999999));
    const total = nums.reduce((a, b) => a + b, 0n);
    const expected = Number((2n * total + den) / (2n * den));
    const parts = roundShares(nums, den);
    assert.equal(sum(parts), expected);
    parts.forEach((p, k) => assert.ok(Math.abs(p - Number(nums[k]) / Number(den)) < 1, "each part is within a cent of its exact share"));
  }
});

test("splitExact divides cents by weight with no loss", () => {
  assert.deepEqual(splitExact(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(splitExact(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.deepEqual(splitExact(100, [3, 0, 1]), [75, 0, 25]);
  assert.deepEqual(splitExact(10, [-5, 5]), [0, 10], "a non-positive weight gets nothing");
  assert.deepEqual(splitExact(100, [0, 0]), [0, 0]);
  assert.deepEqual(splitExact(0, [1, 2]), [0, 0]);
  assert.deepEqual(splitExact(5, []), []);
  const parts = splitExact(9_007_199_254_740_991, [1_000_000_000_000, 3_000_000_000_000, 7]);
  assert.equal(sum(parts), 9_007_199_254_740_991, "sums are exact at the edge of safe integers");
  assert.ok(splitExact(-10, [0, 1]).every((n) => !Object.is(n, -0)));
});

test("mulBpsExact rounds half away from zero", () => {
  assert.equal(mulBpsExact(1, 5000), 1);
  assert.equal(mulBpsExact(-1, 5000), -1);
  assert.equal(mulBpsExact(333, 1500), 50);
  assert.equal(mulBpsExact(194, 1000), 19);
  assert.equal(mulBpsExact(195, 1000), 20);
  assert.equal(mulBpsExact(-195, 1000), -20);
  assert.equal(mulBpsExact(1_000_000_000_000_001, 1000), 100_000_000_000_000);
  assert.ok(Object.is(mulBpsExact(0, 1500), 0));
  assert.ok(Object.is(mulBpsExact(-1, 1), 0), "a fraction that rounds to zero is a plain zero");
});

test("divRound rounds half up and survives bad denominators", () => {
  assert.equal(divRound(7n, 2n), 4);
  assert.equal(divRound(5n, 2n), 3);
  assert.equal(divRound(4n, 3n), 1);
  assert.equal(divRound(5n, 3n), 2);
  assert.equal(divRound(0n, 5n), 0);
  assert.equal(divRound(5n, 0n), 0);
  assert.equal(divRound(5n, -2n), 0);
});

test("roundToDollarCents rounds to whole dollars, half away from zero", () => {
  assert.equal(roundToDollarCents(149), 100);
  assert.equal(roundToDollarCents(150), 200);
  assert.equal(roundToDollarCents(-150), -200);
  assert.equal(roundToDollarCents(-149), -100);
  assert.equal(roundToDollarCents(0), 0);
  assert.ok(Object.is(roundToDollarCents(-49), 0));
});

test("nz, dollars and plural", () => {
  assert.ok(Object.is(nz(-0), 0));
  assert.equal(nz(5), 5);
  assert.equal(nz(-5), -5);
  assert.equal(dollars(12345), 123.45);
  assert.equal(dollars(5), 0.05);
  assert.ok(Object.is(dollars(-0), 0));
  assert.equal(plural(1, "account"), "1 account");
  assert.equal(plural(2, "account"), "2 accounts");
  assert.equal(plural(0, "entry", "entries"), "0 entries");
  assert.equal(plural(1, "entry", "entries"), "1 entry");
});

test("aud and audCompact format Australian dollars", () => {
  assert.equal(aud(123456789), "A$1,234,568");
  assert.equal(aud(123456, 2), "A$1,234.56");
  assert.equal(aud(-5000), "−A$50");
  assert.equal(audCompact(123456789), "A$1.23m");
  assert.equal(audCompact(-4500000), "−A$45.0k");
});

// ------------------------------------------------------------------------------------------------ lookups
test("lookups return only the fund's own Australian records", () => {
  const data = freshData();
  assert.equal(holdersOf(data, "harbourline").length, 5);
  assert.ok(holdersOf(data, "harbourline").every((h) => h.fundId === "harbourline" && isAuHolder(h)));
  assert.deepEqual(holdersOf(data, "no-such-fund"), []);
  assert.equal(propertiesOf(data, "harbourline").length, 3);
  assert.ok(tbRowsOf(data, "kurrajong").every((r) => r.fundId === "kurrajong"));
  assert.ok(tbRowsOf(data, "kurrajong").length > 5);
  for (const id of ["harbourline", "southbank", "wattle", "kurrajong", "coastline"]) {
    const dates = noticesOf(data, id).map((n) => n.paymentDate);
    assert.deepEqual([...dates].sort(), dates, `${id}: notices run oldest first`);
    assert.ok(noticesOf(data, id).every((n) => n.fundId === id));
  }
  const sgHolder = data.holders.find((h) => !isAuHolder(h));
  assert.ok(sgHolder, "the seed has Singapore holders");
  assert.equal(isAuHolder(sgHolder), false);
});

test("asAuFund accepts an Australian fund and refuses any other market", () => {
  const data = freshData();
  const au = data.funds.find((f) => f.id === "harbourline");
  const sg = data.funds.find((f) => f.market !== "AU");
  assert.ok(au && sg);
  assert.equal(asAuFund(au).id, "harbourline");
  assert.throws(() => asAuFund(sg), new RegExp(`Fund ${sg.id} is not an Australian fund`));
});

// ------------------------------------------------------------------------------------------------ rates
test("auRates reads the engine's withholding rates and the trust and company rates", () => {
  const r = auRates("2026-06-30");
  assert.deepEqual(r.ordinary, { eoi: 1500, nonEoi: 3000 });
  assert.deepEqual(r.clean, { eoi: 1000, nonEoi: 3000 });
  assert.deepEqual(r.ncmi, { eoi: 3000, nonEoi: 3000 });
  assert.deepEqual(r.excluded, { eoi: 1500, nonEoi: 3000 });
  assert.deepEqual(r.interest, { eoi: 1000, nonEoi: 1000 });
  assert.equal(r.trustDiscountBps, 5000);
  assert.equal(r.companyBps, 3000);
  assert.equal(r.superBps, 1500);
  assert.equal(INTEREST_WITHHOLDING_BPS, 1000);
  assert.equal(COMPLYING_SUPER_RATE_BPS, 1500);
  assert.deepEqual(auRates("2026-06-30"), r, "the same answer on a second look");
});

test("buildToRentRates: 15% for an EOI-country member and 30% otherwise from 1 January 2025, and no rate before", () => {
  assert.equal(BUILD_TO_RENT_FROM, "2025-01-01");
  assert.deepEqual(buildToRentRates("2026-06-30"), { eoi: 1500, nonEoi: 3000 });
  assert.deepEqual(buildToRentRates("2025-01-01"), { eoi: 1500, nonEoi: 3000 });
  assert.equal(buildToRentRates("2024-12-31"), null);
  assert.equal(buildToRentRates("2020-06-30"), null);
  assert.deepEqual(buildToRentRates("2026-06-30"), buildToRentRates("2026-06-30"), "the same answer on a second look");
});

// The start date is the engine's (BTR_WITHHOLDING_RATES in engine/au/members.ts), which refuses an EOI member's build-to-rent payment before it.
test("BUILD_TO_RENT_FROM is the first day the engine accepts a build-to-rent fund payment", () => {
  const eoiPayment = (paymentDate: string) => () =>
    determineMemberWithholding({
      trustRegime: "AMIT",
      paymentDate,
      member: { memberClass: "FOREIGN_FUND_EOI" },
      actualCashPayment: 100,
      mitRateBuckets: { buildToRentFundPayment: 100 },
    });
  assert.doesNotThrow(eoiPayment(BUILD_TO_RENT_FROM));
  assert.throws(eoiPayment(addDays(BUILD_TO_RENT_FROM, -1)));
});

test("trust and super fund discounts come from the engine", () => {
  assert.equal(trustNetGain("2026-06-30", 1_000_000), 500_000);
  assert.equal(superNetGain("2026-06-30", 900_000), 600_000);
  assert.equal(trustNetGain("2026-06-30", 0), 0);
  assert.equal(trustNetGain("2026-06-30", -5), 0);
  assert.equal(superNetGain("2026-06-30", -5), 0);
  const engine = computeCgt({
    label: "x",
    entityType: "TRUST",
    acquisitionDate: "2024-06-30",
    disposalContractDate: "2026-06-30",
    capitalProceeds: 123_457,
    acquisitionPrice: 0,
  });
  assert.equal(trustNetGain("2026-06-30", 123_457), engine.netCapitalGain);
});

test("heldForDiscount agrees with the engine on the first anniversary and the day after", () => {
  for (const acquired of ["2023-06-30", "2024-02-29", "2025-03-01", "1999-09-20", "2000-01-01"]) {
    const anniversary = addYears(acquired, 1);
    for (const day of [addDays(anniversary, -1), anniversary, addDays(anniversary, 1)]) {
      const engine = computeCgt({
        label: "boundary",
        entityType: "TRUST",
        acquisitionDate: acquired,
        disposalContractDate: day,
        capitalProceeds: 2_000_000,
        acquisitionPrice: 1_000_000,
      });
      assert.equal(heldForDiscount(acquired, day), engine.methodUsed === "DISCOUNT", `${acquired} sold ${day}`);
    }
    assert.equal(heldForDiscount(acquired, anniversary), false, `${acquired}: no discount on the first anniversary itself`);
    assert.equal(heldForDiscount(acquired, addDays(anniversary, 1)), true);
  }
});

// ------------------------------------------------------------------------------------------------ due dates
test("ammaDue: three months after the income year, finishing on a month-end when the year does", () => {
  assert.equal(ammaDue("2026-06-30"), "2026-09-30");
  assert.equal(ammaDue("2026-09-30"), "2026-12-31");
  assert.equal(ammaDue("2026-12-31"), "2027-03-31");
  assert.equal(ammaDue("2026-02-28"), "2026-05-31");
  assert.equal(ammaDue("2024-02-29"), "2024-05-31");
  assert.equal(ammaDue("2026-06-15"), "2026-09-15", "a year that does not end on a month-end keeps the day");
});

test("aiirDueDate is 31 October for a 30 June year and unknown for a substituted accounting period", () => {
  assert.equal(aiirDueDate("2026-06-30"), "2026-10-31");
  assert.equal(aiirDueDate("2025-06-30"), "2025-10-31");
  assert.equal(aiirDueDate("2026-09-30"), "");
  assert.equal(aiirDueDate("2026-12-31"), "");
});

test("the withholding report is due 14 January (30 June year) or 14 April (30 September year)", () => {
  assert.equal(mitAiirDueDate("2026-06-30"), "2027-01-14");
  assert.equal(mitAiirDueDate("2026-09-30"), "2027-04-14");
});

// The income year ends 30 September, so "within 3 months after the end of the income year" runs to the end of 31 December (Acts Interpretation Act
// 1901 ss 2G and 36: the period starts the day after the year end, so three months finish at the end of 31 December). The reference's AMMA deadline
// for Coastline is 31 December, and so is ours (engine ammaDueDate was corrected to finish a month-end year on a month-end).
test(
  "engine ammaDueDate for a 30 September year end is 31 December",
  () => {
    assert.equal(ammaDueDate("2026-09-30"), "2026-12-31");
  },
);

// The same applies to every year end on the last day of a month when the month three on is longer.
test(
  "engine ammaDueDate for a February or April month-end year end is the last day of the month three months on",
  () => {
    assert.equal(ammaDueDate("2026-02-28"), "2026-05-31");
    assert.equal(ammaDueDate("2024-02-29"), "2024-05-31");
    assert.equal(ammaDueDate("2026-04-30"), "2026-07-31");
  },
);

test("the engine's ammaDueDate agrees with ammaDue for every 2026 month-end and two mid-month year ends", () => {
  const monthEnds = ["01-31", "02-28", "03-31", "04-30", "05-31", "06-30", "07-31", "08-31", "09-30", "10-31", "11-30", "12-31"].map((d) => `2026-${d}`);
  for (const end of [...monthEnds, "2026-06-15", "2026-01-30"]) assert.equal(ammaDue(end), ammaDueDate(end), end);
});