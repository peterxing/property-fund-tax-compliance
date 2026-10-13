import { test } from "node:test";
import assert from "node:assert/strict";
import { leakageHeadline, mixHeadline } from "../../src/domain/core/analytics.ts";
import { money } from "../../src/domain/format.ts";
import { moduleFor } from "../../src/domain/modules.ts";
import { analyticsView, fundCalc, scenarioView, visibleFunds } from "../../src/domain/selectors.ts";
import type { JurisdictionFilter, LeakageRow, MixRow } from "../../src/domain/types.ts";
import { AU_FUNDS, NOW, PERSONAS, SG_FUNDS, chain, ctxOf, frozenSeed, fundOf, ok, skipUnlessReady, userOf } from "./core-fixtures.ts";

const JURISDICTIONS: JurisdictionFilter[] = ["all", "AU", "SG"];
const ALL_FUNDS = [...AU_FUNDS, ...SG_FUNDS];
const NO_FUNDS = "There are no funds to compare.";

const idOf = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const leak = (fundName: string, over: Partial<LeakageRow> = {}): LeakageRow => ({
  fundId: idOf(fundName),
  fundName,
  currency: "AUD",
  distribution: 100_000_000,
  finalWithholding: 0,
  recoverable: 0,
  trusteeTax: 0,
  totalPct: 0,
  ...over,
});
const mixOf = (fundName: string, taxable: number): MixRow => ({
  fundId: idOf(fundName),
  fundName,
  taxable,
  capitalGains: 0,
  taxExempt: 0,
  taxDeferredAndCapital: 100 - taxable,
});

// ---------------------------------------------------------------------------------------------------- headline sentences

test("leakageHeadline names the fund that loses the most, how much, and the biggest cause", () => {
  const rows = [
    leak("Alpha Fund", { finalWithholding: 2_000_000, totalPct: 2 }),
    leak("Beta Fund", { finalWithholding: 8_200_000, totalPct: 8.2 }),
    leak("Gamma Fund", { recoverable: 5_000_000, totalPct: 5 }),
  ];
  assert.equal(leakageHeadline(rows), "Beta Fund loses the most, 8.2% of its distribution, mostly final withholding (8.2%).");
});

test("leakageHeadline words each of the three causes", () => {
  assert.equal(
    leakageHeadline([leak("Fund A", { finalWithholding: 2_000_000, recoverable: 4_000_000, trusteeTax: 1_000_000, totalPct: 7 })]),
    "Fund A loses the most, 7.0% of its distribution, mostly withholding holders can recover (4.0%).",
  );
  assert.equal(
    leakageHeadline([leak("Fund B", { finalWithholding: 1_000_000, recoverable: 2_000_000, trusteeTax: 7_500_000, totalPct: 10.5 })]),
    "Fund B loses the most, 10.5% of its distribution, mostly tax paid by the trustee (7.5%).",
  );
  assert.equal(
    leakageHeadline([leak("Fund C", { finalWithholding: 5_900_000, recoverable: 2_000_000, trusteeTax: 1_000_000, totalPct: 8.9 })]),
    "Fund C loses the most, 8.9% of its distribution, mostly final withholding (5.9%).",
  );
});

test("leakageHeadline breaks a tie between causes in the order withholding, recoverable, trustee", () => {
  assert.match(leakageHeadline([leak("A", { finalWithholding: 3_000_000, recoverable: 3_000_000, trusteeTax: 3_000_000, totalPct: 9 })]), /mostly final withholding \(3\.0%\)/);
  assert.match(leakageHeadline([leak("A", { recoverable: 3_000_000, trusteeTax: 3_000_000, totalPct: 6 })]), /mostly withholding holders can recover \(3\.0%\)/);
});

test("leakageHeadline gives the first of two equal funds", () => {
  const rows = [leak("First", { finalWithholding: 5_000_000, totalPct: 5 }), leak("Second", { finalWithholding: 5_000_000, totalPct: 5 })];
  assert.match(leakageHeadline(rows), /^First loses the most, 5\.0% of its distribution/);
  assert.match(leakageHeadline([...rows].reverse()), /^Second loses the most/);
});

