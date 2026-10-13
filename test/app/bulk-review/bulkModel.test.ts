import { test } from "node:test";
import assert from "node:assert/strict";
import { bulkRows, createStore, roleCan } from "../../../src/domain/index.ts";
import type { BulkKind, BulkRow, FundId, JurisdictionFilter, RoleId, Store } from "../../../src/domain/types.ts";
import {
  BULK_KINDS,
  EMPTY_SELECTION,
  approvalsText,
  bulkButtonLabel,
  bulkButtons,
  bulkOutcome,
  bulkRoleActions,
  eligibleRows,
  emptyMessage,
  fundHref,
  hasBulkActions,
  isActionable,
  nextIcon,
  outcomeLines,
  pruneSelection,
  selectAllState,
  selectedRows,
  selectionAfterRun,
  selectionSummary,
  setAllSelected,
  setSelected,
  type Selection,
} from "../../../src/app/workspaces/bulk-review/bulkModel.ts";
import { NOW, PERSONAS, ctxOf, fundOf, sampleStates, seed, userOf } from "../../domain/core-fixtures.ts";

const SEED_ORDER = ["harbourline", "southbank", "wattle", "kurrajong", "coastline", "telok-ayer", "loyang", "meranti", "kallang"];
const SG_IDS = ["telok-ayer", "loyang", "meranti", "kallang"];

function rowsFor(data = seed(), userId: string, jurisdiction: JurisdictionFilter = "all"): BulkRow[] {
  return bulkRows(data, ctxOf(data, userId), jurisdiction);
}

const ids = (rows: readonly BulkRow[]): FundId[] => rows.map((row) => row.fund.id);
const pick = (...fundIds: FundId[]): Selection => new Set(fundIds);

function newStore(userId: string): Store {
  const store = createStore({ storage: null, now: () => NOW });
  store.setUser(userId);
  return store;
}

function storeRows(store: Store): BulkRow[] {
  const { data, ui } = store.getState();
  return bulkRows(data, { now: NOW, user: userOf(data, ui.currentUserId) }, ui.jurisdiction);
}

const nameOfIn = (store: Store) => (fundId: FundId) => fundOf(store.getState().data, fundId).name;

// ------------------------------------------------------------------------------------------------ rows as the capture shows them
test("rows: approvals text, next step and fund link for every fund, as A. Moreno at the seed", () => {
  const rows = rowsFor(seed(), "a-moreno");
  assert.deepEqual(ids(rows), SEED_ORDER);
  // Strings from the reference capture of the Bulk review page.
  assert.deepEqual(
    rows.map((row) => approvalsText(row)),
    [
      "Reviewer done · Tax agent done",
      "Reviewer pending · Tax agent pending",
      "Reviewer done",
      "Reviewer pending · Tax agent pending",
      "Reviewer pending",
      "Reviewer pending · Tax agent pending",
      "Reviewer done",
      "Reviewer done · Tax agent pending",
      "Reviewer pending",
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.next.text),
    ["already signed off", "2 open exceptions", "already signed off", "3 open exceptions", "Submit", "Submit", "already signed off", "waiting for tax agent approval", "Submit"],
  );
  assert.deepEqual(
    rows.map((row) => [row.status, row.exceptions, row.openQueries]),
    [
      ["Signed off", 0, 0],
      ["In review", 2, 1],
      ["Signed off", 0, 0],
      ["In review", 3, 2],
      ["Preparing", 1, 0],
      ["Preparing", 0, 0],
      ["Signed off", 0, 0],
      ["In review", 0, 0],
      ["Preparing", 1, 0],
    ],
  );
  assert.equal(rows[0]!.governanceLabel, "Tax agent signs off; you lodge");
  assert.equal(rows[2]!.governanceLabel, "No tax agent");
  assert.equal(fundHref("southbank"), "#/?fund=southbank");
});

test("rows: only the steps this persona can take are drawn stronger, and each kind has a stable icon", () => {
  const rows = rowsFor(seed(), "a-moreno");
  const strong = rows.filter((row) => isActionable(row.next.kind)).map((row) => row.fund.id);
  assert.deepEqual(strong, ["coastline", "telok-ayer", "kallang"]);
  assert.equal(nextIcon("submit"), "send");
  assert.equal(nextIcon("approve-review"), "shield-check");
  assert.equal(nextIcon("approve-agent"), "shield-check");
  assert.equal(nextIcon("sign-off"), "circle-check");
  assert.equal(nextIcon("blocked"), "alert-triangle");
  assert.equal(nextIcon("signed-off"), "lock");
  assert.equal(nextIcon("waiting"), null);
  assert.equal(nextIcon("none"), null);
  assert.equal(isActionable("waiting"), false);
  assert.equal(isActionable("blocked"), false);
});

