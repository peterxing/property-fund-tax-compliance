import { test } from "node:test";
import assert from "node:assert/strict";
import { accessView, createStore } from "../../../src/domain/index.ts";
import type { AppData, FundId, GovernanceMode } from "../../../src/domain/types.ts";
import {
  LOCKED_REASON,
  PERMISSIONS_FOOTNOTE,
  PERMISSIONS_SUBTITLE,
  PICK_ONE_FUND,
  RESET_DESCRIPTION,
  canManageAccess,
  draftFunds,
  fundsChanged,
  fundsDialogDescription,
  fundsDialogTitle,
  fundsSavedMessage,
  fundsText,
  governanceChangedMessage,
  governanceControl,
  governanceOptions,
  governanceSelectLabel,
  initialFundsDraft,
  managerRoleLabels,
  matrixColumns,
  matrixRows,
  readOnlyNote,
  roleLabelOf,
  selectionOf,
  selectionText,
  setAllTicked,
  setFundTicked,
  setGovernanceAction,
  setUserFundsAction,
  userMeta,
  validateFunds,
} from "../../../src/app/workspaces/access/accessModel.ts";
import { NOW, PERSONAS, ctxOf, denied, ok, sampleStates, seed } from "../../domain/core-fixtures.ts";

const BAD_TEXT = /NaN|undefined|null|Infinity|\[object/;

const AU_NAMES = [
  "Harbourline Office Trust",
  "Southbank Industrial Partners Fund",
  "Wattle Retail Property Trust",
  "Kurrajong Stapled Property Trust",
  "Coastline Healthcare Property Fund",
];
const SG_NAMES = ["Telok Ayer Commercial REIT", "Loyang Logistics REIT", "Meranti Digital Infrastructure REIT", "Kallang Riverside Retail REIT"];

// From the reference capture (Access, working as A. Moreno): name, "title · organisation", role, funds.
const REFERENCE_USERS: Array<{ id: string; name: string; meta: string; role: string; funds: string }> = [
  { id: "a-moreno", name: "A. Moreno", meta: "Head of Tax · Fund manager", role: "Head of Tax", funds: "All funds" },
  { id: "l-brennan", name: "L. Brennan", meta: "Tax manager, Australia · Fund manager", role: "Reviewer", funds: AU_NAMES.join(", ") },
  { id: "n-pillai", name: "N. Pillai", meta: "Tax manager, Singapore · Fund manager", role: "Reviewer", funds: SG_NAMES.join(", ") },
  { id: "r-okafor", name: "R. Okafor", meta: "Tax accountant, Australia · Fund manager", role: "Preparer", funds: AU_NAMES.join(", ") },
  { id: "w-l-teo", name: "W. L. Teo", meta: "Tax accountant, Singapore · Fund manager", role: "Preparer", funds: SG_NAMES.join(", ") },
  {
    id: "d-harrow",
    name: "D. Harrow",
    meta: "Registered tax agent · Arden Tax Partners",
    role: "Tax agent",
    funds: "Harbourline Office Trust, Southbank Industrial Partners Fund, Kurrajong Stapled Property Trust",
  },
  { id: "s-lim", name: "S. Lim", meta: "Tax adviser · Tanjong Tax Advisory", role: "Tax agent", funds: "Telok Ayer Commercial REIT, Meranti Digital Infrastructure REIT" },
  { id: "m-castillo", name: "M. Castillo", meta: "Fund finance · Fund manager", role: "View only", funds: "All funds" },
];

// From the reference capture (Governance by fund): fund, status, governance in words, approvals before sign-off, who records lodgment.
const REFERENCE_GOVERNANCE: Array<[string, string, string, string, string]> = [
  ["Harbourline Office Trust", "Signed off", "Tax agent signs off; you lodge", "Reviewer, Tax agent", "Head of Tax"],
  ["Southbank Industrial Partners Fund", "In review", "Tax agent reviews and lodges", "Reviewer, Tax agent", "Tax agent"],
  ["Wattle Retail Property Trust", "Signed off", "No tax agent", "Reviewer", "Head of Tax"],
  ["Kurrajong Stapled Property Trust", "In review", "Tax agent reviews and lodges", "Reviewer, Tax agent", "Tax agent"],
  ["Coastline Healthcare Property Fund", "Preparing", "No tax agent", "Reviewer", "Head of Tax"],
  ["Telok Ayer Commercial REIT", "Preparing", "Tax agent signs off; you lodge", "Reviewer, Tax agent", "Head of Tax"],
  ["Loyang Logistics REIT", "Signed off", "No tax agent", "Reviewer", "Head of Tax"],
  ["Meranti Digital Infrastructure REIT", "In review", "Tax agent reviews and lodges", "Reviewer, Tax agent", "Tax agent"],
  ["Kallang Riverside Retail REIT", "Preparing", "No tax agent", "Reviewer", "Head of Tax"],
];

// From the reference capture (Permissions by role): the action and which of the five roles can take it, in column order
// Head of Tax | Reviewer | Preparer | Tax agent | View only.
const REFERENCE_MATRIX: Array<[string, boolean[]]> = [
  ["Edit components, holders and the trial balance", [true, false, true, false, false]],
  ["Submit for review", [true, false, true, false, false]],
  ["Publish notices", [true, false, true, false, false]],
  ["Raise and answer queries", [true, true, true, true, false]],
  ["Return to preparer", [true, true, false, false, false]],
  ["Approve as reviewer", [true, true, false, false, false]],
  ["Approve as tax agent", [false, false, false, true, false]],
  ["Sign off", [true, false, false, false, false]],
  ["Reopen a signed-off fund", [true, false, false, false, false]],
  ["Record lodgment", [true, false, false, true, false]],
  ["Manage users and governance", [true, false, false, false, false]],
];

const ALL_IDS = seed().funds.map((fund) => fund.id);

function viewAs(userId: string, data: AppData = seed()) {
  return accessView(data, ctxOf(data, userId));
}

function storeAs(userId: string, data: AppData = seed()) {
  return createStore({ storage: null, now: () => NOW, initial: { data, ui: { currentUserId: userId, jurisdiction: "all", selectedFundId: null } } });
}

// ------------------------------------------------------------------------------------------------ users
test("users: names, roles, titles and funds read like the reference", () => {
  const view = viewAs("a-moreno");
  assert.deepEqual(
    view.users.map((entry) => entry.user.id),
    REFERENCE_USERS.map((user) => user.id),
  );
  for (const reference of REFERENCE_USERS) {
    const entry = view.users.find((candidate) => candidate.user.id === reference.id)!;
    assert.equal(entry.user.name, reference.name);
    assert.equal(userMeta(entry.user), reference.meta, reference.name);
    assert.equal(roleLabelOf(entry.user), reference.role, reference.name);
    assert.equal(fundsText(entry), reference.funds, reference.name);
  }
});

test("users: exactly one row says 'working as', and it is the acting persona", () => {
  for (const persona of PERSONAS) {
    const current = viewAs(persona).users.filter((entry) => entry.isCurrent);
    assert.deepEqual(
      current.map((entry) => entry.user.id),
      [persona],
    );
  }
});

test("users: the funds text for a list of one, an empty list and everything", () => {
  assert.equal(fundsText({ allFunds: false, fundNames: ["Harbourline Office Trust"] }), "Harbourline Office Trust");
  assert.equal(fundsText({ allFunds: false, fundNames: [] }), "No funds");
  assert.equal(fundsText({ allFunds: true, fundNames: AU_NAMES.concat(SG_NAMES) }), "All funds");
});

// ------------------------------------------------------------------------------------------------ governance
test("governance: every fund's status, mode, approvals and lodgment read like the reference", () => {
  const view = viewAs("a-moreno");
  assert.deepEqual(
    view.governance.map((entry) => [entry.fund.name, entry.status, entry.label, entry.approvalsBeforeSignOff, entry.recordsLodgment]),
    REFERENCE_GOVERNANCE,
  );
  assert.deepEqual(
    governanceOptions(view.modes),
    [
      { value: "agent-lodges", label: "Tax agent reviews and lodges" },
      { value: "agent-signs-off", label: "Tax agent signs off; you lodge" },
      { value: "no-agent", label: "No tax agent" },
    ],
  );
  assert.equal(governanceSelectLabel("Wattle Retail Property Trust"), "Governance for Wattle Retail Property Trust");
});

test("governance: only the Head of Tax can change it, and not once the fund is signed off", () => {
  const data = seed();
  for (const persona of PERSONAS) {
    const entries = viewAs(persona, data).governance;
    const user = ctxOf(data, persona).user;
    for (const entry of entries) {
      const control = governanceControl(entry, user);
      if (entry.status === "Signed off") {
        assert.deepEqual(control, { kind: "locked", reason: LOCKED_REASON }, `${persona}: ${entry.fund.name}`);
      } else if (persona === "a-moreno") {
        assert.deepEqual(control, { kind: "select", reason: null }, entry.fund.name);
      } else {
        assert.deepEqual(control, { kind: "readonly", reason: readOnlyNote() }, `${persona}: ${entry.fund.name}`);
      }
    }
  }
});

test("governance: what the page offers is exactly what the domain accepts", () => {
  const data = seed();
  const modes: GovernanceMode[] = ["agent-lodges", "agent-signs-off", "no-agent"];
  for (const persona of PERSONAS) {
    const user = ctxOf(data, persona).user;
    for (const entry of viewAs(persona, data).governance) {
      const other = modes.find((mode) => mode !== entry.mode)!;
      const result = storeAs(persona, data).dispatch(setGovernanceAction(entry.fund.id, other));
      const offered = governanceControl(entry, user).kind === "select";
      assert.equal(result.ok, offered, `${persona}: ${entry.fund.name} -> ${other}`);
    }
  }
});

test("governance: the confirmation names the fund and the new setting", () => {
  assert.equal(
    governanceChangedMessage("Southbank Industrial Partners Fund", "No tax agent"),
    "Governance for Southbank Industrial Partners Fund changed to No tax agent.",
  );
  assert.deepEqual(setGovernanceAction("southbank", "no-agent"), { type: "set-governance", fundId: "southbank", mode: "no-agent" });
});

test("governance: a Head of Tax's change shows straight away in the rows that follow from it", () => {
  const store = storeAs("a-moreno");
  const result = store.dispatch(setGovernanceAction("southbank", "no-agent"));
  assert.ok(result.ok);
  const row = viewAs("a-moreno", store.getState().data).governance.find((entry) => entry.fund.id === "southbank")!;
  assert.equal(row.mode, "no-agent");
  assert.equal(row.label, "No tax agent");
  assert.equal(row.approvalsBeforeSignOff, "Reviewer");
  assert.equal(row.recordsLodgment, "Head of Tax");
  // The other funds are untouched.
  const others = viewAs("a-moreno", store.getState().data).governance.filter((entry) => entry.fund.id !== "southbank");
  assert.deepEqual(
    others.map((entry) => [entry.fund.name, entry.label]),
    REFERENCE_GOVERNANCE.filter(([name]) => name !== "Southbank Industrial Partners Fund").map(([name, , label]) => [name, label]),
  );
});

test("governance: a signed-off fund is refused with a reason the page already shows", () => {
  const reason = denied(seed(), "a-moreno", setGovernanceAction("harbourline", "no-agent"));
  assert.match(reason, /signed off/i);
  assert.match(LOCKED_REASON, /signed off/i);
});

// ------------------------------------------------------------------------------------------------ who may manage access
test("only a Head of Tax manages access, and the read-only note says so", () => {
  const data = seed();
  const managers = PERSONAS.filter((persona) => canManageAccess(ctxOf(data, persona).user));
  assert.deepEqual(managers, ["a-moreno"]);
  assert.deepEqual(managerRoleLabels(), ["Head of Tax"]);
  assert.equal(readOnlyNote(), "This page is read-only for you. Only a Head of Tax can change who sees which funds or how a fund is governed.");
});

// ------------------------------------------------------------------------------------------------ permissions by role
test("permissions: the grid reads like the reference", () => {
  const view = viewAs("a-moreno");
  assert.deepEqual(
    matrixColumns(view).map((column) => column.label),
    ["Head of Tax", "Reviewer", "Preparer", "Tax agent", "View only"],
  );
  const rows = matrixRows(view);
  assert.deepEqual(
    rows.map((row) => [row.label, row.cells.map((cell) => cell.allowed)]),
    REFERENCE_MATRIX,
  );
  for (const row of rows) {
    assert.equal(row.cells.length, 5);
    for (const cell of row.cells) {
      assert.equal(cell.text, cell.allowed ? "Yes" : "No");
      assert.ok(cell.roleLabel.length > 0);
    }
  }
  assert.equal(PERMISSIONS_SUBTITLE, "Which roles can take each action on the funds they can see");
  assert.equal(
    PERMISSIONS_FOOTNOTE,
    "Tax agents approve only where a fund's governance includes a tax agent, and record lodgment only where the agent lodges. Whoever submits a fund can't also approve it as reviewer.",
  );
});

test("permissions: the grid is the same whoever is looking", () => {
  const first = matrixRows(viewAs("a-moreno"));
  for (const persona of PERSONAS) assert.deepEqual(matrixRows(viewAs(persona)), first, persona);
});

// ------------------------------------------------------------------------------------------------ the "Change funds" dialog
test("dialog: it starts from what the user can see now", () => {
  assert.deepEqual(initialFundsDraft("all", ALL_IDS), ALL_IDS);
  assert.deepEqual(initialFundsDraft(["southbank", "harbourline"], ALL_IDS), ["harbourline", "southbank"], "in the funds' own order");
  assert.deepEqual(initialFundsDraft(["gone"], ALL_IDS), [], "a fund that no longer exists is dropped");
  const brennan = viewAs("a-moreno").users.find((entry) => entry.user.id === "l-brennan")!;
  assert.deepEqual(initialFundsDraft(brennan.user.funds, ALL_IDS), ["harbourline", "southbank", "wattle", "kurrajong", "coastline"]);
});

test("dialog: ticking and unticking a fund keeps the funds' order and never doubles up", () => {
  let draft: FundId[] = [];
  draft = setFundTicked(draft, "kallang", true, ALL_IDS);
  draft = setFundTicked(draft, "harbourline", true, ALL_IDS);
  draft = setFundTicked(draft, "harbourline", true, ALL_IDS);
  assert.deepEqual(draft, ["harbourline", "kallang"]);
  draft = setFundTicked(draft, "kallang", false, ALL_IDS);
  draft = setFundTicked(draft, "kallang", false, ALL_IDS);
  assert.deepEqual(draft, ["harbourline"]);
  assert.deepEqual(setFundTicked(["harbourline"], "nope", true, ALL_IDS), ["harbourline"], "an unknown fund cannot be ticked");
});

test("dialog: the All funds box ticks everything or clears everything, and shows a dash in between", () => {
  assert.deepEqual(setAllTicked(true, ALL_IDS), ALL_IDS);
  assert.deepEqual(setAllTicked(false, ALL_IDS), []);

  assert.deepEqual(selectionOf([], ALL_IDS), { count: 0, total: 9, all: false, none: true, indeterminate: false });
  assert.deepEqual(selectionOf(["harbourline", "kallang"], ALL_IDS), { count: 2, total: 9, all: false, none: false, indeterminate: true });
  assert.deepEqual(selectionOf(ALL_IDS, ALL_IDS), { count: 9, total: 9, all: true, none: false, indeterminate: false });
  // A tick for a fund that no longer exists does not count.
  assert.equal(selectionOf(["gone"], ALL_IDS).none, true);
  // Ticking the last missing fund by hand is the same as All funds.
  assert.equal(selectionOf(setFundTicked(ALL_IDS.slice(0, -1), ALL_IDS.at(-1)!, true, ALL_IDS), ALL_IDS).all, true);

  assert.equal(selectionText(selectionOf([], ALL_IDS)), "No funds selected");
  assert.equal(selectionText(selectionOf(["harbourline", "kallang"], ALL_IDS)), "2 of 9 funds selected");
  assert.equal(selectionText(selectionOf(ALL_IDS, ALL_IDS)), "All 9 funds selected");
});

test("dialog: Save with nothing ticked is refused with 'Pick at least one fund' - the domain's own wording", () => {
  assert.equal(validateFunds([], ALL_IDS), PICK_ONE_FUND);
  assert.equal(validateFunds(["gone"], ALL_IDS), PICK_ONE_FUND);
  assert.equal(validateFunds(["wattle"], ALL_IDS), null);
  assert.equal(validateFunds(ALL_IDS, ALL_IDS), null);
  assert.equal(PICK_ONE_FUND, "Pick at least one fund");
  // The page checks first, but the domain says the same thing if an empty list ever reaches it.
  assert.equal(denied(seed(), "a-moreno", { type: "set-user-funds", userId: "l-brennan", funds: [] }), PICK_ONE_FUND);
});

test("dialog: what is saved is 'all' when every fund is ticked, otherwise the ticked funds in order", () => {
  assert.equal(draftFunds(ALL_IDS, ALL_IDS), "all");
  assert.deepEqual(draftFunds(["kallang", "wattle"], ALL_IDS), ["wattle", "kallang"]);
  assert.deepEqual(draftFunds([], ALL_IDS), []);
  assert.deepEqual(setUserFundsAction("l-brennan", ["kallang", "wattle"], ALL_IDS), { type: "set-user-funds", userId: "l-brennan", funds: ["wattle", "kallang"] });
  assert.deepEqual(setUserFundsAction("r-okafor", ALL_IDS, ALL_IDS), { type: "set-user-funds", userId: "r-okafor", funds: "all" });
});

test("dialog: Save only does something when what the user can see would change", () => {
  const brennan: FundId[] = ["harbourline", "southbank", "wattle", "kurrajong", "coastline"];
  assert.equal(fundsChanged(brennan, initialFundsDraft(brennan, ALL_IDS), ALL_IDS), false, "untouched");
  assert.equal(fundsChanged(brennan, [...brennan].reverse(), ALL_IDS), false, "the same funds in another order");
  assert.equal(fundsChanged(brennan, brennan.slice(1), ALL_IDS), true, "one fewer");
  assert.equal(fundsChanged(brennan, brennan.concat("kallang"), ALL_IDS), true, "one more");
  assert.equal(fundsChanged("all", ALL_IDS, ALL_IDS), false, "everyone-sees-all stays that way");
  assert.equal(fundsChanged("all", ALL_IDS.slice(1), ALL_IDS), true);
  assert.equal(fundsChanged(brennan, ALL_IDS, ALL_IDS), true, "widening to everything");
  assert.equal(fundsChanged(ALL_IDS, ALL_IDS, ALL_IDS), false, "an explicit list of every fund is already everything");
});

test("dialog: wording", () => {
  assert.equal(fundsDialogTitle("L. Brennan"), "Change funds for L. Brennan");
  assert.equal(fundsDialogDescription("L. Brennan"), "Choose which funds L. Brennan can see.");
  assert.equal(fundsSavedMessage("L. Brennan", "all"), "L. Brennan can now see all funds.");
  assert.equal(fundsSavedMessage("L. Brennan", ["harbourline"]), "L. Brennan can now see 1 fund.");
  assert.equal(fundsSavedMessage("L. Brennan", ["harbourline", "wattle", "kallang"]), "L. Brennan can now see 3 funds.");
});

test("dialog: a Head of Tax narrows a user's funds and the Users table follows", () => {
  const store = storeAs("a-moreno");
  const brennan = viewAs("a-moreno", store.getState().data).users.find((entry) => entry.user.id === "l-brennan")!;
  // The dialog opens on Brennan's five funds; the Head of Tax unticks Coastline and ticks one Singapore fund.
  let draft = initialFundsDraft(brennan.user.funds, ALL_IDS);
  draft = setFundTicked(draft, "coastline", false, ALL_IDS);
  draft = setFundTicked(draft, "loyang", true, ALL_IDS);
  assert.equal(fundsChanged(brennan.user.funds, draft, ALL_IDS), true);
  assert.equal(validateFunds(draft, ALL_IDS), null);

  const result = store.dispatch(setUserFundsAction("l-brennan", draft, ALL_IDS));
  assert.ok(result.ok);
  const after = viewAs("a-moreno", store.getState().data).users.find((entry) => entry.user.id === "l-brennan")!;
  assert.equal(after.allFunds, false);
  assert.equal(
    fundsText(after),
    [...AU_NAMES.slice(0, 4), "Loyang Logistics REIT"].join(", "),
    "Australian funds first, then the Singapore one, as the funds are ordered",
  );
  assert.equal(fundsSavedMessage("L. Brennan", draftFunds(draft, ALL_IDS)), "L. Brennan can now see 5 funds.");
  // Nobody else's access moved.
  for (const entry of viewAs("a-moreno", store.getState().data).users) {
    if (entry.user.id === "l-brennan") continue;
    assert.equal(fundsText(entry), REFERENCE_USERS.find((user) => user.id === entry.user.id)!.funds, entry.user.name);
  }
});

test("dialog: ticking every fund saves 'All funds', and unticking one from 'All funds' saves the rest", () => {
  const store = storeAs("a-moreno");
  assert.ok(store.dispatch(setUserFundsAction("r-okafor", ALL_IDS, ALL_IDS)).ok);
  const okafor = viewAs("a-moreno", store.getState().data).users.find((entry) => entry.user.id === "r-okafor")!;
  assert.equal(okafor.allFunds, true);
  assert.equal(fundsText(okafor), "All funds");

  const draft = setFundTicked(initialFundsDraft(okafor.user.funds, ALL_IDS), "kallang", false, ALL_IDS);
  assert.ok(store.dispatch(setUserFundsAction("r-okafor", draft, ALL_IDS)).ok);
  const narrowed = viewAs("a-moreno", store.getState().data).users.find((entry) => entry.user.id === "r-okafor")!;
  assert.equal(narrowed.allFunds, false);
  assert.equal(narrowed.fundNames.length, 8);
  assert.ok(!narrowed.fundNames.includes("Kallang Riverside Retail REIT"));
});

test("dialog: what the page offers is exactly what the domain accepts", () => {
  const data = seed();
  for (const persona of PERSONAS) {
    const result = storeAs(persona, data).dispatch(setUserFundsAction("r-okafor", ALL_IDS, ALL_IDS));
    assert.equal(result.ok, canManageAccess(ctxOf(data, persona).user), persona);
  }
});

// ------------------------------------------------------------------------------------------------ reset
test("reset: the original data returns and the acting persona stays", () => {
  const store = storeAs("a-moreno");
  assert.ok(store.dispatch(setGovernanceAction("southbank", "no-agent")).ok);
  assert.ok(store.dispatch(setUserFundsAction("l-brennan", ["wattle"], ALL_IDS)).ok);
  assert.notDeepEqual(viewAs("a-moreno", store.getState().data), viewAs("a-moreno"));

  store.reset();
  assert.deepEqual(viewAs("a-moreno", store.getState().data), viewAs("a-moreno"));
  assert.equal(store.getState().ui.currentUserId, "a-moreno");
  assert.equal(
    RESET_DESCRIPTION,
    "This restores the original demonstration data in this browser. Your changes will be lost.",
  );
});

// ------------------------------------------------------------------------------------------------ invariants
test("every string the page draws is readable in every sample state for every persona", () => {
  for (const [label, data] of sampleStates()) {
    for (const persona of PERSONAS) {
      const view = viewAs(persona, data);
      const user = ctxOf(data, persona).user;
      const strings: string[] = [view.disclaimer, readOnlyNote()];
      for (const entry of view.users) strings.push(entry.user.name, userMeta(entry.user), roleLabelOf(entry.user), fundsText(entry));
      for (const entry of view.governance) {
        const control = governanceControl(entry, user);
        strings.push(entry.fund.name, entry.status, entry.label, entry.approvalsBeforeSignOff, entry.recordsLodgment, governanceSelectLabel(entry.fund.name));
        if (control.reason) strings.push(control.reason);
      }
      for (const row of matrixRows(view)) strings.push(row.label, ...row.cells.map((cell) => `${cell.roleLabel} ${cell.text}`));
      for (const text of strings) {
        assert.ok(text.trim().length > 0, `${persona} in "${label}": an empty string`);
        assert.doesNotMatch(text, BAD_TEXT, `${persona} in "${label}": ${text}`);
      }
      // One row per user and per fund, in every state.
      assert.equal(view.users.length, 8);
      assert.equal(view.governance.length, 9);
    }
  }
});

test("a user whose funds were narrowed sees the change as themselves, and still cannot manage access", () => {
  const data = ok(seed(), "a-moreno", setUserFundsAction("l-brennan", ["wattle"], ALL_IDS));
  const view = viewAs("l-brennan", data);
  assert.equal(fundsText(view.users.find((entry) => entry.isCurrent)!), "Wattle Retail Property Trust");
  assert.equal(canManageAccess(ctxOf(data, "l-brennan").user), false);
  // The page shows every user and fund, whatever the persona can see elsewhere in the app.
  assert.equal(view.users.length, 8);
  assert.equal(view.governance.length, 9);
});
