// The error boundary (src/app/shell/ErrorBoundary.tsx): what a visitor sees when a screen throws, what the two buttons do, when the card goes
// away by itself, and how the real shell and its frames contain a crash so that the header, the rail, the navigation and the persona switcher
// stay usable. A crash is staged with a child that throws on demand and, in the shell, by swapping the component of an entry of WORKSPACES.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComponentType, ReactNode } from "react";
import { ErrorBoundary } from "../../src/app/shell/ErrorBoundary.tsx";
import { FundWorkspaceFrame } from "../../src/app/shell/FundWorkspaceFrame.tsx";
import { PortfolioFrame } from "../../src/app/shell/PortfolioFrame.tsx";
import { appStore } from "../../src/app/state.tsx";
import { WORKSPACES } from "../../src/app/workspaces/index.ts";
import { STORAGE_KEY, seedData } from "../../src/domain/index.ts";
import type { Fund } from "../../src/domain/types.ts";
import { ALLOWANCES } from "./allowlist.ts";
import { applyAllowances, auditPage, expectClean, type Allowance } from "./audit.ts";
import { accessibleName } from "./dom.ts";
import { expectAuditsClean, expectFundHeader, openFund } from "./expect.ts";
import { MemoryStorage, expectConsole, importFresh, mountApp, peekStore, render, storage, type MountedApp, type Rendered } from "./harness.tsx";
import { expectedRail, hashFor, oracle, type Oracle } from "./oracle.ts";
import { expectNone } from "./same.ts";
import { fundHeaderState, navLinks, personaSelect, railState, titleFor } from "./shell.ts";

const explanation = (subject: string): string =>
  `${subject} hit an unexpected error. Your demo data lives only in this browser, so resetting it restores the original sample funds if a saved change is the cause.`;

/** A screen that throws `thrown` for as long as `fault.on` is set. */
interface Fault {
  on: boolean;
  thrown: unknown;
}

function screenWith(fault: Fault) {
  return function Boom(): ReactNode {
    if (fault.on) throw fault.thrown;
    return <p>The screen works.</p>;
  };
}

/** React reports every error a boundary catches with console.error, so a test that makes screens throw expects those reports. */
function expectCaught(times = 1, component = "Boom"): void {
  expectConsole(new RegExp(`error occurred in the <${component}> component`), times);
}

/** jsdom cannot reload a page: it says so, and that is how the tests see that the boundary asked for a reload. */
function expectReload(): void {
  expectConsole(/Not implemented: navigation/i);
}

const fragmentIsClean = (view: Rendered, where: string): void => expectClean(auditPage(view.container, { scope: "fragment" }), where);

const buttons = (view: Rendered): string[] => view.allByRole("button").map((button) => accessibleName(button));

