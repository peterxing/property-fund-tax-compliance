// Pure helpers behind the Access workspace (no React, so Node tests can import them).
import type { AccessView, Action, ActionId, FundId, GovernanceMode, RoleId, User, UserId } from "../../../domain/types.ts";
import { ROLES, ROLE_LABEL, roleCan } from "../../../domain/permissions.ts";

export type UserEntry = AccessView["users"][number];
export type GovernanceEntry = AccessView["governance"][number];
export type PermissionEntry = AccessView["permissions"][number];

export const PERMISSIONS_SUBTITLE = "Which roles can take each action on the funds they can see";
export const PERMISSIONS_FOOTNOTE =
  "Tax agents approve only where a fund's governance includes a tax agent, and record lodgment only where the agent lodges. Whoever submits a fund can't also approve it as reviewer.";

export const STORAGE_NOTE =
  "This app keeps its data in this browser only (local storage). Nothing is sent anywhere, so other browsers and other people never see your changes.";
export const RESET_TITLE = "Reset demo data?";
export const RESET_DESCRIPTION = "This restores the original demonstration data in this browser. Your changes will be lost.";
export const RESET_DONE = "Demo data reset. The original demonstration data is back.";

export const PICK_ONE_FUND = "Pick at least one fund";
export const LOCKED_REASON = "Locked while signed off. Reopen the fund to change its governance.";

// ------------------------------------------------------------------------------------------------ who may change what
/** Managing access is portfolio-wide and needs only the role (the domain applies the same rule when an action is dispatched). */
export function canManageAccess(user: Pick<User, "role">): boolean {
  return roleCan(user.role, "manage-access");
}

function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** The roles that may manage access, as labels ("Head of Tax"). */
export function managerRoleLabels(): string[] {
  return ROLES.filter((role) => roleCan(role, "manage-access")).map((role) => ROLE_LABEL[role]);
}

/** Why the page is read-only for everyone else; shown once and referred to by every disabled control. */
export function readOnlyNote(): string {
  return `This page is read-only for you. Only a ${joinOr(managerRoleLabels())} can change who sees which funds or how a fund is governed.`;
}

// ------------------------------------------------------------------------------------------------ users
/** "All funds", or the names joined as in the reference ("Harbourline Office Trust, Southbank Industrial Partners Fund"). */
export function fundsText(entry: Pick<UserEntry, "allFunds" | "fundNames">): string {
  if (entry.allFunds) return "All funds";
  return entry.fundNames.length > 0 ? entry.fundNames.join(", ") : "No funds";
}

/** The muted second line under a name: "Tax manager, Australia · Fund manager". */
export function userMeta(user: Pick<User, "title" | "organisation">): string {
  return `${user.title} · ${user.organisation}`;
}

export const roleLabelOf = (user: Pick<User, "role">): string => ROLE_LABEL[user.role];

// ------------------------------------------------------------------------------------------------ the "Change funds" dialog
// The draft is the list of fund ids ticked in the dialog. "All funds" is not a separate state: it is simply every fund ticked.
export type FundsDraft = readonly FundId[];

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** What the dialog starts from: everything for a user who sees all funds, otherwise the user's own list (in the funds' order). */
export function initialFundsDraft(funds: User["funds"], fundIds: readonly FundId[]): FundId[] {
  return funds === "all" ? [...fundIds] : fundIds.filter((id) => funds.includes(id));
}

/** Ticks or unticks one fund; the result is always in the funds' own order and ignores ids that no longer exist. */
export function setFundTicked(draft: FundsDraft, fundId: FundId, checked: boolean, fundIds: readonly FundId[]): FundId[] {
  return fundIds.filter((id) => (id === fundId ? checked : draft.includes(id)));
}

/** The "All funds" box: ticks every fund, or clears them all. */
export function setAllTicked(checked: boolean, fundIds: readonly FundId[]): FundId[] {
  return checked ? [...fundIds] : [];
}

export interface FundsSelection {
  count: number;
  total: number;
  all: boolean;
  none: boolean;
  /** For the "All funds" box: some but not all funds are ticked. */
  indeterminate: boolean;
}

export function selectionOf(draft: FundsDraft, fundIds: readonly FundId[]): FundsSelection {
  const count = fundIds.filter((id) => draft.includes(id)).length;
  const all = fundIds.length > 0 && count === fundIds.length;
  return { count, total: fundIds.length, all, none: count === 0, indeterminate: count > 0 && !all };
}

