// Flow 7: persistence and reset. A day's work across both markets comes back exactly after a reload and every workspace shows it; "Reset demo data"
// asks first, then restores the demonstration data and keeps the persona; storage that is damaged at boot falls back to the demo data quietly.
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/ui/flows/persistence-reset.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STORAGE_KEY, seedData } from "../../../src/domain/index.ts";
import type { Action } from "../../../src/domain/index.ts";
import { accessibleName } from "../dom.ts";
import { MemoryStorage, mountApp, type MountedApp } from "../harness.tsx";
import { expectedQueries, oracle } from "../oracle.ts";
import { PERSONAS } from "../personas.ts";
import { ROUTES } from "../routes.ts";
import { expectNone, expectSame } from "../same.ts";
import { announced, fundHeaderState, personaSelect, toasts } from "../shell.ts";
import { auditRows, bulkTable, dataOf, openTab, tableRows } from "./support.ts";

const RESET_TITLE = "Reset demo data?";
const RESET_DESCRIPTION = "This restores the original demonstration data in this browser. Your changes will be lost.";
const RESET_DONE = "Demo data reset. The original demonstration data is back.";

const COASTLINE = "Coastline Healthcare Property Fund";
const KURRAJONG = "Kurrajong Stapled Property Trust";
const SOUTHBANK = "Southbank Industrial Partners Fund";
const KALLANG = "Kallang Riverside Retail REIT";
const QUERY = "Reconcile the AMMA statements";

/** Several people's work, across both markets, written through the store the way the pages would: it leaves Moreno on Kallang with every jurisdiction showing. */
async function workADay(app: MountedApp): Promise<void> {
  const perform = async (userId: string, ...actions: Action[]): Promise<void> => {
    const failures: string[] = [];
    await app.act(() => {
      app.store.setUser(userId);
      for (const action of actions) {
        const result = app.store.dispatch(action);
        if (!result.ok) failures.push(`${userId} ${action.type}: ${result.reason}`);
      }
    });
    assert.deepEqual(failures, []);
  };
  const holderOf = (fundId: string) => dataOf(app).holders.find((holder) => holder.fundId === fundId)!;

  await perform(
    "r-okafor",
    { type: "update-tb-category", fundId: "coastline", rowId: "tb-coastline-4510", category: "rent" },
    { type: "sync-distribution-from-tb", fundId: "coastline" },
    { type: "update-holder-units", fundId: "coastline", holderId: holderOf("coastline").id, units: holderOf("coastline").units + 1000 },
    { type: "update-remitted", fundId: "coastline", remitted: 12_345_600 },
    { type: "submit", fundId: "coastline" },
  );
  await perform("l-brennan", { type: "approve", fundId: "coastline", level: "review" });
  await perform(
    "a-moreno",
    { type: "sign-off", fundId: "coastline" },
    { type: "record-lodgment", fundId: "coastline", kind: "return", reference: "ATO-REF-7788", date: "2026-10-12" },
    { type: "publish-notice", fundId: "coastline", noticeId: "coastline-2026-09-30" },
    { type: "raise-query", fundId: "kurrajong", subject: QUERY, message: "Please confirm the date the statements go out." },
  );
  await perform("d-harrow", { type: "reply-query", fundId: "kurrajong", queryId: dataOf(app).queries.find((query) => query.subject === QUERY)!.id, message: "They go out on 30 Oct." });

  await perform(
    "w-l-teo",
    { type: "update-holder-units", fundId: "kallang", holderId: holderOf("kallang").id, units: holderOf("kallang").units + 500 },
    { type: "update-remitted", fundId: "kallang", remitted: 89_300_000 },
    { type: "submit", fundId: "kallang" },
  );
  await perform("n-pillai", { type: "approve", fundId: "kallang", level: "review" });
  await perform(
    "a-moreno",
    { type: "sign-off", fundId: "kallang" },
    { type: "record-lodgment", fundId: "kallang", kind: "form-ut", reference: "UT-2027-0042", date: "2026-10-12" },
    { type: "publish-notice", fundId: "kallang", noticeId: "kallang-notice" },
    { type: "set-governance", fundId: "southbank", mode: "no-agent" },
    { type: "set-user-funds", userId: "r-okafor", funds: ["harbourline", "coastline"] },
  );
  await app.act(() => app.store.setJurisdiction("all"));
  await app.navigate("#/?fund=kallang");
}

