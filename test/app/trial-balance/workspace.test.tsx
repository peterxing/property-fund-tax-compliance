// The Trial balance workspace inside the whole app: what each persona can change, the category and adjustment boxes saving through the store
// with the checks, the bridge and the live region following, the CSV that goes out and comes back in, and the audits with the import dialog open.
// Run with the esbuild loader like the other UI tests:
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/app/trial-balance/workspace.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tbView, workflowView } from "../../../src/domain/index.ts";
import { MAP_EVERY_ACCOUNT, bookToTaxLines, changeFlag, moneyExact, sortRows } from "../../../src/app/workspaces/trial-balance/model.ts";
import { auditPage, expectClean } from "../../ui/audit.ts";
import { flatText } from "../../ui/dom.ts";
import { clock, downloads, mountApp, type MountedApp } from "../../ui/harness.tsx";
import { PERSONAS } from "../../ui/personas.ts";
import { expectNone, expectSame } from "../../ui/same.ts";
import { announced } from "../../ui/shell.ts";

// ---------------------------------------------------------------------------------------------------------------- helpers
const COASTLINE = "#/trial-balance?fund=coastline";
const IMPORT = "Import trial balance";

const dataOf = (app: MountedApp) => app.store.getState().data;
const now = () => new Date(clock.now.getTime());
const viewOf = (app: MountedApp, fundId: string) => tbView(dataOf(app), fundId, now());
const fundName = (app: MountedApp, fundId: string): string => dataOf(app).funds.find((fund) => fund.id === fundId)!.name;

/** The three checks at the top, as read on screen. */
const checks = (app: MountedApp): string[] => Array.from(app.byRole("list", "Trial balance checks").querySelectorAll("li")).map((li) => flatText(li));

const mappingTable = (app: MountedApp): HTMLElement => app.byRole("table", /^Accounts and tax mapping/);
const accountOf = (row: Element): string => row.querySelector(".tb-account__no")!.textContent!;
const mappingRows = (app: MountedApp): HTMLElement[] => Array.from(mappingTable(app).querySelectorAll<HTMLElement>("tbody tr"));
const accountsShown = (app: MountedApp): string[] => mappingRows(app).map(accountOf);
const flaggedShown = (app: MountedApp): string[] => mappingRows(app).filter((row) => row.querySelector(".tb-flag") !== null).map(accountOf);

const categoryBox = (app: MountedApp, account: string) => app.byLabel(new RegExp(`^Tax category for ${account} `)) as HTMLSelectElement;
const isBlocked = (el: HTMLElement): boolean => el.getAttribute("aria-disabled") === "true";
const updateButton = (app: MountedApp) => app.byRole("button", "Update distribution");

/** The result line of the book-to-tax table as read on screen. */
const bridgeResult = (app: MountedApp): string => flatText(app.byRole("region", "Book to tax").querySelector("tr.total td")!);
const bridgeResultOf = (app: MountedApp): string => {
  const view = viewOf(app, "coastline");
  return moneyExact(bookToTaxLines(view.bookToTax).find((line) => line.kind === "result")!.amount, "AUD");
};

const errorUnder = (app: MountedApp, label: string): string | null => {
  const alert = app.byLabel(label).closest(".field")!.querySelector('[role="alert"]');
  return alert ? flatText(alert) : null;
};

/** Types into a box and leaves it, the way a person would. */
async function enter(app: MountedApp, label: string, text: string): Promise<void> {
  const box = app.byLabel(label);
  await app.focus(box);
  await app.type(box, text);
  await app.blur(box);
}

const importDialog = (app: MountedApp) => app.byRole("dialog", IMPORT);
const pasteBox = (app: MountedApp) => app.byLabel("Or paste the CSV text") as HTMLTextAreaElement;
const replaceButton = (app: MountedApp) => app.byRole("button", "Replace trial balance");

async function openImport(app: MountedApp): Promise<void> {
  await app.click(app.byRole("button", IMPORT));
  importDialog(app);
}

const CLEAN_FILE = ["Account,Name,Current,Prior,Tax category", "1000,Cash at bank,250.00,100.00,Balance sheet", "4000,Rent received,-250.00,-100.00,Rental and property income"].join("\n");

