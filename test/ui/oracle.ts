// What the shell should show, worked out from the domain layer (seed data and selectors) rather than from the shell's own components,
// so a test compares the DOM with an independent answer.
import { dateLabel, fundCalc, fundGroups, integer, seedData, visibleFunds, workflowView } from "../../src/domain/index.ts";
import type { AppData, Ctx, Fund, FundGroup, JurisdictionFilter, User, WorkflowView } from "../../src/domain/types.ts";
import { clock } from "./env.ts";
import type { RailGroup, RailToggle } from "./shell.ts";

export interface Oracle {
  data: AppData;
  user: User;
  ctx: Ctx;
  /** What the persona can open, in the order the shell picks "the first visible fund" from. */
  funds: Fund[];
  /** The rail: by market, with each fund's status and exception count. */
  groups: FundGroup[];
  workflow(fundId: string): WorkflowView;
}

/** The demo seed as `userId` sees it with this jurisdiction filter, at the harness clock. */
export function oracle(userId: string, jurisdiction: JurisdictionFilter = "all", data: AppData = seedData()): Oracle {
  const user = data.users.find((candidate) => candidate.id === userId);
  if (!user) throw new Error(`oracle: unknown persona "${userId}".`);
  const ctx: Ctx = { user, now: new Date(clock.now.getTime()) };
  return {
    data,
    user,
    ctx,
    funds: visibleFunds(data, user, jurisdiction),
    groups: fundGroups(data, ctx, jurisdiction),
    workflow: (fundId) => workflowView(data, fundId, ctx),
  };
}

/** "#/trial-balance?fund=southbank": the hash the shell writes for a workspace path, a fund and any other params. */
export function hashFor(path: string, params: Record<string, string> = {}): string {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return `#${path}${query ? `?${query}` : ""}`;
}

/** "No exceptions" / "1 exception" / "3 exceptions". */
export function exceptionsText(count: number): string {
  return count === 0 ? "No exceptions" : count === 1 ? "1 exception" : `${count} exceptions`;
}

/** The rail's second line: "Office · Year ended 30 Jun 2026", "Healthcare · Year ended 30 Sep 2026". */
export function railDetailText(fund: Fund): string {
  return `${fund.sector} · ${fund.periodLabel.replace(/^Income year /, "Year ").replace(/^Distribution period /, "")}`;
}

/** What the rail of a fund workspace (`path`) shows for this persona and jurisdiction, `selectedId` being the open fund. */
export function expectedRail(view: Oracle, path: string, selectedId: string | null, params: Record<string, string> = {}): RailGroup[] {
  return view.groups.map((group) => ({
    label: group.label,
    items: group.funds.map(({ fund }) => {
      const workflow = view.workflow(fund.id);
      return {
        name: fund.name,
        detail: railDetailText(fund),
        status: workflow.status,
        exceptions: exceptionsText(workflow.exceptions),
        href: hashFor(path, { fund: fund.id, ...params }),
        current: fund.id === selectedId,
      };
    }),
  }));
}

/** The rail's disclosure button with `fundId` open: its name and status, the exceptions only when there are some, and the list folded away to begin with. */
export function expectedRailToggle(view: Oracle, fundId: string): RailToggle {
  const fund = view.data.funds.find((candidate) => candidate.id === fundId);
  if (!fund) throw new Error(`expectedRailToggle: no fund "${fundId}".`);
  const workflow = view.workflow(fundId);
  return {
    name: fund.name,
    status: workflow.status,
    exceptions: workflow.exceptions > 0 ? exceptionsText(workflow.exceptions) : null,
    expanded: false,
    controlsList: true,
  };
}

/** "Regime", "Period", "Units on issue" and the statutory due date ("AMMA due" for an AU fund, "Form UT" for an SG one) in the fund header. */
export function expectedFacts(view: Oracle, fund: Fund): Record<string, string> {
  const calc = fundCalc(view.data, fund.id, view.ctx.now);
  const facts: Record<string, string> = {
    Regime: `${fund.regime} · ${fund.sector} · ${fund.listed ? "Listed" : "Unlisted"}`,
    Period: fund.periodLabel,
    "Units on issue": integer(fund.unitsOnIssue),
  };
  if (fund.market === "AU") facts["AMMA due"] = dateLabel(calc.au!.ammaDue);
  else facts["Form UT"] = `YA${fund.assessmentYear} · due ${dateLabel(calc.sg!.formUtDue)}`;
  return facts;
}

/** The approvals list in the fund header, one line per step: "Reviewer done, L. Brennan, 1 Sep 2026", "Tax agent pending", "Sign-off pending · Head of Tax". */
export function expectedSteps(workflow: WorkflowView): string[] {
  const doneBy = (by: string | undefined, at: string | undefined): string => [by, at ? dateLabel(at) : ""].filter(Boolean).join(", ");
  const { signOff } = workflow;
  return [
    ...workflow.approvals.map((approval) => (approval.done ? `${approval.label} done, ${doneBy(approval.by, approval.at)}` : `${approval.label} pending`)),
    signOff.done ? `Sign-off done, ${doneBy(signOff.by, signOff.at)}` : `Sign-off pending${signOff.waitingOn ? ` · ${signOff.waitingOn}` : ""}`,
  ];
}

/** The "N open queries" link of the fund header (it opens the queries tab of Distributions), or null when there is none. */
export function expectedQueries(workflow: WorkflowView): { text: string; href: string } | null {
  const count = workflow.openQueries;
  if (count === 0) return null;
  return { text: count === 1 ? "1 open query" : `${count} open queries`, href: hashFor("/", { fund: workflow.fundId, tab: "queries" }) };
}

/** The workflow buttons the header should offer, in order, with the visible reason of each disabled one. */
export function expectedActions(workflow: WorkflowView): Array<{ label: string; disabled: boolean; reason: string | null }> {
  return workflow.available.map((action) => ({ label: action.label, disabled: !action.enabled, reason: action.enabled ? null : (action.reason ?? null) }));
}