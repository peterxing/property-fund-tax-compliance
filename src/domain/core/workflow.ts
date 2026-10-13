// Workflow rules shared by the reducers (actions.ts) and the views (selectors.ts), so a button that is enabled is an action that succeeds.
// Gates are checked in this order: fund access, role permission (incl. governance), workflow status, then the state rules
// (whoever submitted a fund cannot approve it as reviewer; sign-off needs every approval its governance requires).
import type {
  ActionId,
  AppData,
  Approval,
  ApprovalLevel,
  ApprovalStatus,
  BulkKind,
  Ctx,
  Fund,
  FundId,
  NextForYou,
  User,
  WorkflowStatus,
} from "../types.ts";
import { APPROVAL_LEVEL_LABEL, GOVERNANCE, can, listLevels, missingApprovals, userHasFund } from "../permissions.ts";
import { submittedBy } from "./audit.ts";

export type Step = Extract<ActionId, "submit" | "return" | "approve-review" | "approve-agent" | "sign-off" | "reopen">;

/** Order the workflow buttons are offered in. */
export const STEPS: readonly Step[] = ["submit", "return", "approve-review", "approve-agent", "sign-off", "reopen"];

export const STEP_LABEL: Record<Step, string> = {
  submit: "Submit for review",
  return: "Return to preparer",
  "approve-review": "Approve as reviewer",
  "approve-agent": "Approve as tax agent",
  "sign-off": "Sign off",
  reopen: "Reopen",
};

/** Status a fund must be in for the step to apply. */
export const STEP_FROM: Record<Step, WorkflowStatus> = {
  submit: "Preparing",
  return: "In review",
  "approve-review": "In review",
  "approve-agent": "In review",
  "sign-off": "In review",
  reopen: "Signed off",
};

/** Status after the step (approvals keep the fund In review). */
export const STEP_TO: Record<Step, WorkflowStatus> = {
  submit: "In review",
  return: "Preparing",
  "approve-review": "In review",
  "approve-agent": "In review",
  "sign-off": "Signed off",
  reopen: "Preparing",
};

export const NO_ACCESS = "You don't have access to this fund";
export const SUBMITTER_BLOCK = "You can't approve a fund you submitted";
const SUBMITTER_SHORT = "You submitted this fund";

const PERMISSION_REASON: Record<Step, string> = {
  submit: "You don't have permission to submit for review",
  return: "You don't have permission to return a fund to the preparer",
  "approve-review": "You don't have permission to approve as reviewer",
  "approve-agent": "You don't have permission to approve as tax agent",
  "sign-off": "You don't have permission to sign off",
  reopen: "You don't have permission to reopen a fund",
};

const STATUS_REASON: Record<Step, string> = {
  submit: "Only a fund being prepared can be submitted for review",
  return: "Only a fund in review can be returned to the preparer",
  "approve-review": "Only a fund in review can be approved",
  "approve-agent": "Only a fund in review can be approved",
  "sign-off": "Only a fund in review can be signed off",
  reopen: "Only a signed-off fund can be reopened",
};

export function levelOfStep(step: Step): ApprovalLevel | null {
  return step === "approve-review" ? "review" : step === "approve-agent" ? "agent" : null;
}

export function signOffWaitText(missing: readonly ApprovalLevel[]): string {
  return `Sign-off waits for: ${listLevels(missing)} approval.`;
}

// ---------------------------------------------------------------------------------------------------- approvals and queries
export function latestApproval(approvals: readonly Approval[], fundId: FundId, level: ApprovalLevel): Approval | undefined {
  let best: Approval | undefined;
  for (const approval of approvals) {
    if (approval.fundId !== fundId || approval.level !== level) continue;
    if (!best || approval.at >= best.at) best = approval;
  }
  return best;
}

export function approvalChain(data: AppData, fund: Fund): ApprovalStatus[] {
  return GOVERNANCE[fund.governance].levels.map((level) => {
    const approval = latestApproval(data.approvals, fund.id, level);
    const label = APPROVAL_LEVEL_LABEL[level];
    return approval ? { level, label, done: true, by: approval.by, at: approval.at } : { level, label, done: false };
  });
}

export function openQueryCount(data: AppData, fundId: FundId): number {
  return data.queries.filter((q) => q.fundId === fundId && q.status === "open").length;
}

// ---------------------------------------------------------------------------------------------------- single-fund steps
export type BlockCode = "access" | "role" | "no-agent-level" | "status" | "submitter" | "approvals";
export interface Block {
  code: BlockCode;
  reason: string;
}

