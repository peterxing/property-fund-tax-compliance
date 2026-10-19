// OWNER: Expense allocation agent (v3 G5). Sets an AU fund's expense allocation policy ("entity-set-expense-allocation").
import type { ActionResult, AppData, AuExpenseAllocation, AuFund, Ctx, Fund, FundId } from "../types.ts";
import { appendAudit } from "../core/audit.ts";
import { can, userHasFund } from "../permissions.ts";
import type { EntityAction } from "./types.ts";

const fail = (reason: string): ActionResult => ({ ok: false, reason });
const succeed = (data: AppData): ActionResult => ({ ok: true, data });

const FUND_NOT_FOUND = "Fund not found";
const NO_ACCESS = "You don't have access to this fund";

function findFund(data: AppData, fundId: FundId): Fund | undefined {
  return data.funds.find((f) => f.id === fundId);
}

function replaceFund(data: AppData, next: Fund): Fund[] {
  return data.funds.map((fund) => (fund.id === next.id ? next : fund));
}

function editableAuFund(data: AppData, fundId: FundId, ctx: Ctx): AuFund | string {
  const fund = findFund(data, fundId);
  if (!fund) return FUND_NOT_FOUND;
  if (!userHasFund(ctx.user, fund.id)) return NO_ACCESS;
  if (fund.market !== "AU") return "Expense allocation only applies to Australian funds";
  if (!can(ctx.user, "edit", fund, fund.governance)) return "You don't have permission to edit this fund";
  if (fund.status === "Signed off") return "This fund is signed off. Reopen it to edit.";
  if (fund.status === "In review") return "This fund is in review. Return it to the preparer to edit.";
  return fund;
}

function normaliseAllocation(value: AuExpenseAllocation): AuExpenseAllocation | string {
  if (!value || typeof value !== "object") return "Choose an expense allocation method";
  if (value.method === "pro-rata" || value.method === "other-income") return { method: value.method };
  if (value.method !== "custom") return "Choose an expense allocation method";
  const shares = value.sharesBps;
  if (!shares || typeof shares !== "object") return "Custom expense allocation needs four percentages";
  const next = { other: shares.other, ncmi: shares.ncmi, transitional: shares.transitional, clean: shares.clean };
  for (const [key, share] of Object.entries(next)) {
    if (!Number.isInteger(share) || share < 0 || share > 10_000) return `${key} share must be between 0% and 100%`;
  }
  const total = next.other + next.ncmi + next.transitional + next.clean;
  if (total !== 10_000) return "Custom expense allocation must total 100%";
  return { method: "custom", sharesBps: next };
}

function policyText(allocation: AuExpenseAllocation | undefined): string {
  const policy = allocation ?? { method: "pro-rata" };
  if (policy.method === "pro-rata") return "Pro-rata by gross rent";
  if (policy.method === "other-income") return "All deductions against Australian income — other";
  const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.00$/, "")}%`;
  return `Custom shares: other ${pct(policy.sharesBps.other)}, NCMI ${pct(policy.sharesBps.ncmi)}, transitional ${pct(policy.sharesBps.transitional)}, clean building ${pct(policy.sharesBps.clean)}`;
}

function samePolicy(a: AuExpenseAllocation | undefined, b: AuExpenseAllocation): boolean {
  return JSON.stringify(a ?? { method: "pro-rata" }) === JSON.stringify(b);
}

export function setExpenseAllocation(data: AppData, action: Extract<EntityAction, { type: "entity-set-expense-allocation" }>, ctx: Ctx): ActionResult {
  const fund = editableAuFund(data, action.fundId, ctx);
  if (typeof fund === "string") return fail(fund);
  const allocation = normaliseAllocation(action.allocation);
  if (typeof allocation === "string") return fail(allocation);
  if (samePolicy(fund.expenseAllocation, allocation)) return succeed(data);
  const next: AuFund = { ...fund, expenseAllocation: allocation };
  return succeed({
    ...data,
    funds: replaceFund(data, next),
    audit: appendAudit(data, ctx, [
      {
        fundId: fund.id,
        action: "Expense allocation policy updated",
        detail: `${policyText(fund.expenseAllocation)} → ${policyText(allocation)}`,
      },
    ]),
  });
}