// -------------------------------------------------------------------------------------------------------------------- the card
describe("a screen that throws", () => {
  it("a workspace is replaced, inside <main>, by one calm card: heading, plain explanation, the error's message, two buttons", async () => {
    expectCaught();
    const fault: Fault = { on: true, thrown: new Error("The trial balance has no rows to total") };
    const Boom = screenWith(fault);
    const view = await render(
      <ErrorBoundary scope="workspace">
        <Boom />
      </ErrorBoundary>,
    );

    const card = view.byRole("alert");
    assert.equal(card.className, "error-card error-card--workspace");
    assert.deepEqual(view.allByRole("heading").map((heading) => [heading.localName, heading.textContent]), [["h2", "Something went wrong"]]);
    assert.equal(view.$(".error-card__text").textContent, explanation("This workspace"));
    assert.equal(view.$(".error-card__detail").textContent, "The trial balance has no rows to total");
    assert.deepEqual(buttons(view), ["Try again", "Reset demo data"]);
    const main = view.byRole("main");
    assert.equal(main.id, "main", "the skip link finds it");
    assert.equal(main.getAttribute("tabindex"), "-1", "and can focus it");
    assert.equal(main.className, "error-page error-page--workspace");
    assert.ok(main.contains(card));
    assert.ok(!view.text().includes("The screen works."), "the broken screen is gone");
    fragmentIsClean(view, "the workspace card");
  });

  it("the app-level card is the whole page: an h1 and the main landmark", async () => {
    expectCaught();
    const Boom = screenWith({ on: true, thrown: new Error("The store is damaged") });
    const view = await render(
      <ErrorBoundary scope="app">
        <Boom />
      </ErrorBoundary>,
    );

    assert.equal(view.byRole("alert").className, "error-card error-card--app");
    assert.deepEqual(view.allByRole("heading").map((heading) => [heading.localName, heading.textContent]), [["h1", "Something went wrong"]]);
    assert.equal(view.$(".error-card__text").textContent, explanation("The app"));
    assert.equal(view.$(".error-card__detail").textContent, "The store is damaged");
    assert.deepEqual(buttons(view), ["Try again", "Reset demo data"]);
    assert.equal(view.byRole("main").className, "error-page error-page--app");
    assert.equal(view.byRole("main").id, "main");
    fragmentIsClean(view, "the app card");
  });

  it("a panel card is only a card (an h3, no <main>) and what is around it keeps working", async () => {
    expectCaught();
    const Boom = screenWith({ on: true, thrown: new Error("The chart needs data") });
    const view = await render(
      <div className="host">
        <h2>Fund page</h2>
        <ErrorBoundary scope="panel">
          <Boom />
        </ErrorBoundary>
        <p>Another panel.</p>
      </div>,
    );

    expectNone(view.queryByRole("main"), "a panel is not a page");
    assert.equal(view.byRole("alert").className, "error-card error-card--panel");
    assert.equal(view.byRole("alert").parentElement?.className, "host", "the card sits where the panel was");
    assert.deepEqual(view.allByRole("heading").map((heading) => [heading.localName, heading.textContent]), [["h2", "Fund page"], ["h3", "Something went wrong"]]);
    assert.equal(view.$(".error-card__text").textContent, explanation("This section"));
    assert.equal(view.$(".error-card__detail").textContent, "The chart needs data");
    assert.match(view.text(), /Another panel\./);
    fragmentIsClean(view, "the panel card");
  });

  it("shows the message as plain text, shows a thrown string, and has no detail line for an error without a message", async () => {
    expectCaught(3);
    const cases: ReadonlyArray<readonly [thrown: unknown, detail: string | null]> = [
      [new Error('Bad <b>markup</b> & "quotes"'), 'Bad <b>markup</b> & "quotes"'],
      ["something that is not an Error", "something that is not an Error"],
      [new Error(""), null],
    ];
    for (const [thrown, detail] of cases) {
      const Boom = screenWith({ on: true, thrown });
      const view = await render(
        <ErrorBoundary scope="workspace">
          <Boom />
        </ErrorBoundary>,
      );
      const card = view.byRole("alert");
      if (detail === null) expectNone(view.maybe(".error-card__detail"), "an error without a message");
      else assert.equal(view.$(".error-card__detail").textContent, detail);
      assert.equal(card.querySelector("b"), null, "the message is text, not markup");
      assert.deepEqual(buttons(view), ["Try again", "Reset demo data"]);
      fragmentIsClean(view, `the card for ${String(detail)}`);
      await view.unmount();
    }
  });
});

