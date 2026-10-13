import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticsView } from "../../../src/domain/index.ts";
import type { AnalyticsView, JurisdictionFilter } from "../../../src/domain/types.ts";
import { stackedLayout } from "../../../src/app/charts/stackedBars.ts";
import {
  DEADLINE_STATUS_LABEL,
  LEAKAGE_COLUMNS,
  LEAKAGE_SERIES,
  MIX_COLUMNS,
  MIX_SERIES,
  analyticsEmptyMessage,
  colorsOf,
  completedCount,
  deadlineDate,
  deadlinesAnnouncement,
  deadlinesEmptyMessage,
  deadlinesTitle,
  formatPercentTick,
  formatShare,
  leakageChartRows,
  leakageSummary,
  leakageTableRows,
  legendOf,
  mixChartRows,
  mixSummary,
  mixTableRows,
  obligationLabel,
  sortDeadlines,
  visibleDeadlines,
} from "../../../src/app/workspaces/analytics/analyticsModel.ts";
import { PERSONAS, ctxOf, sampleStates, seed } from "../../domain/core-fixtures.ts";

// The deadlines are judged against this moment (2026-10-12T09:00:00), the same one as the reference capture.
const AS_AT = new Date(2026, 9, 12, 9, 0, 0);

function viewFor(userId: string, jurisdiction: JurisdictionFilter = "all", data = seed(), now = AS_AT): AnalyticsView {
  return analyticsView(data, ctxOf(data, userId, now), jurisdiction);
}

// Tax leakage table from the reference capture (A. Moreno, all funds): fund, distribution, final withholding, recoverable, trustee tax, total.
const CAPTURE_LEAKAGE = [
  ["Harbourline Office Trust", "A$92,446,000", "A$2,504,486", "A$0", "A$0", "2.7%"],
  ["Southbank Industrial Partners Fund", "A$47,212,000", "A$3,892,099", "A$0", "A$0", "8.2%"],
  ["Wattle Retail Property Trust", "A$129,688,000", "A$2,742,646", "A$0", "A$0", "2.1%"],
  ["Kurrajong Stapled Property Trust", "A$58,036,000", "A$2,452,995", "A$0", "A$0", "4.2%"],
  ["Coastline Healthcare Property Fund", "A$21,048,000", "A$640,638", "A$0", "A$0", "3.0%"],
  ["Telok Ayer Commercial REIT", "S$63,436,800", "S$876,189", "S$993,014", "S$0", "2.9%"],
  ["Loyang Logistics REIT", "S$74,118,100", "S$2,792,644", "S$0", "S$242,216", "4.1%"],
  ["Meranti Digital Infrastructure REIT", "S$28,277,100", "S$1,073,376", "S$456,185", "S$141,083", "5.9%"],
  ["Kallang Riverside Retail REIT", "S$35,620,500", "S$534,308", "S$302,774", "S$1,068,620", "5.4%"],
];
const CAPTURE_LEAKAGE_HEADLINE = "Southbank Industrial Partners Fund loses the most, 8.2% of its distribution, mostly final withholding (8.2%).";

// Distribution mix table from the reference capture: fund, taxable income, capital gains, tax-exempt, tax-deferred and capital.
const CAPTURE_MIX = [
  ["Harbourline Office Trust", "60.3%", "8.5%", "0.0%", "31.3%"],
  ["Southbank Industrial Partners Fund", "62.0%", "38.0%", "0.0%", "0.0%"],
  ["Wattle Retail Property Trust", "70.3%", "18.6%", "0.0%", "11.1%"],
  ["Kurrajong Stapled Property Trust", "69.6%", "0.0%", "0.0%", "30.4%"],
  ["Coastline Healthcare Property Fund", "86.9%", "0.0%", "0.0%", "13.1%"],
  ["Telok Ayer Commercial REIT", "92.1%", "0.0%", "4.9%", "3.0%"],
  ["Loyang Logistics REIT", "94.2%", "0.0%", "0.0%", "5.8%"],
  ["Meranti Digital Infrastructure REIT", "94.9%", "0.0%", "5.1%", "0.0%"],
  ["Kallang Riverside Retail REIT", "100.0%", "0.0%", "0.0%", "0.0%"],
];
const CAPTURE_MIX_HEADLINE = "Taxable income ranges from 60% of the distribution (Harbourline Office Trust) to 100% (Kallang Riverside Retail REIT).";

