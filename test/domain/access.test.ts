import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../../src/domain/actions.ts";
import { ACTIONS, GOVERNANCE_MODES, ROLES, ROLE_ACTIONS } from "../../src/domain/permissions.ts";
import { accessView } from "../../src/domain/selectors.ts";
import type { Action, AppData, GovernanceMode, RoleId } from "../../src/domain/types.ts";
import { NOW_STAMP, PERSONAS, chain, ctxOf, denied, frozenSeed, fundOf, ok, seed } from "./core-fixtures.ts";

const approve = (fundId: string, level: "review" | "agent"): Action => ({ type: "approve", fundId, level });
const governance = (fundId: string, mode: GovernanceMode): Action => ({ type: "set-governance", fundId, mode });
const userFunds = (userId: string, funds: "all" | string[]): Action => ({ type: "set-user-funds", userId, funds });
const view = (data: AppData, userId = "a-moreno") => accessView(data, ctxOf(data, userId));
const lastAudit = (data: AppData) => data.audit[data.audit.length - 1];
const withoutId = (entry: AppData["audit"][number]) => ({ ...entry, id: undefined });

// ------------------------------------------------------------------------------------------------ the Access page
test("accessView lists every user with the funds they can reach, in seed order", () => {
  const data = seed();
  const v = view(data, "n-pillai");
  assert.deepEqual(v.users.map((u) => u.user.id), data.users.map((u) => u.id));
  assert.deepEqual(v.users.map((u) => u.isCurrent), data.users.map((u) => u.id === "n-pillai"));
  const names = (ids: string[]) => ids.map((id) => fundOf(data, id).name);
  const row = (id: string) => v.users.find((u) => u.user.id === id)!;
  assert.deepEqual(row("a-moreno").fundNames, data.funds.map((f) => f.name));
  assert.equal(row("a-moreno").allFunds, true);
  assert.equal(row("m-castillo").allFunds, true);
  assert.deepEqual(row("l-brennan").fundNames, names(["harbourline", "southbank", "wattle", "kurrajong", "coastline"]));
  assert.deepEqual(row("n-pillai").fundNames, names(["telok-ayer", "loyang", "meranti", "kallang"]));
  assert.deepEqual(row("d-harrow").fundNames, names(["harbourline", "southbank", "kurrajong"]));
  assert.deepEqual(row("s-lim").fundNames, names(["telok-ayer", "meranti"]));
  assert.equal(row("s-lim").allFunds, false);
  assert.ok(row("d-harrow").fundNames.includes("Southbank Industrial Partners Fund"));
  assert.equal(v.users.filter((u) => u.isCurrent).length, 1);
  assert.equal(row("a-moreno").user, data.users.find((u) => u.id === "a-moreno"), "the user object itself is shared");
});

test("accessView gives every fund its governance in words", () => {
  const data = seed();
  const rows = view(data).governance;
  assert.deepEqual(rows.map((r) => r.fund.id), data.funds.map((f) => f.id));
  const by = (id: string) => rows.find((r) => r.fund.id === id)!;
  assert.deepEqual(
    { mode: by("harbourline").mode, label: by("harbourline").label, approvalsBeforeSignOff: by("harbourline").approvalsBeforeSignOff, recordsLodgment: by("harbourline").recordsLodgment, status: by("harbourline").status },
    { mode: "agent-signs-off", label: "Tax agent signs off; you lodge", approvalsBeforeSignOff: "Reviewer, Tax agent", recordsLodgment: "Head of Tax", status: "Signed off" },
  );
  assert.deepEqual(
    { mode: by("southbank").mode, label: by("southbank").label, approvalsBeforeSignOff: by("southbank").approvalsBeforeSignOff, recordsLodgment: by("southbank").recordsLodgment, status: by("southbank").status },
    { mode: "agent-lodges", label: "Tax agent reviews and lodges", approvalsBeforeSignOff: "Reviewer, Tax agent", recordsLodgment: "Tax agent", status: "In review" },
  );
  assert.deepEqual(
    { mode: by("wattle").mode, label: by("wattle").label, approvalsBeforeSignOff: by("wattle").approvalsBeforeSignOff, recordsLodgment: by("wattle").recordsLodgment },
    { mode: "no-agent", label: "No tax agent", approvalsBeforeSignOff: "Reviewer", recordsLodgment: "Head of Tax" },
  );
  assert.equal(by("kallang").fund, fundOf(data, "kallang"));
});

