import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, applyBulk } from "../../src/domain/actions.ts";
import { approvalChain, bulkBlock } from "../../src/domain/core/workflow.ts";
import { bulkRows } from "../../src/domain/selectors.ts";
import type { Action, AppData, BulkKind, JurisdictionFilter } from "../../src/domain/types.ts";
import { toISODate } from "../../src/domain/format.ts";
import { NOW, NOW_STAMP, PERSONAS, chain, ctxOf, frozenSeed, fundOf, ok, sampleStates, seed, skipUnlessReady, userOf } from "./core-fixtures.ts";

const approve = (fundId: string, level: "review" | "agent"): Action => ({ type: "approve", fundId, level });
const submit = (fundId: string): Action => ({ type: "submit", fundId });
const signOff = (fundId: string): Action => ({ type: "sign-off", fundId });

function counter(value: number) {
  let calls = 0;
  return { count: () => (calls++, value), calls: () => calls };
}

const block = (data: AppData, fundId: string, kind: BulkKind, userId: string, exceptions = () => 0) =>
  bulkBlock(data, fundOf(data, fundId), kind, userOf(data, userId), exceptions);

const bulk = (data: AppData, kind: BulkKind, fundIds: string[], userId: string) => applyBulk(data, kind, fundIds, ctxOf(data, userId));

// ------------------------------------------------------------------------------------------------ bulkBlock
test("bulkBlock: the role and access gate comes first and costs no exception count", () => {
  const data = seed();
  const spy = counter(5);
  assert.equal(block(data, "kallang", "submit", "n-pillai", spy.count), "Not allowed for your role");
  assert.equal(block(data, "kallang", "submit", "m-castillo", spy.count), "Not allowed for your role");
  assert.equal(block(data, "kallang", "submit", "r-okafor", spy.count), "Not allowed for your role", "no access to the fund");
  assert.equal(block(data, "meranti", "sign-off", "n-pillai", spy.count), "Not allowed for your role");
  assert.equal(block(data, "meranti", "sign-off", "w-l-teo", spy.count), "Not allowed for your role");
  assert.equal(block(data, "kallang", "approve-review", "w-l-teo", spy.count), "Not allowed for your role");
  assert.equal(block(data, "meranti", "approve-review", "l-brennan", spy.count), "Not allowed for your role");
  assert.equal(spy.calls(), 0);
});

test("bulkBlock: a tax agent approves at the agent level, which a fund without an agent step does not have", () => {
  let data = seed();
  data = ok(data, "a-moreno", { type: "set-user-funds", userId: "s-lim", funds: ["telok-ayer", "meranti", "kallang"] });
  data = ok(data, "w-l-teo", submit("kallang"));
  assert.equal(block(data, "kallang", "approve-review", "s-lim"), "Not allowed for your role");
  assert.equal(block(data, "meranti", "approve-review", "s-lim"), null);
});

test("bulkBlock: the workflow status gate", () => {
  const data = seed();
  const spy = counter(5);
  assert.equal(block(data, "meranti", "submit", "a-moreno", spy.count), "Not preparing");
  assert.equal(block(data, "loyang", "submit", "a-moreno", spy.count), "Not preparing");
  assert.equal(block(data, "kallang", "approve-review", "n-pillai", spy.count), "Not in review");
  assert.equal(block(data, "loyang", "approve-review", "n-pillai", spy.count), "Not in review");
  assert.equal(block(data, "telok-ayer", "sign-off", "a-moreno", spy.count), "Not in review");
  assert.equal(block(data, "loyang", "sign-off", "a-moreno", spy.count), "Not in review");
  assert.equal(spy.calls(), 0);
});