// Deadlines table from the reference capture with "Show completed" off, as at 2026-10-12: date, fund, obligation, status.
const CAPTURE_DEADLINES = [
  ["Wed 30 Sep 2026", "Kurrajong Stapled Property Trust", "AMMA statements", "Overdue"],
  ["Wed 30 Sep 2026", "Southbank Industrial Partners Fund", "AMMA statements", "Overdue"],
  ["Sat 31 Oct 2026", "Harbourline Office Trust", "AIIR", "Open"],
  ["Sat 31 Oct 2026", "Kurrajong Stapled Property Trust", "AIIR", "Open"],
  ["Sat 31 Oct 2026", "Southbank Industrial Partners Fund", "AIIR", "Open"],
  ["Thu 5 Nov 2026", "Meranti Digital Infrastructure REIT", "Distribution tax notice", "Open"],
  ["Fri 6 Nov 2026", "Telok Ayer Commercial REIT", "Distribution tax notice", "Open"],
  ["Mon 9 Nov 2026", "Kallang Riverside Retail REIT", "Distribution tax notice", "Open"],
  ["Fri 13 Nov 2026", "Coastline Healthcare Property Fund", "Fund payment notice \u2014 Quarter ended 30 Sep 2026", "Open"],
  ["Thu 31 Dec 2026", "Coastline Healthcare Property Fund", "AMMA statements", "Open"],
  ["Thu 14 Jan 2027", "Harbourline Office Trust", "Fund payment withholding report", "Open"],
  ["Thu 14 Jan 2027", "Kurrajong Stapled Property Trust", "Fund payment withholding report", "Open"],
  ["Thu 14 Jan 2027", "Southbank Industrial Partners Fund", "Fund payment withholding report", "Open"],
  ["Fri 15 Jan 2027", "Kallang Riverside Retail REIT", "Withholding tax (s45G)", "Open"],
  ["Fri 15 Jan 2027", "Meranti Digital Infrastructure REIT", "Withholding tax (s45G)", "Open"],
  ["Fri 15 Jan 2027", "Telok Ayer Commercial REIT", "Withholding tax (s45G)", "Open"],
  ["Wed 14 Apr 2027", "Coastline Healthcare Property Fund", "Fund payment withholding report", "Open"],
  ["Thu 15 Apr 2027", "Kallang Riverside Retail REIT", "Form UT", "Open"],
  ["Thu 15 Apr 2027", "Loyang Logistics REIT", "Form UT", "Open"],
  ["Thu 15 Apr 2027", "Meranti Digital Infrastructure REIT", "Form UT", "Open"],
  ["Thu 15 Apr 2027", "Telok Ayer Commercial REIT", "Form UT", "Open"],
];

const tableOf = (rows: ReturnType<typeof leakageTableRows>): string[][] =>
  rows.map((row) => LEAKAGE_COLUMNS.map((column) => row[column.key]));
const mixTableOf = (rows: ReturnType<typeof mixTableRows>): string[][] => rows.map((row) => MIX_COLUMNS.map((column) => row[column.key]));
const deadlineCells = (rows: ReturnType<typeof visibleDeadlines>): string[][] =>
  rows.map((row) => [deadlineDate(row.date), row.fundName, obligationLabel(row.obligation), DEADLINE_STATUS_LABEL[row.status]]);