test("accessView exposes the governance modes, the roles and the permission matrix", () => {
  const v = view(seed());
  assert.deepEqual(v.modes, [
    { mode: "agent-lodges", label: "Tax agent reviews and lodges" },
    { mode: "agent-signs-off", label: "Tax agent signs off; you lodge" },
    { mode: "no-agent", label: "No tax agent" },
  ]);
  assert.deepEqual(v.modes.map((m) => m.mode), GOVERNANCE_MODES);
  assert.deepEqual(v.roles, [
    { id: "head-of-tax", label: "Head of Tax" },
    { id: "reviewer", label: "Reviewer" },
    { id: "preparer", label: "Preparer" },
    { id: "tax-agent", label: "Tax agent" },
    { id: "finance", label: "View only" },
  ]);
  assert.deepEqual(v.permissions.map((p) => p.action), ACTIONS);
  assert.equal(v.permissions.length, 11);
  const row = (action: string) => v.permissions.find((p) => p.action === action)!;
  assert.deepEqual(row("sign-off").roles, { "head-of-tax": true, reviewer: false, preparer: false, "tax-agent": false, finance: false });
  assert.deepEqual(row("manage-access").roles, { "head-of-tax": true, reviewer: false, preparer: false, "tax-agent": false, finance: false });
  assert.deepEqual(row("query").roles, { "head-of-tax": true, reviewer: true, preparer: true, "tax-agent": true, finance: false });
  assert.deepEqual(row("approve-review").roles, { "head-of-tax": true, reviewer: true, preparer: false, "tax-agent": false, finance: false });
  assert.deepEqual(row("approve-agent").roles, { "head-of-tax": false, reviewer: false, preparer: false, "tax-agent": true, finance: false });
  assert.equal(row("edit").label, "Edit components, holders and the trial balance");
  assert.equal(row("manage-access").label, "Manage users and governance");
  for (const p of v.permissions) {
    for (const role of ROLES as RoleId[]) assert.equal(p.roles[role], ROLE_ACTIONS[role].includes(p.action), `${role} ${p.action}`);
  }
});

test("accessView carries the disclaimer, and only isCurrent depends on who is asking", () => {
  const data = seed();
  assert.equal(view(data).disclaimer, "Roles apply within this app's screens. Anyone who can open the app can switch who they're working as, so this isn't a security boundary.");
  const strip = (v: ReturnType<typeof accessView>) => ({ ...v, users: v.users.map(({ isCurrent: _isCurrent, ...rest }) => rest) });
  const baseline = strip(view(data, "a-moreno"));
  for (const id of PERSONAS) assert.deepEqual(strip(view(data, id)), baseline, id);
});

test("accessView follows the data after a change", () => {
  let data = seed();
  data = ok(data, "a-moreno", governance("coastline", "agent-signs-off"));
  data = ok(data, "a-moreno", userFunds("s-lim", ["telok-ayer", "meranti", "kallang"]));
  const v = view(data);
  assert.equal(v.governance.find((g) => g.fund.id === "coastline")?.label, "Tax agent signs off; you lodge");
  assert.equal(v.governance.find((g) => g.fund.id === "coastline")?.approvalsBeforeSignOff, "Reviewer, Tax agent");
  assert.deepEqual(v.users.find((u) => u.user.id === "s-lim")?.fundNames, ["Telok Ayer Commercial REIT", "Meranti Digital Infrastructure REIT", "Kallang Riverside Retail REIT"]);
});

// ------------------------------------------------------------------------------------------------ governance
test("set-governance changes the mode of one fund and audits the change in words", () => {
  const before = frozenSeed();
  const after = ok(before, "a-moreno", governance("coastline", "agent-lodges"));
  assert.equal(fundOf(after, "coastline").governance, "agent-lodges");
  assert.deepEqual(after.funds.filter((f) => f.id !== "coastline"), before.funds.filter((f) => f.id !== "coastline"));
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "coastline",
    at: NOW_STAMP,
    actor: "A. Moreno",
    action: "Governance changed",
    detail: "No tax agent → Tax agent reviews and lodges",
  });
  assert.equal(after.audit.length, before.audit.length + 1);
  const back = ok(after, "a-moreno", governance("coastline", "agent-signs-off"));
  assert.equal(lastAudit(back).detail, "Tax agent reviews and lodges → Tax agent signs off; you lodge");
});