// ------------------------------------------------------------------------------------------------ selection and button state per persona
test("A. Moreno: nothing selected shows the prompt and keeps all three buttons disabled", () => {
  const rows = rowsFor(seed(), "a-moreno");
  assert.equal(selectionSummary(rows, EMPTY_SELECTION, "head-of-tax"), "No funds selected. Tick funds in the table to submit, approve or sign them off.");
  assert.deepEqual(
    bulkButtons(rows, EMPTY_SELECTION, "head-of-tax").map((b) => [b.label, b.count, b.enabled]),
    [
      ["Submit selected", 0, false],
      ["Approve selected as reviewer", 0, false],
      ["Sign off selected", 0, false],
    ],
  );
  assert.equal(selectAllState(rows, EMPTY_SELECTION), "none");
});

test("A. Moreno: select all counts the three Preparing funds as submittable and nothing else", () => {
  const rows = rowsFor(seed(), "a-moreno");
  const all = setAllSelected(EMPTY_SELECTION, rows, true);
  assert.equal(all.size, 9);
  assert.equal(selectAllState(rows, all), "all");
  assert.equal(selectionSummary(rows, all, "head-of-tax"), "9 selected, 3 can be submitted");
  assert.deepEqual(ids(eligibleRows(rows, all, "submit")), ["coastline", "telok-ayer", "kallang"]);
  assert.deepEqual(ids(eligibleRows(rows, all, "approve-review")), []);
  assert.deepEqual(ids(eligibleRows(rows, all, "sign-off")), []);
  assert.deepEqual(
    bulkButtons(rows, all, "head-of-tax").map((b) => [b.kind, b.count, b.enabled]),
    [
      ["submit", 3, true],
      ["approve-review", 0, false],
      ["sign-off", 0, false],
    ],
  );
});

test("A. Moreno: a selection with nothing to do says so, and one with a submittable fund enables only Submit", () => {
  const rows = rowsFor(seed(), "a-moreno");
  const signedOff = pick("harbourline", "wattle");
  assert.equal(selectionSummary(rows, signedOff, "head-of-tax"), "2 selected, none can be submitted, approved or signed off");
  assert.ok(bulkButtons(rows, signedOff, "head-of-tax").every((b) => !b.enabled));

  const mixed = pick("harbourline", "coastline");
  assert.equal(selectionSummary(rows, mixed, "head-of-tax"), "2 selected, 1 can be submitted");
  assert.deepEqual(bulkButtons(rows, mixed, "head-of-tax").map((b) => b.enabled), [true, false, false]);
  assert.equal(selectAllState(rows, mixed), "some");
});

test("L. Brennan (Reviewer): sees the five Australian funds and cannot take any step at the seed, even with everything ticked", () => {
  const rows = rowsFor(seed(), "l-brennan");
  assert.deepEqual(ids(rows), ["harbourline", "southbank", "wattle", "kurrajong", "coastline"]);
  const all = setAllSelected(EMPTY_SELECTION, rows, true);
  assert.equal(selectionSummary(rows, all, "reviewer"), "5 selected, none can be submitted, approved or signed off");
  assert.deepEqual(bulkRoleActions("reviewer"), { submit: false, "approve-review": true, "sign-off": false });
  assert.ok(bulkButtons(rows, all, "reviewer").every((b) => !b.enabled));
  assert.equal(bulkButtons(rows, all, "reviewer")[1]!.label, "Approve selected as reviewer");
});

test("R. Okafor (Preparer): can submit Coastline and nothing else", () => {
  const rows = rowsFor(seed(), "r-okafor");
  assert.deepEqual(ids(rows), ["harbourline", "southbank", "wattle", "kurrajong", "coastline"]);
  const all = setAllSelected(EMPTY_SELECTION, rows, true);
  assert.equal(selectionSummary(rows, all, "preparer"), "5 selected, 1 can be submitted");
  assert.deepEqual(bulkButtons(rows, all, "preparer").map((b) => [b.count, b.enabled]), [[1, true], [0, false], [0, false]]);
  const none = pick("southbank");
  assert.equal(selectionSummary(rows, none, "preparer"), "1 selected, none can be submitted, approved or signed off");
});