const BAD_TEXT = /NaN|undefined|null|Infinity|\[object/;

// ------------------------------------------------------------------------------------------------ tax leakage
test("leakage: the table shows what the reference shows, fund by fund", () => {
  const view = viewFor("a-moreno");
  assert.deepEqual(tableOf(leakageTableRows(view.leakage)), CAPTURE_LEAKAGE);
  assert.equal(view.leakageHeadline, CAPTURE_LEAKAGE_HEADLINE);
  assert.deepEqual(
    LEAKAGE_COLUMNS.map((column) => column.label),
    ["Fund", "Distribution", "Final withholding", "Recoverable", "Trustee tax", "Total"],
  );
  assert.deepEqual(
    LEAKAGE_COLUMNS.map((column) => column.numeric),
    [false, true, true, true, true, true],
  );
});

test("leakage: one bar per fund, each segment a share of the fund's distribution, amber / teal / red", () => {
  const view = viewFor("a-moreno");
  const rows = leakageChartRows(view.leakage);
  assert.deepEqual(
    rows.map((row) => row.label),
    CAPTURE_LEAKAGE.map((row) => row[0]),
  );
  assert.deepEqual(
    rows.map((row) => row.key),
    view.leakage.map((row) => row.fundId),
  );
  for (const [i, row] of rows.entries()) {
    const source = view.leakage[i]!;
    assert.deepEqual(
      row.segments.map((segment) => segment.key),
      ["finalWithholding", "recoverable", "trusteeTax"],
    );
    assert.deepEqual(
      row.segments.map((segment) => segment.label),
      ["Final withholding", "Withholding holders can recover", "Tax paid by the trustee"],
    );
    for (const segment of row.segments) {
      const cents = source[segment.key as "finalWithholding" | "recoverable" | "trusteeTax"];
      assert.ok(Number.isFinite(segment.value) && segment.value >= 0, `${source.fundName} ${segment.key}`);
      assert.ok(Math.abs(segment.value - (cents / source.distribution) * 100) < 1e-9);
    }
    // The bar is the fund's total leakage, the figure the table shows in its last column (the domain may round that to one decimal).
    const total = row.segments.reduce((sum, segment) => sum + segment.value, 0);
    assert.ok(Math.abs(total - source.totalPct) <= 0.05 + 1e-9, `${source.fundName}: bar ${total} vs ${source.totalPct}`);
  }
  assert.deepEqual(colorsOf(LEAKAGE_SERIES), {
    finalWithholding: "var(--viz-withheld)",
    recoverable: "var(--viz-net)",
    trusteeTax: "var(--viz-unallocated)",
  });
  assert.deepEqual(
    legendOf(LEAKAGE_SERIES).map((entry) => entry.label),
    ["Final withholding", "Withholding holders can recover", "Tax paid by the trustee"],
  );
});

test("leakage: the axis scales to the largest total and Southbank has the longest bar", () => {
  const rows = leakageChartRows(viewFor("a-moreno").leakage);
  const { axis, totals } = stackedLayout(rows, "max");
  const longest = totals.indexOf(Math.max(...totals));
  assert.equal(rows[longest]!.label, "Southbank Industrial Partners Fund");
  assert.ok(Math.abs(totals[longest]! - 8.2) < 0.05);
  // The axis ends at the first round tick at or above the longest bar (the reference rounds up to 12).
  assert.deepEqual(axis.ticks, [0, 3, 6, 9]);
  assert.ok(axis.max >= totals[longest]!);
});

test("leakage: a fund with no distribution draws nothing instead of NaN", () => {
  const rows = leakageChartRows([
    { fundId: "x", fundName: "Empty Fund", currency: "AUD", distribution: 0, finalWithholding: 0, recoverable: 0, trusteeTax: 0, totalPct: 0 },
  ]);
  assert.deepEqual(
    rows[0]!.segments.map((segment) => segment.value),
    [0, 0, 0],
  );
  assert.equal(leakageTableRows([{ fundId: "x", fundName: "Empty Fund", currency: "AUD", distribution: 0, finalWithholding: 0, recoverable: 0, trusteeTax: 0, totalPct: 0 }])[0]!.total, "0.0%");
});

test("leakage: value and tick formats", () => {
  assert.equal(formatShare(2.7091343703351143), "2.7%");
  assert.equal(formatShare(0), "0.0%");
  assert.deepEqual([0, 3, 6, 9].map(formatPercentTick), ["0%", "3%", "6%", "9%"]);
  assert.equal(formatPercentTick(0.5), "0.5%");
  assert.equal(formatPercentTick(0.1 + 0.2), "0.3%");
});

test("leakage: the chart's accessible name carries every fund's number", () => {
  const view = viewFor("a-moreno");
  const summary = leakageSummary(view.leakage);
  for (const row of CAPTURE_LEAKAGE) assert.ok(summary.includes(`${row[0]} ${row[5]}`), row[0]);
  assert.match(summary, /^Tax leakage as a percentage of each distribution\./);
  assert.equal(leakageSummary([]), "Tax leakage chart: there are no funds to compare.");
});

// ------------------------------------------------------------------------------------------------ distribution mix
test("mix: the table shows what the reference shows, fund by fund", () => {
  const view = viewFor("a-moreno");
  assert.deepEqual(mixTableOf(mixTableRows(view.mix)), CAPTURE_MIX);
  assert.equal(view.mixHeadline, CAPTURE_MIX_HEADLINE);
  assert.deepEqual(
    MIX_COLUMNS.map((column) => column.label),
    ["Fund", "Taxable income", "Capital gains", "Tax-exempt", "Tax-deferred and capital"],
  );
});

test("mix: 100% bars in the four tax characters, each fund adding up to the whole distribution", () => {
  const view = viewFor("a-moreno");
  const rows = mixChartRows(view.mix);
  assert.equal(rows.length, 9);
  for (const [i, row] of rows.entries()) {
    assert.deepEqual(
      row.segments.map((segment) => segment.key),
      ["taxable", "capitalGains", "taxExempt", "taxDeferredAndCapital"],
    );
    const total = row.segments.reduce((sum, segment) => sum + segment.value, 0);
    assert.ok(Math.abs(total - 100) < 1e-6, `${view.mix[i]!.fundName} adds up to ${total}`);
    assert.ok(row.segments.every((segment) => Number.isFinite(segment.value) && segment.value >= 0));
  }
  const { axis } = stackedLayout(rows, 100);
  assert.deepEqual(axis.ticks, [0, 25, 50, 75, 100]);
  assert.deepEqual(
    legendOf(MIX_SERIES).map((entry) => entry.label),
    ["Taxable income", "Capital gains", "Tax-exempt", "Tax-deferred and capital"],
  );
  assert.equal(new Set(Object.values(colorsOf(MIX_SERIES))).size, 4, "four distinct colours");
});

test("mix: the chart's accessible name carries each fund's mix and skips empty characters", () => {
  const view = viewFor("a-moreno");
  const summary = mixSummary(view.mix);
  assert.ok(summary.includes("Southbank Industrial Partners Fund: Taxable income 62.0%, Capital gains 38.0%;"), summary);
  assert.ok(summary.includes("Kallang Riverside Retail REIT: Taxable income 100.0%."), summary);
  assert.doesNotMatch(summary, /Tax-exempt 0\.0%/);
  assert.equal(mixSummary([]), "Distribution mix chart: there are no funds to compare.");
});

// ------------------------------------------------------------------------------------------------ deadlines
test("deadlines: as at 2026-10-12 the list, order and overdue count match the reference", () => {
  const view = viewFor("a-moreno");
  const shown = visibleDeadlines(view.deadlines, false);
  assert.equal(shown.length, 21);
  assert.deepEqual(deadlineCells(shown), CAPTURE_DEADLINES);
  assert.equal(view.overdueCount, 2);
  assert.equal(deadlinesTitle(view.overdueCount), "Deadlines \u00b7 2 overdue");
  assert.equal(deadlinesTitle(0), "Deadlines \u00b7 0 overdue");
  assert.deepEqual(
    DEADLINE_STATUS_LABEL,
    { overdue: "Overdue", open: "Open", done: "Done" },
  );
});

test("deadlines: Show completed adds the finished ones in date order and loses nothing", () => {
  const view = viewFor("a-moreno");
  const all = visibleDeadlines(view.deadlines, true);
  assert.equal(all.length, view.deadlines.length);
  assert.equal(completedCount(view.deadlines), all.length - 21);
  assert.ok(completedCount(view.deadlines) > 0);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1]!.date <= all[i]!.date, `row ${i} is out of date order`);
  assert.deepEqual(
    visibleDeadlines(all, false).map((row) => `${row.date}|${row.fundId}|${row.obligation}`),
    visibleDeadlines(view.deadlines, false).map((row) => `${row.date}|${row.fundId}|${row.obligation}`),
    "hiding completed again gives the default list",
  );
  assert.equal(deadlineCells(all).find((cells) => cells[3] === "Done")?.[3], "Done");
});

