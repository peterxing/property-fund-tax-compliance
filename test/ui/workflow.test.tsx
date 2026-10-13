// The workflow buttons of the fund header (Submit for review, Return to preparer, Approve as reviewer / tax agent, Sign off, Reopen): what each
// persona is offered on each fund, what pressing a button does to the store, the header, the rail and the announcements, and what happens when a
// button is pressed after it has stopped applying. The buttons are compared with the domain (workflowView) and with a table written out by hand.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, seedData } from "../../src/domain/index.ts";
import type { Action, AppData } from "../../src/domain/types.ts";
import { expectAuditsClean, expectFundHeader } from "./expect.ts";
import { clock, mountApp, type MountedApp } from "./harness.tsx";
import { expectedRail, hashFor, oracle } from "./oracle.ts";
import { PERSONAS, fundById, personaById } from "./personas.ts";
import { ROUTES } from "./routes.ts";
import { expectNone, expectSame } from "./same.ts";
import { announced, fundHeaderState, personaSelect, railState, titleFor, toasts } from "./shell.ts";

/** The harness clock: what the audit trail records and what the approvals list shows. */
const NOW = "2026-10-12T09:00:00";
const TODAY = "12 Oct 2026";

/** A workflow button as the header shows it: its label, and for an unavailable one the reason shown beneath it. */
type Offer = readonly [label: string, reason?: string];

const SUBMIT: Offer = ["Submit for review"];
const RETURN: Offer = ["Return to preparer"];
const APPROVE_REVIEW: Offer = ["Approve as reviewer"];
const APPROVE_AGENT: Offer = ["Approve as tax agent"];
const SIGN_OFF: Offer = ["Sign off"];
const REOPEN: Offer = ["Reopen"];
const SIGN_OFF_WAITS_FOR_BOTH: Offer = ["Sign off", "Sign-off waits for: Reviewer and Tax agent approval."];
const SIGN_OFF_WAITS_FOR_AGENT: Offer = ["Sign off", "Sign-off waits for: Tax agent approval."];

/** What each persona is offered on each fund of the demo data, in the order of the buttons; a fund that is not listed offers nothing. */
const OFFERS: Record<string, Record<string, readonly Offer[]>> = {
  "a-moreno": {
    harbourline: [REOPEN],
    southbank: [RETURN, APPROVE_REVIEW, SIGN_OFF_WAITS_FOR_BOTH],
    wattle: [REOPEN],
    kurrajong: [RETURN, APPROVE_REVIEW, SIGN_OFF_WAITS_FOR_BOTH],
    coastline: [SUBMIT],
    "telok-ayer": [SUBMIT],
    loyang: [REOPEN],
    meranti: [RETURN, SIGN_OFF_WAITS_FOR_AGENT],
    kallang: [SUBMIT],
  },
  "l-brennan": { southbank: [RETURN, APPROVE_REVIEW], kurrajong: [RETURN, APPROVE_REVIEW] },
  "n-pillai": { meranti: [RETURN] },
  "r-okafor": { coastline: [SUBMIT] },
  "w-l-teo": { "telok-ayer": [SUBMIT], kallang: [SUBMIT] },
  "d-harrow": { southbank: [APPROVE_AGENT], kurrajong: [APPROVE_AGENT] },
  "s-lim": { meranti: [APPROVE_AGENT] },
  "m-castillo": {},
};

// ---------------------------------------------------------------------------------------------------------------- helpers
function header(app: MountedApp) {
  const state = fundHeaderState(app);
  assert.ok(state, "the page has a fund header");
  return state;
}

const offers = (app: MountedApp): Offer[] => header(app).actions.map((action): Offer => (action.reason ? [action.label, action.reason] : [action.label]));

/** The header without its elements, for comparing with a literal. */
function plain(app: MountedApp) {
  const { name, status, market, actions, facts, governance, steps, queries } = header(app);
  return { name, status, market, actions: actions.map(({ label, disabled, reason }) => ({ label, disabled, reason })), facts, governance, steps, queries };
}

function railLink(app: MountedApp, fundId: string): HTMLElement {
  const href = hashFor("/", { fund: fundId });
  const link = app.$$("a.fund-rail__item").find((candidate) => candidate.getAttribute("href") === href);
  assert.ok(link, `the rail has no link ${href}`);
  return link;
}

