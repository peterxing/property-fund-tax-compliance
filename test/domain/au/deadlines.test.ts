import assert from "node:assert/strict";
import { test } from "node:test";
import { auModule } from "../../../src/domain/au/index.ts";
import { dateLabel } from "../../../src/domain/format.ts";
import type { AppData, AuInvestorView, DeadlineRow } from "../../../src/domain/types.ts";
import { AU_IDS, auFund, calcFor, ctxFor, freshData, NOW } from "./helpers.ts";

const deadlinesFor = (data: AppData, id: string, now: Date = NOW): DeadlineRow[] => {
  const fund = auFund(data, id);
  return auModule.deadlines(data, fund, auModule.fundCalc(data, fund, now), now);
};
const compact = (rows: readonly DeadlineRow[]): string[] => rows.map((r) => `${r.date} ${r.status} ${r.obligation}`);
const find = (rows: readonly DeadlineRow[], obligation: string): DeadlineRow => {
  const row = rows.find((r) => r.obligation === obligation);
  assert.ok(row, obligation);
  return row;
};

test("on 12 Oct 2026 the open and overdue obligations across the five funds are the ones the reference lists", () => {
  const data = freshData();
  const all = AU_IDS.flatMap((id) => deadlinesFor(data, id).filter((r) => r.status !== "done"));
  const sorted = [...all].sort((a, b) => a.date.localeCompare(b.date) || a.fundId.localeCompare(b.fundId));
  assert.deepEqual(
    sorted.map((r) => `${r.date} ${r.fundId} ${r.status} ${r.obligation}`),
    [
      "2026-09-30 kurrajong overdue AMMA statements",
      "2026-09-30 southbank overdue AMMA statements",
      "2026-10-31 harbourline open AIIR",
      "2026-10-31 kurrajong open AIIR",
      "2026-10-31 southbank open AIIR",
      "2026-11-13 coastline open Fund payment notice - Quarter ended 30 Sep 2026",
      "2026-12-31 coastline open AMMA statements",
      "2027-01-14 harbourline open Fund payment withholding report",
      "2027-01-14 kurrajong open Fund payment withholding report",
      "2027-01-14 southbank open Fund payment withholding report",
      "2027-04-14 coastline open Fund payment withholding report",
    ],
  );
  assert.equal(all.filter((r) => r.status === "overdue").length, 2);
});

test("every row names its fund, and each fund's rows run in date order", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const rows = deadlinesFor(data, id);
    assert.ok(rows.length >= 5, id);
    assert.ok(rows.every((r) => r.fundId === id && r.fundName === fund.name), id);
    assert.deepEqual(rows.map((r) => r.date), rows.map((r) => r.date).sort(), `${id}: sorted by date`);
    assert.ok(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)), id);
    assert.ok(rows.every((r) => ["overdue", "open", "done"].includes(r.status)), id);
  }
});

test("Harbourline: everything is done until the AIIR and the withholding report", () => {
  assert.deepEqual(compact(deadlinesFor(freshData(), "harbourline")), [
    "2025-11-14 done Fund payment notice - Quarter ended 30 Sep 2025",
    "2026-02-13 done Fund payment notice - Quarter ended 31 Dec 2025",
    "2026-05-15 done Fund payment notice - Quarter ended 31 Mar 2026",
    "2026-08-28 done Fund payment notice - Quarter ended 30 Jun 2026",
    "2026-09-30 done AMMA statements",
    "2026-10-31 open AIIR",
    "2027-01-14 open Fund payment withholding report",
  ]);
});

test("Wattle has lodged the AIIR, so every obligation is done", () => {
  const rows = deadlinesFor(freshData(), "wattle");
  assert.equal(rows.length, 7);
  assert.ok(rows.every((r) => r.status === "done"));
});

test("Coastline's substituted accounting period: no 31 October AIIR, and the dates run from its 30 September year end", () => {
  const rows = deadlinesFor(freshData(), "coastline");
  assert.ok(!rows.some((r) => r.obligation === "AIIR"), "the ATO sets the AIIR due date for a substituted period");
  assert.deepEqual(compact(rows), [
    "2026-02-13 done Fund payment notice - Quarter ended 31 Dec 2025",
    "2026-05-15 done Fund payment notice - Quarter ended 31 Mar 2026",
    "2026-08-14 done Fund payment notice - Quarter ended 30 Jun 2026",
    "2026-11-13 open Fund payment notice - Quarter ended 30 Sep 2026",
    "2026-12-31 open AMMA statements",
    "2027-04-14 open Fund payment withholding report",
  ]);
});

test("the AMMA statements fall due 3 months after the year end, rolled to the end of the month", () => {
  const data = freshData();
  assert.equal(find(deadlinesFor(data, "harbourline"), "AMMA statements").date, "2026-09-30");
  assert.equal(find(deadlinesFor(data, "coastline"), "AMMA statements").date, "2026-12-31");
  const fund = auFund(data, "harbourline");
  for (const [end, due] of [
    ["2026-06-30", "2026-09-30"],
    ["2026-03-31", "2026-06-30"],
    ["2026-12-31", "2027-03-31"],
    ["2026-09-30", "2026-12-31"],
    ["2027-02-28", "2027-05-31"],
    ["2028-02-29", "2028-05-31"],
  ] as const) {
    const moved = { ...fund, periodEnd: end };
    const rows = auModule.deadlines(data, moved, auModule.fundCalc(data, moved, NOW), NOW);
    assert.equal(find(rows, "AMMA statements").date, due, `year end ${end}`);
  }
});

