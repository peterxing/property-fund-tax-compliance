import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../../src/domain/actions.ts";
import { fundCalc, workflowView } from "../../src/domain/selectors.ts";
import { STEPS, STEP_LABEL, approvalChain, buttonReason, openQueryCount, stepBlock } from "../../src/domain/core/workflow.ts";
import type { Step } from "../../src/domain/core/workflow.ts";
import type { Action, AppData } from "../../src/domain/types.ts";
import { AU_FUNDS, NOW, NOW_STAMP, PERSONAS, SG_FUNDS, chain, ctxOf, denied, frozenSeed, fundOf, modulesReady, ok, sampleStates, seed, skipUnlessReady, userOf } from "./core-fixtures.ts";

const approve = (fundId: string, level: "review" | "agent"): Action => ({ type: "approve", fundId, level });
const act = (type: "submit" | "return" | "sign-off" | "reopen", fundId: string): Action => ({ type, fundId });
const status = (data: AppData, id: string) => fundOf(data, id).status;
const approvalsOf = (data: AppData, fundId: string) => data.approvals.filter((a) => a.fundId === fundId);
const lastAudit = (data: AppData) => data.audit[data.audit.length - 1];

test("submit moves a fund being prepared into review and records the submitter", () => {
  const before = frozenSeed();
  const after = ok(before, "w-l-teo", act("submit", "kallang"));
  assert.equal(status(after, "kallang"), "In review");
  assert.equal(after.audit.length, before.audit.length + 1);
  const entry = lastAudit(after);
  assert.deepEqual({ ...entry, id: undefined }, { id: undefined, fundId: "kallang", at: NOW_STAMP, actor: "W. L. Teo", action: "Submitted for review" });
  assert.equal(before.funds.find((f) => f.id === "kallang")?.status, "Preparing", "the input is untouched");
  assert.deepEqual(after.funds.filter((f) => f.id !== "kallang"), before.funds.filter((f) => f.id !== "kallang"));
  assert.deepEqual(after.approvals, before.approvals, "submitting does not clear approvals");
});

test("submit is refused for the wrong role, no access, the wrong status and unknown funds", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "n-pillai", act("submit", "kallang")), "You don't have permission to submit for review");
  assert.equal(denied(data, "s-lim", act("submit", "telok-ayer")), "You don't have permission to submit for review");
  assert.equal(denied(data, "m-castillo", act("submit", "coastline")), "You don't have permission to submit for review");
  assert.equal(denied(data, "r-okafor", act("submit", "kallang")), "You don't have access to this fund");
  assert.equal(denied(data, "s-lim", act("submit", "kallang")), "You don't have access to this fund", "access is checked before the role");
  assert.equal(denied(data, "a-moreno", act("submit", "meranti")), "Only a fund being prepared can be submitted for review");
  assert.equal(denied(data, "a-moreno", act("submit", "loyang")), "Only a fund being prepared can be submitted for review");
  assert.equal(denied(data, "a-moreno", act("submit", "nope")), "Fund not found");
});

test("return sends a fund back to the preparer and clears that fund's approvals only", () => {
  const before = frozenSeed();
  assert.equal(approvalsOf(before, "meranti").length, 1);
  const after = ok(before, "n-pillai", act("return", "meranti"));
  assert.equal(status(after, "meranti"), "Preparing");
  assert.deepEqual(approvalsOf(after, "meranti"), []);
  assert.deepEqual(approvalsOf(after, "loyang"), approvalsOf(before, "loyang"));
  assert.equal(after.approvals.length, before.approvals.length - 1);
  assert.deepEqual({ ...lastAudit(after), id: undefined }, { id: undefined, fundId: "meranti", at: NOW_STAMP, actor: "N. Pillai", action: "Returned to preparer" });
});

test("return is refused for the wrong role and the wrong status", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "w-l-teo", act("return", "meranti")), "You don't have permission to return a fund to the preparer");
  assert.equal(denied(data, "s-lim", act("return", "meranti")), "You don't have permission to return a fund to the preparer");
  assert.equal(denied(data, "a-moreno", act("return", "kallang")), "Only a fund in review can be returned to the preparer");
  assert.equal(denied(data, "a-moreno", act("return", "loyang")), "Only a fund in review can be returned to the preparer");
  assert.equal(denied(data, "r-okafor", act("return", "kurrajong")), "You don't have permission to return a fund to the preparer");
});

