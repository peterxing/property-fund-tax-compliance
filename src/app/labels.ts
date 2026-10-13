// Pure label helpers shared by the shell components (rail, header, bulk views). No React, so Node tests can import this file.
import type {
  Action,
  ActionId,
  ApprovalLevel,
  Fund,
  FundCalc,
  JurisdictionFilter,
  Market,
  User,
  WorkflowStatus,
  WorkflowView,
} from "../domain/types.ts";
import { dateLabel } from "../domain/format.ts";
import type { WorkspaceId } from "./router.ts";
import type { IconName } from "./ui/icons.tsx";

export const APP_NAME = "Property Fund Tax Compliance";

export function marketName(market: Market): string {
  return market === "AU" ? "Australia" : "Singapore";
}

export type StatusKey = "preparing" | "review" | "signed";

export function statusKey(status: WorkflowStatus): StatusKey {
  return status === "Signed off" ? "signed" : status === "In review" ? "review" : "preparing";
}

/** "Income year ended 30 Jun 2026" -> "Year ended 30 Jun 2026"; "Distribution period 1 Jul – 30 Sep 2026" -> "1 Jul – 30 Sep 2026". */
export function shortPeriod(periodLabel: string): string {
  if (periodLabel.startsWith("Distribution period ")) return periodLabel.slice("Distribution period ".length);
  if (periodLabel.startsWith("Income year ")) return `Year ${periodLabel.slice("Income year ".length)}`;
  return periodLabel;
}

/** The muted second line of a rail item: "Office · Year ended 30 Jun 2026". */
export function railDetail(fund: Pick<Fund, "sector" | "periodLabel">): string {
  return `${fund.sector} · ${shortPeriod(fund.periodLabel)}`;
}

export function exceptionLabel(count: number): string {
  return count === 1 ? "1 exception" : `${count} exceptions`;
}

export function queryLabel(count: number): string {
  return count === 1 ? "1 open query" : `${count} open queries`;
}

/** "AMIT · Office · Listed" / "S-REIT · Office & retail · Listed". */
export function regimeLine(fund: Pick<Fund, "regime" | "sector" | "listed">): string {
  return `${fund.regime} · ${fund.sector} · ${fund.listed ? "Listed" : "Unlisted"}`;
}

export interface Fact {
  label: string;
  value: string;
}

/** The statutory due-date fact: AU "AMMA DUE 30 Sep 2026"; SG "FORM UT YA2027 · due 15 Apr 2027". Null while the calculation has no facts. */
export function dueFact(fund: Fund, calc: Pick<FundCalc, "au" | "sg"> | null | undefined): Fact | null {
  if (fund.market === "AU") return calc?.au ? { label: "AMMA due", value: dateLabel(calc.au.ammaDue) } : null;
  return calc?.sg ? { label: "Form UT", value: `YA${fund.assessmentYear} · due ${dateLabel(calc.sg.formUtDue)}` } : null;
}

export interface ChainStep {
  key: string;
  label: string;
  done: boolean;
  /** "pending" | "pending · Head of Tax" | "done," */
  state: string;
  /** "L. Brennan, 1 Sep 2026" once done. */
  detail: string;
}

/** The approvals chain in the header: Reviewer / Tax agent (as the governance requires) then Sign-off. */
export function approvalChain(workflow: Pick<WorkflowView, "approvals" | "signOff">): ChainStep[] {
  const steps: ChainStep[] = workflow.approvals.map((a) => ({
    key: a.level,
    label: a.label,
    done: a.done,
    state: a.done ? "done," : "pending",
    detail: a.done ? [a.by, a.at ? dateLabel(a.at) : ""].filter(Boolean).join(", ") : "",
  }));
  const s = workflow.signOff;
  steps.push({
    key: "sign-off",
    label: "Sign-off",
    done: s.done,
    state: s.done ? "done," : s.waitingOn ? `pending · ${s.waitingOn}` : "pending",
    detail: s.done ? [s.by, s.at ? dateLabel(s.at) : ""].filter(Boolean).join(", ") : "",
  });
  return steps;
}

