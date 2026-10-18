// The shell around every workspace: header, workspace navigation, persona and jurisdiction controls, fund rail, fund header, footer, routing and
// focus. Every workspace is mounted for every persona and compared with the demo data worked out by the domain layer (oracle.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROUTES as APP_ROUTES, buildHash } from "../../src/app/router.ts";
import { seedData } from "../../src/domain/index.ts";
import { accessibleName, allByRole, flatText } from "./dom.ts";
import { calls, mountApp, tabOrder, type MountedApp } from "./harness.tsx";
import { expectedRail, expectedRailToggle, hashFor, oracle } from "./oracle.ts";
import { FUNDS, PERSONAS, type Persona } from "./personas.ts";
import { ROUTES, type RouteFixture } from "./routes.ts";
import { expectSame } from "./same.ts";
import { APP_NAME, announced, fundHeaderState, jurisdictionState, navLinks, personaOptions, railState, railToggle, titleFor, toasts } from "./shell.ts";

describe("the fixtures the sweeps use", () => {
  it("personas.ts lists the seed's personas in the order of the Working as list", () => {
    const seed = seedData();
    assert.deepEqual(
      seed.users.map((u) => ({ id: u.id, name: u.name, title: u.title, role: u.role, funds: u.funds })),
      PERSONAS.map((p) => ({ id: p.id, name: p.name, title: p.title, role: p.role, funds: p.funds })),
    );
  });

  it("personas.ts says which funds each persona can open", () => {
    for (const persona of PERSONAS) {
      const expected = FUNDS.filter((f) => persona.funds === "all" || persona.funds.includes(f.id)).map((f) => f.id);
      assert.deepEqual(oracle(persona.id).funds.map((f) => f.id), expected, persona.name);
    }
  });

  it("funds are as personas.ts says: id, name, market, workflow status and governance", () => {
    const view = oracle("a-moreno");
    assert.deepEqual(
      view.data.funds.map((f) => ({ id: f.id, name: f.name, market: f.market, status: view.workflow(f.id).status, governance: view.workflow(f.id).governance.mode })),
      FUNDS.map((f) => ({ ...f })),
    );
  });

  it("routes.ts is the router's table", () => {
    assert.deepEqual(
      ROUTES.map(({ path, label, scope }) => ({ path, label, scope })),
      APP_ROUTES.map(({ path, label, scope }) => ({ path, label, scope })),
    );
    assert.deepEqual(
      ROUTES.map((r) => r.hash),
      APP_ROUTES.map((r) => buildHash({ path: r.path })),
    );
  });

  it("the rail groups cover exactly the funds a persona can open, for every jurisdiction filter", () => {
    for (const persona of PERSONAS) {
      for (const filter of ["all", "AU", "SG"] as const) {
        const view = oracle(persona.id, filter);
        assert.deepEqual(view.groups.flatMap((g) => g.funds.map((item) => item.fund.id)).sort(), view.funds.map((f) => f.id).sort(), `${persona.name} / ${filter}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------- every workspace x persona
/** Everything every page has, whichever workspace and persona. */
function checkChrome(app: MountedApp, persona: Persona, route: RouteFixture): void {
  const h1s = allByRole(app.container, "heading", { level: 1 });
  assert.deepEqual(h1s.map((h) => h.textContent), [APP_NAME], "one h1: the app name");

  const skip = app.$("a.skip-link");
  expectSame(tabOrder(app.container)[0], skip, "the skip link is the first stop of the Tab key");
  assert.equal(skip.getAttribute("href"), "#main");
  assert.equal(accessibleName(skip), "Skip to fund workspace");

  const links = navLinks(app);
  assert.deepEqual(links.map((link) => accessibleName(link)), ROUTES.map((r) => r.label), "the workspaces, in order");
  assert.deepEqual(
    links.filter((link) => link.hasAttribute("aria-current")).map((link) => `${accessibleName(link)}=${link.getAttribute("aria-current")}`),
    [`${route.label}=page`],
    "aria-current on the open workspace only",
  );
  const selected = app.ui().selectedFundId;
  links.forEach((link, index) => {
    const target = ROUTES[index]!;
    assert.equal(link.getAttribute("href"), hashFor(target.path, target.scope === "fund" && selected ? { fund: selected } : {}), `link to ${target.label}`);
  });

  const select = app.byLabel("Working as") as HTMLSelectElement;
  assert.equal(select.value, persona.id, "Working as shows the persona");
  assert.deepEqual(personaOptions(app), PERSONAS.map((p) => p.label), "Working as lists the eight personas");

  assert.deepEqual(jurisdictionState(app), { names: ["All", "Australia", "Singapore"], checked: "All" });

  const footer = flatText(app.byRole("contentinfo"));
  assert.match(footer, /Demonstration only\./);
  assert.match(footer, /Not tax advice\./);
  assert.match(footer, new RegExp(`${APP_NAME} · v\\S+ · \\S+ · built \\d{1,2} \\w{3} \\d{4}`));

  const main = app.byRole("main");
  assert.equal(main.id, "main");
  assert.equal(main.getAttribute("tabindex"), "-1");
  assert.equal(announced(app), "", "nothing is announced on the first load");
  assert.equal(announced(app, "assertive"), "");
  assert.deepEqual(toasts(app), [], "no notifications on the first load");
}

for (const persona of PERSONAS) {
  describe(`as ${persona.name} (${persona.title})`, () => {
    for (const route of ROUTES) {
      it(`${route.label}: header, navigation, controls, ${route.scope === "fund" ? "fund rail and fund header" : "portfolio page"} and footer`, async () => {
        const app = await mountApp({ hash: route.hash, user: persona.id });
        const view = oracle(persona.id);
        checkChrome(app, persona, route);

        if (route.scope === "portfolio") {
          assert.equal(railState(app), null, "no fund rail");
          assert.equal(fundHeaderState(app), null, "no fund header");
          assert.equal(app.$$("main.portfolio").length, 1);
          assert.equal(allByRole(app.byRole("main"), "heading", { level: 2 }).length > 0, true, "the page has an h2 heading");
          assert.equal(document.title, titleFor(route.label));
          assert.equal(app.hash(), route.hash, "the hash is left alone");
          return;
        }

        const selected = view.funds[0]!;
        const workflow = view.workflow(selected.id);
        assert.equal(app.ui().selectedFundId, selected.id, "the first visible fund is selected");
        assert.equal(app.hash(), hashFor(route.path, { fund: selected.id }), "the hash names the fund");
        assert.equal(document.title, titleFor(route.label, selected.name));
        assert.deepEqual(railState(app), { empty: null, groups: expectedRail(view, route.path, selected.id) }, "the rail is the persona's funds");
        const header = fundHeaderState(app);
        assert.equal(header?.name, selected.name, "the fund header names the fund");
        assert.equal(header?.status, workflow.status);
        assert.equal(app.$$("main#main h2").filter((h) => h.classList.contains("fund-header__name")).length, 1);
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------- routing
describe("routes and the ?fund= parameter", () => {
  const nameOf = (id: string): string => FUNDS.find((f) => f.id === id)!.name;

  it("an unknown path opens Distributions", async () => {
    for (const hash of ["#/nope", "#/trial-balance/extra", "#/_gallery", "#/", "", "#"]) {
      const app = await mountApp({ hash });
      assert.deepEqual(
        navLinks(app).filter((link) => link.hasAttribute("aria-current")).map((link) => accessibleName(link)),
        ["Distributions"],
        `"${hash}"`,
      );
      assert.equal(document.title, titleFor("Distributions", nameOf("harbourline")), `"${hash}"`);
      assert.equal(app.hash(), "#/?fund=harbourline", `"${hash}" is rewritten to the canonical hash`);
      await app.unmount();
    }
  });

  it("paths are matched without regard to case or a trailing slash", async () => {
    const app = await mountApp({ hash: "#/Trial-Balance/" });
    assert.deepEqual(navLinks(app).filter((link) => link.hasAttribute("aria-current")).map((link) => accessibleName(link)), ["Trial balance"]);
    assert.equal(app.hash(), "#/trial-balance?fund=harbourline");
  });

  it("the fund in the hash is the fund shown, in every fund workspace", async () => {
    for (const route of ROUTES.filter((r) => r.scope === "fund")) {
      const app = await mountApp({ hash: `${route.hash}?fund=southbank` });
      assert.equal(fundHeaderState(app)?.name, nameOf("southbank"), route.label);
      assert.equal(document.title, titleFor(route.label, nameOf("southbank")));
      assert.equal(app.ui().selectedFundId, "southbank", "the store follows the hash");
      assert.deepEqual(
        railState(app)?.groups.flatMap((g) => g.items.filter((item) => item.current).map((item) => item.name)),
        [nameOf("southbank")],
      );
      assert.equal(app.hash(), hashFor(route.path, { fund: "southbank" }));
      await app.unmount();
    }
  });

  it("the fund id is matched without regard to case and the hash is rewritten to the canonical id", async () => {
    const app = await mountApp({ hash: "#/trial-balance?fund=SouthBank" });
    assert.equal(fundHeaderState(app)?.name, nameOf("southbank"));
    assert.equal(app.hash(), "#/trial-balance?fund=southbank");
  });

  it("a fund that does not exist falls back to the first visible fund", async () => {
    const app = await mountApp({ hash: "#/tax-returns?fund=atlantis" });
    assert.equal(fundHeaderState(app)?.name, nameOf("harbourline"));
    assert.equal(app.hash(), "#/tax-returns?fund=harbourline");
  });

  it("a fund the persona cannot see falls back to the first visible fund, whoever asks", async () => {
    const cases: Array<[string, string, string]> = [
      ["n-pillai", "harbourline", "telok-ayer"],
      ["w-l-teo", "southbank", "telok-ayer"],
      ["l-brennan", "telok-ayer", "harbourline"],
      ["r-okafor", "kallang", "harbourline"],
      ["d-harrow", "coastline", "harbourline"],
      ["s-lim", "kallang", "telok-ayer"],
    ];
    for (const [user, asked, expected] of cases) {
      const app = await mountApp({ hash: `#/?fund=${asked}`, user });
      assert.equal(fundHeaderState(app)?.name, nameOf(expected), `${user} asks for ${asked}`);
      assert.equal(app.hash(), `#/?fund=${expected}`, `${user} asks for ${asked}`);
      assert.equal(app.ui().selectedFundId, expected);
      assert.equal(railNamesOf(app).includes(nameOf(asked)), false, "and the rail does not list it");
      await app.unmount();
    }
  });

  it("a fund the persona can see is honoured", async () => {
    const app = await mountApp({ hash: "#/?fund=meranti", user: "s-lim" });
    assert.equal(fundHeaderState(app)?.name, nameOf("meranti"));
    assert.equal(app.hash(), "#/?fund=meranti");
  });

  it("the tab parameter is kept when the fund is fixed up or another fund is chosen, and holder and notice are not", async () => {
    const app = await mountApp({ hash: "#/investor-reporting?fund=nowhere&tab=queries&holder=h-1&notice=n-1", user: "l-brennan" });
    assert.equal(app.hash(), "#/investor-reporting?fund=harbourline&tab=queries&holder=h-1&notice=n-1", "only the fund is replaced");
    const hrefs = railState(app)?.groups.flatMap((g) => g.items.map((item) => item.href));
    assert.deepEqual(hrefs, ["harbourline", "southbank", "wattle", "kurrajong", "coastline"].map((id) => `#/investor-reporting?fund=${id}&tab=queries`));
  });

  it("portfolio workspaces ignore the fund parameter and do not rewrite the hash", async () => {
    const app = await mountApp({ hash: "#/analytics?fund=southbank" });
    assert.equal(app.hash(), "#/analytics?fund=southbank");
    assert.equal(railState(app), null);
  });
});

function railNamesOf(app: MountedApp): string[] {
  return railState(app)?.groups.flatMap((group) => group.items.map((item) => item.name)) ?? [];
}

// ---------------------------------------------------------------------------------------------------------------- moving around
describe("moving between workspaces and funds", () => {
  it("choosing a workspace in the navigation opens it, moves aria-current, retitles the page, announces it, scrolls to the top and focuses main", async () => {
    const app = await mountApp({ hash: "#/?fund=southbank" });
    for (const route of ROUTES.slice(1)) {
      calls.length = 0;
      const link = navLinks(app).find((candidate) => accessibleName(candidate) === route.label)!;
      const expectedHref = hashFor(route.path, route.scope === "fund" ? { fund: "southbank" } : {});
      assert.equal(link.getAttribute("href"), expectedHref);
      await app.click(link);
      assert.equal(app.hash(), expectedHref, route.label);
      assert.deepEqual(
        navLinks(app).filter((candidate) => candidate.hasAttribute("aria-current")).map((candidate) => accessibleName(candidate)),
        [route.label],
      );
      assert.equal(document.title, route.scope === "fund" ? titleFor(route.label, "Southbank Industrial Partners Fund") : titleFor(route.label));
      assert.equal(announced(app), route.label, "the new workspace is announced");
      expectSame(document.activeElement, app.$("main#main"), "focus moves to main");
      assert.deepEqual(
        calls.filter((call) => call.target === "window.scrollTo").map((call) => call.args),
        [[0, 0]],
        "the page scrolls to the top once",
      );
    }
  });

  it("the fund chosen stays chosen across fund workspaces, and a portfolio workspace remembers it for the way back", async () => {
    const app = await mountApp({ hash: "#/trial-balance?fund=kurrajong" });
    await app.click(navLinks(app).find((link) => accessibleName(link) === "Bulk review")!);
    assert.equal(app.hash(), "#/bulk-review");
    const back = navLinks(app).find((link) => accessibleName(link) === "Cost base & CGT")!;
    assert.equal(back.getAttribute("href"), "#/cost-base?fund=kurrajong");
    await app.click(back);
    assert.equal(fundHeaderState(app)?.name, FUNDS.find((f) => f.id === "kurrajong")!.name);
  });

  it("the browser's Back button returns to the previous workspace", async () => {
    const app = await mountApp({ hash: "#/?fund=southbank" });
    await app.click(navLinks(app).find((link) => accessibleName(link) === "Tax returns")!);
    assert.equal(app.hash(), "#/tax-returns?fund=southbank");
    await app.back();
    assert.equal(app.hash(), "#/?fund=southbank");
    assert.deepEqual(
      navLinks(app).filter((link) => link.hasAttribute("aria-current")).map((link) => accessibleName(link)),
      ["Distributions"],
    );
    assert.equal(document.title, titleFor("Distributions", "Southbank Industrial Partners Fund"));
    assert.equal(announced(app), "Distributions");
  });

  it("choosing a fund in the rail keeps the workspace and tab, moves aria-current and retitles the page, without scrolling or announcing", async () => {
    const app = await mountApp({ hash: "#/investor-reporting?fund=harbourline&tab=statements" });
    calls.length = 0;
    const item = app.$$("a.fund-rail__item").find((link) => link.textContent?.includes("Telok Ayer Commercial REIT"))!;
    assert.equal(item.getAttribute("href"), "#/investor-reporting?fund=telok-ayer&tab=statements");
    await app.click(item);
    assert.equal(app.hash(), "#/investor-reporting?fund=telok-ayer&tab=statements");
    assert.equal(fundHeaderState(app)?.name, "Telok Ayer Commercial REIT");
    assert.equal(document.title, titleFor("Investor reporting", "Telok Ayer Commercial REIT"));
    assert.equal(app.ui().selectedFundId, "telok-ayer");
    assert.deepEqual(
      railState(app)?.groups.flatMap((g) => g.items.filter((i) => i.current).map((i) => i.name)),
      ["Telok Ayer Commercial REIT"],
    );
    assert.equal(announced(app), "", "choosing a fund is not announced as a new workspace");
    assert.deepEqual(calls.filter((call) => call.target === "window.scrollTo"), [], "and does not scroll");
  });

  it("the rail's button names the open fund with its status and exceptions, opens and folds the list, and follows a change of fund and of workflow", async () => {
    const view = oracle("a-moreno");
    const loud = view.funds.find((fund) => view.workflow(fund.id).exceptions > 0);
    const quiet = view.funds.find((fund) => {
      const workflow = view.workflow(fund.id);
      return workflow.exceptions === 0 && workflow.available.some((action) => action.action === "submit" && action.enabled);
    });
    assert.ok(loud && quiet, "the seed has a fund with exceptions and a quiet one that can be submitted");
    const path = "/trial-balance";
    const app = await mountApp({ user: "a-moreno", hash: hashFor(path, { fund: loud.id }) });
    const button = (): HTMLElement => app.byRole("button", /^Fund:/);

    assert.deepEqual(railToggle(app), expectedRailToggle(view, loud.id), "it names the open fund, its status and its exceptions");
    assert.equal(button().closest("nav")?.getAttribute("aria-label"), "Funds");

    await app.click(button());
    assert.equal(railToggle(app)?.expanded, true, "it opens the list");
    await app.click(button());
    assert.equal(railToggle(app)?.expanded, false, "and folds it away again");

    await app.click(button());
    await app.press(app.$("a.fund-rail__item"), "Escape");
    assert.equal(railToggle(app)?.expanded, false, "Escape in the list folds it");
    expectSame(document.activeElement, button(), "and puts the focus back on the button");

    await app.click(button());
    const link = app.$$("a.fund-rail__item").find((candidate) => candidate.getAttribute("href") === hashFor(path, { fund: quiet.id }));
    assert.ok(link, "the list has a link to the quiet fund");
    await app.click(link);
    assert.equal(app.hash(), hashFor(path, { fund: quiet.id }));
    assert.deepEqual(railToggle(app), expectedRailToggle(view, quiet.id), "choosing a fund updates the button and folds the list");
    assert.equal(railToggle(app)?.exceptions, null, "a fund without exceptions shows none");
    expectSame(document.activeElement, button(), "the focus is on the button");

    await app.click(app.byRole("button", "Submit for review"));
    const submitted = oracle("a-moreno", "all", app.store.getState().data);
    assert.equal(submitted.workflow(quiet.id).status, "In review");
    assert.deepEqual(railToggle(app), expectedRailToggle(submitted, quiet.id), "the button follows the workflow");
  });

  it("the skip link moves focus to main without changing the route", async () => {
    const app = await mountApp({ hash: "#/trial-balance?fund=southbank" });
    const skip = app.$("a.skip-link");
    await app.focus(skip);
    expectSame(document.activeElement, skip, "the skip link has the focus");
    await app.press(skip, "Enter");
    expectSame(document.activeElement, app.$("main#main"), "the skip link moves focus to main");
    assert.equal(app.hash(), "#/trial-balance?fund=southbank", "the hash is not replaced by #main");
    assert.equal(document.title, titleFor("Trial balance", "Southbank Industrial Partners Fund"));
  });

  it("Tab goes from the skip link through the workspaces and the persona and jurisdiction controls to the fund rail", async () => {
    const app = await mountApp();
    const names = tabOrder(app.container).map((el) => accessibleName(el));
    assert.deepEqual(names.slice(0, ROUTES.length + 4), ["Skip to fund workspace", "Workspaces", ...ROUTES.map((r) => r.label), "Working as", "All"]);
    assert.match(
      names[ROUTES.length + 4] ?? "",
      /^Fund:\s*Harbourline Office Trust/,
      "then the rail's button: it names the open fund and, on a narrow screen, opens the list (the style sheet hides it from 900px up)",
    );
    assert.match(names[ROUTES.length + 5] ?? "", /^Harbourline Office Trust/, "then the first fund of the rail");
  });
});