test("bulkBlock: already approved, and the submitter cannot approve as reviewer", () => {
  const spy = counter(5);
  const seeded = seed();
  assert.equal(block(seeded, "meranti", "approve-review", "n-pillai", spy.count), "Already approved");
  assert.equal(block(seeded, "meranti", "approve-review", "a-moreno", spy.count), "Already approved", "any approver at that level counts");

  const submitted = ok(seeded, "a-moreno", submit("telok-ayer"));
  assert.equal(block(submitted, "telok-ayer", "approve-review", "a-moreno", spy.count), "You submitted this fund");
  assert.equal(block(submitted, "telok-ayer", "approve-review", "n-pillai", () => 0), null, "someone else can approve it");
  assert.equal(spy.calls(), 0, "both gates are cheap");

  const agent = ok(seeded, "s-lim", approve("meranti", "agent"));
  assert.equal(block(agent, "meranti", "approve-review", "s-lim", spy.count), "Already approved");
  assert.equal(spy.calls(), 0);
});

test("bulkBlock: open exceptions stop approval and sign-off, never submission", () => {
  let data = seed();
  data = ok(data, "w-l-teo", submit("telok-ayer"));
  const submitSpy = counter(3);
  assert.equal(block(seed(), "kallang", "submit", "w-l-teo", submitSpy.count), null);
  assert.equal(submitSpy.calls(), 0, "submit never counts exceptions");

  const approveSpy = counter(2);
  assert.equal(block(data, "telok-ayer", "approve-review", "n-pillai", approveSpy.count), "Open exceptions");
  assert.equal(approveSpy.calls(), 1);
  assert.equal(block(data, "telok-ayer", "approve-review", "n-pillai", () => 0), null);

  const signSpy = counter(1);
  assert.equal(block(data, "telok-ayer", "sign-off", "a-moreno", signSpy.count), "Open exceptions", "exceptions are reported before missing approvals");
  assert.equal(signSpy.calls(), 1);
});

test("bulkBlock: sign-off then checks open queries, then the approvals still missing", () => {
  let data = seed();
  assert.equal(block(data, "meranti", "sign-off", "a-moreno"), "Waiting for Tax agent approval");
  data = ok(data, "w-l-teo", submit("telok-ayer"));
  assert.equal(block(data, "telok-ayer", "sign-off", "a-moreno"), "Waiting for Reviewer and Tax agent approval");
  const noAgent = ok(data, "w-l-teo", submit("kallang"));
  assert.equal(block(noAgent, "kallang", "sign-off", "a-moreno"), "Waiting for Reviewer approval");

  let ready = ok(data, "n-pillai", approve("telok-ayer", "review"));
  ready = ok(ready, "s-lim", approve("telok-ayer", "agent"));
  const spy = counter(0);
  assert.equal(block(ready, "telok-ayer", "sign-off", "a-moreno", spy.count), null);
  assert.equal(spy.calls(), 1);

  const queried = ok(ready, "n-pillai", { type: "raise-query", fundId: "telok-ayer", subject: "Rate", message: "Which rate?" });
  assert.equal(block(queried, "telok-ayer", "sign-off", "a-moreno"), "Open queries");
  const resolved = ok(queried, "n-pillai", { type: "resolve-query", fundId: "telok-ayer", queryId: "q-5" });
  assert.equal(block(resolved, "telok-ayer", "sign-off", "a-moreno"), null);
  assert.equal(block(queried, "telok-ayer", "approve-review", "a-moreno"), "Already approved", "an open query does not stop an approval");
});

// ------------------------------------------------------------------------------------------------ applyBulk
test("bulk submit moves every eligible fund to review and skips the rest with a reason", () => {
  const before = frozenSeed();
  const { data, result } = bulk(before, "submit", ["telok-ayer", "loyang", "meranti", "kallang"], "w-l-teo");
  assert.deepEqual(result.done, ["telok-ayer", "kallang"]);
  assert.deepEqual(result.skipped, [
    { fundId: "loyang", reason: "Not preparing" },
    { fundId: "meranti", reason: "Not preparing" },
  ]);
  assert.equal(fundOf(data, "telok-ayer").status, "In review");
  assert.equal(fundOf(data, "kallang").status, "In review", "an open exception does not stop a bulk submit");
  assert.equal(fundOf(data, "loyang").status, "Signed off");
  const added = data.audit.slice(before.audit.length);
  assert.deepEqual(added.map((a) => [a.fundId, a.actor, a.action, a.at]), [
    ["telok-ayer", "W. L. Teo", "Submitted for review", NOW_STAMP],
    ["kallang", "W. L. Teo", "Submitted for review", NOW_STAMP],
  ]);
  assert.equal(new Set(data.audit.map((a) => a.id)).size, data.audit.length);
});