const accessUsers = (app: MountedApp): string[][] => tableRows(app.$$("table").find((table) => /^Users, their roles/.test(table.querySelector("caption")?.textContent ?? ""))!);
const accessGovernance = (app: MountedApp): string[][] =>
  tableRows(app.$$("table").find((table) => /^How each fund is governed/.test(table.querySelector("caption")?.textContent ?? ""))!);

describe("a day's work and a reload", () => {
  it("comes back exactly, and every workspace shows what was done", async () => {
    const first = await mountApp({ hash: "#/", user: "r-okafor" });
    const seed = dataOf(first);
    await workADay(first);

    assert.notDeepEqual(JSON.stringify(dataOf(first)), JSON.stringify(seed), "the day's work changed the data");
    const snapshot = structuredClone(first.store.getState());
    const saved = first.storage.getItem(STORAGE_KEY);
    assert.ok(saved, "the work is saved");
    assert.deepEqual(JSON.parse(saved), snapshot, "what is saved is what the store holds");
    const { storage } = first;
    await first.unmount();

    const app = await mountApp({ hash: "#/", storage });
    assert.deepEqual(app.store.getState(), snapshot, "every list, approval, query, lodgment, notice and choice is back");
    assert.equal(storage.getItem(STORAGE_KEY), saved, "booting from it writes nothing");
    assert.equal(personaSelect(app).value, "a-moreno");
    assert.equal(app.ui().selectedFundId, "kallang");
    assert.equal(app.hash(), "#/?fund=kallang");
    assert.deepEqual(toasts(app), []);
    assert.equal(announced(app), "");

    // Kallang: the whole chain is on the page.
    assert.equal(fundHeaderState(app)?.name, KALLANG);
    assert.equal(fundHeaderState(app)?.status, "Signed off");
    await openTab(app, /^Audit trail/);
    assert.deepEqual(
      auditRows(app)
        .slice(0, 5)
        .map((row) => `${row.action} · ${row.actor}`),
      ["Distribution tax notice announced · A. Moreno", "Form UT filed with IRAS · A. Moreno", "Signed off · A. Moreno", "Approved — reviewer · N. Pillai", "Submitted for review · W. L. Teo"],
      "the newest entries come first",
    );
    await app.navigate("#/tax-returns?fund=kallang");
    assert.match(app.flat(), /UT-2027-0042/, "the Form UT reference");
    await app.navigate("#/investor-reporting?fund=kallang");
    assert.match(app.flat(), /Announced 12 Oct 2026 — locked\./);

    // Coastline: signed off and lodged, the account mapped, the notice published.
    await app.navigate("#/?fund=coastline");
    assert.equal(fundHeaderState(app)?.status, "Signed off");
    await app.navigate("#/trial-balance?fund=coastline");
    const mapped = tableRows(app.byRole("table", /^Accounts and tax mapping/)).find((cells) => cells.join(" ").includes("Make-good income received"));
    assert.ok(mapped, "the 4510 row is on the page");
    assert.match(mapped.join(" "), /Rental and property income/, "mapped to Rental and property income");
    await app.navigate("#/tax-returns?fund=coastline");
    assert.match(app.flat(), /ATO-REF-7788/);
    await app.navigate("#/investor-reporting?fund=coastline");
    assert.match(app.flat(), /Published 12 Oct 2026 — locked\./);

    // Kurrajong: the new query and the reply.
    await app.navigate("#/?fund=kurrajong");
    assert.equal(fundHeaderState(app)?.queries?.text, "3 open queries");
    await openTab(app, /^Queries/);
    assert.match(app.flat(), new RegExp(`${QUERY}[\\s\\S]*They go out on 30 Oct\\.`));

    // Portfolio pages.
    await app.navigate("#/bulk-review");
    const rows = Object.fromEntries(bulkTable(app).map((row) => [row.name, row]));
    assert.equal(rows[COASTLINE]!.status, "Signed off");
    assert.equal(rows[KALLANG]!.status, "Signed off");
    assert.equal(rows[KURRAJONG]!.queries, "3");
    assert.match(rows[SOUTHBANK]!.governance, /No tax agent/);
    await app.navigate("#/access");
    const okafor = accessUsers(app).find((cells) => cells[0]!.startsWith("R. Okafor"))!;
    assert.equal(okafor[2], "Harbourline Office Trust, Coastline Healthcare Property Fund");
    const southbank = accessGovernance(app).find((cells) => cells[0]!.includes(SOUTHBANK))!;
    assert.match(southbank.join(" "), /No tax agent/);
    assert.equal((app.byLabel(/^Governance for Southbank/) as HTMLSelectElement).value, "no-agent");

    // Kurrajong was the fund open when the persona changed: it is not N. Pillai's, so the first fund Pillai can see opens, and Kallang shows what was done.
    await app.select(personaSelect(app), "n-pillai");
    assert.equal(app.ui().selectedFundId, "telok-ayer");
    assert.equal(oracle("n-pillai", "all", dataOf(app)).workflow("kallang").status, "Signed off");
    await app.unmount();
  });
});

