import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_RULES } from "../../../src/engine/registry.ts";
import { AU_ALL_RULES } from "../../../src/engine/au/registry.ts";
import { analyticsView } from "../../../src/domain/selectors.ts";
import { calendarView, icsCalendar, riskRegister, rulesRegister } from "../../../src/domain/portfolio/index.ts";
import { ctxOf, frozenSeed, skipUnlessReady } from "../core-fixtures.ts";

const NOW = new Date(2026, 9, 12, 9, 0, 0);

test("calendarView keeps the market-module Analytics deadline rows unchanged and adds portfolio metadata", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno", NOW);
  const analytics = analyticsView(data, ctx, "all").deadlines;
  const calendar = calendarView(data, ctx, "all", { showCompleted: true });
  for (const expected of analytics) {
    assert.ok(
      calendar.rows.some(
        (row) =>
          row.date === expected.date &&
          row.fundId === expected.fundId &&
          row.fundName === expected.fundName &&
          row.obligation === expected.obligation &&
          row.status === expected.status,
      ),
      `${expected.fundId} ${expected.obligation}`,
    );
  }
  assert.ok(calendar.rows.every((row) => row.fund && row.market && row.kind && row.workspaceRoute));
  assert.ok(calendar.counts.overdue >= analytics.filter((row) => row.status === "overdue").length);
});

test("calendarView filters by persona, market, fund, status and kind", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const brennan = calendarView(data, ctxOf(data, "l-brennan", NOW), "all", { showCompleted: true });
  assert.ok(brennan.rows.length > 0);
  assert.ok(brennan.rows.every((row) => row.market === "AU"));
  const southbank = calendarView(data, ctxOf(data, "a-moreno", NOW), "all", { fundId: "southbank", status: "overdue", kind: "AMMA", showCompleted: true });
  assert.deepEqual(southbank.rows.map((row) => [row.fundId, row.obligation, row.date, row.status]), [["southbank", "AMMA statements", "2026-09-30", "overdue"]]);
});

test("icsCalendar emits escaped, folded CRLF iCalendar events for open rows only with stable UIDs", { skip: skipUnlessReady("AU") }, () => {
  const data = frozenSeed();
  const row = {
    ...calendarView(data, ctxOf(data, "a-moreno", NOW), "AU", { fundId: "southbank", status: "overdue", kind: "AMMA", showCompleted: true }).rows[0]!,
    obligation: "AMMA, statements; review \\ evidence\n非常に長い説明テキスト非常に長い説明テキスト非常に長い説明テキスト",
  };
  const done = { ...row, status: "done" as const, obligation: "Done item" };
  const ics = icsCalendar([row, done], { now: new Date(Date.UTC(2026, 9, 12, 0, 0, 0)) });
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(ics.endsWith("\r\n"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/m);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.match(ics, /DTSTAMP:20261012T000000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260930/);
  assert.match(unfolded, /SUMMARY:Southbank Industrial Partners Fund — AMMA\\, statements\\; review \\\\ evidence\\n/);
  assert.doesNotMatch(ics, /Done item/);
  assert.equal(icsCalendar([row], { now: NOW }).match(/UID:(.*)\r\n/)?.[1], icsCalendar([row], { now: new Date(2030, 0, 1) }).match(/UID:(.*)\r\n/)?.[1]);
  for (const line of ics.split("\r\n").filter(Boolean)) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(ics.includes("\r\n "), "long multi-byte lines are folded");
});

test("riskRegister includes Southbank AMMA overdue and under-remitted withholding, plus CSV", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const register = riskRegister(data, ctxOf(data, "a-moreno", NOW), "all");
  const southbank = register.rows.filter((row) => row.fundId === "southbank");
  assert.ok(southbank.some((row) => row.title === "AMMA statements is overdue"));
  assert.ok(southbank.some((row) => /under-remitted|remitted/i.test(`${row.title} ${row.detail}`)));
  assert.ok(register.csv.rows.length === register.filteredRows.length);
  assert.ok(register.summary.bySeverity.exception > 0);
});

test("riskRegister respects persona filtering", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const brennan = riskRegister(data, ctxOf(data, "l-brennan", NOW), "all");
  assert.ok(brennan.rows.length > 0);
  assert.ok(brennan.rows.every((row) => row.market === "AU"));
  const pillai = riskRegister(data, ctxOf(data, "n-pillai", NOW), "all");
  assert.ok(pillai.rows.every((row) => row.market === "SG"));
  const lim = riskRegister(data, ctxOf(data, "s-lim", NOW), "all");
  assert.deepEqual([...new Set(lim.rows.map((row) => row.fundId))].sort(), ["meranti", "telok-ayer"]);
});

test("riskRegister deduplicates identical fund and title pairs and does not duplicate feature overdue obligations", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const register = riskRegister(data, ctxOf(data, "a-moreno", NOW), "all");
  const keys = register.rows.map((row) => `${row.fundId}|${row.title}`);
  assert.equal(keys.length, new Set(keys).size);
  const duplicateProne = register.rows.filter((row) => row.fundId === "southbank" && row.title === "BAS Jan–Mar 2026 is overdue");
  assert.ok(duplicateProne.length <= 1);
});

test("rulesRegister covers every AU and Singapore engine rule with sources, lookup, search and filters", () => {
  const register = rulesRegister();
  assert.equal(register.rows.length, AU_ALL_RULES.length + ALL_RULES.length);
  assert.ok(register.rows.every((row) => row.sources.length > 0));
  assert.ok(register.rows.every((row) => row.sources.every((source) => source.title && source.url && source.retrieved)));
  const first = register.rows[0]!;
  assert.equal(register.lookup(first.registryKey)?.registryKey, first.registryKey);
  assert.equal(register.lookup(first.id)?.id, first.id);
  assert.ok(rulesRegister({ market: "AU" }).filteredRows.every((row) => row.market === "AU"));
  assert.ok(rulesRegister({ search: first.sources[0]!.title.slice(0, 8) }).filteredRows.some((row) => row.registryKey === first.registryKey));
  assert.ok(rulesRegister({ confidence: "ASSUMPTION" }).filteredRows.every((row) => row.confidence === "ASSUMPTION"));
});
