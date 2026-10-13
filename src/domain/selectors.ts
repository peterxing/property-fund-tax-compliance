// UI-facing facade. OWNER: domain-core agent. Every function here is pure: it reads AppData (+ ctx) and returns a view model.
// Market-specific work is delegated to moduleFor(fund.market). Distribution calculations are memoised per (data identity, fund, day)
// in core/calc.ts, so asking for several views of one fund costs one calculation.
// Unknown fund ids: getFund and every fund view throw; queriesFor/auditFor return an empty list.
import type {
  AccessView,
  AnalyticsView,
  AppData,
  AuditEntry,
  BulkRow,
  CostBaseView,
  Ctx,
  DeferredTaxInvestor,
  DocModel,
  Fund,
  FundCalc,
  FundGroup,
  FundId,
  InvestorView,
  JurisdictionFilter,
  Market,
  Query,
  ReturnView,
  RoleId,
  RulesTable,
  ScenarioView,
  TbView,
  User,
  WorkbookModel,
  WorkflowView,
} from "./types.ts";
import {
  ACTIONS,
  ACTION_LABEL,
  APPROVAL_LEVEL_LABEL,
  GOVERNANCE,
  GOVERNANCE_MODES,
  ROLES,
  ROLE_LABEL,
  can,
  lodgmentRole,
  missingApprovals,
  roleCan,
  userHasFund,
} from "./permissions.ts";
import { moduleFor } from "./modules.ts";
import { AUDIT_SIGNED_OFF, latestAudit, newestFirst } from "./core/audit.ts";
import { leakageHeadline, mixHeadline } from "./core/analytics.ts";
import { calcFor } from "./core/calc.ts";
import { portfolioDeadlines, portfolioEntries } from "./core/portfolio.ts";
import { visibleFundsOf } from "./core/visible.ts";
import { buildWorkbook } from "./core/workbook.ts";
import {
  STEPS,
  STEP_FROM,
  STEP_LABEL,
  approvalChain,
  bulkBlock,
  buttonReason,
  latestApproval,
  levelOfStep,
  nextForYou,
  openQueryCount,
  signOffWaitText,
  stepBlock,
} from "./core/workflow.ts";

const GROUPS: ReadonlyArray<{ market: Market; label: string }> = [
  { market: "AU", label: "Australia · AMIT · AUD" },
  { market: "SG", label: "Singapore · S-REIT · SGD" },
];

const ACCESS_DISCLAIMER =
  "Roles apply within this app's screens. Anyone who can open the app can switch who they're working as, so this isn't a security boundary.";

/** Funds the user may see (user.funds) filtered by the jurisdiction toggle, in seed order. */
export function visibleFunds(data: AppData, user: User, jurisdiction: JurisdictionFilter): Fund[] {
  return visibleFundsOf(data, user, jurisdiction);
}

/** The fund rail: funds grouped by market (AU first), each with status and exception count. Empty groups are omitted. */
export function fundGroups(data: AppData, ctx: Ctx, jurisdiction: JurisdictionFilter): FundGroup[] {
  const visible = visibleFundsOf(data, ctx.user, jurisdiction);
  return GROUPS.map(({ market, label }) => ({
    market,
    label,
    funds: visible.filter((fund) => fund.market === market).map((fund) => ({ fund, status: fund.status, exceptions: calcFor(data, fund, ctx.now).exceptions })),
  })).filter((group) => group.funds.length > 0);
}

export function getFund(data: AppData, fundId: FundId): Fund {
  const fund = data.funds.find((f) => f.id === fundId);
  if (!fund) throw new Error(`Unknown fund: ${fundId}`);
  return fund;
}

/** Distribution calculation for one fund (delegates to the market module). */
export function fundCalc(data: AppData, fundId: FundId, now: Date): FundCalc {
  return calcFor(data, getFund(data, fundId), now);
}