// ------------------------------------------------------------------------------------------------------------ trying again
describe("Try again and the keys that clear the card by themselves", () => {
  it("Try again renders the screen again: the card comes back while it still throws and goes once it works", async () => {
    expectCaught(2);
    const fault: Fault = { on: true, thrown: new Error("Stale totals") };
    const Boom = screenWith(fault);
    const view = await render(
      <ErrorBoundary scope="workspace">
        <Boom />
      </ErrorBoundary>,
    );

    await view.click(view.byRole("button", "Try again"));
    assert.equal(view.$(".error-card__detail").textContent, "Stale totals", "still broken, so the card is shown again");

    fault.on = false;
    await view.click(view.byRole("button", "Try again"));
    expectNone(view.maybe(".error-card"), "the card is gone");
    expectNone(view.queryByRole("main"), "and the boundary adds nothing around a screen that works");
    assert.equal(view.text(), "The screen works.");
  });

  it("a change of resetKeys clears the error, the same keys in a new array do not, and a screen that is still broken shows the card again", async () => {
    expectCaught(3);
    const fault: Fault = { on: true, thrown: new Error("Broken on /distributions") };
    const Boom = screenWith(fault);
    const at = (path: string) => (
      <ErrorBoundary scope="workspace" resetKeys={[path]}>
        <Boom />
      </ErrorBoundary>
    );
    const view = await render(at("/distributions"));
    assert.equal(view.$(".error-card__detail").textContent, "Broken on /distributions");

    fault.on = false;
    await view.rerender(at("/distributions"));
    assert.ok(view.maybe(".error-card"), "the keys are the same, so the card stays");

    await view.rerender(at("/trial-balance"));
    expectNone(view.maybe(".error-card"), "another workspace starts clean");
    assert.equal(view.text(), "The screen works.");

    fault.on = true;
    fault.thrown = new Error("Broken on /analytics");
    await view.rerender(at("/analytics"));
    assert.equal(view.$(".error-card__detail").textContent, "Broken on /analytics", "a screen that breaks shows the card");

    fault.thrown = new Error("Broken on /access");
    await view.rerender(at("/access"));
    assert.equal(view.$(".error-card__detail").textContent, "Broken on /access", "another route that is also broken shows its own card");
  });
});