test("D. Harrow (Tax agent): three Australian funds, approvals are labelled as the tax agent level, none open yet", () => {
  const rows = rowsFor(seed(), "d-harrow");
  assert.deepEqual(ids(rows), ["harbourline", "southbank", "kurrajong"]);
  assert.equal(bulkButtonLabel("approve-review", "tax-agent"), "Approve selected as tax agent");
  assert.deepEqual(bulkRoleActions("tax-agent"), { submit: false, "approve-review": true, "sign-off": false });
  const all = setAllSelected(EMPTY_SELECTION, rows, true);
  assert.equal(selectionSummary(rows, all, "tax-agent"), "3 selected, none can be submitted, approved or signed off");
  assert.ok(bulkButtons(rows, all, "tax-agent").every((b) => !b.enabled));
  assert.deepEqual(rowsFor(seed(), "d-harrow", "SG"), [], "no Singapore funds");
});

test("S. Lim (Tax agent): Meranti is the one fund waiting for a tax agent approval", () => {
  const rows = rowsFor(seed(), "s-lim");
  assert.deepEqual(ids(rows), ["telok-ayer", "meranti"]);
  const all = setAllSelected(EMPTY_SELECTION, rows, true);
  assert.equal(selectionSummary(rows, all, "tax-agent"), "2 selected, 1 can be approved");
  const buttons = bulkButtons(rows, all, "tax-agent");
  assert.deepEqual(buttons.map((b) => [b.label, b.enabled]), [
    ["Submit selected", false],
    ["Approve selected as tax agent", true],
    ["Sign off selected", false],
  ]);
});

test("M. Castillo (View only): sees all nine funds, can tick them, and no button is ever enabled", () => {
  const rows = rowsFor(seed(), "m-castillo");
  assert.deepEqual(ids(rows), SEED_ORDER);
  assert.equal(hasBulkActions("finance"), false);
  const all = setAllSelected(EMPTY_SELECTION, rows, true);
  assert.equal(selectAllState(rows, all), "all");
  assert.equal(selectionSummary(rows, EMPTY_SELECTION, "finance"), "Your role (View only) can't submit, approve or sign off funds.");
  assert.equal(selectionSummary(rows, all, "finance"), "Your role (View only) can't submit, approve or sign off funds.");
  assert.ok(bulkButtons(rows, all, "finance").every((b) => !b.enabled && b.count === 0));
  assert.ok(rows.filter((row) => row.status !== "Signed off").every((row) => row.next.text === "view only"));
});

// ------------------------------------------------------------------------------------------------ selection mechanics
test("selection helpers return the same set when nothing changes and a new one when something does", () => {
  const rows = rowsFor(seed(), "a-moreno");
  const one = setSelected(EMPTY_SELECTION, "coastline", true);
  assert.notEqual(one, EMPTY_SELECTION);
  assert.equal(EMPTY_SELECTION.size, 0, "the shared empty set is never mutated");
  assert.equal(setSelected(one, "coastline", true), one);
  assert.equal(setSelected(one, "kallang", false), one);
  assert.equal(setSelected(one, "coastline", false).size, 0);
  const all = setAllSelected(EMPTY_SELECTION, rows, true);
  assert.equal(setAllSelected(all, rows, true), all);
  assert.equal(setAllSelected(EMPTY_SELECTION, rows, false), EMPTY_SELECTION);
  assert.equal(setAllSelected(all, rows, false).size, 0);
  assert.equal(setAllSelected(one, rows, true).size, 9, "select all completes a partial selection");
  assert.deepEqual(ids(selectedRows(rows, pick("kallang", "harbourline"))), ["harbourline", "kallang"], "ticked rows come back in table order");
});