test("a bulk step audits and changes exactly what the single actions would have", () => {
  const start = frozenSeed();
  const viaBulk = bulk(start, "submit", ["telok-ayer", "kallang"], "w-l-teo").data;
  const viaSingle = chain(start, [["w-l-teo", submit("telok-ayer")], ["w-l-teo", submit("kallang")]]);
  assert.deepEqual(viaBulk, viaSingle);

  const next = bulk(viaBulk, "approve-review", ["telok-ayer"], "n-pillai").data;
  assert.deepEqual(next, ok(viaBulk, "n-pillai", approve("telok-ayer", "review")));
});

test("bulk approve-review approves at the user's own level and skips funds with open exceptions", () => {
  const submitted = bulk(frozenSeed(), "submit", ["telok-ayer", "kallang"], "w-l-teo").data;
  const reviewer = bulk(submitted, "approve-review", ["telok-ayer", "loyang", "meranti", "kallang"], "n-pillai");
  assert.deepEqual(reviewer.result.done, ["telok-ayer"]);
  assert.deepEqual(reviewer.result.skipped, [
    { fundId: "loyang", reason: "Not in review" },
    { fundId: "meranti", reason: "Already approved" },
    { fundId: "kallang", reason: "Open exceptions" },
  ]);
  assert.deepEqual(reviewer.data.approvals.filter((a) => a.fundId === "telok-ayer").map((a) => [a.level, a.by]), [["review", "N. Pillai"]]);
  assert.equal(reviewer.data.audit[reviewer.data.audit.length - 1].action, "Approved — reviewer");

  const agent = bulk(reviewer.data, "approve-review", ["telok-ayer", "meranti", "kallang"], "s-lim");
  assert.deepEqual(agent.result.done, ["telok-ayer", "meranti"]);
  assert.deepEqual(agent.result.skipped, [{ fundId: "kallang", reason: "Not allowed for your role" }]);
  assert.deepEqual(agent.data.approvals.filter((a) => a.level === "agent" && a.by === "S. Lim").map((a) => a.fundId), ["telok-ayer", "meranti"]);
  assert.deepEqual(agent.data.audit.slice(-2).map((a) => a.action), ["Approved — tax agent", "Approved — tax agent"]);
});

test("bulk sign-off signs off only funds with every approval, no exceptions and no open queries", () => {
  let data = frozenSeed();
  data = bulk(data, "submit", ["telok-ayer", "kallang"], "w-l-teo").data;
  data = bulk(data, "approve-review", ["telok-ayer", "kallang"], "n-pillai").data;
  data = bulk(data, "approve-review", ["telok-ayer", "meranti"], "s-lim").data;
  const { data: after, result } = bulk(data, "sign-off", ["telok-ayer", "loyang", "meranti", "kallang"], "a-moreno");
  assert.deepEqual(result.done, ["telok-ayer", "meranti"]);
  assert.deepEqual(result.skipped, [
    { fundId: "loyang", reason: "Not in review" },
    { fundId: "kallang", reason: "Open exceptions" },
  ]);
  assert.equal(fundOf(after, "telok-ayer").status, "Signed off");
  assert.equal(fundOf(after, "meranti").status, "Signed off");
  assert.equal(fundOf(after, "kallang").status, "In review");
  assert.deepEqual(after.audit.slice(-2).map((a) => [a.fundId, a.action, a.detail]), [
    ["telok-ayer", "Signed off", "Components and withholding locked"],
    ["meranti", "Signed off", "Components and withholding locked"],
  ]);
});