// ------------------------------------------------------------------------------------------------------------ reset demo data
describe("Reset demo data", () => {
  it("re-seeds the store, keeps the persona, saves the sample funds and clears the card", async () => {
    expectCaught(1, "Poisoned");
    const store = appStore();
    store.reset();
    store.setUser("r-okafor");
    assert.equal(store.dispatch({ type: "submit", fundId: "coastline" }).ok, true);
    const status = () => store.getState().data.funds.find((fund) => fund.id === "coastline")?.status;
    assert.equal(status(), "In review");
    function Poisoned(): ReactNode {
      if (status() !== "Preparing") throw new Error("Coastline cannot be shown after the saved change");
      return <p>Coastline is Preparing again.</p>;
    }
    const view = await render(
      <ErrorBoundary scope="workspace">
        <Poisoned />
      </ErrorBoundary>,
    );
    assert.equal(view.$(".error-card__detail").textContent, "Coastline cannot be shown after the saved change");

    await view.click(view.byRole("button", "Reset demo data"));

    assert.deepEqual(store.getState().data, seedData(), "the sample funds are back");
    assert.deepEqual(
      store.getState().ui,
      { currentUserId: "r-okafor", jurisdiction: "all", selectedFundId: openFund(oracle("r-okafor"), null) },
      "the persona stays; the selection is the first fund the persona can see",
    );
    const saved = JSON.parse(storage.current.getItem(STORAGE_KEY) ?? "null");
    assert.deepEqual(saved?.data, JSON.parse(JSON.stringify(seedData())), "the sample funds are saved too");
    expectNone(view.maybe(".error-card"), "the card is gone");
    assert.equal(view.text(), "Coastline is Preparing again.");
  });

  it("if the store cannot reset itself it clears the saved state and reloads the page", async () => {
    expectCaught();
    expectReload();
    const store = appStore();
    const reset = store.reset;
    store.reset = () => {
      throw new Error("the store is stuck");
    };
    try {
      storage.current.setItem(STORAGE_KEY, '{"saved":"state"}');
      storage.current.setItem("another.app", "keep");
      const Boom = screenWith({ on: true, thrown: new Error("Saved state is damaged") });
      const view = await render(
        <ErrorBoundary scope="workspace">
          <Boom />
        </ErrorBoundary>,
      );
      await view.click(view.byRole("button", "Reset demo data"));
      assert.equal(storage.current.getItem(STORAGE_KEY), null, "the saved state is gone, so the reload starts from the sample funds");
      assert.equal(storage.current.getItem("another.app"), "keep", "nothing else is touched");
      assert.ok(view.maybe(".error-card"), "the page is about to be replaced, so the card stays until then");
    } finally {
      store.reset = reset;
    }
  });

  it("with no store yet it clears the saved state and reloads the page", async () => {
    expectCaught();
    expectReload();
    const [boundary, state] = await importFresh("../../src/app/shell/ErrorBoundary.tsx", "../../src/app/state.tsx");
    const Fresh = (boundary as { ErrorBoundary: typeof ErrorBoundary }).ErrorBoundary;
    assert.equal((state as { peekStore: typeof peekStore }).peekStore(), null, "this copy of the app has no store");
    storage.current.setItem(STORAGE_KEY, '{"saved":"state"}');
    storage.current.setItem("another.app", "keep");
    const Boom = screenWith({ on: true, thrown: new Error("Saved state is damaged") });
    const view = await render(
      <Fresh scope="app">
        <Boom />
      </Fresh>,
    );

    await view.click(view.byRole("button", "Reset demo data"));

    assert.equal(storage.current.getItem(STORAGE_KEY), null);
    assert.equal(storage.current.getItem("another.app"), "keep");
  });

  it("still reloads when the browser refuses to clear the saved state", async () => {
    expectCaught();
    expectReload();
    class Refusing extends MemoryStorage {
      override removeItem(): never {
        throw new DOMException("Storage is not available", "SecurityError");
      }
    }
    const backing = storage.use(new Refusing());
    backing.setItem(STORAGE_KEY, '{"saved":"state"}');
    const [boundary] = await importFresh("../../src/app/shell/ErrorBoundary.tsx");
    const Fresh = (boundary as { ErrorBoundary: typeof ErrorBoundary }).ErrorBoundary;
    const Boom = screenWith({ on: true, thrown: new Error("Saved state is damaged") });
    const view = await render(
      <Fresh scope="workspace">
        <Boom />
      </Fresh>,
    );

    await view.click(view.byRole("button", "Reset demo data"));

    assert.ok(view.maybe(".error-card"), "nothing threw out of the click handler, and the page is about to reload");
  });
});

// ------------------------------------------------------------------------------------------------------------ the real shell
// Each test swaps the component of one or two entries of WORKSPACES for stand-ins, so the page under test is the real shell (header, navigation,
// persona switcher, footer) and the real frames (FundWorkspaceFrame, PortfolioFrame) around a body that the test can make throw.

/** Puts `component` where the shell finds the workspace `id` and returns the function that puts the original back. */
function replaceWorkspace(id: string, component: ComponentType): () => void {
  const workspace = WORKSPACES.find((candidate) => candidate.id === id);
  assert.ok(workspace, `no workspace "${id}"`);
  const original = workspace.component;
  workspace.component = component;
  return () => {
    workspace.component = original;
  };
}

const restoreAll = (undo: ReadonlyArray<() => void>): void => {
  for (const restore of [...undo].reverse()) restore();
};

/** A workspace with no frame of its own: when it throws, the shell's workspace boundary is the one that catches it. */
const unframed = (problem: () => Error | null): ComponentType =>
  function Crash(): ReactNode {
    const error = problem();
    if (error) throw error;
    return (
      <main id="main" tabIndex={-1}>
        <h2>The workspace recovered</h2>
      </main>
    );
  };

