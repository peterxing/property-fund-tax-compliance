// Pure helpers behind the Bulk review workspace: selection, button state, summary and result text. No React, so Node tests can import this.
import type { BulkKind, BulkResult, BulkRow, FundId, JurisdictionFilter, NextForYou, RoleId } from "../../../domain/types.ts";
import { ROLE_LABEL, roleCan } from "../../../domain/permissions.ts";
import { buildHash } from "../../router.ts";
import type { IconName } from "../../ui/icons.tsx";

export const BULK_KINDS: readonly BulkKind[] = ["submit", "approve-review", "sign-off"];

/** The funds ticked in the table, by id. Treated as immutable: every helper returns a new set (or the same one when nothing changed). */
export type Selection = ReadonlySet<FundId>;

export const EMPTY_SELECTION: Selection = new Set<FundId>();

/** Which of the three bulk steps the role has at all, before any fund is looked at. */
export function bulkRoleActions(role: RoleId): Record<BulkKind, boolean> {
  return {
    submit: roleCan(role, "submit"),
    "approve-review": roleCan(role, "approve-review") || roleCan(role, "approve-agent"),
    "sign-off": roleCan(role, "sign-off"),
  };
}

export function hasBulkActions(role: RoleId): boolean {
  return Object.values(bulkRoleActions(role)).some(Boolean);
}

/** "Approve selected as reviewer" for everyone except a tax agent, whose bulk approval is the tax agent level. */
export function bulkButtonLabel(kind: BulkKind, role: RoleId): string {
  switch (kind) {
    case "submit":
      return "Submit selected";
    case "approve-review":
      return role === "tax-agent" ? "Approve selected as tax agent" : "Approve selected as reviewer";
    case "sign-off":
      return "Sign off selected";
  }
}

export function canTake(row: BulkRow, kind: BulkKind): boolean {
  switch (kind) {
    case "submit":
      return row.canSubmit;
    case "approve-review":
      return row.canApproveReview;
    case "sign-off":
      return row.canSignOff;
  }
}

/** The ticked rows in table order. */
export function selectedRows(rows: readonly BulkRow[], selection: Selection): BulkRow[] {
  return rows.filter((row) => selection.has(row.fund.id));
}

/** The ticked rows that can take this step now. */
export function eligibleRows(rows: readonly BulkRow[], selection: Selection, kind: BulkKind): BulkRow[] {
  return selectedRows(rows, selection).filter((row) => canTake(row, kind));
}

/** Drops ids that are no longer in the table (persona or jurisdiction changed). Returns the same set when nothing is dropped. */
export function pruneSelection(selection: Selection, rows: readonly BulkRow[]): Selection {
  const present = new Set(rows.map((row) => row.fund.id));
  const kept = [...selection].filter((id) => present.has(id));
  return kept.length === selection.size ? selection : new Set(kept);
}

export function setSelected(selection: Selection, fundId: FundId, checked: boolean): Selection {
  if (selection.has(fundId) === checked) return selection;
  const next = new Set(selection);
  if (checked) next.add(fundId);
  else next.delete(fundId);
  return next;
}

/** The select-all box: every row in the table when ticked, none of them when cleared. */
export function setAllSelected(selection: Selection, rows: readonly BulkRow[], checked: boolean): Selection {
  const next = new Set(selection);
  for (const row of rows) {
    if (checked) next.add(row.fund.id);
    else next.delete(row.fund.id);
  }
  return next.size === selection.size && [...next].every((id) => selection.has(id)) ? selection : next;
}

export type SelectAllState = "none" | "some" | "all";

export function selectAllState(rows: readonly BulkRow[], selection: Selection): SelectAllState {
  const count = selectedRows(rows, selection).length;
  return count === 0 ? "none" : count === rows.length ? "all" : "some";
}

const CAN_BE: Record<BulkKind, string> = { submit: "submitted", "approve-review": "approved", "sign-off": "signed off" };

/** The count line (read out as the ticks change): "3 selected, 1 can be signed off". */
export function selectionSummary(rows: readonly BulkRow[], selection: Selection, role: RoleId): string {
  if (rows.length === 0) return "There are no funds to select.";
  if (!hasBulkActions(role)) return `Your role (${ROLE_LABEL[role]}) can't submit, approve or sign off funds.`;
  const picked = selectedRows(rows, selection).length;
  if (picked === 0) return "No funds selected. Tick funds in the table to submit, approve or sign them off.";
  const parts = BULK_KINDS.flatMap((kind) => {
    const count = eligibleRows(rows, selection, kind).length;
    return count > 0 ? [`${count} can be ${CAN_BE[kind]}`] : [];
  });
  return `${picked} selected, ${parts.length > 0 ? parts.join(", ") : "none can be submitted, approved or signed off"}`;
}