test("deadlines: the same day is ordered by fund name, then obligation, whatever order the rows arrive in", () => {
  const rows = [
    { date: "2026-10-31", fundId: "southbank", fundName: "Southbank", obligation: "AIIR", status: "open" as const },
    { date: "2026-10-30", fundId: "z", fundName: "Zeta", obligation: "AIIR", status: "open" as const },
    { date: "2026-10-31", fundId: "harbourline", fundName: "Harbourline", obligation: "AIIR", status: "open" as const },
    { date: "2026-10-31", fundId: "harbourline", fundName: "Harbourline", obligation: "AAA", status: "done" as const },
  ];
  assert.deepEqual(
    sortDeadlines(rows).map((row) => `${row.date} ${row.fundName} ${row.obligation}`),
    ["2026-10-30 Zeta AIIR", "2026-10-31 Harbourline AAA", "2026-10-31 Harbourline AIIR", "2026-10-31 Southbank AIIR"],
  );
  assert.deepEqual(
    rows.map((row) => row.fundName),
    ["Southbank", "Zeta", "Harbourline", "Harbourline"],
    "the input is not reordered in place",
  );
  assert.equal(visibleDeadlines(rows, false).length, 3);
});

test("deadlines: the date reads like the reference and the obligation dash is typeset", () => {
  assert.equal(deadlineDate("2026-09-30"), "Wed 30 Sep 2026");
  assert.equal(deadlineDate("2027-04-15"), "Thu 15 Apr 2027");
  assert.equal(obligationLabel("Fund payment notice - Quarter ended 30 Sep 2026"), "Fund payment notice \u2014 Quarter ended 30 Sep 2026");
  assert.equal(obligationLabel("Withholding tax (s45G)"), "Withholding tax (s45G)");
  assert.equal(obligationLabel("Form UT"), "Form UT");
});

