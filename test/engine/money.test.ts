import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, ceilToDollar, floorToDollar, formatBps, formatSGD, mulBps, mulRatio, ratioBps, roundToDollar, toCents } from "../../src/engine/money.ts";

test("toCents parses common formats without float error", () => {
  assert.equal(toCents("1,234.56"), 123456);
  assert.equal(toCents("$1,234.5"), 123450);
  assert.equal(toCents("(1,234.56)"), -123456);
  assert.equal(toCents("-0.01"), -1);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents("S$ 12"), 1200);
  assert.equal(toCents(""), 0);
  assert.throws(() => toCents("12abc"));
});

test("mulBps rounds half away from zero and is exact for large amounts", () => {
  assert.equal(mulBps(100000, 1700), 17000); // 17% of $1,000
  assert.equal(mulBps(5, 1000), 1); // 0.5 rounds up
  assert.equal(mulBps(-5, 1000), -1);
  assert.equal(mulBps(1_000_000_000_000, 1700), 170_000_000_000); // S$10bn x 17%
  assert.equal(mulBps(123456, 0), 0);
});

test("mulRatio / ratioBps", () => {
  assert.equal(mulRatio(10000, 1, 3), 3333);
  assert.equal(mulRatio(10000, 2, 3), 6667);
  assert.equal(mulRatio(10000, 1, 0), 0);
  assert.equal(ratioBps(25, 100), 2500);
  assert.equal(ratioBps(1, 3), 3333);
  assert.equal(ratioBps(1, 0), 0);
});

test("dollar rounding helpers", () => {
  assert.equal(floorToDollar(12399), 12300);
  assert.equal(ceilToDollar(12301), 12400);
  assert.equal(roundToDollar(12350), 12400);
  assert.equal(roundToDollar(-12350), -12400);
  assert.equal(roundToDollar(12349), 12300);
});

test("allocate keeps the total exact", () => {
  const parts = allocate(100, [1, 1, 1]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(parts.slice().sort(), [33, 33, 34]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocate(100, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(-100, [1, 3]), [-25, -75]);
});

test("formatSGD", () => {
  assert.equal(formatSGD(123456789), "S$1,234,567.89");
  assert.equal(formatSGD(-5000, { parens: true }), "(S$50.00)");
  assert.equal(formatSGD(123400, { cents: false, symbol: false }), "1,234");
  assert.equal(formatBps(1700), "17%");
  assert.equal(formatBps(40), "0.4%");
});