/** What the domain makes of `action` done by `userId` at the harness clock. */
function apply(data: AppData, userId: string, action: Action): AppData {
  const user = data.users.find((candidate) => candidate.id === userId);
  assert.ok(user, `unknown persona ${userId}`);
  const result = applyAction(data, action, { user, now: new Date(clock.now.getTime()) });
  assert.ok(result.ok, `${userId}: ${JSON.stringify(action)} should work`);
  return result.data;
}

/** Why the domain refuses `action` done by `userId`. */
function refusal(data: AppData, userId: string, action: Action): string {
  const user = data.users.find((candidate) => candidate.id === userId);
  assert.ok(user, `unknown persona ${userId}`);
  const result = applyAction(data, action, { user, now: new Date(clock.now.getTime()) });
  assert.ok(!result.ok, `${userId}: ${JSON.stringify(action)} should be refused`);
  return result.reason;
}

/** The audit entries `after` has and `before` does not, without their ids. */
function recorded(before: AppData, after: AppData): Array<{ fundId: string; at: string; actor: string; action: string; detail?: string }> {
  const known = new Set(before.audit.map((entry) => entry.id));
  return after.audit
    .filter((entry) => !known.has(entry.id))
    .map((entry) => ({ fundId: entry.fundId, at: entry.at, actor: entry.actor, action: entry.action, ...(entry.detail ? { detail: entry.detail } : {}) }));
}

interface Step {
  /** Who presses the button. */
  userId: string;
  fundId: string;
  /** The label of the button. */
  label: string;
  /** What the domain should be asked to do. */
  action: Action;
  /** The sentence announced afterwards. */
  announcement: string;
  /** The audit trail entry written. */
  audit: { action: string; detail?: string };
  /** The workflow status chip afterwards. */
  status: string;
  /** The approvals list afterwards. */
  steps: string[];
  /** The buttons the same persona is offered afterwards. */
  then: readonly Offer[];
  /** The workspace the button is pressed on (default Distributions). */
  path?: string;
}

/**
 * Presses a header button the way a person does and checks everything the press changes: the store (against the domain), the audit trail, the
 * status chip, the approvals list, the buttons, the rail, the announcement, the focus, and that the page still passes the audits.
 * Returns the data afterwards, for the next step of a chain.
 */
async function press(app: MountedApp, before: AppData, step: Step): Promise<AppData> {
  const where = `${personaById(step.userId).name} presses "${step.label}" on ${fundById(step.fundId).name}`;
  const path = step.path ?? "/";
  expectFundHeader(app, oracle(step.userId, "all", before), step.fundId, `${where}: before`);
  const button = header(app).actions.find((action) => action.label === step.label);
  assert.ok(button, `${where}: offered ${JSON.stringify(offers(app))}`);
  assert.ok(!button.disabled, `${where}: the button is available`);
  const expected = apply(before, step.userId, step.action);
  const pressed = button.element;
  const hash = app.hash();

  await app.click(pressed);

  assert.deepEqual(app.store.getState().data, expected, `${where}: the data`);
  assert.deepEqual(
    recorded(before, expected),
    [{ fundId: step.fundId, at: NOW, actor: personaById(step.userId).name, ...step.audit }],
    `${where}: the audit trail`,
  );
  const view = oracle(step.userId, "all", expected);
  expectFundHeader(app, view, step.fundId, `${where}: after`);
  assert.equal(header(app).status, step.status, `${where}: status`);
  assert.deepEqual(header(app).steps, step.steps, `${where}: approvals`);
  assert.deepEqual(offers(app), step.then, `${where}: the buttons afterwards`);
  assert.deepEqual(railState(app), { empty: null, groups: expectedRail(view, path, step.fundId) }, `${where}: the rail`);
  assert.equal(app.hash(), hash, `${where}: the page stays where it is`);
  assert.equal(announced(app), step.announcement, `${where}: the announcement`);
  assert.deepEqual(toasts(app), [], `${where}: no notice`);
  // A button that went away must not take the focus with it.
  expectSame(document.activeElement, pressed.isConnected ? pressed : app.$("h2.fund-header__name"), `${where}: where the focus is`);
  expectAuditsClean(app, where);
  return expected;
}

/** The notices on screen without their elements. */
const notices = (app: MountedApp) => toasts(app).map(({ tone, role, text }) => ({ tone, role, text }));

