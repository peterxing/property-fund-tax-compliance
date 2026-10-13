import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIONS,
  ACTION_LABEL,
  APPROVAL_LEVEL_LABEL,
  GOVERNANCE,
  GOVERNANCE_MODES,
  ROLES,
  ROLE_ACTIONS,
  ROLE_LABEL,
  can,
  listLevels,
  lodgmentRole,
  missingApprovals,
  roleCan,
  userHasFund,
} from "../../src/domain/permissions.ts";
import type { ActionId, Approval, GovernanceMode, RoleId, User } from "../../src/domain/types.ts";

// What each role may do on a fund it can open, written out by hand from the reference app. `lodge` and `approve-agent` depend on the
// governance mode and `manage-access` on the role alone, so they are handled separately below.
const PLAIN: Record<RoleId, ActionId[]> = {
  "head-of-tax": ["edit", "submit", "publish", "query", "return", "approve-review", "sign-off", "reopen"],
  reviewer: ["query", "return", "approve-review"],
  preparer: ["edit", "submit", "publish", "query"],
  "tax-agent": ["query"],
  finance: [],
};

function expected(role: RoleId, action: ActionId, mode: GovernanceMode, hasAccess: boolean): boolean {
  if (action === "manage-access") return role === "head-of-tax";
  if (!hasAccess) return false;
  if (action === "lodge") return role === "tax-agent" ? mode === "agent-lodges" : role === "head-of-tax" && mode !== "agent-lodges";
  if (action === "approve-agent") return role === "tax-agent" && mode !== "no-agent";
  return PLAIN[role].includes(action);
}

const user = (role: RoleId, funds: User["funds"]): User => ({ id: `u-${role}`, name: "Test User", title: "", organisation: "", role, funds });

test("there are 5 roles and 11 actions, each with a label", () => {
  assert.equal(ROLES.length, 5);
  assert.equal(ACTIONS.length, 11);
  assert.equal(new Set(ACTIONS).size, 11);
  for (const action of ACTIONS) assert.ok(ACTION_LABEL[action], action);
  for (const role of ROLES) assert.ok(ROLE_LABEL[role], role);
  assert.equal(ROLE_LABEL.finance, "View only");
  assert.equal(ROLE_LABEL["head-of-tax"], "Head of Tax");
});

test("the full matrix: 5 roles x 11 actions x 3 governance modes x with/without access", () => {
  let cases = 0;
  for (const role of ROLES) {
    for (const action of ACTIONS) {
      for (const mode of GOVERNANCE_MODES) {
        for (const hasAccess of [true, false]) {
          const who = user(role, hasAccess ? ["f1"] : ["f2"]);
          assert.equal(can(who, action, { id: "f1" }, mode), expected(role, action, mode, hasAccess), `${role} ${action} ${mode} access=${hasAccess}`);
          cases++;
        }
      }
    }
  }
  assert.equal(cases, 5 * 11 * 3 * 2);
});

test("access can come from 'all' as well as from a list", () => {
  for (const role of ROLES) for (const action of ACTIONS) for (const mode of GOVERNANCE_MODES) {
    assert.equal(can(user(role, "all"), action, { id: "anything" }, mode), expected(role, action, mode, true), `${role} ${action} ${mode}`);
  }
});

test("manage-access needs the role only: no fund, no access required", () => {
  for (const role of ROLES) {
    assert.equal(can(user(role, []), "manage-access", undefined, "no-agent"), role === "head-of-tax", role);
    assert.equal(can(user(role, ["f2"]), "manage-access", { id: "f1" }, "agent-lodges"), role === "head-of-tax", role);
  }
});

test("every other action needs a fund", () => {
  for (const role of ROLES) for (const action of ACTIONS.filter((a) => a !== "manage-access")) {
    assert.equal(can(user(role, "all"), action, undefined, "agent-lodges"), false, `${role} ${action}`);
  }
});

test("roleCan and ROLE_ACTIONS agree with the hand-written table", () => {
  for (const role of ROLES) {
    for (const action of ACTIONS) assert.equal(roleCan(role, action), ROLE_ACTIONS[role].includes(action));
  }
  assert.deepEqual(ROLE_ACTIONS.finance, []);
  assert.deepEqual([...ROLE_ACTIONS.reviewer].sort(), ["approve-review", "query", "return"]);
  assert.deepEqual([...ROLE_ACTIONS["tax-agent"]].sort(), ["approve-agent", "lodge", "query"]);
  assert.deepEqual([...ROLE_ACTIONS.preparer].sort(), ["edit", "publish", "query", "submit"]);
  assert.equal(ROLE_ACTIONS["head-of-tax"].length, 10, "everything except approve-agent");
  assert.ok(!ROLE_ACTIONS["head-of-tax"].includes("approve-agent"));
});