test("leakageHeadline has plain words for nothing to compare and nothing lost", () => {
  assert.equal(leakageHeadline([]), NO_FUNDS);
  assert.equal(leakageHeadline([leak("A"), leak("B")]), "None of these funds loses any of its distribution to tax.");
});

test("leakageHeadline copes with an empty distribution", () => {
  const sentence = leakageHeadline([leak("Empty Fund", { distribution: 0, finalWithholding: 100, totalPct: 3 })]);
  assert.doesNotMatch(sentence, /NaN|Infinity|undefined/);
  assert.match(sentence, /^Empty Fund loses the most, 3\.0% of its distribution/);
});

test("mixHeadline gives the lowest and highest taxable share in whole percentages", () => {
  const rows = [mixOf("Mid Fund", 70.3), mixOf("Low Fund", 60.3), mixOf("High Fund", 100)];
  assert.equal(mixHeadline(rows), "Taxable income ranges from 60% of the distribution (Low Fund) to 100% (High Fund).");
  assert.equal(mixHeadline([mixOf("A", 59.5), mixOf("B", 99.4)]), "Taxable income ranges from 60% of the distribution (A) to 99% (B).");
});

test("mixHeadline gives the first fund at each end when funds tie", () => {
  const rows = [mixOf("One", 60), mixOf("Two", 60), mixOf("Top", 90), mixOf("Peak", 90)];
  assert.equal(mixHeadline(rows), "Taxable income ranges from 60% of the distribution (One) to 90% (Top).");
});

test("mixHeadline has plain words for one fund, funds that agree, and no funds", () => {
  assert.equal(mixHeadline([mixOf("Solo Fund", 92.1)]), "Taxable income is 92% of the distribution (Solo Fund).");
  assert.equal(mixHeadline([mixOf("A", 80), mixOf("B", 80.2)]), "Taxable income is 80% of the distribution in every fund.");
  assert.equal(mixHeadline([]), NO_FUNDS);
});

// ---------------------------------------------------------------------------------------------------- the analytics view

test("analyticsView words its headlines like the reference (Australia and Singapore together)", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const view = analyticsView(data, ctxOf(data, "a-moreno"), "all");
  assert.equal(view.leakageHeadline, "Southbank Industrial Partners Fund loses the most, 8.2% of its distribution, mostly final withholding (8.2%).");
  assert.equal(view.mixHeadline, "Taxable income ranges from 60% of the distribution (Harbourline Office Trust) to 100% (Kallang Riverside Retail REIT).");
});

test("analyticsView headlines follow the jurisdiction toggle", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const moreno = ctxOf(data, "a-moreno");
  const sg = analyticsView(data, moreno, "SG");
  assert.equal(sg.leakageHeadline, "Meranti Digital Infrastructure REIT loses the most, 5.9% of its distribution, mostly final withholding (3.8%).");
  assert.equal(sg.mixHeadline, "Taxable income ranges from 92% of the distribution (Telok Ayer Commercial REIT) to 100% (Kallang Riverside Retail REIT).");
  const au = analyticsView(data, moreno, "AU");
  assert.equal(au.leakageHeadline, "Southbank Industrial Partners Fund loses the most, 8.2% of its distribution, mostly final withholding (8.2%).");
  assert.equal(au.mixHeadline, "Taxable income ranges from 60% of the distribution (Harbourline Office Trust) to 87% (Coastline Healthcare Property Fund).");
});