test("select all follows the table: partial is mixed, a jurisdiction change prunes what is no longer shown", () => {
  const all = rowsFor(seed(), "a-moreno");
  const au = rowsFor(seed(), "a-moreno", "AU");
  const sg = rowsFor(seed(), "a-moreno", "SG");
  assert.deepEqual(ids(au), SEED_ORDER.slice(0, 5));
  assert.deepEqual(ids(sg), SEED_ORDER.slice(5));

  const selection = pick("coastline", "kallang", "telok-ayer");
  assert.equal(selectAllState(all, selection), "some");
  const onlySg = pruneSelection(selection, sg);
  assert.deepEqual([...onlySg].sort(), ["kallang", "telok-ayer"]);
  assert.equal(pruneSelection(onlySg, sg), onlySg, "nothing to drop, same set");
  assert.deepEqual([...pruneSelection(selection, au)], ["coastline"]);
  assert.equal(pruneSelection(EMPTY_SELECTION, au), EMPTY_SELECTION);

  const everySg = setAllSelected(EMPTY_SELECTION, sg, true);
  assert.equal(selectAllState(sg, everySg), "all");
  assert.equal(selectAllState(au, everySg), "none", "ids that are not in the table do not count");
});

// ------------------------------------------------------------------------------------------------ results
test("a full bulk run through a store: submit, approve at each level, then sign off, with the result model for each step", () => {
  const store = newStore("w-l-teo");
  const nameOf = nameOfIn(store);
  const names = { telok: nameOf("telok-ayer"), loyang: nameOf("loyang"), meranti: nameOf("meranti"), kallang: nameOf("kallang") };

  // W. L. Teo (Preparer) ticks four Singapore funds; two of them can be submitted.
  let rows = storeRows(store);
  assert.deepEqual(ids(rows), SG_IDS);
  let selection: Selection = setAllSelected(EMPTY_SELECTION, rows, true);
  assert.equal(selectionSummary(rows, selection, "preparer"), "4 selected, 2 can be submitted");
  let result = store.dispatchBulk("submit", ids(selectedRows(rows, selection)));
  assert.deepEqual(result.done, ["telok-ayer", "kallang"]);
  let outcome = bulkOutcome("submit", result, nameOf, "preparer");
  assert.equal(outcome.tone, "warn", "some funds were skipped");
  assert.equal(outcome.title, "Submitted 2 funds for review");
  assert.deepEqual(outcomeLines(outcome), [
    `Done: ${names.telok}, ${names.kallang}`,
    `Skipped: ${names.loyang}: Not preparing`,
    `Skipped: ${names.meranti}: Not preparing`,
  ]);
  selection = selectionAfterRun(selection, result);
  assert.deepEqual([...selection].sort(), ["loyang", "meranti"], "the funds that completed are no longer ticked, the skipped ones stay");
  rows = storeRows(store);
  assert.deepEqual(rows.map((row) => row.status), ["In review", "Signed off", "In review", "In review"]);
  assert.equal(selectionSummary(rows, selection, "preparer"), "2 selected, none can be submitted, approved or signed off");

  // N. Pillai (Reviewer) approves: Telok Ayer goes through, Kallang has an open exception.
  store.setUser("n-pillai");
  rows = storeRows(store);
  selection = setAllSelected(EMPTY_SELECTION, rows, true);
  assert.equal(selectionSummary(rows, selection, "reviewer"), "4 selected, 1 can be approved");
  result = store.dispatchBulk("approve-review", ids(selectedRows(rows, selection)));
  assert.deepEqual(result.done, ["telok-ayer"]);
  outcome = bulkOutcome("approve-review", result, nameOf, "reviewer");
  assert.equal(outcome.title, "Approved 1 fund as reviewer");
  assert.deepEqual(outcome.skipped.map((s) => [s.fundId, s.reason]), [
    ["loyang", "Not in review"],
    ["meranti", "Already approved"],
    ["kallang", "Open exceptions"],
  ]);

  // S. Lim (Tax agent) approves at the agent level; every fund in the selection completes, so the result is a success.
  store.setUser("s-lim");
  rows = storeRows(store);
  selection = pick("telok-ayer", "meranti");
  assert.equal(selectionSummary(rows, selection, "tax-agent"), "2 selected, 2 can be approved");
  result = store.dispatchBulk("approve-review", ids(selectedRows(rows, selection)));
  assert.deepEqual(result.done, ["telok-ayer", "meranti"]);
  outcome = bulkOutcome("approve-review", result, nameOf, "tax-agent");
  assert.equal(outcome.tone, "success");
  assert.equal(outcome.title, "Approved 2 funds as tax agent");
  assert.deepEqual(outcomeLines(outcome), [`Done: ${names.telok}, ${names.meranti}`]);
  assert.equal(selectionAfterRun(selection, result).size, 0);

  // A. Moreno (Head of Tax) ticks everything: Coastline can still be submitted, two funds can be signed off, the rest are skipped with a reason each.
  store.setUser("a-moreno");
  rows = storeRows(store);
  assert.deepEqual(ids(rows), SEED_ORDER);
  selection = setAllSelected(EMPTY_SELECTION, rows, true);
  assert.equal(selectionSummary(rows, selection, "head-of-tax"), "9 selected, 1 can be submitted, 2 can be signed off");
  assert.deepEqual(bulkButtons(rows, selection, "head-of-tax").map((b) => b.enabled), [true, false, true]);
  result = store.dispatchBulk("sign-off", ids(selectedRows(rows, selection)));
  assert.deepEqual(result.done, ["telok-ayer", "meranti"]);
  assert.deepEqual(result.skipped.map((s) => s.fundId), ["harbourline", "southbank", "wattle", "kurrajong", "coastline", "loyang", "kallang"]);
  outcome = bulkOutcome("sign-off", result, nameOf, "head-of-tax");
  assert.equal(outcome.tone, "warn");
  assert.equal(outcome.title, "Signed off 2 funds");
  const lines = outcomeLines(outcome);
  assert.equal(lines.length, 8);
  assert.equal(lines[0], `Done: ${names.telok}, ${names.meranti}`);
  assert.ok(lines.includes(`Skipped: ${nameOf("southbank")}: Open exceptions`));
  assert.ok(lines.includes(`Skipped: ${nameOf("coastline")}: Not in review`));
  assert.ok(lines.includes(`Skipped: ${names.kallang}: Open exceptions`));
  rows = storeRows(store);
  assert.deepEqual(rows.filter((row) => row.status === "Signed off").map((row) => row.fund.id), ["harbourline", "wattle", "telok-ayer", "loyang", "meranti"]);
  selection = selectionAfterRun(selection, result);
  assert.equal(selection.size, 7);
  assert.equal(selectionSummary(rows, selection, "head-of-tax"), "7 selected, 1 can be submitted");

  // Repeating the run does nothing: the title says so and nothing is "done".
  result = store.dispatchBulk("sign-off", ids(selectedRows(rows, selection)));
  assert.deepEqual(result.done, []);
  outcome = bulkOutcome("sign-off", result, nameOf, "head-of-tax");
  assert.equal(outcome.tone, "warn");
  assert.equal(outcome.title, "No funds were signed off");
  assert.ok(outcomeLines(outcome).every((line) => line.startsWith("Skipped: ")));
});