/** A fund workspace in the real frame (fund rail, fund header, the frame's own boundary) around `Body`. */
const inFundFrame = (name: string, Body: (props: { fund: Fund }) => ReactNode): ComponentType =>
  function Page(): ReactNode {
    return <FundWorkspaceFrame workspace={name}>{(fund) => <Body fund={fund} />}</FundWorkspaceFrame>;
  };

/** A portfolio workspace in the real frame (heading row and the frame's own boundary) around `Body`. */
const inPortfolioFrame = (name: string, Body: () => ReactNode): ComponentType =>
  function Page(): ReactNode {
    return (
      <PortfolioFrame workspace={name} title={name}>
        <Body />
      </PortfolioFrame>
    );
  };

const Healthy = ({ fund }: { fund: Fund }): ReactNode => <p>{fund.name} works.</p>;

/** The rail's link to `fundId` on the workspace at `path`. */
function railLink(app: MountedApp, path: string, fundId: string): HTMLElement {
  const href = hashFor(path, { fund: fundId });
  const link = app.$$("a.fund-rail__item").find((candidate) => candidate.getAttribute("href") === href);
  assert.ok(link, `the rail has no link ${href}`);
  return link;
}

const fundName = (view: Oracle, fundId: string): string => view.funds.find((fund) => fund.id === fundId)!.name;

// A workspace that crashes outside its frame happens before anything has set the document title (the frames do), so the first page has none.
const UNTITLED: Allowance = { rule: "g.title", reason: "a workspace that crashes outside its frame leaves the page untitled until the next workspace" };