test("bulk sign-off skips a fund with an open query until it is resolved", () => {
  let data = frozenSeed();
  data = ok(data, "s-lim", approve("meranti", "agent"));
  data = ok(data, "n-pillai", { type: "raise-query", fundId: "meranti", subject: "Rate", message: "Which rate?" });
  const blocked = bulk(data, "sign-off", ["meranti"], "a-moreno");
  assert.deepEqual(blocked.result, { done: [], skipped: [{ fundId: "meranti", reason: "Open queries" }] });
  data = ok(data, "n-pillai", { type: "resolve-query", fundId: "meranti", queryId: "q-5" });
  assert.deepEqual(bulk(data, "sign-off", ["meranti"], "a-moreno").result.done, ["meranti"]);
});

test("applyBulk keeps the order given, processes a repeated id once, and reports unknown funds and kinds", () => {
  const data = frozenSeed();
  const run = bulk(data, "submit", ["kallang", "telok-ayer", "kallang", "nope", "telok-ayer"], "w-l-teo");
  assert.deepEqual(run.result.done, ["kallang", "telok-ayer"]);
  assert.deepEqual(run.result.skipped, [{ fundId: "nope", reason: "Unknown fund" }]);
  assert.deepEqual(run.data.audit.slice(data.audit.length).map((a) => a.fundId), ["kallang", "telok-ayer"]);

  const unknownKind = applyBulk(data, "publish" as BulkKind, ["kallang", "nope"], ctxOf(data, "w-l-teo"));
  assert.deepEqual(unknownKind.result, { done: [], skipped: [{ fundId: "kallang", reason: "Unknown action" }, { fundId: "nope", reason: "Unknown action" }] });
  assert.equal(unknownKind.data, data);

  const empty = bulk(data, "submit", [], "w-l-teo");
  assert.deepEqual(empty.result, { done: [], skipped: [] });
  assert.equal(empty.data, data);
});

test("applyBulk returns the very same data when nothing could be done, and never mutates its input", () => {
  const data = frozenSeed();
  const copy = structuredClone(data);
  const nothing = bulk(data, "sign-off", ["telok-ayer", "loyang", "kallang", "meranti"], "w-l-teo");
  assert.equal(nothing.data, data);
  assert.deepEqual(nothing.result.done, []);
  assert.equal(nothing.result.skipped.length, 4);
  assert.ok(nothing.result.skipped.every((s) => s.reason === "Not allowed for your role"));
  const something = bulk(data, "submit", ["telok-ayer"], "w-l-teo");
  assert.notEqual(something.data, data);
  assert.deepEqual(data, copy);
});

test("each fund in a bulk run sees the result of the funds before it", () => {
  const data = frozenSeed();
  const run = bulk(data, "submit", ["telok-ayer", "kallang"], "a-moreno");
  const ids = run.data.audit.slice(data.audit.length).map((a) => a.id);
  assert.deepEqual(ids, ["a-21", "a-22"]);
});

// ------------------------------------------------------------------------------------------------ bulkRows
test("bulkRows: one row per visible fund with status, approvals, counts and the next step (Head of Tax, Singapore)", () => {
  const data = seed();
  const rows = bulkRows(data, ctxOf(data, "a-moreno"), "SG");
  assert.deepEqual(rows.map((r) => r.fund.id), ["telok-ayer", "loyang", "meranti", "kallang"]);
  const row = (id: string) => rows.find((r) => r.fund.id === id)!;
  assert.equal(row("telok-ayer").fund, fundOf(data, "telok-ayer"));
  assert.deepEqual(
    [row("telok-ayer").status, row("telok-ayer").governanceLabel, row("telok-ayer").exceptions, row("telok-ayer").openQueries],
    ["Preparing", "Tax agent signs off; you lodge", 0, 0],
  );
  assert.deepEqual(row("telok-ayer").next, { kind: "submit", text: "Submit" });
  assert.deepEqual([row("telok-ayer").canSubmit, row("telok-ayer").canApproveReview, row("telok-ayer").canSignOff], [true, false, false]);
  assert.deepEqual(row("telok-ayer").approvals, approvalChain(data, fundOf(data, "telok-ayer")));

  assert.deepEqual(row("loyang").next, { kind: "signed-off", text: "already signed off" });
  assert.deepEqual([row("loyang").canSubmit, row("loyang").canApproveReview, row("loyang").canSignOff], [false, false, false]);
  assert.equal(row("loyang").governanceLabel, "No tax agent");

  assert.deepEqual(row("meranti").next, { kind: "waiting", text: "waiting for tax agent approval" });
  assert.deepEqual([row("meranti").canSubmit, row("meranti").canApproveReview, row("meranti").canSignOff], [false, false, false]);
  assert.equal(row("meranti").approvals[0].done, true);
  assert.equal(row("meranti").approvals[1].done, false);

  assert.deepEqual(row("kallang").next, { kind: "submit", text: "Submit" });
  assert.equal(row("kallang").exceptions, 1);
});

