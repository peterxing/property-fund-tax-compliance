import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMoneyDraft, formatNumberDraft, parseMoneyDraft, parseNumberDraft } from "../../src/app/ui/inputParsing.ts";

const aud = { currency: "AUD" } as const;

function ok<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  assert.equal(result.ok, true, result.ok ? "" : result.message);
  return (result as { ok: true; value: T }).value;
}

function message(result: { ok: true; value: unknown } | { ok: false; message: string }): string {
  assert.equal(result.ok, false, "expected a parse failure");
  return (result as { ok: false; message: string }).message;
}

describe("parseMoneyDraft", () => {
  it("reads plain and grouped amounts as cents", () => {
    assert.equal(ok(parseMoneyDraft("1250000", aud)), 125_000_000);
    assert.equal(ok(parseMoneyDraft("1,250,000", aud)), 125_000_000);
    assert.equal(ok(parseMoneyDraft("  1,250,000  ", aud)), 125_000_000);
    assert.equal(ok(parseMoneyDraft("0", aud)), 0);
  });

  it("reads decimals", () => {
    assert.equal(ok(parseMoneyDraft("1,250,000.50", aud)), 125_000_050);
    assert.equal(ok(parseMoneyDraft("12.5", aud)), 1250);
    assert.equal(ok(parseMoneyDraft(".5", aud)), 50);
    assert.equal(ok(parseMoneyDraft("12.", aud)), 1200);
    assert.equal(ok(parseMoneyDraft("0.07", aud)), 7);
    assert.equal(ok(parseMoneyDraft("-.5", aud)), -50);
    assert.equal(ok(parseMoneyDraft("(12.)", aud)), -1200);
    assert.equal(ok(parseMoneyDraft("1,234.", aud)), 123_400);
  });

  it("accepts a currency marker before the number", () => {
    assert.equal(ok(parseMoneyDraft("A$1,250,000.50", aud)), 125_000_050);
    assert.equal(ok(parseMoneyDraft("S$ 12.5", { currency: "SGD" })), 1250);
    assert.equal(ok(parseMoneyDraft("$99", aud)), 9900);
    assert.equal(ok(parseMoneyDraft("AUD 100", aud)), 10_000);
  });

  it("reads negatives written with a minus, a real minus sign or brackets", () => {
    assert.equal(ok(parseMoneyDraft("-1,200", aud)), -120_000);
    assert.equal(ok(parseMoneyDraft("\u22121,200", aud)), -120_000);
    assert.equal(ok(parseMoneyDraft("(1,200)", aud)), -120_000);
    assert.equal(ok(parseMoneyDraft("-A$1,200.40", aud)), -120_040);
  });

  it("treats an empty box as an error unless empty is allowed", () => {
    assert.match(message(parseMoneyDraft("", aud)), /Enter an amount/);
    assert.match(message(parseMoneyDraft("   ", aud)), /Enter an amount/);
    assert.equal(ok(parseMoneyDraft("", { ...aud, allowEmpty: true })), null);
  });

  it("rejects letters, exponents and stray symbols with a helpful message", () => {
    for (const text of ["abc", "1e5", "12 apples", "1,2,x", "--5", "1.2.3", "$", ".", "%12"]) {
      assert.match(message(parseMoneyDraft(text, aud)), /digits only/, text);
    }
  });

  it("rejects more than two decimal places", () => {
    assert.match(message(parseMoneyDraft("1.234", aud)), /two decimal places/);
  });

  it("rejects amounts too large to hold exactly, and says so rather than blaming the digits", () => {
    assert.match(message(parseMoneyDraft("99999999999999999999", aud)), /too large/);
    assert.match(message(parseMoneyDraft("A$ 100,000,000,000,000.50", aud)), /too large/);
    assert.match(message(parseMoneyDraft("(5", aud)), /digits only/);
  });

  it("applies the minimum and maximum", () => {
    assert.match(message(parseMoneyDraft("-1", { ...aud, min: 0 })), /zero or a positive amount/);
    assert.match(message(parseMoneyDraft("5", { ...aud, min: 1000 })), /A\$10\.00 or more/);
    assert.match(message(parseMoneyDraft("5,000", { ...aud, max: 100_000 })), /A\$1,000\.00 or less/);
    assert.equal(ok(parseMoneyDraft("10", { ...aud, min: 1000, max: 1000 })), 1000);
  });
});