test("deadlines: empty and announcement messages", () => {
  assert.equal(deadlinesEmptyMessage(false, []), "There are no deadlines for the funds you can see.");
  assert.equal(deadlinesEmptyMessage(true, []), "There are no deadlines for the funds you can see.");
  const done = [{ date: "2026-01-01", fundId: "a", fundName: "A", obligation: "AIIR", status: "done" as const }];
  assert.equal(deadlinesEmptyMessage(false, done), "Nothing is open. Tick Show completed to see the finished deadlines.");
  assert.equal(deadlinesEmptyMessage(true, done), "There are no deadlines to show.");
  assert.equal(deadlinesAnnouncement(21, false), "Showing 21 deadlines, completed ones hidden.");
  assert.equal(deadlinesAnnouncement(44, true), "Showing 44 deadlines, including completed ones.");
  assert.equal(deadlinesAnnouncement(1, true), "Showing 1 deadline, including completed ones.");
});

test("deadlines: the overdue count follows the clock", () => {
  // Before the first deadline nothing is overdue; long after, everything unfinished is.
  assert.equal(viewFor("a-moreno", "all", seed(), new Date(2026, 8, 1, 9, 0, 0)).overdueCount, 0);
  const late = viewFor("a-moreno", "all", seed(), new Date(2027, 11, 1, 9, 0, 0));
  assert.equal(late.overdueCount, late.deadlines.filter((row) => row.status === "overdue").length);
  assert.ok(late.overdueCount > 2);
});

// ------------------------------------------------------------------------------------------------ persona and jurisdiction scoping
test("scope: each persona's panels cover exactly the funds that persona can see", () => {
  const AU = ["Harbourline Office Trust", "Southbank Industrial Partners Fund", "Wattle Retail Property Trust", "Kurrajong Stapled Property Trust", "Coastline Healthcare Property Fund"];
  const SG = ["Telok Ayer Commercial REIT", "Loyang Logistics REIT", "Meranti Digital Infrastructure REIT", "Kallang Riverside Retail REIT"];
  const names = (userId: string, jurisdiction: JurisdictionFilter = "all"): string[] => viewFor(userId, jurisdiction).leakage.map((row) => row.fundName);

  assert.deepEqual(names("a-moreno"), [...AU, ...SG]);
  assert.deepEqual(names("m-castillo"), [...AU, ...SG]);
  assert.deepEqual(names("l-brennan"), AU);
  assert.deepEqual(names("r-okafor"), AU);
  assert.deepEqual(names("n-pillai"), SG);
  assert.deepEqual(names("w-l-teo"), SG);
  assert.deepEqual(names("d-harrow"), ["Southbank Industrial Partners Fund", "Kurrajong Stapled Property Trust", "Harbourline Office Trust"].sort((a, b) => AU.indexOf(a) - AU.indexOf(b)));
  assert.deepEqual(names("s-lim"), ["Telok Ayer Commercial REIT", "Meranti Digital Infrastructure REIT"]);

  assert.deepEqual(names("a-moreno", "AU"), AU);
  assert.deepEqual(names("a-moreno", "SG"), SG);
  assert.deepEqual(names("l-brennan", "SG"), []);
  assert.deepEqual(names("n-pillai", "AU"), []);

  for (const userId of PERSONAS) {
    for (const jurisdiction of ["all", "AU", "SG"] as const) {
      const view = viewFor(userId, jurisdiction);
      const wanted = view.leakage.map((row) => row.fundId);
      assert.deepEqual(view.mix.map((row) => row.fundId), wanted, `${userId}/${jurisdiction}: mix`);
      assert.ok(view.deadlines.every((row) => wanted.includes(row.fundId)), `${userId}/${jurisdiction}: deadlines`);
    }
  }
});