test("bulkRows: what each role is told to do next (Singapore)", () => {
  const data = seed();
  const next = (userId: string) => Object.fromEntries(bulkRows(data, ctxOf(data, userId), "SG").map((r) => [r.fund.id, r.next]));
  assert.deepEqual(next("n-pillai"), {
    "telok-ayer": { kind: "waiting", text: "waiting for the preparer to submit" },
    loyang: { kind: "signed-off", text: "already signed off" },
    meranti: { kind: "waiting", text: "waiting for tax agent approval" },
    kallang: { kind: "waiting", text: "waiting for the preparer to submit" },
  });
  assert.deepEqual(next("w-l-teo"), {
    "telok-ayer": { kind: "submit", text: "Submit" },
    loyang: { kind: "signed-off", text: "already signed off" },
    meranti: { kind: "waiting", text: "waiting for tax agent approval" },
    kallang: { kind: "submit", text: "Submit" },
  });
  assert.deepEqual(next("s-lim"), {
    "telok-ayer": { kind: "waiting", text: "waiting for the preparer to submit" },
    meranti: { kind: "approve-agent", text: "Approve as tax agent" },
  });
  assert.deepEqual(next("m-castillo"), {
    "telok-ayer": { kind: "none", text: "view only" },
    loyang: { kind: "signed-off", text: "already signed off" },
    meranti: { kind: "none", text: "view only" },
    kallang: { kind: "none", text: "view only" },
  });
});

test("bulkRows: reviewers are told to approve, and Head of Tax to sign off, when the fund is ready", () => {
  let data = seed();
  data = chain(data, [["a-moreno", submit("telok-ayer")]]);
  assert.deepEqual(bulkRows(data, ctxOf(data, "n-pillai"), "SG").find((r) => r.fund.id === "telok-ayer")?.next, { kind: "approve-review", text: "Approve as reviewer" });
  assert.deepEqual(bulkRows(data, ctxOf(data, "a-moreno"), "SG").find((r) => r.fund.id === "telok-ayer")?.next, { kind: "waiting", text: "waiting for reviewer and tax agent approval" }, "Moreno submitted it, so cannot approve it");
  data = chain(data, [["n-pillai", approve("telok-ayer", "review")], ["s-lim", approve("telok-ayer", "agent")]]);
  const moreno = bulkRows(data, ctxOf(data, "a-moreno"), "SG").find((r) => r.fund.id === "telok-ayer")!;
  assert.deepEqual(moreno.next, { kind: "sign-off", text: "Sign off" });
  assert.equal(moreno.canSignOff, true);
  const reviewer = bulkRows(data, ctxOf(data, "n-pillai"), "SG").find((r) => r.fund.id === "telok-ayer")!;
  assert.deepEqual(reviewer.next, { kind: "waiting", text: "waiting for sign-off" });
  const queried = ok(data, "n-pillai", { type: "raise-query", fundId: "telok-ayer", subject: "Rate", message: "Which rate?" });
  const blocked = bulkRows(queried, ctxOf(queried, "a-moreno"), "SG").find((r) => r.fund.id === "telok-ayer")!;
  assert.deepEqual(blocked.next, { kind: "blocked", text: "1 open query" });
  assert.equal(blocked.openQueries, 1);
  assert.equal(blocked.canSignOff, false);
});