test("analyticsView: one leakage row and one mix row per visible fund, in seed order, with headlines drawn from those rows", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  for (const id of PERSONAS) {
    const ctx = ctxOf(data, id);
    for (const jurisdiction of JURISDICTIONS) {
      const view = analyticsView(data, ctx, jurisdiction);
      const visible = visibleFunds(data, ctx.user, jurisdiction);
      const where = `${id} / ${jurisdiction}`;
      assert.deepEqual(view.leakage.map((r) => r.fundId), visible.map((f) => f.id), where);
      assert.deepEqual(view.mix.map((r) => r.fundId), visible.map((f) => f.id), where);
      assert.deepEqual(view.leakage.map((r) => r.fundName), visible.map((f) => f.name), where);
      assert.deepEqual(view.leakage.map((r) => r.currency), visible.map((f) => f.currency), where);
      assert.equal(view.leakageHeadline, leakageHeadline(view.leakage), where);
      assert.equal(view.mixHeadline, mixHeadline(view.mix), where);
      const allowed = new Set(visible.map((f) => f.id));
      assert.ok(view.deadlines.every((d) => allowed.has(d.fundId)), `${where}: deadlines of visible funds only`);
    }
  }
});

test("analyticsView for a persona with nothing in the chosen market is empty but still readable", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  for (const [id, jurisdiction] of [["l-brennan", "SG"], ["n-pillai", "AU"], ["s-lim", "AU"]] as const) {
    const view = analyticsView(data, ctxOf(data, id), jurisdiction);
    assert.deepEqual(view, {
      leakage: [],
      leakageHeadline: NO_FUNDS,
      mix: [],
      mixHeadline: NO_FUNDS,
      deadlines: [],
      overdueCount: 0,
    });
  }
});

test("analyticsView: a view-only persona sees the same analytics as the head of tax", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  assert.deepEqual(analyticsView(data, ctxOf(data, "m-castillo"), "all"), analyticsView(data, ctxOf(data, "a-moreno"), "all"));
  assert.deepEqual(analyticsView(data, ctxOf(data, "r-okafor"), "all"), analyticsView(data, ctxOf(data, "l-brennan"), "all"));
});

test("analyticsView: a persona's headlines come from their own funds only", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const harrow = analyticsView(data, ctxOf(data, "d-harrow"), "all");
  assert.deepEqual(harrow.leakage.map((r) => r.fundId), ["harbourline", "southbank", "kurrajong"]);
  assert.equal(harrow.mixHeadline, "Taxable income ranges from 60% of the distribution (Harbourline Office Trust) to 70% (Kurrajong Stapled Property Trust).");
  const lim = analyticsView(data, ctxOf(data, "s-lim"), "all");
  assert.deepEqual(lim.mix.map((r) => r.fundId), ["telok-ayer", "meranti"]);
  assert.match(lim.leakageHeadline, /^Meranti Digital Infrastructure REIT loses the most/);
});

test("analyticsView: shares are percentages, amounts are not negative, and every mix adds up to the whole distribution", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const view = analyticsView(data, ctxOf(data, "a-moreno"), "all");
  assert.equal(view.leakage.length, ALL_FUNDS.length);
  for (const row of view.leakage) {
    assert.ok(row.distribution > 0, row.fundId);
    for (const amount of [row.finalWithholding, row.recoverable, row.trusteeTax]) assert.ok(Number.isFinite(amount) && amount >= 0, `${row.fundId} amount`);
    assert.ok(row.totalPct >= 0 && row.totalPct <= 100, `${row.fundId} totalPct ${row.totalPct}`);
  }
  for (const row of view.mix) {
    const parts = [row.taxable, row.capitalGains, row.taxExempt, row.taxDeferredAndCapital];
    for (const part of parts) assert.ok(part >= -1e-9 && part <= 100 + 1e-9, `${row.fundId} part ${part}`);
    assert.ok(Math.abs(parts.reduce((a, b) => a + b, 0) - 100) < 0.01, `${row.fundId} adds up to 100`);
  }
});

test("analyticsView leakage rows are the market module's rows for the same calculation", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  const view = analyticsView(data, ctx, "all");
  data.funds.forEach((fund, i) => {
    const calc = fundCalc(data, fund.id, ctx.now);
    assert.deepEqual(view.leakage[i], moduleFor(fund.market).leakage(fund, calc), fund.id);
    assert.deepEqual(view.mix[i], moduleFor(fund.market).mix(fund, calc), fund.id);
  });
});

