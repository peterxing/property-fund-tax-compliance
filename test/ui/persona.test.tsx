// Choosing who you work as and which jurisdiction to show: the rail, the open fund, the hash, the title and the announcements.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STORAGE_KEY } from "../../src/domain/index.ts";
import type { JurisdictionFilter } from "../../src/domain/types.ts";
import { FILTER_LABEL, expectFundPage, openFund, showing, workingAs } from "./expect.ts";
import { mountApp } from "./harness.tsx";
import { hashFor, oracle } from "./oracle.ts";
import { PERSONAS } from "./personas.ts";
import { ROUTES } from "./routes.ts";
import { expectSame } from "./same.ts";
import { announced, jurisdictionRadio, jurisdictionState, navLinks, personaSelect, railState, titleFor, toasts } from "./shell.ts";

describe("choosing who to work as", () => {
  it("every persona can be chosen from any other: rail, open fund, hash, title, announcement and storage follow", async () => {
    const app = await mountApp({ hash: "#/tax-returns" });
    let hashFund: string | null = "harbourline";
    for (const target of [...PERSONAS.slice(1), PERSONAS[0]!]) {
      await app.select(personaSelect(app), target.id);
      const view = oracle(target.id);
      hashFund = openFund(view, hashFund);
      assert.equal(personaSelect(app).value, target.id);
      assert.equal(app.ui().currentUserId, target.id);
      assert.equal(app.ui().jurisdiction, "all");
      expectFundPage(app, "/tax-returns", "Tax returns", view, hashFund, "all", target.name);
      assert.equal(announced(app), workingAs(target, view.funds.length), `${target.name}: announcement`);
      expectSame(document.activeElement, personaSelect(app), "focus stays on the control that was used");
      assert.deepEqual(toasts(app), []);
      assert.deepEqual(JSON.parse(app.storage.getItem(STORAGE_KEY)!).ui, app.ui(), `${target.name}: the choice is saved`);
    }
  });

  it("a persona who cannot see the open fund gets the first fund they can see, and the hash is rewritten to it", async () => {
    const app = await mountApp({ hash: "#/investor-reporting?fund=harbourline&tab=statements" });
    await app.select(personaSelect(app), "n-pillai");
    assert.equal(app.hash(), "#/investor-reporting?fund=telok-ayer&tab=statements");
    assert.equal(app.ui().selectedFundId, "telok-ayer");
    await app.select(personaSelect(app), "d-harrow");
    assert.equal(app.hash(), "#/investor-reporting?fund=harbourline&tab=statements");
  });

  it("a persona who can see the open fund keeps it", async () => {
    const app = await mountApp({ hash: "#/?fund=kurrajong" });
    await app.select(personaSelect(app), "l-brennan");
    assert.equal(app.ui().selectedFundId, "kurrajong");
    assert.equal(app.hash(), "#/?fund=kurrajong");
    await app.select(personaSelect(app), "m-castillo");
    assert.equal(app.ui().selectedFundId, "kurrajong");
  });

  it("on a portfolio workspace the route stays and the links to fund workspaces follow the open fund", async () => {
    const app = await mountApp({ hash: "#/analytics" });
    let hashFund: string | null = "harbourline";
    for (const target of [...PERSONAS.slice(1), PERSONAS[0]!]) {
      await app.select(personaSelect(app), target.id);
      const view = oracle(target.id);
      hashFund = openFund(view, hashFund);
      assert.equal(app.hash(), "#/analytics", target.name);
      assert.equal(document.title, titleFor("Analytics"));
      assert.equal(app.ui().selectedFundId, hashFund, target.name);
      const hrefs = navLinks(app).map((link) => link.getAttribute("href"));
      assert.deepEqual(
        hrefs,
        ROUTES.map((route) => hashFor(route.path, route.scope === "fund" && hashFund ? { fund: hashFund } : {})),
        `${target.name}: nav links`,
      );
      assert.equal(announced(app), workingAs(target, view.funds.length));
    }
  });
});

describe("choosing a jurisdiction", () => {
  for (const persona of PERSONAS) {
    it(`${persona.name}: All, Australia and Singapore filter the rail, move the open fund when it drops out and are announced`, async () => {
      const app = await mountApp({ hash: "#/trial-balance", user: persona.id });
      let hashFund: string | null = oracle(persona.id).funds[0]!.id;
      const steps: Array<[string, JurisdictionFilter]> = [
        ["Australia", "AU"],
        ["Singapore", "SG"],
        ["All", "all"],
        ["Singapore", "SG"],
        ["Australia", "AU"],
        ["All", "all"],
      ];
      for (const [label, filter] of steps) {
        await app.click(jurisdictionRadio(app, label));
        const view = oracle(persona.id, filter);
        const selected = openFund(view, hashFund);
        if (selected !== null) hashFund = selected;
        const where = `${persona.name} / ${label}`;
        assert.equal(app.ui().jurisdiction, filter, where);
        assert.deepEqual(jurisdictionState(app), { names: ["All", "Australia", "Singapore"], checked: FILTER_LABEL[filter] }, where);
        expectFundPage(app, "/trial-balance", "Trial balance", view, selected, filter, where);
        assert.equal(announced(app), showing(filter, view.funds.length), `${where}: announcement`);
        assert.deepEqual(JSON.parse(app.storage.getItem(STORAGE_KEY)!).ui, app.ui(), `${where}: saved`);
      }
    });
  }

  it("the filter stays while moving between workspaces and with Back", async () => {
    const app = await mountApp({ hash: "#/", user: "a-moreno" });
    await app.click(jurisdictionRadio(app, "Singapore"));
    for (const route of ROUTES) {
      await app.click(navLinks(app).find((link) => link.textContent?.trim() === route.label)!);
      assert.equal(jurisdictionState(app).checked, "Singapore", route.label);
      assert.equal(app.ui().jurisdiction, "SG");
      if (route.scope === "fund") {
        assert.deepEqual(
          railState(app)?.groups.map((group) => group.label),
          ["Singapore · S-REIT · SGD"],
          route.label,
        );
      }
    }
    await app.back();
    assert.equal(jurisdictionState(app).checked, "Singapore");
  });

  it("with a filter that leaves a persona nothing, the page says so and the filter can be undone", async () => {
    const app = await mountApp({ hash: "#/tax-returns", user: "l-brennan" });
    await app.click(jurisdictionRadio(app, "Singapore"));
    expectFundPage(app, "/tax-returns", "Tax returns", oracle("l-brennan", "SG"), null, "SG", "L. Brennan / Singapore");
    assert.equal(announced(app), "Showing Singapore funds. No funds visible.");
    await app.click(jurisdictionRadio(app, "All"));
    const view = oracle("l-brennan");
    expectFundPage(app, "/tax-returns", "Tax returns", view, app.ui().selectedFundId, "all", "L. Brennan / All");
    assert.ok(app.ui().selectedFundId !== null, "a fund is open again");
  });
});