export function approvalLabelFor(level: ApprovalLevel): string {
  return level === "review" ? "Reviewer" : "Tax agent";
}

/** Maps a workflow button (WorkflowView.available[].action) to the domain action it dispatches; null for actions that are not workflow steps. */
export function workflowAction(action: ActionId, fundId: string): Action | null {
  switch (action) {
    case "submit":
      return { type: "submit", fundId };
    case "return":
      return { type: "return", fundId };
    case "approve-review":
      return { type: "approve", fundId, level: "review" };
    case "approve-agent":
      return { type: "approve", fundId, level: "agent" };
    case "sign-off":
      return { type: "sign-off", fundId };
    case "reopen":
      return { type: "reopen", fundId };
    default:
      return null;
  }
}

/** Message announced after a workflow step succeeds. */
export function workflowDoneMessage(action: ActionId, fundName: string): string {
  switch (action) {
    case "submit":
      return `${fundName} submitted for review.`;
    case "return":
      return `${fundName} returned to the preparer.`;
    case "approve-review":
      return `${fundName} approved as reviewer.`;
    case "approve-agent":
      return `${fundName} approved as tax agent.`;
    case "sign-off":
      return `${fundName} signed off.`;
    case "reopen":
      return `${fundName} reopened for editing.`;
    default:
      return `${fundName} updated.`;
  }
}

/** Icon names for the workflow buttons (the shell keeps this next to the action mapping). */
export const WORKFLOW_ICON: Partial<Record<ActionId, "send" | "undo" | "shield-check" | "circle-check" | "reopen">> = {
  submit: "send",
  return: "undo",
  "approve-review": "shield-check",
  "approve-agent": "shield-check",
  "sign-off": "circle-check",
  reopen: "reopen",
};

/** Icon beside each workspace in the nav and the registry. */
export const WORKSPACE_ICON: Record<WorkspaceId, IconName> = {
  distributions: "distributions",
  "trial-balance": "table",
  "tax-returns": "landmark",
  "investor-reporting": "file-text",
  "cost-base": "scale",
  "bulk-review": "list-checks",
  analytics: "bar-chart",
  access: "users",
};

/** "Distributions · Southbank Industrial Partners Fund · Property Fund Tax Compliance" (empty parts are skipped). */
export function documentTitle(parts: ReadonlyArray<string | null | undefined>): string {
  return [...parts.filter((p): p is string => Boolean(p)), APP_NAME].join(" · ");
}

/** "A. Moreno — Head of Tax". */
export function personaLabel(user: Pick<User, "name" | "title">): string {
  return `${user.name} — ${user.title}`;
}

export const JURISDICTION_OPTIONS: ReadonlyArray<{ value: JurisdictionFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "AU", label: "Australia" },
  { value: "SG", label: "Singapore" },
];

export function fundsVisibleMessage(count: number): string {
  return count === 0 ? "No funds visible." : count === 1 ? "1 fund visible." : `${count} funds visible.`;
}

/** Spoken after the persona changes. */
export function workingAsMessage(user: Pick<User, "name" | "title">, fundCount: number): string {
  return `Working as ${user.name}, ${user.title}. ${fundsVisibleMessage(fundCount)}`;
}

/** Spoken after the jurisdiction toggle changes. */
export function jurisdictionMessage(filter: JurisdictionFilter, fundCount: number): string {
  const what = filter === "all" ? "all funds" : filter === "AU" ? "Australian funds" : "Singapore funds";
  return `Showing ${what}. ${fundsVisibleMessage(fundCount)}`;
}

/** Footer build stamp: "v0.1.0 · 1a2b3c4 · built 13 Oct 2026". Empty when build info is not available (tests, the dev server). */
export function buildLabel(info: { version: string; sha: string; builtAt: string } | null | undefined): string {
  if (!info) return "";
  const built = /^\d{4}-\d{2}-\d{2}/.test(info.builtAt) ? ` · built ${dateLabel(info.builtAt.slice(0, 10))}` : "";
  return `v${info.version} · ${info.sha}${built}`;
}
