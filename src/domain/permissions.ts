// Roles, actions, governance and the permission rules. Mirrors the reference app's behaviour exactly (verified live):
//   head-of-tax: edit, submit, publish, query, return, approve-review, sign-off, reopen, lodge, manage-access
//   reviewer:    query, return, approve-review
//   preparer:    edit, submit, publish, query
//   tax-agent:   query, approve-agent, lodge
//   finance:     (view only)
import type { ActionId, Approval, ApprovalLevel, Fund, FundId, GovernanceDef, GovernanceMode, RoleId, User } from "./types.ts";

export const ROLES: RoleId[] = ["head-of-tax", "reviewer", "preparer", "tax-agent", "finance"];

export const ROLE_LABEL: Record<RoleId, string> = {
  "head-of-tax": "Head of Tax",
  reviewer: "Reviewer",
  preparer: "Preparer",
  "tax-agent": "Tax agent",
  finance: "View only",
};

export const ACTIONS: ActionId[] = ["edit", "submit", "publish", "query", "return", "approve-review", "approve-agent", "sign-off", "reopen", "lodge", "manage-access"];

export const ACTION_LABEL: Record<ActionId, string> = {
  edit: "Edit components, holders and the trial balance",
  submit: "Submit for review",
  publish: "Publish notices",
  query: "Raise and answer queries",
  return: "Return to preparer",
  "approve-review": "Approve as reviewer",
  "approve-agent": "Approve as tax agent",
  "sign-off": "Sign off",
  reopen: "Reopen a signed-off fund",
  lodge: "Record lodgment",
  "manage-access": "Manage users and governance",
};

export const ROLE_ACTIONS: Record<RoleId, ActionId[]> = {
  "head-of-tax": ["edit", "submit", "publish", "query", "return", "approve-review", "sign-off", "reopen", "lodge", "manage-access"],
  reviewer: ["query", "return", "approve-review"],
  preparer: ["edit", "submit", "publish", "query"],
  "tax-agent": ["query", "approve-agent", "lodge"],
  finance: [],
};

export const GOVERNANCE: Record<GovernanceMode, GovernanceDef> = {
  "agent-lodges": { label: "Tax agent reviews and lodges", levels: ["review", "agent"], agentLodges: true },
  "agent-signs-off": { label: "Tax agent signs off; you lodge", levels: ["review", "agent"], agentLodges: false },
  "no-agent": { label: "No tax agent", levels: ["review"], agentLodges: false },
};
export const GOVERNANCE_MODES: GovernanceMode[] = ["agent-lodges", "agent-signs-off", "no-agent"];

export const APPROVAL_LEVEL_LABEL: Record<ApprovalLevel, string> = { review: "Reviewer", agent: "Tax agent" };

/** What the role allows, ignoring which fund and governance. */
export function roleCan(role: RoleId, action: ActionId): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

export function userHasFund(user: User, fundId: FundId): boolean {
  return user.funds === "all" || user.funds.includes(fundId);
}

/**
 * Full permission check for an action on a fund under the fund's governance (same rules as the reference app):
 *  - manage-access is portfolio-wide and only needs the role;
 *  - everything else needs access to the fund;
 *  - lodge: the tax agent only where the agent lodges; the head of tax only where the agent does not;
 *  - approve-agent: tax agents only, and only where governance includes an agent level.
 * Workflow-state rules (e.g. "whoever submits cannot approve as reviewer") live in workflow.ts, not here.
 */
export function can(user: User, action: ActionId, fund: Pick<Fund, "id"> | undefined, mode: GovernanceMode): boolean {
  if (action === "manage-access") return roleCan(user.role, action);
  if (!fund || !userHasFund(user, fund.id)) return false;
  if (action === "lodge") {
    const agentLodges = GOVERNANCE[mode].agentLodges;
    return user.role === "tax-agent" ? agentLodges : user.role === "head-of-tax" && !agentLodges;
  }
  if (action === "approve-agent") return user.role === "tax-agent" && GOVERNANCE[mode].levels.includes("agent");
  return roleCan(user.role, action);
}

/** Approval levels required by the governance that have not been recorded yet. */
export function missingApprovals(fundId: FundId, mode: GovernanceMode, approvals: readonly Approval[]): ApprovalLevel[] {
  return GOVERNANCE[mode].levels.filter((level) => !approvals.some((a) => a.fundId === fundId && a.level === level));
}

/** "Reviewer and Tax agent" / "Reviewer" for sign-off hints. */
export function listLevels(levels: readonly ApprovalLevel[]): string {
  return levels.map((l) => APPROVAL_LEVEL_LABEL[l]).join(" and ");
}

/** Who records lodgment under this governance (for the Access page): "Tax agent" or "Head of Tax". */
export function lodgmentRole(mode: GovernanceMode): RoleId {
  return GOVERNANCE[mode].agentLodges ? "tax-agent" : "head-of-tax";
}