export function selectionText(selection: Pick<FundsSelection, "count" | "total" | "all" | "none">): string {
  if (selection.none) return "No funds selected";
  if (selection.all) return `All ${selection.total} funds selected`;
  return `${selection.count} of ${selection.total} funds selected`;
}

/** The message under the list when Save is pressed with nothing ticked, otherwise null. */
export function validateFunds(draft: FundsDraft, fundIds: readonly FundId[]): string | null {
  return selectionOf(draft, fundIds).none ? PICK_ONE_FUND : null;
}

/** What gets saved: "all" when every fund is ticked (so a fund added later is seen too), otherwise the ticked funds. */
export function draftFunds(draft: FundsDraft, fundIds: readonly FundId[]): "all" | FundId[] {
  const picked = fundIds.filter((id) => draft.includes(id));
  return fundIds.length > 0 && picked.length === fundIds.length ? "all" : picked;
}

/** Whether saving would change which funds the user sees ("all" and a list of every fund are the same reach). */
export function fundsChanged(current: User["funds"], draft: FundsDraft, fundIds: readonly FundId[]): boolean {
  const before = new Set(initialFundsDraft(current, fundIds));
  const after = fundIds.filter((id) => draft.includes(id));
  return before.size !== after.length || after.some((id) => !before.has(id));
}

export function setUserFundsAction(userId: UserId, draft: FundsDraft, fundIds: readonly FundId[]): Extract<Action, { type: "set-user-funds" }> {
  return { type: "set-user-funds", userId, funds: draftFunds(draft, fundIds) };
}

export function fundsDialogTitle(userName: string): string {
  return `Change funds for ${userName}`;
}

export function fundsDialogDescription(userName: string): string {
  return `Choose which funds ${userName} can see.`;
}

export function fundsSavedMessage(userName: string, funds: "all" | readonly FundId[]): string {
  return funds === "all" ? `${userName} can now see all funds.` : `${userName} can now see ${plural(funds.length, "fund")}.`;
}

// ------------------------------------------------------------------------------------------------ governance by fund
export interface GovernanceControl {
  /** select: the Head of Tax can change it; locked: the fund is signed off; readonly: this persona cannot change governance. */
  kind: "select" | "locked" | "readonly";
  /** Shown beside the control when it cannot be changed. */
  reason: string | null;
}

export function governanceControl(entry: Pick<GovernanceEntry, "status">, user: Pick<User, "role">): GovernanceControl {
  if (entry.status === "Signed off") return { kind: "locked", reason: LOCKED_REASON };
  if (!canManageAccess(user)) return { kind: "readonly", reason: readOnlyNote() };
  return { kind: "select", reason: null };
}

export function governanceOptions(modes: AccessView["modes"]): Array<{ value: GovernanceMode; label: string }> {
  return modes.map((entry) => ({ value: entry.mode, label: entry.label }));
}

export function governanceSelectLabel(fundName: string): string {
  return `Governance for ${fundName}`;
}

export function setGovernanceAction(fundId: FundId, mode: GovernanceMode): Extract<Action, { type: "set-governance" }> {
  return { type: "set-governance", fundId, mode };
}

export function governanceChangedMessage(fundName: string, modeLabel: string): string {
  return `Governance for ${fundName} changed to ${modeLabel}.`;
}

// ------------------------------------------------------------------------------------------------ permissions by role
export interface MatrixCell {
  role: RoleId;
  roleLabel: string;
  allowed: boolean;
  /** For assistive technology: the check and the dash are drawn, these are read. */
  text: "Yes" | "No";
}

export interface MatrixRow {
  action: ActionId;
  label: string;
  cells: MatrixCell[];
}

export function matrixColumns(view: Pick<AccessView, "roles">): Array<{ id: RoleId; label: string }> {
  return view.roles.map((role) => ({ id: role.id, label: role.label }));
}

/** One row per action, one cell per role in the view's role order. */
export function matrixRows(view: Pick<AccessView, "permissions" | "roles">): MatrixRow[] {
  return view.permissions.map((permission) => ({
    action: permission.action,
    label: permission.label,
    cells: view.roles.map((role) => {
      const allowed = permission.roles[role.id] === true;
      return { role: role.id, roleLabel: role.label, allowed, text: allowed ? "Yes" : "No" };
    }),
  }));
}