export interface BulkButtonState {
  kind: BulkKind;
  label: string;
  /** Selected funds that can take this step now. */
  count: number;
  enabled: boolean;
}

/** A button is enabled only when the role has the step and at least one ticked fund can take it. */
export function bulkButtons(rows: readonly BulkRow[], selection: Selection, role: RoleId): BulkButtonState[] {
  const allowed = bulkRoleActions(role);
  return BULK_KINDS.map((kind) => {
    const count = eligibleRows(rows, selection, kind).length;
    return { kind, label: bulkButtonLabel(kind, role), count, enabled: allowed[kind] && count > 0 };
  });
}

/** After a run the funds that completed are no longer ticked; skipped ones stay ticked so the reasons can be read against them. */
export function selectionAfterRun(selection: Selection, result: BulkResult): Selection {
  const done = new Set(result.done);
  const kept = [...selection].filter((id) => !done.has(id));
  return kept.length === selection.size ? selection : new Set(kept);
}

export interface BulkOutcome {
  kind: BulkKind;
  tone: "success" | "warn";
  title: string;
  /** Names of the funds that took the step, in the order they ran. */
  done: string[];
  skipped: Array<{ fundId: FundId; name: string; reason: string }>;
}

function titleFor(kind: BulkKind, role: RoleId, count: number): string {
  const funds = `${count} ${count === 1 ? "fund" : "funds"}`;
  if (count === 0) {
    return kind === "submit" ? "No funds were submitted" : kind === "approve-review" ? "No funds were approved" : "No funds were signed off";
  }
  switch (kind) {
    case "submit":
      return `Submitted ${funds} for review`;
    case "approve-review":
      return `Approved ${funds} as ${role === "tax-agent" ? "tax agent" : "reviewer"}`;
    case "sign-off":
      return `Signed off ${funds}`;
  }
}

/** What to tell the user after `dispatchBulk`: a title plus the done and skipped lists. `nameOf` turns a fund id into its name. */
export function bulkOutcome(kind: BulkKind, result: BulkResult, nameOf: (fundId: FundId) => string, role: RoleId): BulkOutcome {
  return {
    kind,
    tone: result.done.length > 0 && result.skipped.length === 0 ? "success" : "warn",
    title: titleFor(kind, role, result.done.length),
    done: result.done.map(nameOf),
    skipped: result.skipped.map((s) => ({ fundId: s.fundId, name: nameOf(s.fundId), reason: s.reason })),
  };
}

/** The result as plain lines: "Done: A, B" then one "Skipped: <fund>: <reason>" per skipped fund. */
export function outcomeLines(outcome: BulkOutcome): string[] {
  const lines: string[] = [];
  if (outcome.done.length > 0) lines.push(`Done: ${outcome.done.join(", ")}`);
  for (const skipped of outcome.skipped) lines.push(`Skipped: ${skipped.name}: ${skipped.reason}`);
  return lines;
}

/** "Reviewer done · Tax agent pending". */
export function approvalsText(row: Pick<BulkRow, "approvals">): string {
  return row.approvals.map((a) => `${a.label} ${a.done ? "done" : "pending"}`).join(" · ");
}

const NEXT_ICON: Record<NextForYou["kind"], IconName | null> = {
  submit: "send",
  "approve-review": "shield-check",
  "approve-agent": "shield-check",
  "sign-off": "circle-check",
  blocked: "alert-triangle",
  "signed-off": "lock",
  waiting: null,
  none: null,
};

export function nextIcon(kind: NextForYou["kind"]): IconName | null {
  return NEXT_ICON[kind];
}

/** Steps this persona can take now (the "Next for you" text is drawn stronger for these). */
export function isActionable(kind: NextForYou["kind"]): boolean {
  return kind === "submit" || kind === "approve-review" || kind === "approve-agent" || kind === "sign-off";
}

/** The Distributions page of a fund, which is what a fund name links to. */
export function fundHref(fundId: FundId): string {
  return buildHash({ path: "/", params: { fund: fundId } });
}

export interface EmptyMessage {
  title: string;
  body: string;
}

/**
 * Shown instead of the table when the persona sees no fund. `assigned` is how many funds the persona has across both markets, so the
 * message can tell "nothing assigned" from "hidden by the jurisdiction toggle".
 */
export function emptyMessage(userName: string, jurisdiction: JurisdictionFilter, assigned: number): EmptyMessage {
  if (assigned > 0 && jurisdiction !== "all") {
    const market = jurisdiction === "AU" ? "Australian" : "Singapore";
    return {
      title: `No ${market} funds to review`,
      body: `${userName} has no ${market} funds. Switch the jurisdiction to All to see the others.`,
    };
  }
  return {
    title: "No funds to review",
    body: `${userName} isn't assigned to any funds. A Head of Tax can change that under Access.`,
  };
}
