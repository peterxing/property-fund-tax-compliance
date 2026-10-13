import { test } from "node:test";
import assert from "node:assert/strict";
import {
  centsPerUnit,
  compareDates,
  dateLabel,
  dateLabelWithWeekday,
  dateTimeLabel,
  groupDigits,
  integer,
  money,
  moneyCompact,
  moneyParen,
  parseMoneyInput,
  pct,
  perUnit,
  ratePct,
  slug,
  toISODate,
  toLocalDateTime,
} from "../../src/domain/format.ts";

const MINUS = "\u2212";

test("groupDigits and integer group thousands and use the typographic minus", () => {
  assert.equal(groupDigits("1234567"), "1,234,567");
  assert.equal(groupDigits("999"), "999");
  assert.equal(groupDigits("1000"), "1,000");
  assert.equal(integer(1412680000), "1,412,680,000");
  assert.equal(integer(0), "0");
  assert.equal(integer(-1234), `${MINUS}1,234`);
  assert.equal(integer(-0.2), "0", "a negative that rounds to zero has no sign");
});

test("money formats whole dollars by default and cents on request", () => {
  assert.equal(money(9244600036, "AUD"), "A$92,446,000");
  assert.equal(money(9244600036, "AUD", 2), "A$92,446,000.36");
  assert.equal(money(5, "SGD", 2), "S$0.05");
  assert.equal(money(0, "SGD"), "S$0");
  assert.equal(money(0, "AUD", 2), "A$0.00");
  assert.equal(money(99_999_999_99, "SGD", 2), "S$99,999,999.99");
});

test("money rounds whole dollars half up and never prints a negative zero", () => {
  assert.equal(money(149, "AUD"), "A$1");
  assert.equal(money(150, "AUD"), "A$2");
  assert.equal(money(-49, "AUD"), "A$0");
  assert.equal(money(-49, "AUD", 2), `${MINUS}A$0.49`);
  assert.equal(money(-118423300, "AUD"), `${MINUS}A$1,184,233`);
});

test("moneyParen brackets deductions and leaves positives alone", () => {
  assert.equal(moneyParen(-126320400, "AUD"), "(A$1,263,204.00)");
  assert.equal(moneyParen(126320400, "AUD"), "A$1,263,204.00");
  assert.equal(moneyParen(-500, "SGD", 0), "(S$5)");
  assert.equal(moneyParen(0, "SGD"), "S$0.00");
});

test("moneyCompact picks m, k or plain", () => {
  assert.equal(moneyCompact(9244600050, "AUD"), "A$92.45m");
  assert.equal(moneyCompact(40260000, "AUD"), "A$402.6k");
  assert.equal(moneyCompact(21200, "AUD"), "A$212");
  assert.equal(moneyCompact(100_000_000, "SGD"), "S$1.00m");
  assert.equal(moneyCompact(-120_000, "SGD"), `${MINUS}S$1.2k`);
  assert.equal(moneyCompact(0, "SGD"), "S$0");
});

test("pct takes a 0..100 value and ratePct a 0..1 rate", () => {
  assert.equal(pct(73.94), "73.9%");
  assert.equal(pct(8.2, 0), "8%");
  assert.equal(pct(100, 2), "100.00%");
  assert.equal(ratePct(0.15), "15%");
  assert.equal(ratePct(0.175), "17.5%");
  assert.equal(ratePct(0.3), "30%");
  assert.equal(ratePct(0), "0%");
  assert.equal(ratePct(0.0825), "8.25%");
});

test("per-unit helpers", () => {
  assert.equal(centsPerUnit(342030, 100000), 3.4203);
  assert.equal(centsPerUnit(100, 0), 0);
  assert.equal(centsPerUnit(100, -5), 0);
  assert.equal(perUnit(3.4203), "3.4203");
  assert.equal(perUnit(3.42031234, 6), "3.420312");
});

test("dates read as written, with no time zone conversion", () => {
  assert.equal(dateLabel("2026-09-30"), "30 Sep 2026");
  assert.equal(dateLabel("2026-01-05T23:59:59"), "5 Jan 2026");
  assert.equal(dateLabelWithWeekday("2026-09-30"), "Wed 30 Sep 2026");
  assert.equal(dateLabelWithWeekday("2026-10-13"), "Tue 13 Oct 2026");
  assert.equal(dateTimeLabel("2026-10-07T11:30:00"), "7 Oct 2026, 11:30");
  assert.equal(dateTimeLabel("2026-10-07T09:05:00"), "7 Oct 2026, 09:05");
});

test("toLocalDateTime and toISODate use the local wall clock", () => {
  const when = new Date(2026, 9, 3, 4, 5, 6);
  assert.equal(toLocalDateTime(when), "2026-10-03T04:05:06");
  assert.equal(toISODate(when), "2026-10-03");
  assert.equal(toLocalDateTime(new Date(2026, 11, 31, 23, 59, 59)), "2026-12-31T23:59:59");
});

test("compareDates orders ISO dates", () => {
  assert.equal(compareDates("2026-09-30", "2026-10-01"), -1);
  assert.equal(compareDates("2026-10-01", "2026-09-30"), 1);
  assert.equal(compareDates("2026-10-01", "2026-10-01"), 0);
});

test("slug makes file-name safe words", () => {
  assert.equal(slug("Telok Ayer Commercial REIT"), "telok-ayer-commercial-reit");
  assert.equal(slug("Harbourline Office & Retail"), "harbourline-office-and-retail");
  assert.equal(slug("  --Odd__name!  "), "odd-name");
});

test("parseMoneyInput reads typed amounts into cents", () => {
  assert.equal(parseMoneyInput("92,446,000"), 9244600000);
  assert.equal(parseMoneyInput("A$92,446,000.50"), 9244600050);
  assert.equal(parseMoneyInput("S$ 1,200"), 120000);
  assert.equal(parseMoneyInput("0.5"), 50);
  assert.equal(parseMoneyInput(`${MINUS}1,200`), -120000);
  assert.equal(parseMoneyInput("-1,200"), -120000);
  assert.equal(parseMoneyInput("(1,200)"), -120000);
  assert.equal(parseMoneyInput("  42  "), 4200);
});

test("parseMoneyInput rejects what is not an amount", () => {
  assert.equal(parseMoneyInput(""), null);
  assert.equal(parseMoneyInput("   "), null);
  assert.equal(parseMoneyInput("abc"), null);
  assert.equal(parseMoneyInput("1.234"), null, "more than two decimals");
  assert.equal(parseMoneyInput("1.2.3"), null);
  assert.equal(parseMoneyInput("12 34 .5.5"), null);
});

test("money and parseMoneyInput round trip", () => {
  for (const cents of [0, 5, 99, 100, 123456789, 9244600036, -4200]) {
    const text = money(cents, "AUD", 2);
    assert.equal(parseMoneyInput(text), cents, text);
  }
});