test("a reviewer approval is recorded once per level and keeps the fund in review", () => {
  let data = frozenSeed();
  data = ok(data, "w-l-teo", act("submit", "telok-ayer"));
  data = ok(data, "n-pillai", approve("telok-ayer", "review"));
  assert.equal(status(data, "telok-ayer"), "In review");
  assert.deepEqual(approvalsOf(data, "telok-ayer"), [{ fundId: "telok-ayer", level: "review", by: "N. Pillai", at: NOW_STAMP }]);
  assert.deepEqual({ ...lastAudit(data), id: undefined }, { id: undefined, fundId: "telok-ayer", at: NOW_STAMP, actor: "N. Pillai", action: "Approved — reviewer" });

  data = ok(data, "a-moreno", approve("telok-ayer", "review"));
  assert.deepEqual(approvalsOf(data, "telok-ayer").map((a) => [a.level, a.by]), [["review", "A. Moreno"]], "approving again replaces the earlier approval of that level");
});

test("a tax agent approves at the agent level", () => {
  let data = frozenSeed();
  data = ok(data, "s-lim", approve("meranti", "agent"));
  assert.deepEqual(approvalsOf(data, "meranti").map((a) => [a.level, a.by]), [["review", "N. Pillai"], ["agent", "S. Lim"]]);
  assert.equal(status(data, "meranti"), "In review");
  assert.deepEqual({ ...lastAudit(data), id: undefined }, { id: undefined, fundId: "meranti", at: NOW_STAMP, actor: "S. Lim", action: "Approved — tax agent" });
});

test("approval is refused for the wrong role, level, status or access", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "n-pillai", approve("meranti", "agent")), "You don't have permission to approve as tax agent");
  assert.equal(denied(data, "a-moreno", approve("meranti", "agent")), "You don't have permission to approve as tax agent", "the head of tax cannot stand in for the agent");
  assert.equal(denied(data, "s-lim", approve("meranti", "review")), "You don't have permission to approve as reviewer");
  assert.equal(denied(data, "w-l-teo", approve("meranti", "review")), "You don't have permission to approve as reviewer");
  assert.equal(denied(data, "m-castillo", approve("meranti", "review")), "You don't have permission to approve as reviewer");
  assert.equal(denied(data, "n-pillai", approve("kallang", "review")), "Only a fund in review can be approved");
  assert.equal(denied(data, "n-pillai", approve("loyang", "review")), "Only a fund in review can be approved");
  assert.equal(denied(data, "l-brennan", approve("meranti", "review")), "You don't have access to this fund");
  assert.equal(denied(data, "n-pillai", { type: "approve", fundId: "meranti", level: "bogus" as "review" }), "Unknown approval level");
});

test("a tax agent cannot approve a fund whose governance has no agent step", () => {
  let data = frozenSeed();
  data = ok(data, "a-moreno", { type: "set-user-funds", userId: "s-lim", funds: ["telok-ayer", "meranti", "kallang"] });
  data = ok(data, "w-l-teo", act("submit", "kallang"));
  assert.equal(denied(data, "s-lim", approve("kallang", "agent")), "This fund has no tax agent approval step");
});

test("whoever submitted a fund cannot approve it as reviewer, and the latest submission counts", () => {
  let data = frozenSeed();
  data = ok(data, "a-moreno", act("submit", "telok-ayer"));
  assert.equal(denied(data, "a-moreno", approve("telok-ayer", "review")), "You can't approve a fund you submitted");
  data = ok(data, "n-pillai", approve("telok-ayer", "review"));
  assert.equal(approvalsOf(data, "telok-ayer").length, 1, "someone else can approve it");

  data = ok(data, "n-pillai", act("return", "telok-ayer"));
  data = ok(data, "w-l-teo", act("submit", "telok-ayer"));
  data = ok(data, "a-moreno", approve("telok-ayer", "review"));
  assert.equal(approvalsOf(data, "telok-ayer")[0].by, "A. Moreno", "Teo submitted last, so Moreno may approve now");
});

test("the submitter rule does not stop a role that is refused anyway, or sign-off", () => {
  let data = frozenSeed();
  data = ok(data, "a-moreno", act("submit", "kallang"));
  data = ok(data, "n-pillai", approve("kallang", "review"));
  data = ok(data, "a-moreno", act("sign-off", "kallang"));
  assert.equal(status(data, "kallang"), "Signed off", "the submitter may sign off once someone else has approved");
});