describe("Reset demo data", () => {
  const openDialog = async (app: MountedApp): Promise<HTMLElement> => {
    await app.click(app.byRole("button", "Reset demo data"));
    return app.byRole("alertdialog", RESET_TITLE);
  };

  it("asks first, then puts the demonstration data back for whoever is working, who stays", async () => {
    const app = await mountApp({ hash: "#/", user: "r-okafor" });
    const seed = seedData();
    await workADay(app);
    await app.act(() => {
      app.store.setUser("n-pillai");
      app.store.setJurisdiction("SG");
    });
    await app.navigate("#/?fund=meranti");
    await app.navigate("#/access");
    assert.equal(app.ui().selectedFundId, "meranti");
    const changed = dataOf(app);
    assert.notDeepEqual(JSON.stringify(changed), JSON.stringify(seed));
    assert.equal(accessUsers(app).find((cells) => cells[0]!.startsWith("R. Okafor"))![2], "Harbourline Office Trust, Coastline Healthcare Property Fund");

    // The question, with the safe answer focused.
    const announcement = announced(app);
    const opener = app.byRole("button", "Reset demo data");
    let dialog = await openDialog(app);
    assert.equal(dialog.textContent?.includes(RESET_DESCRIPTION), true, "the dialog says what will be lost");
    assert.deepEqual(
      app.allByRole("button").filter((button) => dialog.contains(button)).map(accessibleName),
      ["Close dialog", "Cancel", "Reset demo data"],
    );
    expectSame(document.activeElement, app.byRole("button", "Cancel"), "Cancel has the focus");

    // Cancel and Escape leave everything as it was.
    await app.click(app.byRole("button", "Cancel"));
    expectNone(app.queryByRole("alertdialog"), "the dialog closes on Cancel");
    assert.ok(dataOf(app) === changed, "Cancel changed nothing");
    expectSame(document.activeElement, opener, "focus returns to the button that asked");
    dialog = await openDialog(app);
    await app.press(dialog, "Escape");
    expectNone(app.queryByRole("alertdialog"), "the dialog closes on Escape");
    assert.ok(dataOf(app) === changed, "Escape changed nothing");
    assert.equal(announced(app), announcement, "nothing new is announced for a question that was not answered");

    // Confirm.
    await openDialog(app);
    await app.click(app.allByRole("button", "Reset demo data").find((button) => button.closest("[role='alertdialog']") !== null)!);
    expectNone(app.queryByRole("alertdialog"), "the dialog closes");
    assert.equal(announced(app), RESET_DONE);
    assert.deepEqual(dataOf(app), seed, "the demonstration data is back, every list of it");
    assert.deepEqual(app.ui(), { currentUserId: "n-pillai", jurisdiction: "all", selectedFundId: "telok-ayer" }, "the persona stays; All jurisdictions; the first fund they can see");
    assert.deepEqual(JSON.parse(app.storage.getItem(STORAGE_KEY)!), { data: seed, ui: app.ui() }, "and it is what is saved");
    assert.equal(app.hash(), "#/access", "the page stays where it was");
    assert.equal(personaSelect(app).value, "n-pillai");
    assert.equal(accessUsers(app).find((cells) => cells[0]!.startsWith("R. Okafor"))![2], "Harbourline Office Trust, Southbank Industrial Partners Fund, Wattle Retail Property Trust, Kurrajong Stapled Property Trust, Coastline Healthcare Property Fund");
    assert.equal((app.byLabel(/^Governance for Southbank/) as HTMLSelectElement).value, "agent-lodges");
    assert.deepEqual(toasts(app), []);

    // Every workspace is back to the seed for Pillai.
    await app.navigate("#/bulk-review");
    assert.deepEqual(
      bulkTable(app).map((row) => [row.name, row.status]),
      [
        ["Telok Ayer Commercial REIT", "Preparing"],
        ["Loyang Logistics REIT", "Signed off"],
        ["Meranti Digital Infrastructure REIT", "In review"],
        ["Kallang Riverside Retail REIT", "Preparing"],
      ],
    );
    await app.navigate("#/?fund=kallang");
    assert.equal(fundHeaderState(app)?.status, "Preparing");
    await openTab(app, /^Audit trail/);
    assert.deepEqual(
      auditRows(app).map((row) => row.action),
      oracle("n-pillai").data.audit.filter((entry) => entry.fundId === "kallang").reverse().map((entry) => entry.action),
      "Kallang's trail is the seeded one again",
    );
    assert.deepEqual(fundHeaderState(app)?.queries, expectedQueries(oracle("n-pillai").workflow("kallang")), "and so are its queries");

    // A reload after the reset is the demonstration data too, for the same person.
    const { storage } = app;
    await app.unmount();
    const again = await mountApp({ hash: "#/", storage });
    assert.deepEqual(again.store.getState().data, seed);
    assert.equal(personaSelect(again).value, "n-pillai");
    await again.unmount();
  });

  it("is there for every persona, and each stays who they were", async () => {
    const seed = seedData();
    for (const persona of PERSONAS) {
      const view = oracle(persona.id);
      const app = await mountApp({ hash: "#/access", user: persona.id });
      const filter = view.funds.some((fund) => fund.market === "AU") ? "AU" : "SG";
      await app.act(() => {
        app.store.setJurisdiction(filter);
        app.store.selectFund(view.funds.filter((fund) => fund.market === filter).at(-1)!.id);
      });
      let raised = false;
      await app.act(() => {
        raised = app.store.dispatch({ type: "raise-query", fundId: view.funds[0]!.id, subject: "Before the reset", message: "A change that the reset removes." }).ok;
      });
      assert.equal(raised, persona.role !== "finance", `${persona.name}: everyone but view-only fund finance has a change to lose`);
      assert.equal(dataOf(app).queries.length, seed.queries.length + (raised ? 1 : 0));
      const dialog = await openDialog(app);
      assert.ok(dialog, `${persona.name}: asked first`);
      await app.click(app.allByRole("button", "Reset demo data").find((button) => button.closest("[role='alertdialog']") !== null)!);
      assert.equal(announced(app), RESET_DONE, persona.name);
      assert.deepEqual(dataOf(app), seed, `${persona.name}: the demonstration data is back`);
      assert.deepEqual(app.ui(), { currentUserId: persona.id, jurisdiction: "all", selectedFundId: view.funds[0]!.id }, `${persona.name}: still working as themselves, jurisdiction All, first fund`);
      await app.unmount();
    }
  });
});