describe("in the real shell", () => {
  it("a workspace that crashes outside any frame leaves the header, navigation, persona switcher and footer working", async () => {
    expectCaught(3, "Crash");
    let broken: Error | null = new Error("Trial balance exploded");
    const undo = [replaceWorkspace("trial-balance", unframed(() => broken)), replaceWorkspace("cost-base", inFundFrame("Cost base & CGT", Healthy))];
    try {
      const app = await mountApp({ user: "a-moreno", fund: "southbank", hash: "#/trial-balance?fund=southbank" });

      const card = app.$(".error-card");
      assert.equal(card.getAttribute("role"), "alert");
      assert.equal(card.closest("main")?.className, "error-page error-page--workspace");
      assert.equal(app.byRole("heading", { level: 2 }).textContent, "Something went wrong");
      assert.equal(app.$(".error-card__detail").textContent, "Trial balance exploded");
      assert.equal(app.byRole("heading", { level: 1 }).textContent, "Property Fund Tax Compliance");
      assert.equal(app.$$("main").length, 1);
      assert.ok(app.byRole("banner") && app.byRole("contentinfo"), "the header and the footer are still there");
      assert.equal(navLinks(app).length, 8);
      assert.equal(app.byRole("link", "Trial balance").getAttribute("aria-current"), "page");
      assert.equal(personaSelect(app).options.length, 8);
      expectClean(applyAllowances(auditPage(app.container), [...ALLOWANCES, UNTITLED]).unexpected, `the crashed workspace (${app.hash()})`);

      await app.select(personaSelect(app), "l-brennan");
      assert.equal(app.ui().currentUserId, "l-brennan", "the persona switcher works while the workspace is down");
      assert.ok(app.maybe(".error-card"), "and the card stays, as the workspace is still broken");

      await app.click(app.byRole("link", "Cost base & CGT"));
      expectNone(app.maybe(".error-card"), "another workspace starts clean");
      assert.equal(fundHeaderState(app)?.name, "Southbank Industrial Partners Fund");
      expectAuditsClean(app, "the page after the crash");

      await app.click(app.byRole("link", "Trial balance"));
      assert.equal(app.$(".error-card__detail").textContent, "Trial balance exploded", "going back to the broken workspace shows the card again");

      await app.back();
      expectNone(app.maybe(".error-card"), "browser Back leaves it again");

      await app.click(app.byRole("link", "Trial balance"));
      broken = null;
      await app.click(app.byRole("button", "Try again"));
      assert.equal(app.byRole("heading", { level: 2 }).textContent, "The workspace recovered", "once the fault is fixed Try again brings the workspace back");
      expectNone(app.maybe(".error-card"), "the card is gone");
      expectAuditsClean(app, "the recovered workspace");
    } finally {
      restoreAll(undo);
    }
  });

  it("a fund body that crashes leaves the rail, the fund header and the navigation working; another fund or workspace clears the card", async () => {
    expectCaught(3, "Body");
    let broken = true;
    function Body({ fund }: { fund: Fund }): ReactNode {
      if (broken && fund.id === "southbank") throw new Error("The Southbank trial balance exploded");
      return <Healthy fund={fund} />;
    }
    const undo = [replaceWorkspace("trial-balance", inFundFrame("Trial balance", Body)), replaceWorkspace("cost-base", inFundFrame("Cost base & CGT", Healthy))];
    try {
      const view = oracle("a-moreno");
      const app = await mountApp({ user: "a-moreno", hash: "#/trial-balance?fund=southbank" });

      const card = app.$(".error-card");
      assert.equal(card.className, "error-card error-card--panel");
      assert.equal(card.closest("main")?.className, "fund-main", "the card sits in the fund workspace, under the fund header");
      assert.equal(app.$$("main").length, 1);
      assert.equal(app.$(".error-card__detail").textContent, "The Southbank trial balance exploded");
      assert.deepEqual(railState(app), { empty: null, groups: expectedRail(view, "/trial-balance", "southbank") }, "the rail is there");
      expectFundHeader(app, view, "southbank", "the fund header beside the card");
      assert.equal(document.title, titleFor("Trial balance", fundName(view, "southbank")));
      assert.equal(app.byRole("link", "Trial balance").getAttribute("aria-current"), "page");
      expectAuditsClean(app, "a crashed fund body");

      await app.click(railLink(app, "/trial-balance", "harbourline"));
      expectNone(app.maybe(".error-card"), "another fund starts clean");
      assert.equal(app.$(".fund-body").textContent, `${fundName(view, "harbourline")} works.`);
      expectFundHeader(app, view, "harbourline", "the other fund");

      await app.click(railLink(app, "/trial-balance", "southbank"));
      assert.equal(app.$(".error-card__detail").textContent, "The Southbank trial balance exploded", "the broken fund shows the card again");

      await app.click(app.byRole("link", "Cost base & CGT"));
      expectNone(app.maybe(".error-card"), "another workspace starts clean");
      assert.equal(app.$(".fund-body").textContent, `${fundName(view, "southbank")} works.`);
      assert.equal(app.hash(), "#/cost-base?fund=southbank");

      await app.back();
      assert.ok(app.maybe(".error-card"), "browser Back returns to the broken page and the card");

      await app.select(personaSelect(app), "l-brennan");
      assert.ok(app.maybe(".error-card"), "a persona change keeps the card: it is the same fund and workspace");
      expectFundHeader(app, oracle("l-brennan"), "southbank", "the fund header follows the persona");

      broken = false;
      await app.click(app.byRole("button", "Try again"));
      expectNone(app.maybe(".error-card"), "the card is gone");
      assert.equal(app.$(".fund-body").textContent, `${fundName(view, "southbank")} works.`);
      expectFundHeader(app, oracle("l-brennan"), "southbank", "the fund header after Try again");
      expectAuditsClean(app, "the recovered fund body");
    } finally {
      restoreAll(undo);
    }
  });

  it("Reset demo data beside a crashed fund body puts the sample funds back, keeps the persona and the page, and the body works again", async () => {
    expectCaught(1, "Body");
    const status = (): string | undefined => appStore().getState().data.funds.find((fund) => fund.id === "coastline")?.status;
    function Body({ fund }: { fund: Fund }): ReactNode {
      if (fund.id === "coastline" && status() !== "Preparing") throw new Error("Coastline cannot be shown after the saved change");
      return <Healthy fund={fund} />;
    }
    const undo = [replaceWorkspace("trial-balance", inFundFrame("Trial balance", Body)), replaceWorkspace("cost-base", inFundFrame("Cost base & CGT", Healthy))];
    try {
      const app = await mountApp({ user: "r-okafor", hash: "#/cost-base?fund=coastline" });
      await app.click(app.byRole("button", "Submit for review"));
      assert.equal(fundHeaderState(app)?.status, "In review");

      await app.click(app.byRole("link", "Trial balance"));
      assert.equal(app.$(".error-card").className, "error-card error-card--panel");
      assert.equal(app.$(".error-card__detail").textContent, "Coastline cannot be shown after the saved change");
      expectFundHeader(app, oracle("r-okafor", "all", app.store.getState().data), "coastline", "the fund header beside the card shows the saved change");

      await app.click(app.byRole("button", "Reset demo data"));

      assert.deepEqual(app.store.getState().data, seedData(), "the sample funds are back");
      assert.equal(personaSelect(app).value, "r-okafor", "still R. Okafor");
      assert.equal(app.ui().jurisdiction, "all");
      assert.equal(app.ui().selectedFundId, "coastline", "the page still shows Coastline");
      assert.equal(app.hash(), "#/trial-balance?fund=coastline", "and stays where it was");
      expectNone(app.maybe(".error-card"), "the card is gone");
      assert.equal(app.$(".fund-body").textContent, `${fundName(oracle("r-okafor"), "coastline")} works.`);
      expectFundHeader(app, oracle("r-okafor"), "coastline", "Coastline after the reset");
      assert.equal(fundHeaderState(app)?.status, "Preparing");
      expectAuditsClean(app, "the page after the reset");
    } finally {
      restoreAll(undo);
    }
  });

  it("a portfolio body that crashes leaves its heading and the navigation working, and Try again brings the body back", async () => {
    expectCaught(2, "Body");
    let broken = true;
    function Body(): ReactNode {
      if (broken) throw new Error("The bulk review list exploded");
      return <p>The bulk review list works.</p>;
    }
    const undo = [replaceWorkspace("bulk-review", inPortfolioFrame("Bulk review", Body)), replaceWorkspace("analytics", inPortfolioFrame("Analytics", () => <p>Analytics works.</p>))];
    try {
      const app = await mountApp({ user: "l-brennan", hash: "#/bulk-review" });

      const card = app.$(".error-card");
      assert.equal(card.className, "error-card error-card--panel");
      assert.equal(card.closest("main")?.className, "portfolio");
      assert.equal(app.byRole("heading", { level: 2 }).textContent, "Bulk review", "the page keeps its heading");
      assert.equal(app.byRole("heading", { level: 3 }).textContent, "Something went wrong");
      assert.equal(app.$(".error-card__detail").textContent, "The bulk review list exploded");
      assert.equal(document.title, titleFor("Bulk review"));
      assert.equal(app.byRole("link", "Bulk review").getAttribute("aria-current"), "page");
      expectAuditsClean(app, "a crashed portfolio body");

      await app.click(app.byRole("link", "Analytics"));
      expectNone(app.maybe(".error-card"), "another workspace starts clean");
      assert.equal(app.$(".portfolio__body").textContent, "Analytics works.");

      await app.click(app.byRole("link", "Bulk review"));
      assert.equal(app.$(".error-card__detail").textContent, "The bulk review list exploded", "the broken workspace shows the card again");

      broken = false;
      await app.click(app.byRole("button", "Try again"));
      expectNone(app.maybe(".error-card"), "the card is gone");
      assert.equal(app.$(".portfolio__body").textContent, "The bulk review list works.");
      expectAuditsClean(app, "the recovered portfolio body");
    } finally {
      restoreAll(undo);
    }
  });
});