function lockedReasonOf(fund: Fund, user: User): string {
  if (fund.status === "Signed off") return "Signed off — reopen to edit";
  if (fund.status === "In review") return "In review — return to preparer to edit";
  return can(user, "edit", fund, fund.governance) ? "" : "View only for your role";
}

/** Approvals chain, available actions for ctx.user (with reasons when disabled), lock state and sign-off hint. */
export function workflowView(data: AppData, fundId: FundId, ctx: Ctx): WorkflowView {
  const fund = getFund(data, fundId);
  const user = ctx.user;
  const missing = missingApprovals(fund.id, fund.governance, data.approvals);
  const done = fund.status === "Signed off";
  const signedOff = done ? latestAudit(data.audit, fund.id, AUDIT_SIGNED_OFF) : undefined;

  const available: WorkflowView["available"] = [];
  for (const step of STEPS) {
    if (fund.status !== STEP_FROM[step] || !userHasFund(user, fund.id) || !roleCan(user.role, step)) continue;
    const level = levelOfStep(step);
    if (level && latestApproval(data.approvals, fund.id, level)) continue;
    const block = stepBlock(data, fund, step, user);
    available.push(block ? { action: step, label: STEP_LABEL[step], enabled: false, reason: buttonReason(block) } : { action: step, label: STEP_LABEL[step], enabled: true });
  }

  const signers = ROLES.filter((role) => roleCan(role, "sign-off")).map((role) => ROLE_LABEL[role]);
  return {
    fundId: fund.id,
    status: fund.status,
    governance: { ...GOVERNANCE[fund.governance], levels: [...GOVERNANCE[fund.governance].levels], mode: fund.governance },
    approvals: approvalChain(data, fund),
    signOff: {
      done,
      ...(signedOff ? { by: signedOff.actor, at: signedOff.at } : {}),
      waitingOn: done ? "" : signers.join(" or "),
    },
    openQueries: openQueryCount(data, fund.id),
    exceptions: calcFor(data, fund, ctx.now).exceptions,
    available,
    can: {
      edit: fund.status === "Preparing" && can(user, "edit", fund, fund.governance),
      query: can(user, "query", fund, fund.governance),
      publish: can(user, "publish", fund, fund.governance),
      lodge: fund.status === "Signed off" && can(user, "lodge", fund, fund.governance),
    },
    locked: fund.status !== "Preparing",
    lockedReason: lockedReasonOf(fund, user),
    signOffBlockedReason: fund.status === "In review" && missing.length > 0 ? signOffWaitText(missing) : "",
  };
}

/** Newest first. */
export function queriesFor(data: AppData, fundId: FundId): Query[] {
  return newestFirst(data.queries.filter((q) => q.fundId === fundId), (q) => q.raisedAt);
}

/** Newest first. */
export function auditFor(data: AppData, fundId: FundId): AuditEntry[] {
  return newestFirst(data.audit.filter((a) => a.fundId === fundId), (a) => a.at);
}

export function rulesFor(fund: Fund): RulesTable {
  return moduleFor(fund.market).rules(fund);
}

export function statementDoc(data: AppData, fundId: FundId, holderId: string, now: Date): DocModel {
  const fund = getFund(data, fundId);
  return moduleFor(fund.market).statementDoc(data, fund, calcFor(data, fund, now), holderId);
}

export function tbView(data: AppData, fundId: FundId, now: Date): TbView {
  const fund = getFund(data, fundId);
  return moduleFor(fund.market).tbView(data, fund, now);
}

export function returnView(data: AppData, fundId: FundId, ctx: Ctx): ReturnView {
  const fund = getFund(data, fundId);
  return moduleFor(fund.market).returnView(data, fund, calcFor(data, fund, ctx.now), ctx);
}

export function investorView(data: AppData, fundId: FundId, ctx: Ctx, selectedNoticeId?: string | null): InvestorView {
  const fund = getFund(data, fundId);
  return moduleFor(fund.market).investorView(data, fund, calcFor(data, fund, ctx.now), ctx, selectedNoticeId);
}