test("sign-off needs every approval the governance asks for", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "a-moreno", act("sign-off", "southbank")), "Sign-off waits for: Reviewer and Tax agent approval.");
  assert.equal(denied(data, "a-moreno", act("sign-off", "meranti")), "Sign-off waits for: Tax agent approval.");
  const noAgent = ok(data, "a-moreno", act("submit", "kallang"));
  assert.equal(denied(noAgent, "a-moreno", act("sign-off", "kallang")), "Sign-off waits for: Reviewer approval.");
});

test("sign-off locks the fund, keeps the approvals and records who did it", () => {
  let data = frozenSeed();
  data = chain(data, [
    ["w-l-teo", act("submit", "kallang")],
    ["n-pillai", approve("kallang", "review")],
    ["a-moreno", act("sign-off", "kallang")],
  ]);
  assert.equal(status(data, "kallang"), "Signed off");
  assert.equal(approvalsOf(data, "kallang").length, 1);
  assert.deepEqual({ ...lastAudit(data), id: undefined }, {
    id: undefined,
    fundId: "kallang",
    at: NOW_STAMP,
    actor: "A. Moreno",
    action: "Signed off",
    detail: "Components and withholding locked",
  });
});

test("single-fund sign-off is not blocked by open queries or exceptions; approvals are what it waits for", () => {
  let data = frozenSeed();
  assert.equal(openQueryCount(data, "southbank"), 1);
  data = ok(data, "l-brennan", approve("southbank", "review"));
  data = ok(data, "d-harrow", approve("southbank", "agent"));
  data = ok(data, "a-moreno", act("sign-off", "southbank"));
  assert.equal(status(data, "southbank"), "Signed off");
  assert.equal(openQueryCount(data, "southbank"), 1, "the query is still open");
});

test("sign-off is refused for the wrong role and the wrong status", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "n-pillai", act("sign-off", "meranti")), "You don't have permission to sign off");
  assert.equal(denied(data, "s-lim", act("sign-off", "meranti")), "You don't have permission to sign off");
  assert.equal(denied(data, "w-l-teo", act("sign-off", "kallang")), "You don't have permission to sign off");
  assert.equal(denied(data, "a-moreno", act("sign-off", "telok-ayer")), "Only a fund in review can be signed off");
  assert.equal(denied(data, "a-moreno", act("sign-off", "loyang")), "Only a fund in review can be signed off");
});

test("reopen unlocks a signed-off fund and clears its approvals", () => {
  const before = frozenSeed();
  assert.equal(approvalsOf(before, "loyang").length, 1);
  const after = ok(before, "a-moreno", act("reopen", "loyang"));
  assert.equal(status(after, "loyang"), "Preparing");
  assert.deepEqual(approvalsOf(after, "loyang"), []);
  assert.deepEqual(approvalsOf(after, "wattle"), approvalsOf(before, "wattle"));
  assert.deepEqual({ ...lastAudit(after), id: undefined }, {
    id: undefined,
    fundId: "loyang",
    at: NOW_STAMP,
    actor: "A. Moreno",
    action: "Reopened",
    detail: "Sign-off removed; components unlocked",
  });
});

test("reopen is refused for the wrong role and the wrong status", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "n-pillai", act("reopen", "loyang")), "You don't have permission to reopen a fund");
  assert.equal(denied(data, "w-l-teo", act("reopen", "loyang")), "You don't have permission to reopen a fund");
  assert.equal(denied(data, "a-moreno", act("reopen", "meranti")), "Only a signed-off fund can be reopened");
  assert.equal(denied(data, "a-moreno", act("reopen", "kallang")), "Only a signed-off fund can be reopened");
});

test("after a reopen the approvals must be given again before the next sign-off", () => {
  let data = frozenSeed();
  data = chain(data, [
    ["r-okafor", act("submit", "coastline")],
    ["l-brennan", approve("coastline", "review")],
    ["a-moreno", act("sign-off", "coastline")],
    ["a-moreno", act("reopen", "coastline")],
    ["r-okafor", act("submit", "coastline")],
  ]);
  assert.equal(denied(data, "a-moreno", act("sign-off", "coastline")), "Sign-off waits for: Reviewer approval.");
});

