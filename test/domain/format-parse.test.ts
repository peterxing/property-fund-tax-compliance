import assert from "node:assert/strict";
import test from "node:test";
import { parseMoneyInput } from "../../src/domain/format.ts";

const MINUS = "\u2212";

test("parseMoneyInput accepts every supported way of typing an amount", () => {
  const cases: Array<[string, number]> = [
    ["92,446,000", 9244600000],
    ["A$92,446,000.50", 9244600050],
    ["S$ 1,200", 120000],
    ["aud 5", 500],
    ["SGD0.07", 7],
    ["$ 10", 1000],
    ["0.5", 50],
    ["  42  ", 4200],
    ["1 200 000", 120000000],
    [`${MINUS}1,200`, -120000],
    ["-1,200", -120000],
    ["-A$1,200", -120000],
    ["A$-1,200", -120000],
    [`S$ ${MINUS}1,200.25`, -120025],
    ["(1,200)", -120000],
    ["(A$1,200.10)", -120010],
    ["0", 0],
    ["-0", 0],
    ["1.15", 115],
    ["90071992547409.91", 9007199254740991],
  ];
  for (const [text, cents] of cases) assert.equal(Object.is(parseMoneyInput(text), cents), true, `${JSON.stringify(text)} -> ${parseMoneyInput(text)}`);
});

test("parseMoneyInput rejects anything that is not a clean amount", () => {
  const bad = [
    "", "   ", "abc", "1e5", "1E5", "12abc3", "1,200 AUD", "A$A$5", "5%", "1.234", "1.2.3", "12 34 .5.5", ".5", "5.", "--5", `-${MINUS}5`,
    "(-1,200)", `(${MINUS}1)`, "A$", "-", "()", "NaN", "Infinity", "0x10", "1_000", "90071992547409.99", "99999999999999999999",
  ];
  for (const text of bad) assert.equal(parseMoneyInput(text), null, JSON.stringify(text));
});

test("parseMoneyInput is exact for large amounts (no floating point rounding)", () => {
  assert.equal(parseMoneyInput("90071992547409.90"), 9007199254740990);
  assert.equal(parseMoneyInput("90071992547409.91"), 9007199254740991);
  assert.equal(parseMoneyInput("90071992547409.92"), null);
  assert.equal(parseMoneyInput("1234567890123.45"), 123456789012345);
  assert.equal(parseMoneyInput("0.29"), 29);
  assert.equal(parseMoneyInput("1.15"), 115);
  assert.equal(parseMoneyInput("4.35"), 435);
  assert.equal(parseMoneyInput("1.005"), null, "three decimals are not an amount");
  assert.equal(parseMoneyInput(`${MINUS}90071992547409.91`), -9007199254740991);
});