export function costBaseView(data: AppData, fundId: FundId, ctx: Ctx, investor?: DeferredTaxInvestor): CostBaseView {
  const fund = getFund(data, fundId);
  return moduleFor(fund.market).costBaseView(data, fund, calcFor(data, fund, ctx.now), investor);
}

/** One row per fund the user can see (jurisdiction filter applied), seed order. */
export function bulkRows(data: AppData, ctx: Ctx, jurisdiction: JurisdictionFilter): BulkRow[] {
  const user = ctx.user;
  return visibleFundsOf(data, user, jurisdiction).map((fund) => {
    const exceptions = calcFor(data, fund, ctx.now).exceptions;
    const openQueries = openQueryCount(data, fund.id);
    const flags = {
      canSubmit: bulkBlock(data, fund, "submit", user, () => exceptions) === null,
      canApproveReview: bulkBlock(data, fund, "approve-review", user, () => exceptions) === null,
      canSignOff: bulkBlock(data, fund, "sign-off", user, () => exceptions) === null,
    };
    return {
      fund,
      governanceLabel: GOVERNANCE[fund.governance].label,
      status: fund.status,
      approvals: approvalChain(data, fund),
      exceptions,
      openQueries,
      next: nextForYou(data, fund, ctx, flags, exceptions, openQueries),
      ...flags,
    };
  });
}

/** Portfolio analytics for the funds the user can see and the jurisdiction filter allows. */
export function analyticsView(data: AppData, ctx: Ctx, jurisdiction: JurisdictionFilter): AnalyticsView {
  const entries = portfolioEntries(data, ctx, jurisdiction);
  const leakage = entries.map(({ fund, calc }) => moduleFor(fund.market).leakage(fund, calc));
  const mix = entries.map(({ fund, calc }) => moduleFor(fund.market).mix(fund, calc));
  const deadlines = portfolioDeadlines(data, entries, ctx.now);
  return {
    leakage,
    leakageHeadline: leakageHeadline(leakage),
    mix,
    mixHeadline: mixHeadline(mix),
    deadlines,
    overdueCount: deadlines.filter((d) => d.status === "overdue").length,
  };
}

/** `value`: AU cash distribution in cents | SG taxable payout percent. Omit for the current position. */
export function scenarioView(data: AppData, fundId: FundId, ctx: Ctx, value?: number): ScenarioView {
  const fund = getFund(data, fundId);
  return moduleFor(fund.market).scenario(data, fund, calcFor(data, fund, ctx.now), value);
}

/** The "Download Power BI workbook" content for the visible funds. */
export function workbookModel(data: AppData, ctx: Ctx, jurisdiction: JurisdictionFilter): WorkbookModel {
  return buildWorkbook(data, ctx, jurisdiction);
}

export function accessView(data: AppData, ctx: Ctx): AccessView {
  return {
    users: data.users.map((user) => ({
      user,
      isCurrent: user.id === ctx.user.id,
      allFunds: user.funds === "all",
      fundNames: data.funds.filter((fund) => userHasFund(user, fund.id)).map((fund) => fund.name),
    })),
    governance: data.funds.map((fund) => ({
      fund,
      status: fund.status,
      mode: fund.governance,
      label: GOVERNANCE[fund.governance].label,
      approvalsBeforeSignOff: GOVERNANCE[fund.governance].levels.map((level) => APPROVAL_LEVEL_LABEL[level]).join(", "),
      recordsLodgment: ROLE_LABEL[lodgmentRole(fund.governance)],
    })),
    modes: GOVERNANCE_MODES.map((mode) => ({ mode, label: GOVERNANCE[mode].label })),
    permissions: ACTIONS.map((action) => ({
      action,
      label: ACTION_LABEL[action],
      roles: Object.fromEntries(ROLES.map((role) => [role, roleCan(role, action)])) as Record<RoleId, boolean>,
    })),
    roles: ROLES.map((id) => ({ id, label: ROLE_LABEL[id] })),
    disclaimer: ACCESS_DISCLAIMER,
  };
}