test("a full cycle writes one audit entry per step with unique, increasing ids", () => {
  const before = frozenSeed();
  const after = chain(before, [
    ["r-okafor", act("submit", "coastline")],
    ["l-brennan", approve("coastline", "review")],
    ["a-moreno", act("sign-off", "coastline")],
    ["a-moreno", act("reopen", "coastline")],
  ]);
  const added = after.audit.slice(before.audit.length);
  assert.deepEqual(added.map((a) => [a.actor, a.action]), [
    ["R. Okafor", "Submitted for review"],
    ["L. Brennan", "Approved — reviewer"],
    ["A. Moreno", "Signed off"],
    ["A. Moreno", "Reopened"],
  ]);
  assert.ok(added.every((a) => a.fundId === "coastline" && a.at === NOW_STAMP));
  const number = (id: string) => Number(/\d+/.exec(id)?.[0]);
  const highest = Math.max(...before.audit.map((a) => number(a.id)));
  assert.deepEqual(added.map((a) => number(a.id)), [highest + 1, highest + 2, highest + 3, highest + 4]);
  assert.equal(new Set(after.audit.map((a) => a.id)).size, after.audit.length);
  assert.deepEqual(after.audit.slice(0, before.audit.length), before.audit, "the earlier trail is untouched");
  assert.equal(status(after, "coastline"), "Preparing");
});

test("every workflow action leaves the input data untouched (deep-frozen input)", () => {
  const frozen = frozenSeed();
  const copy = structuredClone(frozen);
  const steps: Array<[string, Action]> = [
    ["w-l-teo", act("submit", "kallang")],
    ["n-pillai", act("return", "meranti")],
    ["n-pillai", approve("meranti", "review")],
    ["s-lim", approve("meranti", "agent")],
    ["a-moreno", act("reopen", "loyang")],
    ["a-moreno", act("sign-off", "meranti")],
  ];
  for (const [userId, action] of steps) applyAction(frozen, action, ctxOf(frozen, userId));
  assert.deepEqual(frozen, copy);
});

test("stepBlock names the first gate that stops a step, in a fixed order", () => {
  const data = seed();
  const meranti = fundOf(data, "meranti");
  const kallang = fundOf(data, "kallang");
  const block = (fundId: string, step: Step, userId: string) => stepBlock(data, fundOf(data, fundId), step, userOf(data, userId));

  assert.deepEqual(block("meranti", "return", "n-pillai"), null);
  assert.deepEqual(block("meranti", "return", "r-okafor"), { code: "access", reason: "You don't have access to this fund" });
  assert.deepEqual(block("meranti", "return", "w-l-teo"), { code: "role", reason: "You don't have permission to return a fund to the preparer" });
  assert.deepEqual(block("kallang", "return", "a-moreno"), { code: "status", reason: "Only a fund in review can be returned to the preparer" });
  assert.deepEqual(block("meranti", "sign-off", "a-moreno"), { code: "approvals", reason: "Sign-off waits for: Tax agent approval." });
  assert.equal(block("meranti", "approve-agent", "s-lim"), null);
  assert.equal(stepBlock(data, kallang, "approve-agent", userOf(data, "s-lim"))?.code, "access");
  assert.equal(meranti.status, "In review");
});

test("buttonReason shortens the submitter message and passes the rest through", () => {
  assert.equal(buttonReason({ code: "submitter", reason: "You can't approve a fund you submitted" }), "You submitted this fund");
  assert.equal(buttonReason({ code: "role", reason: "You don't have permission to sign off" }), "You don't have permission to sign off");
});

test("approvalChain follows the governance levels in order", () => {
  const data = seed();
  assert.deepEqual(approvalChain(data, fundOf(data, "meranti")), [
    { level: "review", label: "Reviewer", done: true, by: "N. Pillai", at: "2026-10-09T14:30:00" },
    { level: "agent", label: "Tax agent", done: false },
  ]);
  assert.deepEqual(approvalChain(data, fundOf(data, "loyang")).map((a) => a.level), ["review"]);
  assert.deepEqual(approvalChain(data, fundOf(data, "harbourline")).map((a) => [a.level, a.done, a.by]), [["review", true, "L. Brennan"], ["agent", true, "D. Harrow"]]);
});

// ------------------------------------------------------------------------------------------------ the workflow card (needs the market modules)
const view = (data: AppData, fundId: string, userId: string) => workflowView(data, fundId, ctxOf(data, userId));

