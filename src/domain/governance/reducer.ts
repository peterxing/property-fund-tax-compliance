// OWNER: Governance agent (F8: versions, manual adjustments, prior-year view). Pure reducers for this feature's actions. Same rules as src/domain/actions.ts: never mutate data, check
// permissions with permissions.can(...) and fund access, refuse edits outside "Preparing" where the workflow locks them, audit every success
// (core/audit.ts appendAudit), and return { ok: false, reason } with a user-readable reason instead of throwing.
import type { Action, ActionResult, AppData, Ctx, Fund, User } from "../types.ts";
import { can, userHasFund } from "../permissions.ts";
import { appendAudit } from "../core/audit.ts";
import { nextSequenceId } from "../core/ids.ts";
import { inputLabel } from "../core/labels.ts";
import { isSafeInt, MAX_NAME, MAX_STRING } from "../core/validate.ts";
import { money, toLocalDateTime } from "../format.ts";
import type { GovernanceAction, ManualAdjustment, ManualAdjustmentComponent } from "./types.ts";
import { buildCalcVersion } from "./versions.ts";

export function isGovernanceAction(action: Action): action is GovernanceAction {
  return action.type.startsWith("gov-");
}

const fail = (reason: string): ActionResult => ({ ok: false, reason });
const succeed = (data: AppData): ActionResult => ({ ok: true, data });

function fundFor(data: AppData, fundId: string, user: User): Fund | string {
  const fund = data.funds.find((f) => f.id === fundId);
  if (!fund) return "Fund not found";
  if (!userHasFund(user, fund.id)) return "You don't have access to this fund";
  return fund;
}

function editableFund(data: AppData, fundId: string, user: User): Fund | string {
  const fund = fundFor(data, fundId, user);
  if (typeof fund === "string") return fund;
  if (!can(user, "edit", fund, fund.governance)) return "You don't have permission to edit this fund";
  if (fund.status === "Signed off") return "This fund is signed off. Reopen it to edit.";
  if (fund.status === "In review") return "This fund is in review. Return it to the preparer to edit.";
  return fund;
}

function cleanText(value: unknown, name: string, min: number, max = MAX_STRING): string | ActionResult {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min) return fail(`Enter ${name}`);
  if (text.length > max) return fail(`${name[0].toUpperCase()}${name.slice(1)} can have up to ${max} characters`);
  return text;
}

const AU_COMPONENTS = new Set<ManualAdjustmentComponent>(["ausOtherIncome", "ncmi", "excludedNcmi", "cleanBuilding", "interest", "discountGainTarp", "otherGainTarp", "foreignIncome"]);
const SG_COMPONENTS = new Set<ManualAdjustmentComponent>(["taxableSpecifiedIncome"]);

function componentAllowed(fund: Fund, component: ManualAdjustmentComponent): boolean {
  return fund.market === "AU" ? AU_COMPONENTS.has(component) : SG_COMPONENTS.has(component);
}

/** Who may save a calculation version by hand: anyone on the fund who edits, reviews or signs it off (not the view-only role). */
export function maySaveVersion(user: User, fund: Fund): boolean {
  return userHasFund(user, fund.id) && (can(user, "edit", fund, fund.governance) || can(user, "approve-review", fund, fund.governance) || can(user, "sign-off", fund, fund.governance));
}

function saveVersion(data: AppData, action: Extract<GovernanceAction, { type: "gov-save-version" }>, ctx: Ctx): ActionResult {
  const fund = fundFor(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  if (!maySaveVersion(ctx.user, fund)) return fail("You don't have permission to save a calculation version");
  const label = cleanText(action.label, "a version label", 1, MAX_NAME);
  if (typeof label !== "string") return label;
  const version = buildCalcVersion(data, fund, ctx, "manual", label, null);
  return succeed({
    ...data,
    versions: [...data.versions, version],
    audit: appendAudit(data, ctx, [{ fundId: fund.id, action: "Calculation version saved", detail: label }]),
  });
}

function addAdjustment(data: AppData, action: Extract<GovernanceAction, { type: "gov-add-adjustment" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const label = cleanText(action.label, "an adjustment label", 1, MAX_NAME);
  if (typeof label !== "string") return label;
  const reason = cleanText(action.reason, "a reason", 5, 500);
  if (typeof reason !== "string") return reason;
  if (!componentAllowed(fund, action.component)) return fail("Manual adjustment component does not apply to this fund");
  if (!isSafeInt(action.amount) || action.amount === 0) return fail("Manual adjustment amount must be a non-zero whole cents amount");
  const adjustment: ManualAdjustment = {
    id: nextSequenceId("ma", data.manualAdjustments.map((a) => a.id)),
    fundId: fund.id,
    label,
    amount: action.amount,
    component: action.component,
    reason,
    by: ctx.user.name,
    at: toLocalDateTime(ctx.now),
  };
  return succeed({
    ...data,
    manualAdjustments: [...data.manualAdjustments, adjustment],
    audit: appendAudit(data, ctx, [
      { fundId: fund.id, action: "Manual tax adjustment added", detail: `${label}: ${money(action.amount, fund.currency)} to ${inputLabel(action.component)}. Reason: ${reason}` },
    ]),
  });
}

function removeAdjustment(data: AppData, action: Extract<GovernanceAction, { type: "gov-remove-adjustment" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const adjustment = data.manualAdjustments.find((a) => a.id === action.id && a.fundId === fund.id);
  if (!adjustment) return fail("Manual adjustment not found");
  return succeed({
    ...data,
    manualAdjustments: data.manualAdjustments.filter((a) => a !== adjustment),
    audit: appendAudit(data, ctx, [{ fundId: fund.id, action: "Manual tax adjustment removed", detail: `${adjustment.label}: ${money(adjustment.amount, fund.currency)}` }]),
  });
}

export function applyGovernanceAction(data: AppData, action: GovernanceAction, ctx: Ctx): ActionResult {
  switch (action.type) {
    case "gov-save-version":
      return saveVersion(data, action, ctx);
    case "gov-add-adjustment":
      return addAdjustment(data, action, ctx);
    case "gov-remove-adjustment":
      return removeAdjustment(data, action, ctx);
    default:
      return { ok: false, reason: "Unknown governance action" };
  }
}
