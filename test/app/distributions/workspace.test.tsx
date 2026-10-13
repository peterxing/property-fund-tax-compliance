// The Distributions workspace inside the whole app: what each persona sees on each fund, and the amount boxes saving through the store with
// the table, the key figures, the audit trail and the live region following. Run with the esbuild loader like the other UI tests:
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/app/distributions/workspace.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fundCalc, type AuInputs } from "../../../src/domain/index.ts";
import { ComponentsTable } from "../../../src/app/workspaces/distributions/ComponentsTable.tsx";
import { EDITING_HINT, NIL, distributionTable, emptyChartMessage, emptyTableMessage, inputFields, kpiModels } from "../../../src/app/workspaces/distributions/model.ts";
import { NOW, fundOf, ok, seed } from "../../domain/core-fixtures.ts";
import { flatText } from "../../ui/dom.ts";
import { expectAuditsClean } from "../../ui/expect.ts";
import { clock, mountApp, render, type MountedApp } from "../../ui/harness.tsx";
import { announced, toasts } from "../../ui/shell.ts";

// ---------------------------------------------------------------------------------------------------------------- helpers
const dataOf = (app: MountedApp) => app.store.getState().data;
const fundIn = (app: MountedApp, id: string) => dataOf(app).funds.find((fund) => fund.id === id)!;
const calcIn = (app: MountedApp, id: string) => fundCalc(dataOf(app), id, new Date(clock.now.getTime()));

const distribution = (app: MountedApp) => app.byRole("region", "Distribution by tax character");
const inputsPanel = (app: MountedApp) => app.queryByRole("region", "Distribution inputs");

/** The note on the right of the panel header. */
const noteOf = (app: MountedApp): string => flatText(distribution(app).querySelector(".dist-note")!);

/** Every row of the components table by its label: the amount, the cents per unit and the destination columns, as read on screen. */
function tableRows(app: MountedApp): Record<string, string[]> {
  const rows: Record<string, string[]> = {};
  for (const tr of Array.from(distribution(app).querySelectorAll("table.dist-table tbody tr"))) {
    const head = tr.querySelector("th .dt__title") ?? tr.querySelector("th");
    if (!head) continue; // the one row that says there are no amounts has no row heading
    rows[flatText(head)] = Array.from(tr.querySelectorAll("td")).map((td) => flatText(td));
  }
  return rows;
}

/** The one row that stands in for the components when none has an amount. */
const emptyRowOf = (app: MountedApp): HTMLTableCellElement | null => distribution(app).querySelector<HTMLTableCellElement>("table.dist-table td.dist-table__empty");

const SUMMARY_ROWS = ["Total by tax character", "Cash distribution", "Total distribution"];

/** The component rows alone, in the order shown: the table without its total and cash rows. */
const componentLabels = (app: MountedApp): string[] => Object.keys(tableRows(app)).filter((label) => !SUMMARY_ROWS.includes(label));

/** The labels the domain gives the components that have an amount, in its order: what the table should list for the fund as it stands now. */
const listedLabels = (app: MountedApp, fundId: string): string[] =>
  calcIn(app, fundId)
    .components.filter((line) => line.amount !== 0)
    .map((line) => line.label);

/** The domain's own label for one component. */
const labelOf = (app: MountedApp, fundId: string, key: string): string => calcIn(app, fundId).components.find((line) => line.key === key)!.label;

/** The three key figures under the table as read on screen. */
function kpisOf(app: MountedApp) {
  return Array.from(distribution(app).querySelectorAll(".kpi")).map((el) => ({
    label: flatText(el.querySelector(".kpi__label")!).toUpperCase(),
    value: flatText(el.querySelector(".kpi__value")!),
    sub: flatText(el.querySelector(".kpi__sub")!),
    warn: el.classList.contains("kpi--warn"),
  }));
}

/** What the model says the key figures should read for the fund as it stands in the store now. */
function expectedKpis(app: MountedApp, fundId: string) {
  return kpiModels(fundIn(app, fundId), calcIn(app, fundId)).map((k) => ({
    label: k.label.toUpperCase(),
    value: k.unit ? `${k.value} ${k.unit}` : k.value,
    sub: k.sub,
    warn: k.tone === "warn",
  }));
}

const boxValue = (app: MountedApp, label: string): string => (app.byLabel(label) as HTMLInputElement).value;