// ---------------------------------------------------------------------------------------------------------------- what is shown
describe("the Trial balance workspace", () => {
  it("shows the checks, the bridge, the adjustments, the components and the mapping for a fund being prepared", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const view = viewOf(app, "coastline");

    assert.deepEqual(
      app.allByRole("heading", { level: 3 }).map((h) => flatText(h)),
      [`Trial balance · ${view.periodLabel}`, "Book to tax", "Tax adjustments", "Distribution components", "Accounts and tax mapping"],
    );
    assert.deepEqual(checks(app), ["Balanced", "1 account needs a tax category", "Matches the distribution"]);
    assert.equal(app.queryByRole("button", IMPORT)?.getAttribute("aria-disabled"), null);
    expectNone(app.maybe(".tb-lock"), "it should not be on the page");
  });

  it("lists every account with a category box and its movement, and shows what needs attention in words", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const view = viewOf(app, "coastline");

    assert.deepEqual(accountsShown(app), view.rows.map((row) => row.account));
    assert.equal(mappingTable(app).querySelectorAll("tbody select").length, view.rows.length);
    const unmapped = view.rows.find((row) => row.category === "unmapped")!;
    assert.equal(categoryBox(app, unmapped.account).value, "unmapped");
    const row = categoryBox(app, unmapped.account).closest("tr")!;
    assert.equal(row.classList.contains("tb-row--unmapped"), true);
    assert.match(flatText(row), /New balance/);
    assert.match(flatText(mappingTable(app).querySelector("tfoot")!), /^Total \(debits less credits\)/);
  });
});

// ---------------------------------------------------------------------------------------------------------------- who can change what
describe("the Trial balance workspace and the workflow", () => {
  it("is read-only once the fund is signed off, with the reason beside what it locks", async () => {
    const app = await mountApp({ hash: "#/trial-balance?fund=harbourline", user: "a-moreno" });
    const user = dataOf(app).users.find((u) => u.id === "a-moreno")!;
    const reason = workflowView(dataOf(app), "harbourline", { user, now: now() }).lockedReason;
    assert.notEqual(reason, "");

    assert.deepEqual(checks(app), ["Balanced", "All accounts mapped", "Matches the distribution"]);
    assert.equal(flatText(app.$(".tb-lock")), reason);
    const importButton = app.byRole("button", IMPORT);
    assert.equal(isBlocked(importButton), true);
    assert.equal(importButton.getAttribute("aria-describedby"), app.$(".tb-lock").id);
    await app.click(importButton);
    expectNone(app.queryByRole("dialog"), "it should not be on the page");

    assert.equal(mappingTable(app).querySelectorAll("select").length, 0);
    expectNone(app.queryByRole("textbox", "Tax depreciation — Div 40"), "it should not be on the page");
    assert.match(app.text(), /Tax depreciation — Div 40/);
    assert.equal(isBlocked(updateButton(app)), true);
  });

  for (const persona of PERSONAS.filter((p) => p.funds === "all" || p.funds.includes("coastline"))) {
    it(`gives ${persona.name} editing on Coastline exactly when the workflow does`, async () => {
      const app = await mountApp({ hash: COASTLINE, user: persona.id });
      const user = dataOf(app).users.find((u) => u.id === persona.id)!;
      const canEdit = workflowView(dataOf(app), "coastline", { user, now: now() }).can.edit;
      const rows = viewOf(app, "coastline").rows.length;

      assert.equal(mappingTable(app).querySelectorAll("select").length, canEdit ? rows : 0, "category boxes");
      assert.equal(app.queryByRole("textbox", "Tax depreciation — Div 40") !== null, canEdit, "adjustment boxes");
      assert.equal(isBlocked(app.byRole("button", IMPORT)), !canEdit, "import button");
      assert.equal(app.maybe(".tb-lock") !== null, !canEdit, "the reason for the lock");
      if (!canEdit) assert.equal(isBlocked(updateButton(app)), true);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------- mapping and the distribution
describe("mapping an account", () => {
  it("holds back Update distribution until every account has a category, then lets it copy the figures across", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const view = viewOf(app, "coastline");
    const target = view.rows.find((row) => row.category === "unmapped")!;

    assert.equal(isBlocked(updateButton(app)), true);
    assert.equal(updateButton(app).getAttribute("aria-describedby") !== null, true);
    assert.match(app.text(), new RegExp(MAP_EVERY_ACCOUNT));

    await app.select(categoryBox(app, target.account), "Rental and property income");
    assert.equal(dataOf(app).tbRows.find((row) => row.id === target.id)?.category, "rent");
    assert.deepEqual(checks(app), ["Balanced", "All accounts mapped", "Differs from the distribution"]);
    assert.match(announced(app), new RegExp(`${target.account} ${target.name}: tax category set to Rental and property income\\.`));
    assert.equal(isBlocked(updateButton(app)), false);
    expectNone(app.maybe(".tb-row--unmapped"), "it should not be on the page");
    expectNone(app.queryByRole("button", /^Go to the (first )?account/), "nothing left to jump to");

    await app.click(updateButton(app));
    assert.deepEqual(checks(app), ["Balanced", "All accounts mapped", "Matches the distribution"]);
    assert.equal(viewOf(app, "coastline").matchesDistribution, true);
    assert.match(announced(app), new RegExp(`${fundName(app, "coastline")}: distribution components updated from the trial balance\\.`));
    assert.equal(isBlocked(updateButton(app)), true);
    assert.match(app.text(), /The distribution already matches\./);
  });

  it("takes the user to the account that needs a category", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const unmapped = viewOf(app, "coastline").rows.find((row) => row.category === "unmapped")!;
    await app.click(app.byRole("button", "Go to the account that needs a tax category"));
    expectSame(document.activeElement, categoryBox(app, unmapped.account), "focus");
  });

  it("keeps a change of category when the person goes to another workspace and back", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const target = viewOf(app, "coastline").rows.find((row) => row.category === "unmapped")!;
    await app.select(categoryBox(app, target.account), "Interest income");
    await app.navigate("#/tax-returns?fund=coastline");
    await app.navigate(COASTLINE);
    assert.equal(categoryBox(app, target.account).value, "interest-income");
  });
});

// ---------------------------------------------------------------------------------------------------------------- adjustments
describe("the tax adjustments", () => {
  const DIV40 = "Tax depreciation — Div 40";

  it("save through the store and carry through to the bridge", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const before = bridgeResult(app);

    await enter(app, DIV40, "600,000");
    assert.equal(viewOf(app, "coastline").adjustments.find((a) => a.key === "div40")?.amount, 60_000_000);
    assert.equal((app.byLabel(DIV40) as HTMLInputElement).value, "600,000");
    assert.match(announced(app), /Tax depreciation — Div 40 set to A\$600,000\./);
    assert.notEqual(bridgeResult(app), before);
    assert.equal(bridgeResult(app), bridgeResultOf(app));
  });

  it("refuse what is not an amount and keep the figure that was there", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const was = viewOf(app, "coastline").adjustments.find((a) => a.key === "div40")!.amount;

    await enter(app, DIV40, "lots");
    assert.notEqual(errorUnder(app, DIV40), null);
    assert.equal(viewOf(app, "coastline").adjustments.find((a) => a.key === "div40")?.amount, was);
  });

  it("go back to the saved figure when the person presses Escape", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const box = app.byLabel(DIV40) as HTMLInputElement;
    const saved = box.value;
    await app.focus(box);
    await app.type(box, "123");
    assert.equal(box.value, "123");
    await app.press(box, "Escape");
    assert.equal(box.value, saved);
  });
});