test("analyticsView follows the data: a new cash distribution shows in the leakage row", { skip: skipUnlessReady("AU") }, () => {
  const data = frozenSeed();
  const before = analyticsView(data, ctxOf(data, "r-okafor"), "AU").leakage.find((r) => r.fundId === "coastline");
  assert.equal(before?.distribution, 2104800000);
  const next = ok(data, "r-okafor", { type: "update-inputs", fundId: "coastline", inputs: { cashDistribution: 2000000000 } });
  const after = analyticsView(next, ctxOf(next, "r-okafor"), "AU").leakage.find((r) => r.fundId === "coastline");
  assert.equal(after?.distribution, 2000000000);
});

// ---------------------------------------------------------------------------------------------------- deadlines

const at = (iso: string): Date => new Date(`${iso}T10:00:00`);

test("analyticsView deadlines: earliest first, equal dates in fund order, finished items included", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const view = analyticsView(data, ctxOf(data, "a-moreno"), "all");
  const order = new Map(data.funds.map((f, i) => [f.id, i]));
  assert.ok(view.deadlines.length > 0);
  for (let i = 1; i < view.deadlines.length; i++) {
    const [a, b] = [view.deadlines[i - 1], view.deadlines[i]];
    assert.ok(a.date <= b.date, `${a.date} then ${b.date}`);
    if (a.date === b.date) assert.ok((order.get(a.fundId) ?? 0) <= (order.get(b.fundId) ?? 0), `${a.date}: ${a.fundId} before ${b.fundId}`);
  }
  assert.ok(view.deadlines.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.obligation !== "" && ["overdue", "open", "done"].includes(d.status)));
  for (const d of view.deadlines) assert.equal(d.fundName, fundOf(data, d.fundId).name);
  assert.ok(view.deadlines.some((d) => d.status === "done"), "done items are listed (the screen hides them unless asked)");
  assert.ok(view.deadlines.some((d) => d.status === "open"));
  assert.equal(new Set(view.deadlines.map((d) => d.fundId)).size, ALL_FUNDS.length, "every fund has obligations");
});

test("analyticsView: overdueCount counts the overdue rows, and only items past their date are overdue", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  for (const iso of ["2026-09-01", "2026-10-13", "2026-10-31", "2027-06-01"]) {
    const ctx = ctxOf(data, "a-moreno", at(iso));
    const view = analyticsView(data, ctx, "all");
    assert.equal(view.overdueCount, view.deadlines.filter((d) => d.status === "overdue").length, iso);
    for (const d of view.deadlines) {
      if (d.status === "overdue") assert.ok(d.date < iso, `${iso}: ${d.fundId} ${d.obligation} due ${d.date} is overdue`);
      if (d.status === "open") assert.ok(d.date >= iso, `${iso}: ${d.fundId} ${d.obligation} due ${d.date} is still open`);
    }
  }
});

test("analyticsView: items fall overdue as time passes and never come back", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const counts = ["2026-09-01", "2026-10-13", "2027-02-01", "2027-06-01"].map((iso) => analyticsView(data, ctxOf(data, "a-moreno", at(iso)), "all").overdueCount);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `overdue counts ${counts.join(", ")}`);
  assert.ok(counts[counts.length - 1] > counts[0]);
});

test("analyticsView on 13 Oct 2026: the two Australian funds still in review owe overdue AMMA statements", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const view = analyticsView(data, ctxOf(data, "a-moreno"), "all");
  const overdue = view.deadlines.filter((d) => d.status === "overdue");
  assert.deepEqual(overdue.map((d) => [d.fundId, d.obligation, d.date]), [
    ["southbank", "AMMA statements", "2026-09-30"],
    ["kurrajong", "AMMA statements", "2026-09-30"],
  ]);
  assert.equal(view.overdueCount, 2);
  assert.equal(analyticsView(data, ctxOf(data, "a-moreno"), "SG").overdueCount, 0);
  assert.equal(analyticsView(data, ctxOf(data, "n-pillai"), "all").overdueCount, 0);
  assert.equal(analyticsView(data, ctxOf(data, "d-harrow"), "all").overdueCount, 2);
});