test("set-governance changes what sign-off waits for", () => {
  const ready = chain(frozenSeed(), [
    ["r-okafor", { type: "submit", fundId: "coastline" }],
    ["l-brennan", approve("coastline", "review")],
  ]);
  const signOff: Action = { type: "sign-off", fundId: "coastline" };
  assert.equal(fundOf(ok(ready, "a-moreno", signOff), "coastline").status, "Signed off", "without an agent step the reviewer's approval is enough");

  let data = ok(ready, "a-moreno", governance("coastline", "agent-lodges"));
  assert.equal(denied(data, "a-moreno", signOff), "Sign-off waits for: Tax agent approval.");
  data = ok(data, "a-moreno", userFunds("d-harrow", ["harbourline", "southbank", "kurrajong", "coastline"]));
  data = ok(data, "d-harrow", approve("coastline", "agent"));
  assert.equal(fundOf(ok(data, "a-moreno", signOff), "coastline").status, "Signed off");
});

test("set-governance drops approvals that the new mode no longer asks for and keeps the rest", () => {
  let data = frozenSeed();
  data = chain(data, [
    ["l-brennan", approve("kurrajong", "review")],
    ["d-harrow", approve("kurrajong", "agent")],
  ]);
  assert.deepEqual(data.approvals.filter((a) => a.fundId === "kurrajong").map((a) => a.level), ["review", "agent"]);
  const after = ok(data, "a-moreno", governance("kurrajong", "no-agent"));
  assert.deepEqual(after.approvals.filter((a) => a.fundId === "kurrajong").map((a) => [a.level, a.by]), [["review", "L. Brennan"]]);
  assert.deepEqual(after.approvals.filter((a) => a.fundId !== "kurrajong"), data.approvals.filter((a) => a.fundId !== "kurrajong"), "other funds keep their approvals");
  assert.equal(denied(after, "d-harrow", approve("kurrajong", "agent")), "This fund has no tax agent approval step");
  const signed = ok(after, "a-moreno", { type: "sign-off", fundId: "kurrajong" });
  assert.equal(fundOf(signed, "kurrajong").status, "Signed off");

  const keeps = ok(data, "a-moreno", governance("kurrajong", "agent-signs-off"));
  assert.equal(keeps.approvals.filter((a) => a.fundId === "kurrajong").length, 2, "both levels are still required, so both approvals stay");
});

test("set-governance to the mode a fund already has changes nothing", () => {
  const data = frozenSeed();
  const result = applyAction(data, governance("coastline", "no-agent"), ctxOf(data, "a-moreno"));
  assert.equal(result.ok && result.data, data);
});

test("set-governance is for the head of tax, on funds that are not signed off, with a real mode", () => {
  const data = frozenSeed();
  for (const userId of ["l-brennan", "r-okafor", "w-l-teo", "d-harrow", "s-lim", "m-castillo", "n-pillai"]) {
    assert.equal(denied(data, userId, governance("coastline", "agent-lodges")), "You don't have permission to change governance", userId);
  }
  assert.equal(denied(data, "a-moreno", governance("nope", "agent-lodges")), "Fund not found");
  assert.equal(denied(data, "a-moreno", governance("coastline", "bogus" as GovernanceMode)), "Unknown governance mode");
  assert.equal(denied(data, "a-moreno", governance("loyang", "agent-lodges")), "This fund is signed off. Reopen it before changing its governance.");
  assert.equal(denied(data, "a-moreno", governance("harbourline", "no-agent")), "This fund is signed off. Reopen it before changing its governance.");
  const inReview = ok(data, "a-moreno", governance("meranti", "no-agent"));
  assert.equal(fundOf(inReview, "meranti").governance, "no-agent", "a fund in review can change governance");
  const afterReopen = ok(ok(data, "a-moreno", { type: "reopen", fundId: "loyang", reason: "Correcting signed-off inputs" }), "a-moreno", governance("loyang", "agent-lodges"));
  assert.equal(fundOf(afterReopen, "loyang").governance, "agent-lodges");
});

test("set-governance changes who records lodgment", () => {
  let data = frozenSeed();
  data = ok(data, "a-moreno", { type: "reopen", fundId: "loyang", reason: "Correcting signed-off inputs" });
  data = ok(data, "a-moreno", governance("loyang", "agent-lodges"));
  data = ok(data, "a-moreno", { type: "set-user-funds", userId: "s-lim", funds: ["telok-ayer", "loyang", "meranti"] });
  data = chain(data, [
    ["w-l-teo", { type: "submit", fundId: "loyang" }],
    ["n-pillai", approve("loyang", "review")],
    ["s-lim", approve("loyang", "agent")],
    ["a-moreno", { type: "sign-off", fundId: "loyang" }],
  ]);
  assert.equal(denied(data, "a-moreno", { type: "record-lodgment", fundId: "loyang", kind: "form-ut", reference: "R", date: "2026-10-12" }), "Only the tax agent records lodgment for this fund");
  ok(data, "s-lim", { type: "record-lodgment", fundId: "loyang", kind: "form-ut", reference: "R", date: "2026-10-12" });
});