test("workflowView: Head of Tax on a fund in review", { skip: skipUnlessReady("SG") }, () => {
  const data = seed();
  const v = view(data, "meranti", "a-moreno");
  assert.equal(v.fundId, "meranti");
  assert.equal(v.status, "In review");
  assert.deepEqual(v.governance, { label: "Tax agent reviews and lodges", levels: ["review", "agent"], agentLodges: true, mode: "agent-lodges" });
  assert.deepEqual(v.available, [
    { action: "return", label: "Return to preparer", enabled: true },
    { action: "sign-off", label: "Sign off", enabled: false, reason: "Sign-off waits for: Tax agent approval." },
  ]);
  assert.deepEqual(v.approvals, approvalChain(data, fundOf(data, "meranti")));
  assert.deepEqual(v.signOff, { done: false, waitingOn: "Head of Tax" });
  assert.equal(v.signOffBlockedReason, "Sign-off waits for: Tax agent approval.");
  assert.equal(v.locked, true);
  assert.equal(v.lockedReason, "In review — return to preparer to edit");
  assert.deepEqual(v.can, { edit: false, query: true, publish: true, lodge: false });
  assert.equal(v.openQueries, 0);
  assert.equal(v.exceptions, fundCalc(data, "meranti", NOW).exceptions);
});

test("workflowView: the buttons of a fund waiting for its first approval", { skip: skipUnlessReady("SG") }, () => {
  let data = seed();
  data = ok(data, "a-moreno", act("submit", "telok-ayer"));
  const v = view(data, "telok-ayer", "a-moreno");
  assert.deepEqual(v.available.map((a) => [a.action, a.label, a.enabled, a.reason]), [
    ["return", "Return to preparer", true, undefined],
    ["approve-review", "Approve as reviewer", false, "You submitted this fund"],
    ["sign-off", "Sign off", false, "Sign-off waits for: Reviewer and Tax agent approval."],
  ]);
  assert.equal(v.signOffBlockedReason, "Sign-off waits for: Reviewer and Tax agent approval.");
  const reviewer = view(data, "telok-ayer", "n-pillai");
  assert.deepEqual(reviewer.available.map((a) => [a.action, a.enabled]), [["return", true], ["approve-review", true]]);
});

test("workflowView: an approval button disappears once its level is approved", { skip: skipUnlessReady("SG") }, () => {
  const data = seed();
  assert.deepEqual(view(data, "meranti", "n-pillai").available.map((a) => a.action), ["return"], "Pillai already approved Meranti");
  assert.deepEqual(view(data, "meranti", "s-lim").available.map((a) => [a.action, a.enabled]), [["approve-agent", true]]);
  const done = ok(data, "s-lim", approve("meranti", "agent"));
  assert.deepEqual(view(done, "meranti", "s-lim").available, []);
  const signOff = view(done, "meranti", "a-moreno").available.find((a) => a.action === "sign-off");
  assert.deepEqual(signOff, { action: "sign-off", label: "Sign off", enabled: true });
  assert.equal(view(done, "meranti", "a-moreno").signOffBlockedReason, "");
});

test("workflowView: a signed-off fund offers Reopen and names who signed it off", { skip: skipUnlessReady("SG") }, () => {
  const data = seed();
  const v = view(data, "loyang", "a-moreno");
  assert.deepEqual(v.available, [{ action: "reopen", label: "Reopen", enabled: true }]);
  assert.deepEqual(v.signOff, { done: true, by: "A. Moreno", at: "2026-08-03T17:46:00", waitingOn: "" });
  assert.equal(v.lockedReason, "Signed off — reopen to edit");
  assert.equal(v.locked, true);
  assert.deepEqual(v.can, { edit: false, query: true, publish: true, lodge: true });
  assert.equal(v.signOffBlockedReason, "");
  assert.deepEqual(view(data, "loyang", "n-pillai").available, []);
  assert.equal(view(data, "loyang", "n-pillai").can.lodge, false);
});