test("result titles for each step, singular and plural, and for a run that completes nothing", () => {
  const nameOf = (fundId: FundId) => fundId.toUpperCase();
  const none = { done: [], skipped: [{ fundId: "a", reason: "Not preparing" }] };
  assert.equal(bulkOutcome("submit", none, nameOf, "preparer").title, "No funds were submitted");
  assert.equal(bulkOutcome("approve-review", none, nameOf, "reviewer").title, "No funds were approved");
  assert.equal(bulkOutcome("sign-off", none, nameOf, "head-of-tax").title, "No funds were signed off");
  const one = { done: ["a"], skipped: [] };
  assert.equal(bulkOutcome("submit", one, nameOf, "preparer").title, "Submitted 1 fund for review");
  assert.equal(bulkOutcome("sign-off", one, nameOf, "head-of-tax").title, "Signed off 1 fund");
  assert.equal(bulkOutcome("approve-review", one, nameOf, "head-of-tax").title, "Approved 1 fund as reviewer");
  assert.equal(bulkOutcome("approve-review", one, nameOf, "tax-agent").title, "Approved 1 fund as tax agent");
  assert.equal(bulkOutcome("sign-off", one, nameOf, "head-of-tax").tone, "success");
  assert.deepEqual(outcomeLines(bulkOutcome("sign-off", one, nameOf, "head-of-tax")), ["Done: A"]);
  assert.deepEqual(outcomeLines(bulkOutcome("sign-off", { done: [], skipped: [] }, nameOf, "head-of-tax")), []);
});

