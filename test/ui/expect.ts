// Assertions on the shell that several test files share: what a fund workspace shows for a persona and jurisdiction, and the sentences the shell
// announces. The expected values come from the domain oracle (oracle.ts) and from the wording in the design spec, not from the shell's components.
import assert from "node:assert/strict";
import type { JurisdictionFilter } from "../../src/domain/types.ts";
import { ALLOWANCES } from "./allowlist.ts";
import { applyAllowances, auditPage, expectClean } from "./audit.ts";
import { accessibleDescription, accessibleName, isTabStop, visibleText } from "./dom.ts";
import type { MountedApp } from "./harness.tsx";
import { expectedActions, expectedFacts, expectedQueries, expectedRail, expectedRailToggle, expectedSteps, hashFor, type Oracle } from "./oracle.ts";
import type { Persona } from "./personas.ts";
import { expectSame } from "./same.ts";
import { fundHeaderState, navLinks, railState, railToggle, titleFor } from "./shell.ts";

export const FILTER_LABEL: Record<JurisdictionFilter, string> = { all: "All", AU: "Australia", SG: "Singapore" };

const fundsVisible = (count: number): string => (count === 0 ? "No funds visible." : count === 1 ? "1 fund visible." : `${count} funds visible.`);

/** Announced after the persona changes: "Working as L. Brennan, Tax manager, Australia. 5 funds visible." */
export const workingAs = (persona: Persona, count: number): string => `Working as ${persona.name}, ${persona.title}. ${fundsVisible(count)}`;

/** Announced after the jurisdiction changes: "Showing Australian funds. 5 funds visible." */
export const showing = (filter: JurisdictionFilter, count: number): string =>
  `Showing ${filter === "all" ? "all funds" : filter === "AU" ? "Australian funds" : "Singapore funds"}. ${fundsVisible(count)}`;

/** The fund the shell opens: the one asked for when the persona can see it, else the first visible fund (null when there is none). */
export function openFund(view: Oracle, preferred: string | null): string | null {
  return preferred !== null && view.funds.some((fund) => fund.id === preferred) ? preferred : (view.funds[0]?.id ?? null);
}

/** A fund workspace (`path`, `label`) for what `view` allows, with `selected` open: rail, hash, title and fund header; or the empty state. */
export function expectFundPage(app: MountedApp, path: string, label: string, view: Oracle, selected: string | null, filter: JurisdictionFilter, where: string): void {
  assert.equal(app.ui().selectedFundId, selected, `${where}: the open fund`);
  const fund = view.funds.find((candidate) => candidate.id === selected);
  if (!fund) {
    assert.equal(selected, null, where);
    assert.equal(fundHeaderState(app), null, `${where}: no fund header`);
    assert.deepEqual(
      railState(app),
      { groups: [], empty: filter === "all" ? "No funds assigned to this persona." : "No funds assigned to this persona in this jurisdiction." },
      where,
    );
    assert.equal(document.title, titleFor(label), where);
    assert.equal(railToggle(app), null, `${where}: no rail button without funds`);
    const main = app.byRole("main");
    assert.match(main.textContent ?? "", /No funds assigned to this persona/, where);
    assert.match(main.textContent ?? "", /Nothing is visible with the (Australia|Singapore) filter on\. Choose another persona, or set the jurisdiction to All\./, where);
    for (const link of navLinks(app)) assert.ok(!link.getAttribute("href")!.includes("fund="), `${where}: links carry no fund`);
    return;
  }
  assert.deepEqual(railState(app), { empty: null, groups: expectedRail(view, path, fund.id) }, `${where}: the rail`);
  assert.deepEqual(railToggle(app), expectedRailToggle(view, fund.id), `${where}: the rail's button`);
  assert.equal(app.hash(), hashFor(path, { fund: fund.id }), `${where}: the hash`);
  assert.equal(document.title, titleFor(label, fund.name), `${where}: the title`);
  const header = fundHeaderState(app);
  assert.equal(header?.name, fund.name, `${where}: the fund header`);
  assert.equal(header?.status, view.workflow(fund.id).status, where);
}

/** The page passes audits (a)-(g) apart from what allowlist.ts tolerates. */
export function expectAuditsClean(app: MountedApp, where: string): void {
  expectClean(applyAllowances(auditPage(app.container), ALLOWANCES).unexpected, `${where} (${app.hash()})`);
}

/** The header of a fund workspace shows what the domain says about `fundId` for the persona and data in `view`: status, facts, approvals, queries and the workflow buttons. */
export function expectFundHeader(app: MountedApp, view: Oracle, fundId: string, where: string): void {
  const fund = view.data.funds.find((candidate) => candidate.id === fundId);
  assert.ok(fund, `${where}: no fund "${fundId}" in the data`);
  const workflow = view.workflow(fundId);
  const header = fundHeaderState(app);
  assert.ok(header, `${where}: the fund header`);
  assert.equal(header.name, fund.name, `${where}: name`);
  assert.equal(header.market, fund.market === "AU" ? "Australia" : "Singapore", `${where}: market`);
  assert.equal(header.status, workflow.status, `${where}: status`);
  assert.deepEqual(header.facts, expectedFacts(view, fund), `${where}: facts`);
  assert.equal(header.governance, workflow.governance.label, `${where}: governance`);
  assert.deepEqual(header.steps, expectedSteps(workflow), `${where}: approvals`);
  assert.deepEqual(header.queries, expectedQueries(workflow), `${where}: open queries`);

  assert.deepEqual(
    header.actions.map(({ label, disabled, reason }) => ({ label, disabled, reason })),
    expectedActions(workflow),
    `${where}: workflow buttons`,
  );
  const group = app.queryByRole("group", "Workflow actions");
  assert.equal(group !== null, workflow.available.length > 0, `${where}: the button group is there exactly when there are buttons`);
  for (const action of header.actions) {
    const button = action.element;
    const what = `${where}: "${action.label}"`;
    assert.ok(group?.contains(button), `${what} sits in the Workflow actions group`);
    assert.equal(accessibleName(button), action.label, `${what}: accessible name`);
    assert.equal(button.getAttribute("type"), "button", what);
    assert.ok(!button.hasAttribute("disabled"), `${what} stays focusable when it is unavailable`);
    assert.ok(isTabStop(button), `${what} is reachable with Tab`);
    if (!action.disabled) {
      assert.ok(!button.hasAttribute("aria-disabled") && action.describedBy === null, `${what}: an available button carries no disabled state or reason`);
      continue;
    }
    const reason = action.describedBy ? document.getElementById(action.describedBy) : null;
    assert.ok(reason, `${what}: aria-describedby points at the reason`);
    expectSame(reason.closest(".fund-action"), button.closest(".fund-action"), `${what}: the reason is shown with its button`);
    assert.equal(accessibleDescription(button), action.reason, `${what}: accessible description`);
    assert.equal(visibleText(reason).trim(), action.reason, `${what}: the reason is visible`);
  }
}