test("analyticsView: signing a fund off settles its overdue statements", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const signed = chain(data, [
    ["l-brennan", { type: "approve", fundId: "southbank", level: "review" }],
    ["d-harrow", { type: "approve", fundId: "southbank", level: "agent" }],
    ["a-moreno", { type: "sign-off", fundId: "southbank" }],
  ]);
  const view = analyticsView(signed, ctxOf(signed, "a-moreno"), "all");
  assert.deepEqual(view.deadlines.filter((d) => d.status === "overdue").map((d) => d.fundId), ["kurrajong"]);
  assert.equal(view.overdueCount, 1);
});

// ---------------------------------------------------------------------------------------------------- scenario

test("scenarioView: the same shape for every fund, and without a value it shows the current position", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  for (const fund of data.funds) {
    const view = scenarioView(data, fund.id, ctx);
    assert.equal(view.fundId, fund.id);
    assert.equal(view.currency, fund.currency);
    assert.equal(view.inputKind, fund.market === "AU" ? "cash" : "payout", fund.id);
    assert.equal(view.inputValue, view.defaultValue, fund.id);
    assert.ok(view.inputLabel.length > 0 && view.note.length > 0 && view.rows.length > 0, fund.id);
    for (const row of view.rows) {
      assert.ok(row.measure && row.now && row.scenario, `${fund.id}: ${JSON.stringify(row)}`);
      assert.equal(row.scenario, row.now, `${fund.id}: ${row.measure} is unchanged without a new value`);
    }
  }
});

test("scenarioView takes cents for an Australian fund and a payout percentage for a Singapore fund", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");

  const base = scenarioView(data, "southbank", ctx);
  assert.equal(base.inputLabel, "Cash distribution for the year");
  assert.equal(base.defaultValue, 4721200000);
  const more = scenarioView(data, "southbank", ctx, 7081800000);
  assert.equal(more.inputValue, 7081800000);
  assert.equal(more.defaultValue, base.defaultValue, "the current position does not move");
  assert.deepEqual(more.rows.map((r) => r.now), base.rows.map((r) => r.now), "the current column does not move");
  assert.equal(more.rows[0].scenario, money(7081800000, "AUD"));
  assert.notEqual(more.rows[0].scenario, more.rows[0].now);

  const sg = scenarioView(data, "telok-ayer", ctx);
  assert.equal(sg.inputLabel, "Taxable payout (% of taxable specified income)");
  assert.equal(sg.defaultValue, 100);
  const half = scenarioView(data, "telok-ayer", ctx, 50);
  assert.equal(half.inputValue, 50);
  assert.deepEqual(half.rows.map((r) => r.now), sg.rows.map((r) => r.now));
  assert.ok(half.rows.some((r) => r.scenario !== r.now));
});

test("scenarioView is the market module's scenario for the same calculation", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  for (const [id, value] of [["southbank", 5000000000], ["southbank", undefined], ["telok-ayer", 80], ["kallang", undefined]] as const) {
    const fund = fundOf(data, id);
    assert.deepEqual(scenarioView(data, id, ctx, value), moduleFor(fund.market).scenario(data, fund, fundCalc(data, id, ctx.now), value), `${id} ${value}`);
  }
});

test("scenarioView leaves the data alone and reads the persona only for the clock", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const before = JSON.stringify(data);
  for (const id of PERSONAS) {
    const user = userOf(data, id);
    assert.deepEqual(scenarioView(data, "meranti", { user, now: NOW }, 90), scenarioView(data, "meranti", ctxOf(data, "a-moreno"), 90), id);
  }
  assert.equal(JSON.stringify(data), before);
});