test("workflowView: who may edit, query, publish and lodge", { skip: skipUnlessReady("SG") }, () => {
  const data = seed();
  const prep = view(data, "kallang", "w-l-teo");
  assert.deepEqual(prep.can, { edit: true, query: true, publish: true, lodge: false });
  assert.deepEqual(prep.available, [{ action: "submit", label: "Submit for review", enabled: true }]);
  assert.equal(prep.locked, false);
  assert.equal(prep.lockedReason, "");

  const head = view(data, "telok-ayer", "a-moreno");
  assert.deepEqual(head.can, { edit: true, query: true, publish: true, lodge: false });

  const reviewer = view(data, "kallang", "n-pillai");
  assert.deepEqual(reviewer.can, { edit: false, query: true, publish: false, lodge: false });
  assert.equal(reviewer.lockedReason, "View only for your role");
  assert.deepEqual(reviewer.available, []);

  const finance = view(data, "kallang", "m-castillo");
  assert.deepEqual(finance.can, { edit: false, query: false, publish: false, lodge: false });
  assert.deepEqual(finance.available, []);
  assert.equal(finance.lockedReason, "View only for your role");
  assert.equal(view(data, "meranti", "m-castillo").lockedReason, "In review — return to preparer to edit", "status wins, as in the reference");

  const agent = view(data, "meranti", "s-lim");
  assert.deepEqual(agent.can, { edit: false, query: true, publish: false, lodge: false });
});

test("workflowView: a tax agent sees why they cannot approve where there is no agent step", { skip: skipUnlessReady("SG") }, () => {
  let data = seed();
  data = ok(data, "a-moreno", { type: "set-user-funds", userId: "s-lim", funds: ["telok-ayer", "meranti", "kallang"] });
  data = ok(data, "w-l-teo", act("submit", "kallang"));
  assert.deepEqual(view(data, "kallang", "s-lim").available, [
    { action: "approve-agent", label: "Approve as tax agent", enabled: false, reason: "This fund has no tax agent approval step" },
  ]);
});

test("workflowView: someone without access to the fund gets nothing to press", { skip: skipUnlessReady("SG") }, () => {
  const v = view(seed(), "meranti", "r-okafor");
  assert.deepEqual(v.available, []);
  assert.deepEqual(v.can, { edit: false, query: false, publish: false, lodge: false });
});

test("workflowView: asking about an unknown fund throws", { skip: skipUnlessReady("SG") }, () => {
  assert.throws(() => view(seed(), "nope", "a-moreno"), /Unknown fund: nope/);
});

const STEP_ACTION: Record<Step, (fundId: string) => Action> = {
  submit: (id) => act("submit", id),
  return: (id) => act("return", id),
  "approve-review": (id) => approve(id, "review"),
  "approve-agent": (id) => approve(id, "agent"),
  "sign-off": (id) => act("sign-off", id),
  reopen: (id) => act("reopen", id),
};

for (const market of ["SG", "AU"] as const) {
  test(`${market}: an enabled button is an action that succeeds, a disabled one is refused with the same reason`, { skip: skipUnlessReady(market) }, () => {
    let enabled = 0;
    let disabled = 0;
    for (const [name, data] of sampleStates()) {
      for (const fund of data.funds.filter((f) => f.market === market)) {
        for (const userId of PERSONAS) {
          const listed = new Map(view(data, fund.id, userId).available.map((a) => [a.action, a]));
          for (const step of STEPS) {
            const where = `${name}: ${userId} ${step} on ${fund.id}`;
            const result = applyAction(data, STEP_ACTION[step](fund.id), ctxOf(data, userId));
            const button = listed.get(step);
            if (button) {
              assert.equal(button.label, STEP_LABEL[step], where);
              if (button.enabled) {
                assert.equal(result.ok, true, where);
                enabled++;
              } else {
                assert.equal(result.ok, false, where);
                const reason = result.ok ? "" : result.reason;
                assert.equal(button.reason, reason === "You can't approve a fund you submitted" ? "You submitted this fund" : reason, where);
                disabled++;
              }
            } else if (result.ok) {
              const level = step === "approve-review" ? "review" : step === "approve-agent" ? "agent" : null;
              assert.ok(level && data.approvals.some((a) => a.fundId === fund.id && a.level === level), `${where}: hidden buttons are refused, except re-approving an approved level`);
            }
          }
        }
      }
    }
    assert.ok(enabled >= 10 && disabled >= 5, `exercised ${enabled} enabled and ${disabled} disabled buttons`);
  });
}

test("the seed has the expected funds per market (fixture sanity)", () => {
  assert.deepEqual(seed().funds.filter((f) => f.market === "AU").map((f) => f.id), AU_FUNDS);
  assert.deepEqual(seed().funds.filter((f) => f.market === "SG").map((f) => f.id), SG_FUNDS);
  assert.equal(typeof modulesReady.SG, "boolean");
});