describe("storage that is damaged when the page opens", () => {
  const seed = seedData();
  const ui = { currentUserId: "a-moreno", jurisdiction: "all", selectedFundId: "harbourline" };
  const good = JSON.stringify({ data: seed, ui });
  const edited = (change: (data: Record<string, any>) => void): string => {
    const data = JSON.parse(JSON.stringify(seed)) as Record<string, any>;
    change(data);
    return JSON.stringify({ data, ui });
  };
  const firstInput = (data: Record<string, any>): string => Object.keys(data.funds[0].inputs)[0]!;

  const cases: Array<[string, string]> = [
    ["a write that stopped half way", good.slice(0, Math.floor(good.length / 2))],
    ["a saved state with stray text after it", `${good}}}`],
    ["a list instead of an object", "[]"],
    ["a number", "42"],
    ["a quoted word", '"hello"'],
    ["binary junk", "\u0000\u0001\u0002\ufffd"],
    ["data that is text", JSON.stringify({ data: "x", ui })],
    ["no funds", edited((data) => (data.funds = []))],
    ["a fund input that is text", edited((data) => (data.funds[0].inputs[firstInput(data)] = "abc"))],
    ["a negative amount", edited((data) => (data.funds[0].inputs[firstInput(data)] = -5))],
    ["a holder with negative units", edited((data) => (data.holders[0].units = -5))],
    ["a holder that is null", edited((data) => (data.holders[0] = null))],
    ["an audit entry with nothing in it", edited((data) => data.audit.push({}))],
    ["an approval for a fund that does not exist", edited((data) => data.approvals.push({ fundId: "atlantis", level: "review", by: "X", at: "2026-01-01T00:00:00" }))],
    ["a query whose messages are text", edited((data) => (data.queries[0].messages = "x"))],
    ["two funds with the same id", edited((data) => (data.funds[1].id = data.funds[0].id))],
    ["a user with no list of funds", edited((data) => (data.users[0].funds = "everything"))],
    ["a choice of fund that is a number", JSON.stringify({ data: seed, ui: { ...ui, selectedFundId: 7 } })],
  ];

  for (const [what, raw] of cases) {
    it(`${what}: the app starts on the demonstration data, says nothing, and the next change saves valid data`, async () => {
      const storage = new MemoryStorage({ [STORAGE_KEY]: raw });
      const app = await mountApp({ hash: "#/", storage });
      assert.deepEqual(app.store.getState().data, seed);
      assert.equal(personaSelect(app).value, "a-moreno");
      assert.doesNotMatch(app.flat(), /Something went wrong/);
      assert.deepEqual(toasts(app), []);
      assert.equal(announced(app), "");
      assert.equal(fundHeaderState(app)?.name, "Harbourline Office Trust");
      await app.select(personaSelect(app), "l-brennan");
      const saved = JSON.parse(storage.getItem(STORAGE_KEY)!);
      assert.deepEqual(saved, { data: seed, ui: { currentUserId: "l-brennan", jurisdiction: "all", selectedFundId: "harbourline" } });
      await app.unmount();
    });
  }

  it("a state that is odd but readable (no ledger for a Singapore fund) does not break any page for that fund", async () => {
    const raw = edited((data) => delete data.sgLedger.kallang);
    const app = await mountApp({ hash: "#/?fund=kallang", storage: new MemoryStorage({ [STORAGE_KEY]: raw }) });
    for (const route of ROUTES) {
      await app.navigate(route.scope === "fund" ? `${route.hash}?fund=kallang` : route.hash);
      assert.doesNotMatch(app.flat(), /Something went wrong/, route.label);
    }
    await app.unmount();
  });
});