test("bulkRows respects the persona's funds and the jurisdiction toggle", () => {
  const data = seed();
  const ids = (userId: string, jurisdiction: JurisdictionFilter) => bulkRows(data, ctxOf(data, userId), jurisdiction).map((r) => r.fund.id);
  assert.deepEqual(ids("n-pillai", "AU"), []);
  assert.deepEqual(ids("r-okafor", "SG"), []);
  assert.deepEqual(ids("s-lim", "SG"), ["telok-ayer", "meranti"]);
  assert.deepEqual(ids("d-harrow", "SG"), []);
});

test("bulkRows describes Australian funds the way the reference does (Head of Tax)", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = seed();
  const rows = bulkRows(data, ctxOf(data, "a-moreno"), "all");
  assert.deepEqual(rows.map((r) => r.fund.id), ["harbourline", "southbank", "wattle", "kurrajong", "coastline", "telok-ayer", "loyang", "meranti", "kallang"]);
  const row = (id: string) => rows.find((r) => r.fund.id === id)!;
  assert.deepEqual(row("southbank").next, { kind: "blocked", text: "2 open exceptions" });
  assert.deepEqual(row("kurrajong").next, { kind: "blocked", text: "3 open exceptions" });
  assert.deepEqual(row("coastline").next, { kind: "submit", text: "Submit" });
  assert.deepEqual(row("harbourline").next, { kind: "signed-off", text: "already signed off" });
  assert.deepEqual(row("wattle").next, { kind: "signed-off", text: "already signed off" });
  assert.deepEqual(row("meranti").next, { kind: "waiting", text: "waiting for tax agent approval" });
  assert.deepEqual([row("southbank").exceptions, row("southbank").openQueries], [2, 1]);
  assert.deepEqual([row("kurrajong").exceptions, row("kurrajong").openQueries], [3, 2]);
  assert.equal(row("southbank").canApproveReview, false, "open exceptions stop a bulk approval");
  assert.equal(row("southbank").governanceLabel, "Tax agent reviews and lodges");
});

test("bulkRows for Australian reviewers and agents", { skip: skipUnlessReady("AU") }, () => {
  const data = seed();
  const next = (userId: string) => Object.fromEntries(bulkRows(data, ctxOf(data, userId), "AU").map((r) => [r.fund.id, r.next]));
  assert.deepEqual(next("l-brennan"), {
    harbourline: { kind: "signed-off", text: "already signed off" },
    southbank: { kind: "blocked", text: "2 open exceptions" },
    wattle: { kind: "signed-off", text: "already signed off" },
    kurrajong: { kind: "blocked", text: "3 open exceptions" },
    coastline: { kind: "waiting", text: "waiting for the preparer to submit" },
  });
  assert.deepEqual(next("d-harrow"), {
    harbourline: { kind: "signed-off", text: "already signed off" },
    southbank: { kind: "blocked", text: "2 open exceptions" },
    kurrajong: { kind: "blocked", text: "3 open exceptions" },
  });
  assert.deepEqual(next("r-okafor").coastline, { kind: "submit", text: "Submit" });
  assert.deepEqual(next("r-okafor").southbank, { kind: "waiting", text: "waiting for reviewer and tax agent approval" });
});

test("bulk actions on Australian funds", { skip: skipUnlessReady("AU") }, () => {
  const data = frozenSeed();
  const approveAll = bulk(data, "approve-review", ["harbourline", "southbank", "wattle", "kurrajong", "coastline"], "l-brennan");
  assert.deepEqual(approveAll.result.done, []);
  assert.deepEqual(approveAll.result.skipped, [
    { fundId: "harbourline", reason: "Not in review" },
    { fundId: "southbank", reason: "Open exceptions" },
    { fundId: "wattle", reason: "Not in review" },
    { fundId: "kurrajong", reason: "Open exceptions" },
    { fundId: "coastline", reason: "Not in review" },
  ]);
  assert.equal(approveAll.data, data);
  const submitAll = bulk(data, "submit", ["harbourline", "southbank", "wattle", "kurrajong", "coastline"], "r-okafor");
  assert.deepEqual(submitAll.result.done, ["coastline"]);
  assert.equal(submitAll.result.skipped.length, 4);
  assert.ok(submitAll.result.skipped.every((s) => s.reason === "Not preparing"));
  const signAll = bulk(data, "sign-off", ["southbank", "kurrajong"], "a-moreno");
  assert.deepEqual(signAll.result.skipped, [{ fundId: "southbank", reason: "Open exceptions" }, { fundId: "kurrajong", reason: "Open exceptions" }]);
});