test("scope: a persona with nothing to show gets the no-funds message, not empty panels", () => {
  const view = viewFor("l-brennan", "SG");
  assert.deepEqual(view.leakage, []);
  assert.deepEqual(view.deadlines, []);
  assert.equal(view.overdueCount, 0);
  assert.deepEqual(analyticsEmptyMessage("L. Brennan", "SG", 5), {
    title: "No Singapore funds to analyse",
    body: "L. Brennan has no Singapore funds. Switch the jurisdiction to All to see the others.",
  });
  assert.equal(analyticsEmptyMessage("N. Pillai", "AU", 4).title, "No Australian funds to analyse");
  assert.deepEqual(analyticsEmptyMessage("Nobody", "all", 0), {
    title: "No funds to analyse",
    body: "Nobody isn't assigned to any funds. A Head of Tax can change that under Access.",
  });
  assert.equal(leakageChartRows(view.leakage).length, 0);
  assert.equal(visibleDeadlines(view.deadlines, true).length, 0);
});

test("scope: Harrow's three funds and S. Lim's two give matching tables, charts and headlines", () => {
  for (const userId of ["d-harrow", "s-lim"]) {
    const view = viewFor(userId);
    const table = leakageTableRows(view.leakage);
    assert.equal(table.length, view.leakage.length);
    assert.equal(leakageChartRows(view.leakage).length, view.leakage.length);
    assert.equal(mixTableRows(view.mix).length, view.mix.length);
    assert.doesNotMatch(view.leakageHeadline, BAD_TEXT);
    assert.doesNotMatch(view.mixHeadline, BAD_TEXT);
    const worst = [...view.leakage].sort((a, b) => b.totalPct - a.totalPct)[0]!;
    assert.ok(view.leakageHeadline.startsWith(worst.fundName), `${userId}: ${view.leakageHeadline}`);
  }
});

// ------------------------------------------------------------------------------------------------ whatever state the demo is in
test("invariants: every panel's numbers stay finite and readable in every sample state for every persona", () => {
  for (const [label, data] of sampleStates()) {
    for (const userId of PERSONAS) {
      for (const jurisdiction of ["all", "AU", "SG"] as const) {
        const where = `${label} / ${userId} / ${jurisdiction}`;
        const view = analyticsView(data, ctxOf(data, userId, AS_AT), jurisdiction);

        const leakageTable = leakageTableRows(view.leakage);
        const mixTable = mixTableRows(view.mix);
        for (const row of [...tableOf(leakageTable), ...mixTableOf(mixTable)]) {
          for (const cell of row) assert.doesNotMatch(cell, BAD_TEXT, `${where}: ${cell}`);
        }
        for (const row of leakageChartRows(view.leakage)) {
          for (const segment of row.segments) assert.ok(Number.isFinite(segment.value) && segment.value >= 0, `${where}: ${row.label}`);
        }
        for (const row of mixChartRows(view.mix)) {
          for (const segment of row.segments) assert.ok(Number.isFinite(segment.value) && segment.value >= 0, `${where}: ${row.label}`);
        }
        const { axis } = stackedLayout(leakageChartRows(view.leakage), "max");
        assert.ok(axis.ticks.length >= 2 && axis.ticks.every(Number.isFinite), `${where}: axis`);
        assert.doesNotMatch(leakageSummary(view.leakage), BAD_TEXT, where);
        assert.doesNotMatch(mixSummary(view.mix), BAD_TEXT, where);

        const shown = visibleDeadlines(view.deadlines, false);
        assert.ok(shown.every((row) => row.status !== "done"), where);
        assert.equal(shown.length + completedCount(view.deadlines), view.deadlines.length, where);
        assert.equal(view.overdueCount, view.deadlines.filter((row) => row.status === "overdue").length, where);
        for (const cells of deadlineCells(visibleDeadlines(view.deadlines, true))) {
          for (const cell of cells) assert.doesNotMatch(cell, BAD_TEXT, `${where}: ${cell}`);
        }
      }
    }
  }
});
