// What survives a reload: the persona, the jurisdiction, the open fund and the data changes; and what the app does with storage that is
// damaged, from another version or unavailable. (domain/store.test.ts covers loadPersisted case by case; these check the page that results.)
// Each mount here boots a fresh copy of the app's modules, like a page load, which costs about half a second.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STORAGE_KEY, seedData } from "../../src/domain/index.ts";
import type { JurisdictionFilter } from "../../src/domain/types.ts";
import { FILTER_LABEL, expectFundPage } from "./expect.ts";
import { MemoryStorage, mountApp } from "./harness.tsx";
import { expectedRail, oracle } from "./oracle.ts";
import { announced, fundHeaderState, jurisdictionRadio, jurisdictionState, personaSelect, railState, toasts } from "./shell.ts";

const KALLANG = "Kallang Riverside Retail REIT";

describe("reloading the page", () => {
  it("restores the persona, the jurisdiction, the open fund and the changes made", async () => {
    const first = await mountApp({ hash: "#/tax-returns", user: "w-l-teo" });
    await first.click(jurisdictionRadio(first, "Singapore"));
    await first.click(first.$$("a.fund-rail__item").find((link) => link.textContent?.includes("Kallang"))!);
    const submit = fundHeaderState(first)!.actions.find((action) => action.label === "Submit for review");
    assert.ok(submit && !submit.disabled, "W. L. Teo can submit Kallang");
    await first.click(submit.element);
    assert.equal(fundHeaderState(first)?.status, "In review");
    const { storage } = first;
    const hash = first.hash();
    await first.unmount();

    const second = await mountApp({ hash, storage });
    assert.equal(personaSelect(second).value, "w-l-teo");
    assert.equal(jurisdictionState(second).checked, "Singapore");
    assert.equal(fundHeaderState(second)?.name, KALLANG);
    assert.equal(fundHeaderState(second)?.status, "In review", "the submission was kept");
    assert.deepEqual(
      railState(second)?.groups.map((group) => group.label),
      ["Singapore · S-REIT · SGD"],
    );
    assert.equal(announced(second), "", "nothing is announced for a reload");
    await second.unmount();

    // An address with no fund in it opens the fund the store remembers.
    const third = await mountApp({ hash: "#/", storage });
    assert.equal(fundHeaderState(third)?.name, KALLANG);
    assert.equal(third.hash(), "#/?fund=kallang");
  });

  it("starts from the demo data when nothing is stored", async () => {
    const app = await mountApp({ hash: "#/", fresh: true });
    assert.equal(personaSelect(app).value, "a-moreno");
    assert.equal(app.ui().jurisdiction, "all");
    assert.deepEqual(railState(app), { empty: null, groups: expectedRail(oracle("a-moreno"), "/", "harbourline") });
    assert.deepEqual(app.store.getState().data, seedData());
    assert.equal(app.storage.getItem(STORAGE_KEY), null, "nothing is written until something changes");
  });
});

describe("damaged storage", () => {
  const seed = seedData();
  const ui = { currentUserId: "a-moreno", jurisdiction: "all", selectedFundId: "harbourline" };
  const stored = (data: unknown, extra: Record<string, unknown> = { ui }): string => JSON.stringify({ data, ...extra });

  const unusable: Array<[string, string]> = [
    ["text that is not JSON", "{not json"],
    ["an empty string", ""],
    ["JSON that is not an object", "null"],
    ["data from another version", stored({ ...seed, version: seed.version + 1 })],
    ["data without its lists", stored({ version: seed.version })],
    ["a fund with an unknown status", stored({ ...seed, funds: seed.funds.map((fund, index) => (index === 0 ? { ...fund, status: "Archived" } : fund)) })],
    ["a user with an unknown role", stored({ ...seed, users: seed.users.map((user, index) => (index === 0 ? { ...user, role: "wizard" } : user)) })],
  ];

  for (const [what, raw] of unusable) {
    it(`${what}: the app starts from the demo data and saves valid data again at the next change`, async () => {
      const storage = new MemoryStorage({ [STORAGE_KEY]: raw });
      const app = await mountApp({ hash: "#/", storage });
      assert.equal(personaSelect(app).value, "a-moreno");
      assert.deepEqual(app.store.getState().data, seed, "the demo data");
      assert.deepEqual(railState(app), { empty: null, groups: expectedRail(oracle("a-moreno"), "/", "harbourline") });
      assert.equal(fundHeaderState(app)?.name, "Harbourline Office Trust");
      assert.deepEqual(toasts(app), []);
      await app.select(personaSelect(app), "l-brennan");
      const saved = JSON.parse(storage.getItem(STORAGE_KEY)!);
      assert.equal(saved.data.version, seed.version);
      assert.equal(saved.ui.currentUserId, "l-brennan");
    });
  }

  const repaired: Array<[string, Record<string, unknown>, { user: string; filter: JurisdictionFilter; fund: string }]> = [
    ["an unknown persona, jurisdiction and fund", { ui: { currentUserId: "nobody", jurisdiction: "XX", selectedFundId: "atlantis" } }, { user: "a-moreno", filter: "all", fund: "harbourline" }],
    ["a fund the persona cannot see", { ui: { currentUserId: "n-pillai", jurisdiction: "all", selectedFundId: "harbourline" } }, { user: "n-pillai", filter: "all", fund: "telok-ayer" }],
    ["no ui at all", {}, { user: "a-moreno", filter: "all", fund: "harbourline" }],
    ["a persona, jurisdiction and fund that are fine", { ui: { currentUserId: "s-lim", jurisdiction: "SG", selectedFundId: "meranti" } }, { user: "s-lim", filter: "SG", fund: "meranti" }],
  ];

  for (const [what, extra, expected] of repaired) {
    it(`${what}: the saved data is kept and the choices are repaired`, async () => {
      const app = await mountApp({ hash: "#/", storage: new MemoryStorage({ [STORAGE_KEY]: stored(seed, extra) }) });
      assert.equal(personaSelect(app).value, expected.user);
      assert.equal(jurisdictionState(app).checked, FILTER_LABEL[expected.filter]);
      expectFundPage(app, "/", "Distributions", oracle(expected.user, expected.filter), expected.fund, expected.filter, what);
    });
  }

  it("storage that refuses every read and write: the app starts from the demo data and keeps working in memory", async () => {
    class Refusing extends MemoryStorage {
      override getItem(): string | null {
        throw new Error("storage is not available");
      }
      override setItem(): void {
        throw new Error("quota exceeded");
      }
    }
    const app = await mountApp({ hash: "#/", storage: new Refusing() });
    assert.deepEqual(app.store.getState().data, seed);
    await app.select(personaSelect(app), "n-pillai");
    assert.equal(app.ui().currentUserId, "n-pillai");
    assert.equal(fundHeaderState(app)?.name, "Telok Ayer Commercial REIT");
    assert.deepEqual(toasts(app), []);
  });
});