// ------------------------------------------------------------------------------------------------ rows and runs always agree
// After 30 Sep 2026 a fund that is not signed off has an overdue AMMA exception, so the sweep also runs on a day before that.
const CLOCKS = [NOW, new Date(2026, 8, 1, 10, 0, 0)];

const SWEEPS: Array<[string, JurisdictionFilter, Array<"AU" | "SG">]> = [
  ["Singapore", "SG", ["SG"]],
  ["Australia", "AU", ["AU"]],
  ["both markets", "all", ["AU", "SG"]],
];

for (const [label, jurisdiction, markets] of SWEEPS) {
  test(`bulkRows flags match what applyBulk does, for every persona and state (${label})`, { skip: skipUnlessReady(...markets) }, () => {
    const seen = { submit: [0, 0], "approve-review": [0, 0], "sign-off": [0, 0] } as Record<BulkKind, [number, number]>;
    for (const [state, data] of sampleStates()) {
      for (const userId of PERSONAS) {
        for (const clock of CLOCKS) {
          const ctx = ctxOf(data, userId, clock);
          for (const row of bulkRows(data, ctx, jurisdiction)) {
            const flags: Array<[BulkKind, boolean]> = [
              ["submit", row.canSubmit],
              ["approve-review", row.canApproveReview],
              ["sign-off", row.canSignOff],
            ];
            for (const [kind, flag] of flags) {
              const where = `${state} on ${toISODate(clock)}: ${userId} ${kind} ${row.fund.id}`;
              const run = applyBulk(data, kind, [row.fund.id], ctx);
              assert.equal(run.result.done.length === 1, flag, where);
              seen[kind][flag ? 0 : 1]++;
              if (flag) {
                const single: Action =
                  kind === "approve-review" ? approve(row.fund.id, ctx.user.role === "tax-agent" ? "agent" : "review") : { type: kind, fundId: row.fund.id };
                const result = applyAction(data, single, ctx);
                assert.equal(result.ok, true, `${where}: a fund a bulk run accepts, the single action accepts too`);
              }
            }
            if (row.canSubmit) assert.equal(row.next.kind, "submit", `${state}: ${userId} ${row.fund.id}`);
            if (row.canApproveReview) assert.match(row.next.kind, /^approve-(review|agent)$/, `${state}: ${userId} ${row.fund.id}`);
            if (row.canSignOff && !row.canApproveReview) assert.equal(row.next.kind, "sign-off", `${state}: ${userId} ${row.fund.id}`);
            if (row.fund.status === "Signed off") assert.equal(row.next.kind, "signed-off");
          }
        }
      }
    }
    for (const kind of ["submit", "approve-review", "sign-off"] as BulkKind[]) {
      assert.ok(seen[kind][0] > 0 && seen[kind][1] > 0, `${kind}: exercised ${seen[kind][0]} allowed and ${seen[kind][1]} refused rows`);
    }
  });
}

test("after a bulk run the rows move on to the next step", () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "w-l-teo");
  const run = applyBulk(data, "submit", ["telok-ayer", "kallang"], ctx);
  const rows = bulkRows(run.data, ctxOf(run.data, "w-l-teo"), "SG");
  assert.deepEqual(rows.map((r) => [r.fund.id, r.status, r.canSubmit]), [
    ["telok-ayer", "In review", false],
    ["loyang", "Signed off", false],
    ["meranti", "In review", false],
    ["kallang", "In review", false],
  ]);
  const reviewer = bulkRows(run.data, ctxOf(run.data, "n-pillai"), "SG");
  assert.deepEqual(reviewer.map((r) => [r.fund.id, r.canApproveReview]), [
    ["telok-ayer", true],
    ["loyang", false],
    ["meranti", false],
    ["kallang", false],
  ]);
});