// ------------------------------------------------------------------------------------------------ user access
test("set-user-funds changes one user's funds, in seed order, and audits each fund whose access changed", () => {
  const before = frozenSeed();
  const after = ok(before, "a-moreno", userFunds("s-lim", ["kallang", "telok-ayer"]));
  assert.deepEqual(after.users.find((u) => u.id === "s-lim")?.funds, ["telok-ayer", "kallang"], "stored in seed order");
  assert.deepEqual(after.users.filter((u) => u.id !== "s-lim"), before.users.filter((u) => u.id !== "s-lim"));
  const added = after.audit.slice(before.audit.length);
  assert.deepEqual(added.map(withoutId), [
    { id: undefined, fundId: "meranti", at: NOW_STAMP, actor: "A. Moreno", action: "Access changed", detail: "S. Lim: access removed" },
    { id: undefined, fundId: "kallang", at: NOW_STAMP, actor: "A. Moreno", action: "Access changed", detail: "S. Lim: access granted" },
  ]);
  assert.equal(denied(after, "s-lim", { type: "approve", fundId: "meranti", level: "agent" }), "You don't have access to this fund");
});

test("set-user-funds accepts 'all', ignores duplicates, and treats a reordering as no change", () => {
  const before = frozenSeed();
  const all = ok(before, "a-moreno", userFunds("s-lim", "all"));
  assert.equal(all.users.find((u) => u.id === "s-lim")?.funds, "all");
  assert.equal(all.audit.length, before.audit.length + 7, "one entry per fund that was not reachable before");
  assert.ok(all.audit.slice(before.audit.length).every((a) => a.action === "Access changed" && a.detail === "S. Lim: access granted"));

  const dupes = ok(before, "a-moreno", userFunds("s-lim", ["telok-ayer", "telok-ayer", "meranti", "kallang", "kallang"]));
  assert.deepEqual(dupes.users.find((u) => u.id === "s-lim")?.funds, ["telok-ayer", "meranti", "kallang"]);

  const reordered = applyAction(before, userFunds("s-lim", ["meranti", "telok-ayer"]), ctxOf(before, "a-moreno"));
  assert.equal(reordered.ok && reordered.data, before, "the same funds in another order change nothing");
  const sameAll = applyAction(before, userFunds("a-moreno", "all"), ctxOf(before, "a-moreno"));
  assert.equal(sameAll.ok && sameAll.data, before);
});

test("set-user-funds between 'all' and the full list changes the record but writes no audit entry", () => {
  const before = frozenSeed();
  const everyFund = before.funds.map((f) => f.id);
  const after = ok(before, "a-moreno", userFunds("m-castillo", everyFund));
  assert.deepEqual(after.users.find((u) => u.id === "m-castillo")?.funds, everyFund);
  assert.equal(after.audit, before.audit, "nobody gained or lost access to a fund");
});

test("set-user-funds takes access away so that the user's actions are refused", () => {
  let data = frozenSeed();
  data = ok(data, "a-moreno", userFunds("l-brennan", ["harbourline"]));
  assert.equal(denied(data, "l-brennan", approve("southbank", "review")), "You don't have access to this fund");
  assert.equal(data.audit.filter((a) => a.action === "Access changed").length, 4, "southbank, wattle, kurrajong and coastline were removed");
});

test("set-user-funds is for the head of tax, for known users and known funds", () => {
  const data = frozenSeed();
  for (const userId of ["l-brennan", "r-okafor", "w-l-teo", "d-harrow", "s-lim", "m-castillo", "n-pillai"]) {
    assert.equal(denied(data, userId, userFunds(userId, "all")), "You don't have permission to manage access", userId);
  }
  assert.equal(denied(data, "a-moreno", userFunds("nope", "all")), "User not found");
  assert.equal(denied(data, "a-moreno", userFunds("s-lim", [])), "Pick at least one fund");
  assert.equal(denied(data, "a-moreno", { type: "set-user-funds", userId: "s-lim", funds: undefined } as unknown as Action), "Pick at least one fund");
  assert.equal(denied(data, "a-moreno", userFunds("s-lim", ["telok-ayer", "nope"])), "Unknown fund: nope");
  assert.deepEqual(data.users, frozenSeed().users);
});