// ---------------------------------------------------------------------------------------------------------------- what is offered
describe("the fund header offers each persona what the domain allows", () => {
  for (const persona of PERSONAS) {
    it(`${persona.name} (${persona.title}): every fund they can open`, async () => {
      const view = oracle(persona.id);
      const table = OFFERS[persona.id]!;
      const app = await mountApp({ user: persona.id });
      for (const fund of view.funds) {
        const where = `${persona.name} on ${fund.name} (${fund.status})`;
        if (app.ui().selectedFundId !== fund.id) await app.click(railLink(app, fund.id));
        assert.equal(app.ui().selectedFundId, fund.id, `${where}: the open fund`);
        expectFundHeader(app, view, fund.id, where);
        assert.deepEqual(offers(app), table[fund.id] ?? [], `${where}: the buttons`);
      }
      assert.deepEqual(
        Object.keys(table).filter((id) => !view.funds.some((fund) => fund.id === id)),
        [],
        "the table lists only funds the persona can open",
      );
    });
  }

  it("the demo data gives somebody every workflow button, so the sweeps above see each one", () => {
    const seen = { available: new Set<string>(), unavailable: new Set<string>() };
    const statuses = new Set<string>();
    for (const persona of PERSONAS) {
      const view = oracle(persona.id);
      for (const fund of view.funds) {
        const workflow = view.workflow(fund.id);
        statuses.add(workflow.status);
        for (const action of workflow.available) (action.enabled ? seen.available : seen.unavailable).add(action.action);
      }
    }
    assert.deepEqual([...statuses].sort(), ["In review", "Preparing", "Signed off"]);
    assert.deepEqual([...seen.available].sort(), ["approve-agent", "approve-review", "reopen", "return", "submit"]);
    assert.deepEqual([...seen.unavailable].sort(), ["sign-off"]);
  });

  it("spells the header out: Harbourline (signed off), Southbank (in review), Kurrajong (two open queries) and Telok Ayer (Singapore)", async () => {
    const app = await mountApp({ user: "a-moreno" });
    assert.deepEqual(plain(app), {
      name: "Harbourline Office Trust",
      status: "Signed off",
      market: "Australia",
      actions: [{ label: "Reopen", disabled: false, reason: null }],
      facts: { Regime: "AMIT · Office · Listed", Period: "Income year ended 30 Jun 2026", "Units on issue": "1,412,680,000", "AMMA due": "30 Sep 2026" },
      governance: "Tax agent signs off; you lodge",
      steps: ["Reviewer done, L. Brennan, 1 Sep 2026", "Tax agent done, D. Harrow, 7 Sep 2026", "Sign-off done, A. Moreno, 9 Sep 2026"],
      queries: null,
    });

    await app.click(railLink(app, "southbank"));
    assert.deepEqual(plain(app), {
      name: "Southbank Industrial Partners Fund",
      status: "In review",
      market: "Australia",
      actions: [
        { label: "Return to preparer", disabled: false, reason: null },
        { label: "Approve as reviewer", disabled: false, reason: null },
        { label: "Sign off", disabled: true, reason: "Sign-off waits for: Reviewer and Tax agent approval." },
      ],
      facts: { Regime: "AMIT · Logistics · Unlisted", Period: "Income year ended 30 Jun 2026", "Units on issue": "684,215,000", "AMMA due": "30 Sep 2026" },
      governance: "Tax agent reviews and lodges",
      steps: ["Reviewer pending", "Tax agent pending", "Sign-off pending · Head of Tax"],
      queries: { text: "1 open query", href: "#/?fund=southbank&tab=queries" },
    });

    await app.click(railLink(app, "kurrajong"));
    assert.deepEqual(header(app).queries, { text: "2 open queries", href: "#/?fund=kurrajong&tab=queries" });

    await app.click(railLink(app, "telok-ayer"));
    assert.deepEqual(plain(app), {
      name: "Telok Ayer Commercial REIT",
      status: "Preparing",
      market: "Singapore",
      actions: [{ label: "Submit for review", disabled: false, reason: null }],
      facts: {
        Regime: "S-REIT · Office & retail · Listed",
        Period: "Distribution period 1 Jul – 30 Sep 2026",
        "Units on issue": "4,236,180,000",
        "Form UT": "YA2027 · due 15 Apr 2027",
      },
      governance: "Tax agent signs off; you lodge",
      steps: ["Reviewer pending", "Tax agent pending", "Sign-off pending · Head of Tax"],
      queries: null,
    });
  });

  it("heads every fund workspace with the same buttons, and no portfolio workspace has any", async () => {
    const app = await mountApp({ user: "a-moreno", fund: "southbank" });
    const view = oracle("a-moreno");
    for (const route of ROUTES) {
      await app.navigate(route.hash);
      if (route.scope === "fund") {
        assert.equal(app.hash(), `${route.hash}?fund=southbank`, route.label);
        expectFundHeader(app, view, "southbank", route.label);
        assert.deepEqual(offers(app), OFFERS["a-moreno"]!.southbank, `${route.label}: the buttons`);
      } else {
        assert.equal(fundHeaderState(app), null, `${route.label}: no fund header`);
        expectNone(app.queryByRole("group", "Workflow actions"), `${route.label}: no workflow buttons`);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------- pressing a button
describe("pressing a workflow button", () => {
  it("Submit for review: R. Okafor sends Coastline from Preparing to In review", async () => {
    const app = await mountApp({ user: "r-okafor", fund: "coastline" });
    const after = await press(app, seedData(), {
      userId: "r-okafor",
      fundId: "coastline",
      label: "Submit for review",
      action: { type: "submit", fundId: "coastline" },
      announcement: "Coastline Healthcare Property Fund submitted for review.",
      audit: { action: "Submitted for review" },
      status: "In review",
      steps: ["Reviewer pending", "Sign-off pending · Head of Tax"],
      then: [],
    });
    assert.equal(after.funds.find((fund) => fund.id === "coastline")?.status, "In review");
    expectNone(app.queryByRole("group", "Workflow actions"), "a preparer has nothing more to press on a fund in review");
  });

  it("Approve as reviewer: L. Brennan approves Southbank, which stays In review and waits for the tax agent", async () => {
    const app = await mountApp({ user: "l-brennan", fund: "southbank" });
    await press(app, seedData(), {
      userId: "l-brennan",
      fundId: "southbank",
      label: "Approve as reviewer",
      action: { type: "approve", fundId: "southbank", level: "review" },
      announcement: "Southbank Industrial Partners Fund approved as reviewer.",
      audit: { action: "Approved — reviewer" },
      status: "In review",
      steps: [`Reviewer done, L. Brennan, ${TODAY}`, "Tax agent pending", "Sign-off pending · Head of Tax"],
      then: [RETURN],
    });
  });

  it("Approve as tax agent: D. Harrow approves Southbank", async () => {
    const app = await mountApp({ user: "d-harrow", fund: "southbank" });
    await press(app, seedData(), {
      userId: "d-harrow",
      fundId: "southbank",
      label: "Approve as tax agent",
      action: { type: "approve", fundId: "southbank", level: "agent" },
      announcement: "Southbank Industrial Partners Fund approved as tax agent.",
      audit: { action: "Approved — tax agent" },
      status: "In review",
      steps: ["Reviewer pending", `Tax agent done, D. Harrow, ${TODAY}`, "Sign-off pending · Head of Tax"],
      then: [],
    });
  });

  it("Return to preparer: N. Pillai sends Meranti back and its approvals are cleared", async () => {
    const app = await mountApp({ user: "n-pillai", fund: "meranti" });
    assert.deepEqual(header(app).steps, ["Reviewer done, N. Pillai, 9 Oct 2026", "Tax agent pending", "Sign-off pending · Head of Tax"]);
    await press(app, seedData(), {
      userId: "n-pillai",
      fundId: "meranti",
      label: "Return to preparer",
      action: { type: "return", fundId: "meranti" },
      announcement: "Meranti Digital Infrastructure REIT returned to the preparer.",
      audit: { action: "Returned to preparer" },
      status: "Preparing",
      steps: ["Reviewer pending", "Tax agent pending", "Sign-off pending · Head of Tax"],
      then: [],
    });
  });

  it("Reopen: A. Moreno reopens Harbourline, which goes back to Preparing with no approvals", async () => {
    const app = await mountApp({ user: "a-moreno", fund: "harbourline" });
    await press(app, seedData(), {
      userId: "a-moreno",
      fundId: "harbourline",
      label: "Reopen",
      action: { type: "reopen", fundId: "harbourline" },
      announcement: "Harbourline Office Trust reopened for editing.",
      audit: { action: "Reopened", detail: "Sign-off removed; components unlocked" },
      status: "Preparing",
      steps: ["Reviewer pending", "Tax agent pending", "Sign-off pending · Head of Tax"],
      then: [SUBMIT],
    });
  });

  it("Sign off: Southbank goes from reviewer to tax agent to the Head of Tax's sign-off, and can be reopened (switching persona between the steps)", async () => {
    const app = await mountApp({ user: "l-brennan", fund: "southbank" });
    const fundId = "southbank";
    const name = "Southbank Industrial Partners Fund";
    let data = seedData();

    data = await press(app, data, {
      userId: "l-brennan",
      fundId,
      label: "Approve as reviewer",
      action: { type: "approve", fundId, level: "review" },
      announcement: `${name} approved as reviewer.`,
      audit: { action: "Approved — reviewer" },
      status: "In review",
      steps: [`Reviewer done, L. Brennan, ${TODAY}`, "Tax agent pending", "Sign-off pending · Head of Tax"],
      then: [RETURN],
    });

    await app.select(personaSelect(app), "d-harrow");
    assert.equal(app.ui().selectedFundId, fundId, "the open fund stays when the new persona can see it");
    assert.deepEqual(offers(app), [APPROVE_AGENT]);
    data = await press(app, data, {
      userId: "d-harrow",
      fundId,
      label: "Approve as tax agent",
      action: { type: "approve", fundId, level: "agent" },
      announcement: `${name} approved as tax agent.`,
      audit: { action: "Approved — tax agent" },
      status: "In review",
      steps: [`Reviewer done, L. Brennan, ${TODAY}`, `Tax agent done, D. Harrow, ${TODAY}`, "Sign-off pending · Head of Tax"],
      then: [],
    });

    await app.select(personaSelect(app), "a-moreno");
    assert.deepEqual(offers(app), [RETURN, SIGN_OFF], "with both approvals in, Sign off is available to the Head of Tax");
    data = await press(app, data, {
      userId: "a-moreno",
      fundId,
      label: "Sign off",
      action: { type: "sign-off", fundId },
      announcement: `${name} signed off.`,
      audit: { action: "Signed off", detail: "Components and withholding locked" },
      status: "Signed off",
      steps: [`Reviewer done, L. Brennan, ${TODAY}`, `Tax agent done, D. Harrow, ${TODAY}`, `Sign-off done, A. Moreno, ${TODAY}`],
      then: [REOPEN],
    });

    await press(app, data, {
      userId: "a-moreno",
      fundId,
      label: "Reopen",
      action: { type: "reopen", fundId },
      announcement: `${name} reopened for editing.`,
      audit: { action: "Reopened", detail: "Sign-off removed; components unlocked" },
      status: "Preparing",
      steps: ["Reviewer pending", "Tax agent pending", "Sign-off pending · Head of Tax"],
      then: [SUBMIT],
    });
  });

  it("a fund with no tax agent step, and the person who submitted it cannot approve it: Coastline from Preparing to Signed off", async () => {
    const app = await mountApp({ user: "a-moreno", fund: "coastline" });
    const fundId = "coastline";
    const name = "Coastline Healthcare Property Fund";
    let data = seedData();

    data = await press(app, data, {
      userId: "a-moreno",
      fundId,
      label: "Submit for review",
      action: { type: "submit", fundId },
      announcement: `${name} submitted for review.`,
      audit: { action: "Submitted for review" },
      status: "In review",
      steps: ["Reviewer pending", "Sign-off pending · Head of Tax"],
      then: [RETURN, ["Approve as reviewer", "You submitted this fund"], ["Sign off", "Sign-off waits for: Reviewer approval."]],
    });

    // An unavailable button can be focused but does nothing.
    const unavailable = header(app).actions.find((action) => action.label === "Approve as reviewer")!;
    assert.equal(unavailable.disabled, true);
    const stored = app.store.getState().data;
    assert.deepEqual(stored, data);
    await app.click(unavailable.element);
    assert.equal(app.store.getState().data, stored, "nothing was recorded");
    assert.deepEqual(toasts(app), [], "and nothing was said");
    assert.equal(announced(app), `${name} submitted for review.`);
    expectSame(document.activeElement, unavailable.element, "the button keeps the focus");
    assert.match(app.text(), /You submitted this fund/);

    await app.select(personaSelect(app), "l-brennan");
    assert.deepEqual(offers(app), [RETURN, APPROVE_REVIEW]);
    data = await press(app, data, {
      userId: "l-brennan",
      fundId,
      label: "Approve as reviewer",
      action: { type: "approve", fundId, level: "review" },
      announcement: `${name} approved as reviewer.`,
      audit: { action: "Approved — reviewer" },
      status: "In review",
      steps: [`Reviewer done, L. Brennan, ${TODAY}`, "Sign-off pending · Head of Tax"],
      then: [RETURN],
    });

    await app.select(personaSelect(app), "a-moreno");
    assert.deepEqual(offers(app), [RETURN, SIGN_OFF]);
    await press(app, data, {
      userId: "a-moreno",
      fundId,
      label: "Sign off",
      action: { type: "sign-off", fundId },
      announcement: `${name} signed off.`,
      audit: { action: "Signed off", detail: "Components and withholding locked" },
      status: "Signed off",
      steps: [`Reviewer done, L. Brennan, ${TODAY}`, `Sign-off done, A. Moreno, ${TODAY}`],
      then: [REOPEN],
    });
  });

  it("on another workspace the same button does the same and the page stays on it", async () => {
    const app = await mountApp({ hash: "#/tax-returns", user: "l-brennan", fund: "southbank" });
    assert.equal(app.hash(), "#/tax-returns?fund=southbank");
    await press(app, seedData(), {
      userId: "l-brennan",
      fundId: "southbank",
      label: "Approve as reviewer",
      action: { type: "approve", fundId: "southbank", level: "review" },
      announcement: "Southbank Industrial Partners Fund approved as reviewer.",
      audit: { action: "Approved — reviewer" },
      status: "In review",
      steps: [`Reviewer done, L. Brennan, ${TODAY}`, "Tax agent pending", "Sign-off pending · Head of Tax"],
      then: [RETURN],
      path: "/tax-returns",
    });
    assert.equal(document.title, titleFor("Tax returns", "Southbank Industrial Partners Fund"));
  });

  it("works from the keyboard: Enter and Space press an available button; an unavailable one can be focused and does nothing", async () => {
    const app = await mountApp({ user: "a-moreno", fund: "kallang" });
    const name = "Kallang Riverside Retail REIT";
    const submit = header(app).actions[0]!;
    await app.focus(submit.element);
    expectSame(document.activeElement, submit.element, "focus is on the button");
    await app.press(submit.element, "Enter");
    assert.equal(header(app).status, "In review");
    assert.equal(announced(app), `${name} submitted for review.`);

    const unavailable = header(app).actions.find((action) => action.label === "Approve as reviewer")!;
    const data = app.store.getState().data;
    await app.focus(unavailable.element);
    expectSame(document.activeElement, unavailable.element, "an unavailable button can be focused");
    await app.press(unavailable.element, "Enter");
    await app.press(unavailable.element, " ");
    assert.equal(app.store.getState().data, data, "Enter and Space do nothing on it");
    assert.equal(header(app).status, "In review");
    assert.deepEqual(toasts(app), []);

    const back = header(app).actions.find((action) => action.label === "Return to preparer")!;
    await app.focus(back.element);
    await app.press(back.element, " ");
    assert.equal(header(app).status, "Preparing", "Space presses a button too");
    assert.equal(announced(app), `${name} returned to the preparer.`);
  });
});

// ---------------------------------------------------------------------------------------------------------------- a button that no longer applies
describe("a button pressed after it has stopped applying", () => {
  /** Presses `stale`, a button of the page as it was drawn, after `change` has moved the store on but before React has drawn the change. */
  async function pressStale(app: MountedApp, stale: HTMLElement, change: () => void): Promise<void> {
    await app.act(() => {
      change();
      stale.click();
    });
  }

  it("the persona changed: the reason comes in a notice that is read out (role=alert), nothing is recorded, and the notice can be dismissed", async () => {
    const app = await mountApp({ user: "a-moreno", fund: "southbank" });
    const before = app.store.getState().data;
    const stale = header(app).actions.find((action) => action.label === "Approve as reviewer")!.element;
    const reason = refusal(before, "m-castillo", { type: "approve", fundId: "southbank", level: "review" });
    assert.equal(reason, "You don't have permission to approve as reviewer");

    await pressStale(app, stale, () => app.store.setUser("m-castillo"));

    assert.deepEqual(notices(app), [{ tone: "error", role: "alert", text: reason }]);
    assert.equal(app.store.getState().data, before, "nothing was recorded");
    assert.equal(announced(app), "", "nothing was announced as done");
    expectFundHeader(app, oracle("m-castillo"), "southbank", "the page now belongs to M. Castillo");
    expectNone(app.queryByRole("group", "Workflow actions"), "M. Castillo has no buttons");
    expectAuditsClean(app, "a page with a notice");

    await app.click(app.byRole("button", "Dismiss notification"));
    assert.deepEqual(toasts(app), []);
    expectNone(app.maybe(".toasts"), "the notice region goes with its last notice");
  });

  it("the persona lost access to the fund: \"You don't have access to this fund\"", async () => {
    const app = await mountApp({ user: "r-okafor", fund: "coastline" });
    const before = app.store.getState().data;
    const stale = header(app).actions[0]!.element;
    const reason = refusal(before, "w-l-teo", { type: "submit", fundId: "coastline" });
    assert.equal(reason, "You don't have access to this fund");

    await pressStale(app, stale, () => app.store.setUser("w-l-teo"));

    assert.deepEqual(notices(app), [{ tone: "error", role: "alert", text: reason }]);
    assert.equal(app.store.getState().data, before);
    assert.equal(app.ui().selectedFundId, "telok-ayer", "the page moved to a fund W. L. Teo can open");
    expectFundHeader(app, oracle("w-l-teo"), "telok-ayer", "the page now belongs to W. L. Teo");
  });

  it("the fund moved on: Submit for review on a fund somebody else has already submitted", async () => {
    const app = await mountApp({ user: "w-l-teo", fund: "kallang" });
    const before = app.store.getState().data;
    const stale = header(app).actions[0]!.element;
    const reason = refusal(apply(before, "a-moreno", { type: "submit", fundId: "kallang" }), "w-l-teo", { type: "submit", fundId: "kallang" });
    assert.equal(reason, "Only a fund being prepared can be submitted for review");

    await pressStale(app, stale, () => {
      app.store.setUser("a-moreno");
      app.store.dispatch({ type: "submit", fundId: "kallang" });
      app.store.setUser("w-l-teo");
    });

    const submittedMeanwhile = apply(before, "a-moreno", { type: "submit", fundId: "kallang" });
    assert.deepEqual(notices(app), [{ tone: "error", role: "alert", text: reason }]);
    assert.deepEqual(app.store.getState().data, submittedMeanwhile, "only the other person's submission is recorded");
    expectFundHeader(app, oracle("w-l-teo", "all", submittedMeanwhile), "kallang", "the page shows the fund as it is now");
    assert.equal(header(app).status, "In review");
    assert.equal(announced(app), "");
  });
});

// ------------------------------------------------------------------------------------------------- the comparison has teeth
/** The last piece of visible text inside `root`: what a chip, a fact or a step ends with. */
function lastText(root: Node): Text {
  const found: Text[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 && (child.nodeValue ?? "").trim() !== "") found.push(child as Text);
      else walk(child);
    }
  };
  walk(root);
  const last = found[found.length - 1];
  assert.ok(last, "the element has text");
  return last;
}

/** Each damage changes the page in place and returns the function that repairs it; nothing re-renders in between. */
const setAttribute = (element: Element, name: string, value: string | null) => (): (() => void) => {
  const before = element.getAttribute(name);
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
  return () => (before === null ? element.removeAttribute(name) : element.setAttribute(name, before));
};

const setText = (root: Element, value: string) => (): (() => void) => {
  const node = lastText(root);
  const before = node.nodeValue;
  node.nodeValue = value;
  return () => {
    node.nodeValue = before;
  };
};

const moveInto = (node: Element, destination: Element) => (): (() => void) => {
  const parent = node.parentNode!;
  const next = node.nextSibling;
  destination.append(node);
  return () => {
    parent.insertBefore(node, next);
  };
};

describe("the header comparison is not vacuous", () => {
  it("fails on another persona, fund, state or text, and on broken button markup, then passes again once the damage is undone", async () => {
    const app = await mountApp({ user: "a-moreno", fund: "southbank" });
    const view = oracle("a-moreno");
    expectFundHeader(app, view, "southbank", "the header as it is");
    const state = header(app);
    const [giveBack, takeBack, signOff] = state.actions.map((action) => action.element);
    assert.ok(giveBack && takeBack && signOff, "A. Moreno is offered three buttons on Southbank");
    assert.deepEqual(state.actions.map((action) => [action.label, action.disabled]), [["Return to preparer", false], ["Approve as reviewer", false], ["Sign off", true]]);
    const reason = document.getElementById(state.actions[2]!.describedBy ?? "");
    assert.ok(reason, "the unavailable button points at its reason");
    const group = app.byRole("group", "Workflow actions");
    const banner = app.$("header.fund-header");
    const inHeader = (selector: string): HTMLElement => {
      const found = banner.querySelector<HTMLElement>(selector);
      assert.ok(found, `the fund header has ${selector}`);
      return found;
    };
    const queries = inHeader(".fund-chain__queries a");

    // The oracle describes another persona, another fund, another state of the data.
    assert.throws(() => expectFundHeader(app, oracle("l-brennan"), "southbank", "teeth"), /teeth: workflow buttons/);
    assert.throws(() => expectFundHeader(app, view, "harbourline", "teeth"), /teeth: name/);
    const returned = oracle("a-moreno", "all", apply(seedData(), "a-moreno", { type: "return", fundId: "southbank" }));
    assert.throws(() => expectFundHeader(app, returned, "southbank", "teeth"), /teeth: status/);
    assert.throws(() => expectFundHeader(app, view, "no-such-fund", "teeth"), /no fund "no-such-fund"/);

    // The page itself is damaged.
    const damages: ReadonlyArray<readonly [what: string, damage: () => () => void, message: RegExp]> = [
      ["an available button that says it is unavailable", setAttribute(giveBack, "aria-disabled", "true"), /teeth: workflow buttons/],
      ["an unavailable button that says it is available", setAttribute(signOff, "aria-disabled", null), /teeth: workflow buttons/],
      ["an unavailable button without its reason", setAttribute(signOff, "aria-describedby", null), /teeth: workflow buttons/],
      ["an unavailable button that cannot be focused", setAttribute(signOff, "disabled", ""), /teeth: "Sign off" stays focusable/],
      ["a reason nobody can see", setAttribute(reason, "hidden", ""), /teeth: "Sign off": the reason is visible/],
      ["a reason shown beside another button", moveInto(reason, takeBack.closest(".fund-action")!), /teeth: "Sign off": the reason is shown with its button/],
      ["a button group with another name", setAttribute(group, "aria-label", "Actions"), /teeth: the button group is there/],
      ["a button whose name is not its label", setAttribute(takeBack, "aria-label", "Approve"), /teeth: "Approve as reviewer": accessible name/],
      ["a button that Tab skips", setAttribute(giveBack, "tabindex", "-1"), /teeth: "Return to preparer" is reachable with Tab/],
      ["another fund name", setText(inHeader("h2"), "Southbank Retail"), /teeth: name/],
      ["another market", setText(inHeader(".chip--market .sr-only"), "Elsewhere"), /teeth: market/],
      ["another status", setText(inHeader(".chip--status"), "Draft"), /teeth: status/],
      ["another fact", setText(inHeader(".fund-fact dd"), "n/a"), /teeth: facts/],
      ["another governance", setText(inHeader(".fund-chain__label"), "No tax agent"), /teeth: governance/],
      ["another approval", setText(inHeader(".fund-chain__step"), "Reviewer done"), /teeth: approvals/],
      ["another query count", setText(queries, "9 open queries"), /teeth: open queries/],
      ["another query link", setAttribute(queries, "href", "#/"), /teeth: open queries/],
    ];
    for (const [what, damage, message] of damages) {
      const repair = damage();
      try {
        assert.throws(() => expectFundHeader(app, view, "southbank", "teeth"), message, what);
      } finally {
        repair();
      }
      expectFundHeader(app, view, "southbank", `the header after ${what} is repaired`);
    }
    expectAuditsClean(app, "the header after all of that");
  });
});