test("a date-based status: due on the day is open, the next day is overdue", () => {
  const data = freshData();
  const statusOn = (now: Date): string => find(deadlinesFor(data, "southbank", now), "AMMA statements").status;
  assert.equal(statusOn(new Date(2026, 8, 29, 9, 0, 0)), "open");
  assert.equal(statusOn(new Date(2026, 8, 30, 0, 0, 0)), "open");
  assert.equal(statusOn(new Date(2026, 8, 30, 23, 59, 59)), "open", "all of the due day");
  assert.equal(statusOn(new Date(2026, 9, 1, 0, 0, 0)), "overdue");
  assert.equal(statusOn(new Date(2027, 5, 1, 12, 0, 0)), "overdue");
});

test("the AIIR and the withholding report change status as the dates pass", () => {
  const data = freshData();
  const at = (now: Date) => {
    const rows = deadlinesFor(data, "harbourline", now);
    return [find(rows, "AIIR").status, find(rows, "Fund payment withholding report").status];
  };
  assert.deepEqual(at(new Date(2026, 9, 31, 20, 0, 0)), ["open", "open"], "31 October itself");
  assert.deepEqual(at(new Date(2026, 10, 1, 8, 0, 0)), ["overdue", "open"]);
  assert.deepEqual(at(new Date(2027, 0, 14, 17, 0, 0)), ["overdue", "open"], "14 January itself");
  assert.deepEqual(at(new Date(2027, 0, 15, 8, 0, 0)), ["overdue", "overdue"]);
});

test("signing off completes the AMMA statements, lodging the AIIR completes it and the withholding report, publishing completes a notice", () => {
  const data = freshData();
  const southbank = auFund(data, "southbank");
  assert.equal(find(deadlinesFor(data, "southbank"), "AMMA statements").status, "overdue");
  southbank.status = "Signed off";
  assert.equal(find(deadlinesFor(data, "southbank"), "AMMA statements").status, "done");

  const before = deadlinesFor(data, "kurrajong");
  assert.deepEqual([find(before, "AIIR").status, find(before, "Fund payment withholding report").status], ["open", "open"]);
  data.lodgments.push({ fundId: "kurrajong", kind: "aiir", reference: "Receipt 1", date: "2026-10-10", actor: "A. Moreno" });
  const after = deadlinesFor(data, "kurrajong");
  assert.deepEqual([find(after, "AIIR").status, find(after, "Fund payment withholding report").status], ["done", "done"]);
  assert.equal(find(after, "AMMA statements").status, "overdue", "lodging does not sign anything off");

  const draft = data.auNotices.find((n) => n.fundId === "coastline" && n.publishedOn === null);
  assert.ok(draft);
  assert.equal(find(deadlinesFor(data, "coastline"), `Fund payment notice - ${draft.label}`).status, "open");
  draft.publishedOn = "2026-10-12";
  assert.equal(find(deadlinesFor(data, "coastline"), `Fund payment notice - ${draft.label}`).status, "done");
});

test("a return lodgment alone does not complete the AIIR", () => {
  const data = freshData();
  data.lodgments.push({ fundId: "harbourline", kind: "return", reference: "Receipt 2", date: "2026-10-11", actor: "A. Moreno" });
  const rows = deadlinesFor(data, "harbourline");
  assert.equal(find(rows, "AIIR").status, "open");
  assert.equal(find(rows, "Fund payment withholding report").status, "open");
});

test("the dates agree with the investor reporting and returns views", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const calc = calcFor(data, id);
    const rows = auModule.deadlines(data, fund, calc, NOW);
    const investor = auModule.investorView(data, fund, calc, ctxFor(data)) as AuInvestorView;
    const aiir = rows.find((r) => r.obligation === "AIIR");
    assert.equal(aiir?.date ?? "", investor.aiir.aiirDue, `${id}: AIIR due`);
    assert.equal(find(rows, "Fund payment withholding report").date, investor.aiir.withholdingReportDue, `${id}: report due`);
    const returns = auModule.returnView(data, fund, calc, ctxFor(data));
    assert.equal(returns.dueLabel, `AMMA due ${dateLabel(find(rows, "AMMA statements").date)}`, `${id}: AMMA due`);
    const notices = rows.filter((r) => r.obligation.startsWith("Fund payment notice"));
    assert.deepEqual(
      notices.map((r) => r.date),
      investor.notices.map((n) => n.paymentDate),
      `${id}: one row for each notice, on its payment date`,
    );
  }
});

test("a fund with no notices only has the annual obligations; the data is left as it was", () => {
  const data = freshData();
  data.auNotices = data.auNotices.filter((n) => n.fundId !== "harbourline");
  const rows = deadlinesFor(data, "harbourline");
  assert.deepEqual(rows.map((r) => r.obligation), ["AMMA statements", "AIIR", "Fund payment withholding report"]);
  rows[0].status = "overdue";
  rows.pop();
  assert.equal(deadlinesFor(data, "harbourline").length, 3, "a result is a copy");
  assert.equal(find(deadlinesFor(data, "harbourline"), "AMMA statements").status, "done");
});

test("a fund from another market is refused", () => {
  const data = freshData();
  const sg = data.funds.find((f) => f.market !== "AU");
  assert.ok(sg);
  assert.throws(() => auModule.deadlines(data, sg, calcFor(data, "wattle"), NOW), /not an Australian fund/);
});