describe("formatMoneyDraft", () => {
  it("groups digits and shows decimals only when needed", () => {
    assert.equal(formatMoneyDraft(125_000_000), "1,250,000");
    assert.equal(formatMoneyDraft(125_000_050), "1,250,000.50");
    assert.equal(formatMoneyDraft(1250), "12.50");
    assert.equal(formatMoneyDraft(5), "0.05");
    assert.equal(formatMoneyDraft(0), "0");
    assert.equal(formatMoneyDraft(99_900), "999");
  });

  it("keeps the sign of a negative amount", () => {
    assert.equal(formatMoneyDraft(-120_000), "-1,200");
    assert.equal(formatMoneyDraft(-5), "-0.05");
  });

  it("is empty for no value", () => {
    assert.equal(formatMoneyDraft(null), "");
    assert.equal(formatMoneyDraft(Number.NaN), "");
  });

  it("round-trips through the parser", () => {
    for (const cents of [0, 1, 99, 100, 101, 12_345, 99_999_999, 125_000_050, 9_007_199_254_740, -1, -120_000, -123_456_789]) {
      assert.equal(ok(parseMoneyDraft(formatMoneyDraft(cents), aud)), cents, String(cents));
    }
  });
});

describe("parseNumberDraft", () => {
  it("reads grouped numbers and percentages", () => {
    assert.equal(ok(parseNumberDraft("684,215,000")), 684_215_000);
    assert.equal(ok(parseNumberDraft("92.5%")), 92.5);
    assert.equal(ok(parseNumberDraft(" 7 ")), 7);
    assert.equal(ok(parseNumberDraft(".5")), 0.5);
    assert.equal(ok(parseNumberDraft("5.")), 5);
    assert.equal(ok(parseNumberDraft("-3")), -3);
    assert.equal(ok(parseNumberDraft("\u22123")), -3);
  });

  it("treats an empty box as an error unless empty is allowed", () => {
    assert.match(message(parseNumberDraft("")), /Enter a number/);
    assert.equal(ok(parseNumberDraft("", { allowEmpty: true })), null);
  });

  it("rejects letters, exponents and special values", () => {
    for (const text of ["abc", "1e3", "NaN", "Infinity", "1,2,x", "--1", "1.2.3", "%"]) {
      assert.match(message(parseNumberDraft(text)), /digits only/, text);
    }
  });

  it("limits decimal places but ignores trailing zeros", () => {
    assert.match(message(parseNumberDraft("1.234")), /at most 2 decimal places/);
    assert.equal(ok(parseNumberDraft("1.230")), 1.23);
    assert.equal(ok(parseNumberDraft("1.2345", { decimals: 4 })), 1.2345);
    assert.match(message(parseNumberDraft("1.5", { decimals: 0 })), /whole number/);
  });

  it("can require whole numbers", () => {
    assert.equal(ok(parseNumberDraft("412,000,000", { integer: true })), 412_000_000);
    assert.match(message(parseNumberDraft("1.5", { integer: true })), /whole number/);
    assert.equal(ok(parseNumberDraft("2.0", { integer: true })), 2);
  });

  it("applies the minimum and maximum", () => {
    assert.match(message(parseNumberDraft("-1", { min: 0 })), /Enter 0 or more/);
    assert.match(message(parseNumberDraft("101", { max: 100 })), /Enter 100 or less/);
    assert.equal(ok(parseNumberDraft("100", { min: 0, max: 100 })), 100);
  });

  it("rejects numbers beyond what a double can hold", () => {
    assert.match(message(parseNumberDraft("9".repeat(400))), /too large/);
  });
});

describe("formatNumberDraft", () => {
  it("groups digits and trims trailing zeros", () => {
    assert.equal(formatNumberDraft(684_215_000), "684,215,000");
    assert.equal(formatNumberDraft(92.5), "92.5");
    assert.equal(formatNumberDraft(92), "92");
    assert.equal(formatNumberDraft(1.2345, 4), "1.2345");
    assert.equal(formatNumberDraft(1.2345), "1.23");
  });

  it("hides floating point noise", () => {
    assert.equal(formatNumberDraft(0.1 + 0.2), "0.3");
  });

  it("keeps the sign but never shows a negative zero", () => {
    assert.equal(formatNumberDraft(-1234.5), "-1,234.5");
    assert.equal(formatNumberDraft(-0.001), "0");
  });

  it("is empty for no value", () => {
    assert.equal(formatNumberDraft(null), "");
    assert.equal(formatNumberDraft(Number.NaN), "");
  });

  it("round-trips through the parser", () => {
    for (const value of [0, 1, 92.5, 0.07, 412_000_000, -3.25]) {
      assert.equal(ok(parseNumberDraft(formatNumberDraft(value))), value, String(value));
    }
  });
});