test("a store that refuses the whole run (nobody to act as) still produces a readable result", () => {
  const store = newStore("m-castillo");
  const rows = storeRows(store);
  const result = store.dispatchBulk("sign-off", ids(rows));
  assert.deepEqual(result.done, []);
  assert.equal(result.skipped.length, 9);
  assert.ok(result.skipped.every((s) => s.reason === "Not allowed for your role"));
  const outcome = bulkOutcome("sign-off", result, nameOfIn(store), "finance");
  assert.equal(outcome.title, "No funds were signed off");
  assert.equal(outcomeLines(outcome).length, 9);
  assert.ok(outcomeLines(outcome).every((line) => !/undefined|NaN|\[object/.test(line)));
});

// ------------------------------------------------------------------------------------------------ empty state
test("the empty message tells 'nothing assigned' from 'hidden by the jurisdiction'", () => {
  assert.deepEqual(emptyMessage("D. Harrow", "SG", 3), {
    title: "No Singapore funds to review",
    body: "D. Harrow has no Singapore funds. Switch the jurisdiction to All to see the others.",
  });
  assert.equal(emptyMessage("N. Pillai", "AU", 4).title, "No Australian funds to review");
  assert.deepEqual(emptyMessage("A. Nobody", "all", 0), {
    title: "No funds to review",
    body: "A. Nobody isn't assigned to any funds. A Head of Tax can change that under Access.",
  });
  assert.equal(emptyMessage("A. Nobody", "SG", 0).title, "No funds to review");
  assert.equal(selectionSummary([], EMPTY_SELECTION, "head-of-tax"), "There are no funds to select.");
});

// ------------------------------------------------------------------------------------------------ invariants over real states
test("for every persona and sample state the row flags, role steps and buttons agree and no text is broken", () => {
  const roleStep = (role: RoleId): Record<BulkKind, boolean> => ({
    submit: roleCan(role, "submit"),
    "approve-review": roleCan(role, "approve-review") || roleCan(role, "approve-agent"),
    "sign-off": roleCan(role, "sign-off"),
  });
  for (const [label, data] of sampleStates()) {
    for (const persona of PERSONAS) {
      const user = userOf(data, persona);
      const rows = rowsFor(data, persona);
      const where = `${persona} in "${label}"`;
      assert.deepEqual(bulkRoleActions(user.role), roleStep(user.role), where);
      assert.equal(hasBulkActions(user.role), Object.values(roleStep(user.role)).some(Boolean), where);
      const all = setAllSelected(EMPTY_SELECTION, rows, true);
      const summary = selectionSummary(rows, all, user.role);
      assert.ok(!/NaN|undefined|null|\[object/.test(summary), `${where}: ${summary}`);
      const buttons = bulkButtons(rows, all, user.role);
      assert.deepEqual(buttons.map((b) => b.kind), [...BULK_KINDS], where);
      for (const row of rows) {
        // A row can only be eligible for a step the role has at all.
        if (row.canSubmit) assert.ok(roleStep(user.role).submit, `${where}: ${row.fund.id} canSubmit`);
        if (row.canApproveReview) assert.ok(roleStep(user.role)["approve-review"], `${where}: ${row.fund.id} canApproveReview`);
        if (row.canSignOff) assert.ok(roleStep(user.role)["sign-off"], `${where}: ${row.fund.id} canSignOff`);
        assert.ok(!/NaN|undefined|null|\[object/.test(approvalsText(row)), `${where}: ${row.fund.id}`);
      }
      for (const button of buttons) {
        const eligible = rows.filter((row) => (button.kind === "submit" ? row.canSubmit : button.kind === "approve-review" ? row.canApproveReview : row.canSignOff));
        assert.equal(button.count, eligible.length, `${where}: ${button.kind} count`);
        assert.equal(button.enabled, eligible.length > 0, `${where}: ${button.kind} enabled`);
      }
    }
  }
});

test("the buttons promise exactly what the domain then does: for every persona and sample state, a run completes the eligible funds in table order", () => {
  for (const [label, data] of sampleStates()) {
    for (const persona of PERSONAS) {
      const rows = rowsFor(data, persona);
      const all = setAllSelected(EMPTY_SELECTION, rows, true);
      for (const kind of BULK_KINDS) {
        const store = createStore({ storage: null, now: () => NOW, initial: { data, ui: { currentUserId: persona, jurisdiction: "all", selectedFundId: null } } });
        const result = store.dispatchBulk(kind, ids(selectedRows(rows, all)));
        assert.deepEqual(result.done, ids(eligibleRows(rows, all, kind)), `${persona} in "${label}": ${kind}`);
        assert.equal(result.done.length + result.skipped.length, rows.length, `${persona} in "${label}": ${kind} accounts for every fund`);
      }
    }
  }
});