/** Types into an amount box and leaves it (or presses Enter), the way a person would. */
async function enter(app: MountedApp, label: string, text: string, how: "blur" | "Enter" = "blur"): Promise<void> {
  const box = app.byLabel(label);
  await app.focus(box);
  await app.type(box, text);
  if (how === "Enter") await app.press(box, "Enter");
  else await app.blur(box);
}

const errorUnder = (app: MountedApp, label: string): string | null => {
  const alert = app.byLabel(label).closest(".field")!.querySelector('[role="alert"]');
  return alert ? flatText(alert) : null;
};

// ---------------------------------------------------------------------------------------------------------------- what is shown
describe("the Distributions workspace", () => {
  it("shows the panel, the figures and the amount boxes to a preparer, with the hint in the panel header", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "r-okafor" });
    assert.equal(app.$("main h3.panel__title") !== null, true);
    assert.equal(noteOf(app), EDITING_HINT);

    const table = distribution(app).querySelector("table.dist-table")!;
    assert.deepEqual(
      Array.from(table.querySelectorAll("thead th")).map((th) => flatText(th)),
      ["Component", "Amount", "c / unit", "Australian residents", "Foreign investors, net", "Withheld for the ATO"],
    );
    const rows = tableRows(app);
    assert.deepEqual(rows["Total by tax character"], ["A$21,048,000", "6.5994", "A$16,838,400", "A$3,568,962", "A$640,638"]);
    assert.equal(rows["Cash distribution"]![0], "A$21,048,000");
    assert.deepEqual(
      Object.keys(rows),
      [...listedLabels(app, "coastline"), "Total by tax character", "Cash distribution"],
      "the components that have an amount, in the module's order, then the total and the cash",
    );
    const ncmi = calcIn(app, "coastline").components.find((line) => line.key === "ncmi")!;
    assert.equal(ncmi.amount, 0);
    assert.equal(rows[ncmi.label], undefined, "a component with no amount has no row");
    assert.equal(emptyRowOf(app), null, "and the table does not say there is nothing in it");
    assert.deepEqual(kpisOf(app), expectedKpis(app, "coastline"));

    const panel = inputsPanel(app);
    assert.ok(panel, "a preparer gets the Distribution inputs panel");
    const labels = Array.from(panel.querySelectorAll("label.field__label")).map((label) => flatText(label));
    assert.deepEqual(labels, inputFields("AU").map((field) => field.label));
    assert.equal(boxValue(app, "Cash distribution"), "21,048,000");
    assert.equal(boxValue(app, "Australian interest"), "212,300");
    assert.equal(boxValue(app, "Non-concessional MIT income"), "0");
  });

  it("gives every box its explanation as a description, and the currency", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "r-okafor" });
    for (const field of inputFields("AU")) {
      const box = app.byLabel(field.label);
      const described = (box.getAttribute("aria-describedby") ?? "").split(" ").map((id) => flatText(document.getElementById(id)!));
      assert.ok(described.includes(field.hint), `${field.label}: ${described.join(" | ")}`);
      assert.ok(described.includes("Amount in Australian dollars"), field.label);
    }
  });

  it("shows a Singapore preparer the four Singapore boxes and the payout test", async () => {
    const app = await mountApp({ hash: "#/?fund=kallang", user: "w-l-teo" });
    const panel = inputsPanel(app);
    assert.ok(panel);
    assert.deepEqual(
      Array.from(panel.querySelectorAll("label.field__label")).map((label) => flatText(label)),
      inputFields("SG").map((field) => field.label),
    );
    assert.equal(boxValue(app, "Taxable specified income"), "41,906,500");
    assert.equal(boxValue(app, "Taxable income distribution"), "35,620,500");
    assert.deepEqual(kpisOf(app), expectedKpis(app, "kallang"));
    assert.equal(kpisOf(app)[1]!.warn, true, "85.0% is below the transparency threshold");
    assert.equal(kpisOf(app)[1]!.value, "85.0%");
    assert.deepEqual(Object.keys(tableRows(app)), [...listedLabels(app, "kallang"), "Total distribution"], "Kallang has no tax-exempt or capital distribution to list");
    assert.equal(listedLabels(app, "kallang").length, 1);
  });

  it("shows the fourth column, units not on the register, only where there are some", async () => {
    const kurrajong = await mountApp({ hash: "#/?fund=kurrajong", user: "a-moreno" });
    const headings = Array.from(distribution(kurrajong).querySelectorAll("table.dist-table thead th")).map((th) => flatText(th));
    assert.equal(headings.length, 7);
    assert.equal(headings[6], "Units not on register");
    assert.deepEqual(tableRows(kurrajong)["Total by tax character"], ["A$58,036,000", "6.1001", "A$40,625,200", "A$14,881,554", "A$2,452,995", "A$76,251"]);
    await kurrajong.unmount();

    const wattle = await mountApp({ hash: "#/?fund=wattle", user: "a-moreno" });
    assert.equal(distribution(wattle).querySelectorAll("table.dist-table thead th").length, 6);
  });

  it("says why the figures cannot be edited and offers no boxes: signed off, in review, or a role that only views", async () => {
    const cases: Array<[user: string, fund: string, note: string]> = [
      ["a-moreno", "harbourline", "Signed off — reopen to edit"],
      ["a-moreno", "southbank", "In review — return to preparer to edit"],
      ["l-brennan", "kurrajong", "In review — return to preparer to edit"],
      ["d-harrow", "southbank", "In review — return to preparer to edit"],
      ["s-lim", "meranti", "In review — return to preparer to edit"],
      ["m-castillo", "coastline", "View only for your role"],
      ["l-brennan", "coastline", "View only for your role"],
      ["n-pillai", "kallang", "View only for your role"],
    ];
    for (const [user, fund, note] of cases) {
      const app = await mountApp({ hash: `#/?fund=${fund}`, user });
      assert.equal(app.ui().selectedFundId, fund, `${user} can open ${fund}`);
      assert.ok(app.queryByRole("region", "Distribution by tax character"), `${user} on ${fund}: the panel is there`);
      assert.equal(noteOf(app), note, `${user} on ${fund}`);
      assert.equal(inputsPanel(app), null, `${user} on ${fund}: no boxes`);
      assert.equal(app.$$("main input").length, 0, `${user} on ${fund}: nothing to type into`);
      assert.deepEqual(kpisOf(app), expectedKpis(app, fund), `${user} on ${fund}: the figures are still there`);
      await app.unmount();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------- saving
describe("the amount boxes", () => {
  it("save when the box is left: the table, key figures and sentences follow, the audit trail records it, and the change is announced", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "r-okafor" });
    const before = dataOf(app);
    const narrative = flatText(distribution(app).querySelector(".dist-narrative")!);

    await enter(app, "Australian interest", "4,000,000");

    assert.notEqual(dataOf(app), before, "the store has the new amount");
    assert.equal(announced(app), "Saved: Australian interest");
    assert.deepEqual(toasts(app), [], "a save is not a notification");
    assert.equal(boxValue(app, "Australian interest"), "4,000,000");
    assert.equal(errorUnder(app, "Australian interest"), null);

    const entry = dataOf(app).audit[dataOf(app).audit.length - 1]!;
    assert.deepEqual([entry.fundId, entry.actor, entry.action, entry.detail], ["coastline", "R. Okafor", "Australian interest updated", "A$212,300 → A$4,000,000"]);

    const calc = calcIn(app, "coastline");
    const table = distributionTable(fundIn(app, "coastline"), calc);
    assert.equal(tableRows(app)["Australian interest"]![0], "A$4,000,000");
    assert.deepEqual(tableRows(app)["Total by tax character"]!.slice(0, 2), [table.total.amount, table.total.perUnit]);
    assert.deepEqual(kpisOf(app), expectedKpis(app, "coastline"));
    const updated = flatText(distribution(app).querySelector(".dist-narrative")!);
    assert.notEqual(updated, narrative, "the sentence under the chart follows the amounts");
    assert.equal(updated, calc.narrative);
    assert.equal(flatText(inputsPanel(app)!.querySelector(".dist-inputs__result")!), `Result${calc.narrative}`, "the result sits next to the boxes");
  });

  it("save on Enter, without leaving the box", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "a-moreno" });
    await enter(app, "Cash distribution", "20,000,000", "Enter");
    assert.equal(announced(app), "Saved: Cash distribution");
    assert.equal(tableRows(app)["Cash distribution"]![0], "A$20,000,000");
    assert.equal(document.activeElement, app.byLabel("Cash distribution"), "focus stays where it was");
    assert.equal((fundIn(app, "coastline").inputs as AuInputs).cashDistribution, 2_000_000_000);
  });

  it("explain an amount that cannot be saved, keep what was typed, and save nothing", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "r-okafor" });
    const before = dataOf(app);
    const quiet = announced(app);

    await enter(app, "Australian interest", "abc");
    const box = app.byLabel("Australian interest") as HTMLInputElement;
    assert.equal(box.getAttribute("aria-invalid"), "true");
    assert.equal(box.value, "abc");
    assert.equal(errorUnder(app, "Australian interest"), "Use digits only, for example 1,250,000 or 1,250,000.50.");
    assert.equal(dataOf(app), before, "nothing was saved");
    assert.equal(announced(app), quiet, "and nothing was announced as saved");
    assert.deepEqual(toasts(app), [], "the domain was never asked, so it has nothing to complain about");

    await enter(app, "Australian interest", "-5");
    assert.equal(errorUnder(app, "Australian interest"), "Enter zero or a positive amount.");
    await enter(app, "Australian interest", "12.345");
    assert.equal(errorUnder(app, "Australian interest"), "Use at most two decimal places.");
    await enter(app, "Australian interest", "");
    assert.equal(errorUnder(app, "Australian interest"), "Enter an amount, for example 1,250,000.");
    assert.equal(dataOf(app), before, "still nothing saved");
    assert.equal(tableRows(app)["Australian interest"]![0], "A$212,300", "the table still shows the saved amount");

    await enter(app, "Australian interest", "250,000");
    assert.equal(errorUnder(app, "Australian interest"), null, "a good amount clears the message");
    assert.equal(box.getAttribute("aria-invalid"), null);
    assert.equal(announced(app), "Saved: Australian interest");
    assert.equal(tableRows(app)["Australian interest"]![0], "A$250,000");
  });

  it("put the saved amount back on Escape", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "r-okafor" });
    const before = dataOf(app);
    const box = app.byLabel("Australian interest");
    await app.focus(box);
    await app.type(box, "999");
    await app.press(box, "Escape");
    assert.equal(boxValue(app, "Australian interest"), "212,300");
    assert.equal(errorUnder(app, "Australian interest"), null);
    assert.equal(dataOf(app), before);
  });

  it("do not count the same amount as a change: no audit entry and no announcement", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "r-okafor" });
    const before = dataOf(app);
    const quiet = announced(app);
    await enter(app, "Australian interest", "212,300");
    await enter(app, "Assessable foreign income", "A$1,104,800.00");
    assert.equal(dataOf(app), before);
    assert.equal(dataOf(app).audit.length, before.audit.length);
    assert.equal(announced(app), quiet);
  });

  it("accept an amount as typed with a symbol, and cents", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "r-okafor" });
    await enter(app, "Australian interest", "A$1,250,000.50");
    assert.equal((fundIn(app, "coastline").inputs as AuInputs).interest, 125_000_050);
    assert.equal(boxValue(app, "Australian interest"), "1,250,000.50");
    assert.equal(tableRows(app)["Australian interest"]![0], "A$1,250,001", "the table shows whole dollars");
  });

  it("move a Singapore fund's payout test and trustee tax", async () => {
    const app = await mountApp({ hash: "#/?fund=kallang", user: "w-l-teo" });
    assert.equal(kpisOf(app)[1]!.warn, true);
    await enter(app, "Taxable income distribution", "40,000,000");
    assert.equal(announced(app), "Saved: Taxable income distribution");
    const [income, payout, tax] = kpisOf(app);
    assert.equal(income!.value, "S$41,906,500", "the income itself was not touched");
    assert.equal(payout!.value, "95.5%");
    assert.equal(payout!.warn, false, "back above the threshold");
    assert.equal(tax!.sub, "17% of S$1,906,500 retained");
    assert.deepEqual(kpisOf(app), expectedKpis(app, "kallang"));
    assert.equal(tableRows(app)["Taxable income distribution"]![0], "S$40,000,000");
  });

  it("with every amount zero, say so in one row instead of a table of dashes, and say why there is no chart instead of drawing an empty one", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "r-okafor" });
    assert.equal(distribution(app).querySelector(".dist-sankey svg") !== null, true, "there is a chart while there are amounts");
    assert.equal(emptyRowOf(app), null);
    for (const field of inputFields("AU")) {
      await enter(app, field.label, "0");
      assert.deepEqual(componentLabels(app), listedLabels(app, "coastline"), `${field.label} cleared: the table lists what still has an amount`);
    }

    const empty = emptyRowOf(app);
    assert.ok(empty, "one row says there is nothing to list");
    assert.equal(flatText(empty), emptyTableMessage(true));
    assert.equal(flatText(empty), "No amounts yet. Enter the distribution inputs below.");
    assert.equal(
      Number(empty.getAttribute("colspan")),
      distribution(app).querySelectorAll("table.dist-table thead th").length,
      "and it spans every column, so the rows stay the same width",
    );
    assert.deepEqual(componentLabels(app), [], "no component rows at all");
    assert.deepEqual(Object.keys(tableRows(app)), ["Total by tax character", "Cash distribution"], "the total and the cash rows stay");
    for (const [label, cells] of Object.entries(tableRows(app))) {
      const shown = cells.filter((cell) => cell !== "");
      assert.ok(shown.length > 0 && shown.every((cell) => cell === "Nil"), `${label}: ${shown.join(" | ")}`);
    }
    assert.equal(distribution(app).querySelector(".dist-sankey svg"), null, "no chart");
    assert.ok(app.text().includes(emptyChartMessage(true)), "the message that stands in for the chart");
    assert.equal(
      flatText(distribution(app).querySelector(".dist-narrative")!),
      "A$0 by tax character: A$0 to Australian residents and A$0 to foreign investors after A$0 withheld for the ATO.",
    );
    assert.deepEqual(kpisOf(app), expectedKpis(app, "coastline"));
    assert.deepEqual(kpisOf(app).map((k) => k.value), ["A$0", "A$0 0.0000 c/unit", "A$0"]);
    assert.equal(inputsPanel(app)!.querySelectorAll("input").length, inputFields("AU").length, "every box is still there to fill in, whatever the table lists");
    expectAuditsClean(app, "Distributions with every amount zero");

    await enter(app, "Australian interest", "1,000");
    const interest = labelOf(app, "coastline", "interest");
    assert.equal(emptyRowOf(app), null, "an amount ends the empty state");
    assert.deepEqual(componentLabels(app), [interest]);
    assert.equal(tableRows(app)[interest]![0], "A$1,000");
  });

  it("tell a viewer who has no boxes that there are no amounts, without pointing them to the boxes", async () => {
    const zeroed = ok(seed(), "r-okafor", {
      type: "update-inputs",
      fundId: "coastline",
      inputs: { cashDistribution: 0, ausOtherIncome: 0, ncmi: 0, excludedNcmi: 0, cleanBuilding: 0, interest: 0, discountGainTarp: 0, otherGainTarp: 0, foreignIncome: 0 },
    });
    const fund = fundOf(zeroed, "coastline");
    const calc = fundCalc(zeroed, "coastline", NOW);
    const view = await render(<ComponentsTable fund={fund} calc={calc} canEdit={false} />);
    const messageOf = () => flatText(view.$("table.dist-table td.dist-table__empty"));
    assert.equal(messageOf(), emptyTableMessage(false));
    assert.equal(messageOf(), "No amounts yet.");
    assert.deepEqual(
      Array.from(view.$$("table.dist-table tbody tr")).map((tr) => tr.querySelector("th") !== null),
      [false, true, true],
      "the message, then the total and the cash rows",
    );
    await view.rerender(<ComponentsTable fund={fund} calc={calc} canEdit />);
    assert.equal(messageOf(), emptyTableMessage(true));
    await view.unmount();
  });

  it("drop a draft that was never committed when another fund is opened, and never save it", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "a-moreno" });
    const before = dataOf(app);
    const box = app.byLabel("Australian interest");
    await app.focus(box);
    await app.type(box, "123");

    await app.navigate("#/?fund=kallang");
    assert.deepEqual(
      Array.from(inputsPanel(app)!.querySelectorAll("label.field__label")).map((label) => flatText(label)),
      inputFields("SG").map((field) => field.label),
    );
    await app.navigate("#/?fund=coastline");
    assert.equal(boxValue(app, "Australian interest"), "212,300", "the abandoned draft is gone");
    assert.equal(dataOf(app), before, "and was never saved");
  });

  it("show a dash for a zero amount only in the table: the boxes keep the number", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "r-okafor" });
    assert.equal(boxValue(app, "Clean building MIT income"), "0");
    const cleanBuilding = labelOf(app, "coastline", "cleanBuilding");
    assert.equal(tableRows(app)[cleanBuilding], undefined, "the table leaves out a component with no amount");

    const rows = tableRows(app);
    const deferred = rows[labelOf(app, "coastline", "taxDeferred")]!;
    assert.deepEqual(deferred.slice(0, 2).map((cell) => cell === "Nil"), [false, false]);
    assert.equal(deferred[4], "Nil", "no withholding on the part that is not attributed: a zero cell in a row with an amount is a dash");
    assert.ok(!distribution(app).textContent!.includes("A$0"), `no "A$0" in the table or key figures: ${NIL} stands for nothing`);
  });
});