// ---------------------------------------------------------------------------------------------------------------- the movements
describe("the movement columns", () => {
  it("sort by the largest change and flag the movements over the threshold, in words", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const { rows } = viewOf(app, "coastline");
    const flaggedAt = (threshold: number): string[] => rows.filter((row) => changeFlag(row, threshold) !== null).map((row) => row.account).sort();

    assert.deepEqual(accountsShown(app), rows.map((row) => row.account));
    await app.select(app.byLabel("Sort"), "Largest change");
    assert.deepEqual(accountsShown(app), sortRows(rows, "change").map((row) => row.account));
    await app.select(app.byLabel("Sort"), "Account");
    assert.deepEqual(accountsShown(app), rows.map((row) => row.account));

    assert.deepEqual(flaggedShown(app).sort(), flaggedAt(20));
    await enter(app, "Highlight changes over (%)", "5");
    assert.deepEqual(flaggedShown(app).sort(), flaggedAt(5));
    assert.notDeepEqual(flaggedAt(5), flaggedAt(20));
    assert.match(flatText(mappingTable(app)), /Over 5%/);
  });
});

// ---------------------------------------------------------------------------------------------------------------- export and import
describe("the CSV export and import", () => {
  it("downloads the trial balance and reads it back in", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const view = viewOf(app, "coastline");

    await app.click(app.byRole("button", "Download CSV"));
    assert.equal(downloads.length, 1);
    assert.match(downloads[0]!.fileName, /-trial-balance\.csv$/);
    const text = await downloads[0]!.blob.text();
    assert.equal(text.replace(/^\uFEFF/, "").startsWith("Account,Name,Tax category,Treatment,Current,Prior,Change\r\n"), true);
    assert.equal(text.split("\r\n").length, view.rows.length + 2);

    await openImport(app);
    await app.type(pasteBox(app), text);
    await app.flush();
    assert.match(flatText(importDialog(app)), new RegExp(`${view.rows.length} accounts ready to import\\.`));
    assert.equal(isBlocked(replaceButton(app)), false);
  });

  it("replaces the accounts with what a clean file says, and announces it with the dialog closed", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    await openImport(app);
    assert.match(flatText(importDialog(app)), /Choose a CSV file or paste its text to see what would change\./);
    assert.equal(isBlocked(replaceButton(app)), true);

    await app.type(pasteBox(app), CLEAN_FILE);
    await app.flush();
    assert.match(flatText(importDialog(app)), /2 accounts ready to import\./);
    assert.match(flatText(importDialog(app)), /This replaces the 17 accounts in the trial balance now\./);
    assert.match(flatText(importDialog(app)), /Current balances total A\$0: balanced\./);
    assert.equal(isBlocked(replaceButton(app)), false);

    await app.click(replaceButton(app));
    expectNone(app.queryByRole("dialog"), "it should not be on the page");
    assert.deepEqual(viewOf(app, "coastline").rows.map((row) => [row.account, row.name, row.category, row.current, row.prior]), [
      ["1000", "Cash at bank", "balance-sheet", 25_000, 10_000],
      ["4000", "Rent received", "rent", -25_000, -10_000],
    ]);
    assert.deepEqual(accountsShown(app), ["1000", "4000"]);
    assert.deepEqual(checks(app), ["Balanced", "All accounts mapped", "Differs from the distribution"]);
    assert.equal(announced(app), `${fundName(app, "coastline")}: trial balance imported, 2 accounts.`);
    expectSame(document.activeElement, app.byRole("button", IMPORT), "focus goes back to the button that opened the dialog");
  });

  it("refuses a file that does not read cleanly and changes nothing", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const before = viewOf(app, "coastline").rows.length;
    await openImport(app);
    await app.type(pasteBox(app), ["Account,Name,Current,Prior", "1000,Cash at bank,lots,100.00", "4000,Rent received,-250.00,-100.00"].join("\n"));
    await app.flush();

    const dialog = importDialog(app);
    assert.match(flatText(dialog), /1 problem found\. Nothing can be imported until the file reads cleanly\./);
    assert.match(flatText(dialog), /Line 2: /);
    assert.equal(isBlocked(replaceButton(app)), true);
    await app.click(replaceButton(app));
    importDialog(app);
    assert.equal(viewOf(app, "coastline").rows.length, before);
  });

  it("says what a web page or a file with no header is, instead of trying to import it", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    await openImport(app);

    await app.type(pasteBox(app), "<html><body><table><tr><td>1000</td></tr></table></body></html>");
    await app.flush();
    assert.match(flatText(importDialog(app)), /This looks like a web page or XML, not a CSV file\./);
    assert.equal(isBlocked(replaceButton(app)), true);

    await app.type(pasteBox(app), "just some words\nand more words");
    await app.flush();
    assert.match(flatText(importDialog(app)), /The first row must name the columns account, name, current and prior/);
    assert.equal(isBlocked(replaceButton(app)), true);
  });

  it("starts empty each time, and Escape or Cancel close it without importing", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const before = viewOf(app, "coastline").rows.length;

    await openImport(app);
    await app.type(pasteBox(app), CLEAN_FILE);
    await app.flush();
    await app.press(pasteBox(app), "Escape");
    expectNone(app.queryByRole("dialog"), "it should not be on the page");
    expectSame(document.activeElement, app.byRole("button", IMPORT), "focus");

    await openImport(app);
    assert.equal(pasteBox(app).value, "");
    await app.type(pasteBox(app), CLEAN_FILE);
    await app.flush();
    await app.click(app.byRole("button", "Cancel"));
    expectNone(app.queryByRole("dialog"), "it should not be on the page");
    assert.equal(viewOf(app, "coastline").rows.length, before);
  });
});

// ---------------------------------------------------------------------------------------------------------------- audits
describe("the Trial balance workspace and the page audits", () => {
  it("is clean in every state the import dialog goes through", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    expectClean(auditPage(app.container), "Trial balance, before the dialog");

    await openImport(app);
    expectClean(auditPage(app.container), "Import dialog, empty");

    await app.type(pasteBox(app), CLEAN_FILE);
    await app.flush();
    expectClean(auditPage(app.container), "Import dialog, a file that reads");

    await app.type(pasteBox(app), "Account,Name,Current,Prior\n1000,Cash,lots,1\n1000,Cash again,1,1\n");
    await app.flush();
    expectClean(auditPage(app.container), "Import dialog, a file with problems");
  });

  it("is clean after the person has made changes", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    const target = viewOf(app, "coastline").rows.find((row) => row.category === "unmapped")!;
    await app.select(categoryBox(app, target.account), "Rental and property income");
    await enter(app, "Tax depreciation — Div 40", "lots");
    await app.select(app.byLabel("Sort"), "Largest change");
    expectClean(auditPage(app.container), "Trial balance, after edits");
    await app.click(updateButton(app));
    expectClean(auditPage(app.container), "Trial balance, after the sync");
  });
});
