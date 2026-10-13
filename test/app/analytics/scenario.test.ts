import { test } from "node:test";
import assert from "node:assert/strict";
import { scenarioView } from "../../../src/domain/index.ts";
import type { ScenarioView } from "../../../src/domain/types.ts";
import { formatMoneyDraft, formatNumberDraft, parseMoneyDraft, parseNumberDraft } from "../../../src/app/ui/inputParsing.ts";
import {
  CASH_MIN,
  PAYOUT_LIMITS,
  PAYOUT_STEP,
  changedMeasures,
  isCurrentPosition,
  resolveScenarioFund,
  scenarioFundOptions,
  scenarioHint,
  scenarioValue,
  steppedPayout,
} from "../../../src/app/workspaces/analytics/scenario.ts";
import { PERSONAS, ctxOf, seed } from "../../domain/core-fixtures.ts";

const BAD_TEXT = /NaN|undefined|null|Infinity|\[object/;

function viewFor(userId: string, fundId: string, value?: number): ScenarioView {
  const data = seed();
  return scenarioView(data, fundId, ctxOf(data, userId), value);
}

/** What the page does when the user commits something in the box: the domain recomputes for the value that means. */
function afterEntering(userId: string, fundId: string, entered: number | null): ScenarioView {
  const current = viewFor(userId, fundId);
  return viewFor(userId, fundId, scenarioValue(current, entered));
}

const MONEY = { currency: "AUD", allowEmpty: true, min: CASH_MIN } as const;

// ------------------------------------------------------------------------------------------------ Singapore: taxable payout
test("payout: Loyang at 85% gives the verified figures", () => {
  const view = afterEntering("a-moreno", "loyang", 85);
  assert.equal(view.inputKind, "payout");
  assert.equal(view.inputLabel, "Taxable payout (% of taxable specified income)");
  assert.equal(view.inputValue, 85);
  assert.deepEqual(
    view.rows.map((row) => row.scenario),
    ["S$60,554,765", "S$10,686,135", "S$1,816,643", "S$2,422,191", "No"],
  );
  // Today's position stays on the left whatever the scenario says.
  assert.deepEqual(
    view.rows.map((row) => row.now),
    ["S$69,816,100", "S$1,424,800", "S$242,216", "S$2,792,644", "Yes"],
  );
  assert.deepEqual(
    view.rows.map((row) => row.measure),
    ["Taxable distribution", "Retained by the trust", "Trustee tax at 17%", "Withholding on the distribution", "Meets the 90% condition"],
  );
});

test("payout: typed and pasted variants of 85 all mean 85", () => {
  for (const text of ["85", " 85 ", "85%", "85.0", "85.00", "0085"]) {
    const parsed = parseNumberDraft(text, { allowEmpty: true, min: PAYOUT_LIMITS.min, max: PAYOUT_LIMITS.max, decimals: PAYOUT_LIMITS.decimals });
    assert.ok(parsed.ok, `${JSON.stringify(text)} should parse`);
    if (parsed.ok) assert.equal(scenarioValue({ inputKind: "payout", defaultValue: 98 }, parsed.value), 85, text);
  }
});

test("payout: the box refuses what is not a payout percentage, and keeps what was typed", () => {
  for (const text of ["abc", "101", "-5", "85.555", "1e2", "8 5 %%"]) {
    const parsed = parseNumberDraft(text, { allowEmpty: true, min: PAYOUT_LIMITS.min, max: PAYOUT_LIMITS.max, decimals: PAYOUT_LIMITS.decimals });
    assert.equal(parsed.ok, false, `${JSON.stringify(text)} should be refused`);
  }
  assert.deepEqual(parseNumberDraft("", { allowEmpty: true, min: 0, max: 100, decimals: 2 }), { ok: true, value: null });
  assert.deepEqual(parseNumberDraft("100", { allowEmpty: true, min: 0, max: 100, decimals: 2 }), { ok: true, value: 100 });
  assert.deepEqual(parseNumberDraft("0", { allowEmpty: true, min: 0, max: 100, decimals: 2 }), { ok: true, value: 0 });
});

test("payout: the extremes (0% and 100%) and half points compute without garbage", () => {
  for (const entered of [0, 0.5, 50, 90, 89.5, 99.5, 100]) {
    const view = afterEntering("a-moreno", "loyang", entered);
    for (const row of view.rows) {
      assert.doesNotMatch(row.now, BAD_TEXT, `${entered}: ${row.measure}`);
      assert.doesNotMatch(row.scenario, BAD_TEXT, `${entered}: ${row.measure}`);
    }
    assert.equal(view.inputValue, entered);
  }
  // 90 is the threshold: at 90% the condition is met, just under it is not.
  assert.equal(afterEntering("a-moreno", "loyang", 90).rows.at(-1)!.scenario, "Yes");
  assert.equal(afterEntering("a-moreno", "loyang", 89.5).rows.at(-1)!.scenario, "No");
});

test("payout: today's payout is the current position, so the reset button and the table agree", () => {
  for (const fundId of ["telok-ayer", "loyang", "meranti", "kallang"]) {
    const view = viewFor("a-moreno", fundId);
    assert.equal(view.inputValue, view.defaultValue, fundId);
    assert.equal(scenarioValue(view, view.defaultValue), undefined, `${fundId}: typing today's value`);
    assert.equal(scenarioValue(view, view.defaultValue + 0.004), undefined, `${fundId}: within rounding of today's value`);
    for (const row of view.rows) assert.equal(row.scenario, row.now, `${fundId}: ${row.measure}`);
  }
  assert.equal(viewFor("a-moreno", "loyang").defaultValue, 98);
  assert.equal(viewFor("a-moreno", "loyang").note, "The 90% condition applies to the year as a whole; withholding scales with the taxable distribution at today's unitholder mix (98.0% paid out now).");
});

// ------------------------------------------------------------------------------------------------ Australia: cash distribution
test("cash: Harbourline's current position matches the reference", () => {
  const view = viewFor("a-moreno", "harbourline");
  assert.equal(view.inputKind, "cash");
  assert.equal(view.inputLabel, "Cash distribution for the year");
  assert.equal(view.currency, "AUD");
  assert.equal(view.defaultValue, 9_244_600_000);
  assert.equal(view.inputValue, 9_244_600_000);
  assert.deepEqual(
    view.rows.map((row) => row.measure),
    ["Cash distribution", "AMIT cost base net amount", "Per unit (cents)", "Attributed to members"],
  );
  // From the reference capture (the per-unit figure there comes from different units on issue, so it is not pinned here).
  const byMeasure = Object.fromEntries(view.rows.map((row) => [row.measure, row]));
  assert.equal(byMeasure["Cash distribution"]!.now, "A$92,446,000");
  assert.equal(byMeasure["Cash distribution"]!.scenario, "A$92,446,000");
  assert.equal(byMeasure["AMIT cost base net amount"]!.now, "A$28,913,400 excess");
  assert.equal(byMeasure["AMIT cost base net amount"]!.scenario, "A$28,913,400 excess");
  assert.equal(byMeasure["Attributed to members"]!.now, "A$59,620,600");
  assert.equal(byMeasure["Attributed to members"]!.scenario, "A$59,620,600");
  assert.equal(view.note, "Attributed amounts and the fund payment don't change with cash. Paying less than the attributed amounts creates a shortfall that increases members' cost base.");
});

test("cash: typed and pasted variants of 92,446,000 all mean today's cash, with no digit concatenation", () => {
  const view = viewFor("a-moreno", "harbourline");
  const variants = ["92,446,000", "92446000", "A$92,446,000", "A$ 92,446,000", "$92,446,000", "AUD 92,446,000", " 92,446,000 ", "92,446,000.00", "92 446 000"];
  for (const text of variants) {
    const parsed = parseMoneyDraft(text, MONEY);
    assert.ok(parsed.ok, `${JSON.stringify(text)} should parse`);
    if (parsed.ok) {
      assert.equal(parsed.value, 9_244_600_000, text);
      assert.equal(scenarioValue(view, parsed.value), undefined, `${text}: equal to today's cash is the current position`);
    }
  }
});

test("cash: typing 92,446,000 one key at a time passes through honest amounts only", () => {
  const typed = "92,446,000";
  let seen = 0;
  for (let end = 1; end <= typed.length; end++) {
    const prefix = typed.slice(0, end);
    const parsed = parseMoneyDraft(prefix, MONEY);
    assert.ok(parsed.ok, `${JSON.stringify(prefix)} should parse while typing`);
    if (!parsed.ok) continue;
    // Each draft is read as exactly the digits typed so far (commas are only grouping), never as a mashed-up number.
    assert.equal(parsed.value, Number(prefix.replace(/,/g, "")) * 100, prefix);
    assert.ok(parsed.value! >= seen, "the amount only grows as digits are added");
    seen = parsed.value!;
  }
  assert.equal(seen, 9_244_600_000);
});

test("cash: selecting the old text and typing or pasting a new amount replaces it", () => {
  const view = viewFor("a-moreno", "harbourline");
  // The draft is replaced wholesale, so "9" typed over a selected "92,446,000" is 9 dollars, and a paste is the pasted amount.
  assert.deepEqual(parseMoneyDraft("9", MONEY), { ok: true, value: 900 });
  assert.deepEqual(parseMoneyDraft("7,000,000", MONEY), { ok: true, value: 700_000_000 });
  assert.equal(formatMoneyDraft(view.inputValue), "92,446,000", "the box shows the grouped figure when not being edited");
  assert.equal(formatMoneyDraft(scenarioValue(view, 700_000_000)!), "7,000,000");
});

test("cash: paying less than the attributed amounts turns the excess into a shortfall and leaves the rest alone", () => {
  const view = afterEntering("a-moreno", "harbourline", 700_000_000);
  assert.equal(view.inputValue, 700_000_000);
  const byMeasure = Object.fromEntries(view.rows.map((row) => [row.measure, row]));
  assert.equal(byMeasure["Cash distribution"]!.now, "A$92,446,000");
  assert.equal(byMeasure["Cash distribution"]!.scenario, "A$7,000,000");
  assert.match(byMeasure["AMIT cost base net amount"]!.now, /excess$/);
  assert.match(byMeasure["AMIT cost base net amount"]!.scenario, /shortfall$/);
  assert.equal(byMeasure["Attributed to members"]!.scenario, byMeasure["Attributed to members"]!.now, "attributed amounts don't change with cash");
  assert.deepEqual(changedMeasures(view.rows), ["Cash distribution", "AMIT cost base net amount", "Per unit (cents)"]);
  assert.deepEqual(changedMeasures(viewFor("a-moreno", "harbourline").rows), []);
});

test("cash: zero, an empty box and nonsense are all safe", () => {
  const view = viewFor("a-moreno", "harbourline");
  assert.equal(scenarioValue(view, null), undefined, "an empty box is the current position");
  assert.equal(scenarioValue(view, undefined), undefined);
  assert.equal(scenarioValue(view, Number.NaN), undefined);
  assert.equal(scenarioValue(view, Number.POSITIVE_INFINITY), undefined);
  assert.equal(scenarioValue(view, 0), 0);
  assert.deepEqual(parseMoneyDraft("", MONEY), { ok: true, value: null });
  for (const text of ["abc", "-5", "92,446,000.123", "1e5", "A$"]) assert.equal(parseMoneyDraft(text, MONEY).ok, false, JSON.stringify(text));
  const zero = afterEntering("a-moreno", "harbourline", 0);
  for (const row of zero.rows) {
    assert.doesNotMatch(row.now, BAD_TEXT, row.measure);
    assert.doesNotMatch(row.scenario, BAD_TEXT, row.measure);
  }
  assert.equal(zero.rows[0]!.scenario, "A$0");
});

test("cash: a fractional cent is rounded, not kept", () => {
  const view = viewFor("a-moreno", "harbourline");
  assert.equal(scenarioValue(view, 700_000_000.4), 700_000_000);
  assert.equal(scenarioValue(view, 9_244_600_000.4), undefined);
});

// ------------------------------------------------------------------------------------------------ which fund
test("fund: the user's pick wins while visible, then the app's selected fund, then the first visible fund", () => {
  const visible = ["harbourline", "southbank", "wattle"];
  assert.equal(resolveScenarioFund(visible, "southbank", "wattle"), "southbank");
  assert.equal(resolveScenarioFund(visible, null, "wattle"), "wattle");
  assert.equal(resolveScenarioFund(visible, undefined, "wattle"), "wattle");
  assert.equal(resolveScenarioFund(visible, "loyang", "wattle"), "wattle", "a pick the persona can no longer see falls back");
  assert.equal(resolveScenarioFund(visible, "loyang", "kallang"), "harbourline", "nothing chosen is visible: the first fund");
  assert.equal(resolveScenarioFund(visible, null, null), "harbourline");
  assert.equal(resolveScenarioFund([], "harbourline", "harbourline"), null);
});

test("fund: the select offers exactly the funds in view, by name", () => {
  const data = seed();
  const options = scenarioFundOptions(data.funds);
  assert.equal(options.length, 9);
  assert.deepEqual(options[0], { value: "harbourline", label: "Harbourline Office Trust" });
  assert.deepEqual(options.at(-1), { value: "kallang", label: "Kallang Riverside Retail REIT" });
  assert.deepEqual(scenarioFundOptions([]), []);
});

test("every persona gets a scenario for each fund it can see, in that fund's own terms", () => {
  const data = seed();
  for (const userId of PERSONAS) {
    const user = data.users.find((u) => u.id === userId)!;
    const funds = user.funds === "all" ? data.funds : data.funds.filter((fund) => (user.funds as string[]).includes(fund.id));
    assert.ok(funds.length > 0, userId);
    for (const fund of funds) {
      const view = scenarioView(data, fund.id, ctxOf(data, userId));
      assert.equal(view.inputKind, fund.market === "AU" ? "cash" : "payout", `${userId}/${fund.id}`);
      assert.equal(view.currency, fund.market === "AU" ? "AUD" : "SGD");
      assert.ok(view.rows.length >= 4);
      assert.ok(isCurrentPosition(scenarioValue(view, view.inputValue)), `${userId}/${fund.id}: the box's own value is the current position`);
      for (const row of view.rows) {
        assert.doesNotMatch(`${row.measure} ${row.now} ${row.scenario}`, BAD_TEXT, `${userId}/${fund.id}`);
      }
      assert.doesNotMatch(view.note, BAD_TEXT);
    }
  }
});

test("payout stepping: half a point at a time, snapped to the half-point grid like a native number box", () => {
  assert.equal(PAYOUT_STEP, 0.5);
  assert.equal(steppedPayout("72", 100, 1), 72.5);
  assert.equal(steppedPayout("72", 100, -1), 71.5);
  assert.equal(steppedPayout("72.3", 100, 1), 72.5);
  assert.equal(steppedPayout("72.3", 100, -1), 72);
  assert.equal(steppedPayout("72.5", 100, 1), 73);
  assert.equal(steppedPayout("72.5", 100, -1), 72);
  assert.equal(steppedPayout("0.15", 100, 1), 0.5);
  assert.equal(steppedPayout("89.99", 100, 1), 90);
  assert.equal(steppedPayout("1,000", 100, -1), 100, "grouped digits read as the number they are, then the limit applies");
  assert.equal(steppedPayout("50%", 100, 1), 50.5);
});

test("payout stepping: stops at the limits and starts from the current position when the box can't be read", () => {
  assert.equal(steppedPayout("100", 100, 1), PAYOUT_LIMITS.max);
  assert.equal(steppedPayout("99.8", 100, 1), PAYOUT_LIMITS.max);
  assert.equal(steppedPayout("100", 100, -1), 99.5);
  assert.equal(steppedPayout("0", 100, -1), PAYOUT_LIMITS.min);
  assert.equal(steppedPayout("0.2", 100, -1), PAYOUT_LIMITS.min);
  assert.equal(steppedPayout("150", 100, 1), PAYOUT_LIMITS.max, "past the limit it comes back inside");
  assert.equal(steppedPayout("150", 100, -1), PAYOUT_LIMITS.max);
  assert.equal(steppedPayout("", 85, 1), 85.5, "an empty box steps from the committed value");
  assert.equal(steppedPayout("abc", 85, -1), 84.5, "so does text that isn't a number");
  assert.equal(steppedPayout("", null, 1), 0.5, "with nothing committed either it starts at the minimum");
  assert.equal(steppedPayout("", null, -1), PAYOUT_LIMITS.min);
  for (const text of ["", "abc", "12", "12.25", "100", "0"]) {
    for (const direction of [1, -1] as const) {
      const next = steppedPayout(text, 40, direction);
      assert.ok(next >= PAYOUT_LIMITS.min && next <= PAYOUT_LIMITS.max, `${text}/${direction}`);
      assert.equal((next * 2) % 1, 0, `${text}/${direction}: on the half-point grid`);
    }
  }
});

test("hints and number formats", () => {
  assert.equal(scenarioHint("cash"), "Change the cash distribution to see how the position moves.");
  assert.equal(scenarioHint("payout"), "Between 0 and 100. Change it to see how the position moves.");
  assert.equal(formatNumberDraft(85, PAYOUT_LIMITS.decimals), "85");
  assert.equal(formatNumberDraft(89.5, PAYOUT_LIMITS.decimals), "89.5");
  assert.equal(isCurrentPosition(undefined), true);
  assert.equal(isCurrentPosition(85), false);
});