test("only the tax agent approves at the agent level, and the head of tax cannot", () => {
  for (const mode of GOVERNANCE_MODES) {
    assert.equal(can(user("head-of-tax", "all"), "approve-agent", { id: "f" }, mode), false);
    assert.equal(can(user("reviewer", "all"), "approve-agent", { id: "f" }, mode), false);
  }
  assert.equal(can(user("tax-agent", "all"), "approve-agent", { id: "f" }, "agent-lodges"), true);
  assert.equal(can(user("tax-agent", "all"), "approve-agent", { id: "f" }, "agent-signs-off"), true);
  assert.equal(can(user("tax-agent", "all"), "approve-agent", { id: "f" }, "no-agent"), false);
});

test("lodgment belongs to the tax agent where the agent lodges, otherwise the head of tax", () => {
  assert.equal(lodgmentRole("agent-lodges"), "tax-agent");
  assert.equal(lodgmentRole("agent-signs-off"), "head-of-tax");
  assert.equal(lodgmentRole("no-agent"), "head-of-tax");
  for (const mode of GOVERNANCE_MODES) {
    const who = lodgmentRole(mode);
    for (const role of ROLES) assert.equal(can(user(role, "all"), "lodge", { id: "f" }, mode), role === who, `${role} ${mode}`);
  }
});

test("governance modes: labels, required approval levels and who lodges", () => {
  assert.deepEqual(GOVERNANCE_MODES, ["agent-lodges", "agent-signs-off", "no-agent"]);
  assert.deepEqual(GOVERNANCE["agent-lodges"], { label: "Tax agent reviews and lodges", levels: ["review", "agent"], agentLodges: true });
  assert.deepEqual(GOVERNANCE["agent-signs-off"], { label: "Tax agent signs off; you lodge", levels: ["review", "agent"], agentLodges: false });
  assert.deepEqual(GOVERNANCE["no-agent"], { label: "No tax agent", levels: ["review"], agentLodges: false });
  assert.deepEqual(APPROVAL_LEVEL_LABEL, { review: "Reviewer", agent: "Tax agent" });
});

test("userHasFund", () => {
  assert.equal(userHasFund(user("preparer", "all"), "any"), true);
  assert.equal(userHasFund(user("preparer", ["a", "b"]), "b"), true);
  assert.equal(userHasFund(user("preparer", ["a", "b"]), "c"), false);
  assert.equal(userHasFund(user("preparer", []), "a"), false);
});

const approval = (fundId: string, level: Approval["level"]): Approval => ({ fundId, level, by: "X", at: "2026-10-01T09:00:00" });

test("missingApprovals lists the levels the governance still needs, in order", () => {
  assert.deepEqual(missingApprovals("f", "agent-lodges", []), ["review", "agent"]);
  assert.deepEqual(missingApprovals("f", "agent-signs-off", []), ["review", "agent"]);
  assert.deepEqual(missingApprovals("f", "no-agent", []), ["review"]);
  assert.deepEqual(missingApprovals("f", "agent-lodges", [approval("f", "review")]), ["agent"]);
  assert.deepEqual(missingApprovals("f", "agent-lodges", [approval("f", "agent")]), ["review"]);
  assert.deepEqual(missingApprovals("f", "agent-lodges", [approval("f", "agent"), approval("f", "review")]), []);
  assert.deepEqual(missingApprovals("f", "no-agent", [approval("f", "review")]), []);
});

test("missingApprovals ignores other funds and levels the governance does not need", () => {
  assert.deepEqual(missingApprovals("f", "agent-lodges", [approval("other", "review"), approval("other", "agent")]), ["review", "agent"]);
  assert.deepEqual(missingApprovals("f", "no-agent", [approval("f", "agent")]), ["review"]);
});

test("listLevels reads as a sentence fragment", () => {
  assert.equal(listLevels([]), "");
  assert.equal(listLevels(["review"]), "Reviewer");
  assert.equal(listLevels(["agent"]), "Tax agent");
  assert.equal(listLevels(["review", "agent"]), "Reviewer and Tax agent");
});