/** Why `user` cannot take `step` on `fund` right now, or null when they can. */
export function stepBlock(data: AppData, fund: Fund, step: Step, user: User): Block | null {
  if (!userHasFund(user, fund.id)) return { code: "access", reason: NO_ACCESS };
  if (!can(user, step, fund, fund.governance)) {
    if (step === "approve-agent" && user.role === "tax-agent") {
      return { code: "no-agent-level", reason: "This fund has no tax agent approval step" };
    }
    return { code: "role", reason: PERMISSION_REASON[step] };
  }
  if (fund.status !== STEP_FROM[step]) return { code: "status", reason: STATUS_REASON[step] };
  if (step === "approve-review" && submittedBy(data.audit, fund.id) === user.name) {
    return { code: "submitter", reason: SUBMITTER_BLOCK };
  }
  if (step === "sign-off") {
    const missing = missingApprovals(fund.id, fund.governance, data.approvals);
    if (missing.length > 0) return { code: "approvals", reason: signOffWaitText(missing) };
  }
  return null;
}

/** The reason shown next to a disabled workflow button. */
export function buttonReason(block: Block): string {
  return block.code === "submitter" ? SUBMITTER_SHORT : block.reason;
}

// ---------------------------------------------------------------------------------------------------- bulk review
export const BULK_STEP_LABEL: Record<BulkKind, string> = {
  submit: "Submit for review",
  "approve-review": "Approve",
  "sign-off": "Sign off",
};

/** Which workflow step a bulk kind means for this user: "approve-review" approves at the user's own level. */
export function bulkStep(user: User, kind: BulkKind): Step {
  if (kind === "approve-review") return user.role === "tax-agent" ? "approve-agent" : "approve-review";
  return kind;
}

/**
 * Why a bulk action skips this fund for ctx.user, or null when it applies. `exceptionCount` is only called once the cheaper gates pass.
 * Bulk approval and sign-off skip funds with open exceptions; sign-off also skips funds with open queries or missing approvals.
 */
export function bulkBlock(data: AppData, fund: Fund, kind: BulkKind, user: User, exceptionCount: () => number): string | null {
  const step = bulkStep(user, kind);
  if (!can(user, step, fund, fund.governance)) return "Not allowed for your role";
  if (fund.status !== STEP_FROM[step]) return kind === "submit" ? "Not preparing" : "Not in review";
  if (kind === "submit") return null;
  const level = levelOfStep(step);
  if (level) {
    if (latestApproval(data.approvals, fund.id, level)) return "Already approved";
    if (step === "approve-review" && submittedBy(data.audit, fund.id) === user.name) return SUBMITTER_SHORT;
  }
  if (exceptionCount() > 0) return "Open exceptions";
  if (kind === "sign-off") {
    if (openQueryCount(data, fund.id) > 0) return "Open queries";
    const missing = missingApprovals(fund.id, fund.governance, data.approvals);
    if (missing.length > 0) return `Waiting for ${listLevels(missing)} approval`;
  }
  return null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The "Next for you" cell of the Bulk review table. Derived from the same gates as bulkBlock so it never disagrees with Run. */
export function nextForYou(
  data: AppData,
  fund: Fund,
  ctx: Ctx,
  flags: { canSubmit: boolean; canApproveReview: boolean; canSignOff: boolean },
  exceptions: number,
  openQueries: number,
): NextForYou {
  const user = ctx.user;
  const viewOnly = !userHasFund(user, fund.id) || user.role === "finance";
  if (fund.status === "Signed off") return { kind: "signed-off", text: "already signed off" };
  if (fund.status === "Preparing") {
    if (flags.canSubmit) return { kind: "submit", text: "Submit" };
    if (viewOnly) return { kind: "none", text: "view only" };
    return { kind: "waiting", text: "waiting for the preparer to submit" };
  }
  if (flags.canApproveReview) {
    return user.role === "tax-agent"
      ? { kind: "approve-agent", text: "Approve as tax agent" }
      : { kind: "approve-review", text: "Approve as reviewer" };
  }
  if (flags.canSignOff) return { kind: "sign-off", text: "Sign off" };
  if (viewOnly) return { kind: "none", text: "view only" };

  const missing = missingApprovals(fund.id, fund.governance, data.approvals);
  const approveStep: Step = user.role === "tax-agent" ? "approve-agent" : "approve-review";
  const level = levelOfStep(approveStep)!;
  const couldApprove =
    can(user, approveStep, fund, fund.governance) &&
    !latestApproval(data.approvals, fund.id, level) &&
    !(approveStep === "approve-review" && submittedBy(data.audit, fund.id) === user.name);
  const couldSignOff = can(user, "sign-off", fund, fund.governance);
  if (couldApprove || couldSignOff) {
    if (exceptions > 0) return { kind: "blocked", text: plural(exceptions, "open exception", "open exceptions") };
    if (couldSignOff && openQueries > 0) return { kind: "blocked", text: plural(openQueries, "open query", "open queries") };
  }
  if (missing.length > 0) return { kind: "waiting", text: `waiting for ${listLevels(missing).toLowerCase()} approval` };
  return { kind: "waiting", text: "waiting for sign-off" };
}
