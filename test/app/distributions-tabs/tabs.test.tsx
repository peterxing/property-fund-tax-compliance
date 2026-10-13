// The Distributions review tabs inside the whole app (the real <App/> in jsdom): the tab strip and its badges, the Withholding table and its
// edit boxes, the statements, the checks, the query threads, the audit trail and the rules, for the personas that can and cannot change things.
// Run with the esbuild loader like the other UI tests:
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/app/distributions-tabs/tabs.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fundCalc, getFund, rulesFor, statementDoc } from "../../../src/domain/index.ts";
import type { AppData } from "../../../src/domain/types.ts";
import { accessibleDescription, accessibleName, flatText } from "../../ui/dom.ts";
import { expectAuditsClean } from "../../ui/expect.ts";
import { clock, downloads, mountApp, type MountedApp } from "../../ui/harness.tsx";
import { announced, fundHeaderState } from "../../ui/shell.ts";
import { expectNone, expectSame } from "../../ui/same.ts";

// ---------------------------------------------------------------------------------------------------------------- helpers
const NOW = "2026-10-12T09:00:00";
const TODAY_TEXT = "12 Oct 2026, 09:00";
/** The one open query on Southbank. */
const ESTATE_QUERY = "Estate sale: discount eligibility";

/** The Distributions workspace of a fund (on a review tab when `tab` is given), as one of the personas. */
const open = (fund: string, tab?: string, user = "a-moreno"): Promise<MountedApp> =>
  mountApp({ hash: `#/?fund=${fund}${tab ? `&tab=${tab}` : ""}`, user, now: NOW });

const dataOf = (app: MountedApp): AppData => app.store.getState().data;
const calcOf = (app: MountedApp, fund: string) => fundCalc(dataOf(app), fund, new Date(clock.now.getTime()));
const panel = (app: MountedApp): HTMLElement => app.byRole("tabpanel");
const inputsIn = (root: HTMLElement): HTMLInputElement[] => Array.from(root.querySelectorAll<HTMLInputElement>("input"));
const hashParams = (app: MountedApp): Record<string, string> => Object.fromEntries(new URLSearchParams(app.hash().split("?")[1] ?? ""));

const tabNames = (app: MountedApp): string[] => app.allByRole("tab").map((tab) => accessibleName(tab));

function selectedTab(app: MountedApp): string {
  const selected = app.allByRole("tab").filter((tab) => tab.getAttribute("aria-selected") === "true");
  assert.equal(selected.length, 1, "exactly one tab is selected");
  return accessibleName(selected[0]!);
}

/** The name the tab strip shows for a fund: the Checks and Queries tabs carry a badge only when there is something to say. */
const strip = (checks: string | null, queries: string | null): string[] => [
  "Withholding",
  "Statements",
  checks ? `Checks ${checks}` : "Checks",
  queries ? `Queries ${queries}` : "Queries",
  "Audit trail",
  "Rules",
];

interface HolderView {
  name: string;
  country: string;
  status: string;
  rates: string;
  units: string;
  cash: string;
  withheld: string;
  net: string;
}

const withholdingTable = (app: MountedApp): HTMLElement => app.byRole("table", "Withholding by unitholder");

/** The holder rows of the Withholding table as read on screen (the units come from the box when there is one). */
function holderRows(app: MountedApp): HolderView[] {
  return Array.from(withholdingTable(app).querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr:not(.rv-detail)")).map((tr) => {
    const cells = Array.from(tr.children);
    const field = cells[3]!.querySelector("input");
    return {
      name: flatText(tr.querySelector("th .dt__title")!),
      country: flatText(tr.querySelector("th .dt__sub")!),
      status: flatText(tr.querySelector(".rv-status")!),
      rates: flatText(cells[2]!.querySelector(".dt__sub")!),
      units: field ? field.value : flatText(cells[3]!),
      cash: flatText(cells[4]!),
      withheld: flatText(cells[5]!),
      net: flatText(cells[6]!),
    };
  });
}

/** The rows under the table, by their row header: "Register total" and "Units on issue". */
function footRows(app: MountedApp): Record<string, string[]> {
  const rows: Record<string, string[]> = {};
  for (const tr of Array.from(withholdingTable(app).querySelectorAll(":scope > tfoot > tr"))) {
    rows[flatText(tr.querySelector("th")!)] = Array.from(tr.querySelectorAll("td")).map((td) => {
      const field = td.querySelector("input");
      return field ? field.value : flatText(td);
    });
  }
  return rows;
}

/** The reconciliation under the table: "Computed withholding", "Remitted to the ATO" (or IRAS) and "Result". */
function recon(app: MountedApp): Record<string, string> {
  const rows: Record<string, string> = {};
  for (const row of Array.from(app.byRole("region", "Withholding reconciliation").querySelectorAll(".rv-recon__row"))) {
    rows[flatText(row.querySelector("dt")!)] = flatText(row.querySelector("dd")!);
  }
  return rows;
}

const box = (app: MountedApp, label: string): HTMLInputElement => app.byLabel(label) as HTMLInputElement;
const holderSelect = (app: MountedApp): HTMLSelectElement => app.byLabel("Holder") as HTMLSelectElement;

/** Types into a box and presses Enter, the way a person confirms a figure. */
async function enter(app: MountedApp, label: string, text: string): Promise<HTMLInputElement> {
  const field = box(app, label);
  await app.type(field, text);
  await app.press(field, "Enter");
  return field;
}

interface ThreadView {
  subject: string;
  status: string;
  raised: string;
  messages: { by: string; at: string; text: string }[];
  actions: string[];
}

/** The threads of the Queries tab as read on screen. */
function threads(app: MountedApp): ThreadView[] {
  return Array.from(panel(app).querySelectorAll("article.rv-thread")).map((article) => ({
    subject: flatText(article.querySelector("h5")!),
    status: flatText(article.querySelector(".rv-thread__head")!.lastElementChild!),
    raised: flatText(article.querySelector(".rv-thread__meta")!),
    messages: Array.from(article.querySelectorAll(".rv-message")).map((message) => ({
      by: flatText(message.querySelector(".rv-message__by")!),
      at: flatText(message.querySelector("time")!),
      text: flatText(message.querySelector(".rv-message__text")!),
    })),
    actions: Array.from(article.querySelectorAll(".rv-thread__actions button")).map((button) => accessibleName(button)),
  }));
}

/** The entries of the audit trail as read on screen, newest first. */
function auditEntries(app: MountedApp): { at: string; action: string; actor: string; detail: string }[] {
  return Array.from(panel(app).querySelectorAll(".rv-audit__row")).map((row) => ({
    at: flatText(row.querySelector("time")!),
    action: flatText(row.querySelector(".rv-audit__action")!),
    actor: flatText(row.querySelector(".rv-audit__line")!.lastElementChild!),
    detail: row.querySelector(".rv-audit__detail") ? flatText(row.querySelector(".rv-audit__detail")!) : "",
  }));
}

/** The checks of the Checks tab as read on screen. */
function checkEntries(app: MountedApp): { tag: string; title: string; detail: string }[] {
  return Array.from(panel(app).querySelectorAll(".rv-check")).map((item) => ({
    tag: flatText(item.firstElementChild!),
    title: flatText(item.querySelector(".rv-check__title")!),
    detail: flatText(item.querySelector(".rv-check__detail")!),
  }));
}

/** Waits (in real time, inside act) for the PDF to be made: pdfkit is loaded on the first use. The clock is frozen, so count the turns. */
async function nextDownload(app: MountedApp): Promise<void> {
  await app.act(async () => {
    for (let turn = 0; turn < 1200 && downloads.length === 0; turn++) await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

// ---------------------------------------------------------------------------------------------------------------- the tab strip
describe("the tab strip", () => {
  it("is the Review panel's tab list with the six tabs, the exceptions and the open queries on the badges, and one tab stop", async () => {
    const app = await open("southbank");
    const review = app.byRole("region", "Review");
    assert.ok(review.contains(app.byRole("tablist", "Review")));
    assert.deepEqual(tabNames(app), strip("2 exceptions", "1 open"));
    assert.equal(selectedTab(app), "Withholding");
    assert.deepEqual(
      app.allByRole("tab").map((tab) => tab.getAttribute("tabindex")),
      ["0", "-1", "-1", "-1", "-1", "-1"],
    );
    assert.ok(review.contains(panel(app)));
    assert.equal(accessibleName(panel(app)), "Withholding");
  });

  it("shows the badges of every fund: exceptions in red first, then notes, and the open queries", async () => {
    const app = await open("harbourline");
    const expected: Record<string, string[]> = {
      harbourline: strip("1 note", null),
      southbank: strip("2 exceptions", "1 open"),
      wattle: strip(null, null),
      kurrajong: strip("3 exceptions", "2 open"),
      coastline: strip("1 exception", null),
      "telok-ayer": strip("2 notes", null),
      loyang: strip(null, null),
      meranti: strip("2 notes", null),
      kallang: strip("1 exception", null),
    };
    for (const [fund, names] of Object.entries(expected)) {
      await app.navigate(`#/?fund=${fund}`);
      assert.deepEqual(tabNames(app), names, fund);
    }
  });

  it("opens the tab the hash names, and Withholding for anything else", async () => {
    const app = await open("southbank");
    const cases: [string, string][] = [
      ["", "Withholding"],
      ["&tab=withholding", "Withholding"],
      ["&tab=statements", "Statements"],
      ["&tab=statement", "Statements"],
      ["&tab=checks", "Checks 2 exceptions"],
      ["&tab=queries", "Queries 1 open"],
      ["&tab=audit", "Audit trail"],
      ["&tab=audit-trail", "Audit trail"],
      ["&tab=rules", "Rules"],
      ["&tab=RULES", "Rules"],
      ["&tab=unknown", "Withholding"],
      ["&tab=constructor", "Withholding"],
      ["&tab=", "Withholding"],
    ];
    for (const [suffix, name] of cases) {
      await app.navigate(`#/?fund=southbank${suffix}`);
      assert.equal(selectedTab(app), name, `${suffix || "no tab"}`);
      assert.equal(accessibleName(panel(app)), name, `${suffix || "no tab"}: the panel is named by its tab`);
    }
  });

  it("selects a tab with a click, writes it to the hash with the fund and leaves focus on the tab", async () => {
    const app = await open("southbank");
    const checks = app.byRole("tab", "Checks 2 exceptions");
    await app.click(checks);
    assert.deepEqual(hashParams(app), { fund: "southbank", tab: "checks" });
    assert.equal(selectedTab(app), "Checks 2 exceptions");
    expectSame(document.activeElement, checks, "focus stays on the tab that was clicked");
    assert.deepEqual(
      app.allByRole("tab").map((tab) => tab.getAttribute("tabindex")),
      ["-1", "-1", "0", "-1", "-1", "-1"],
    );
    await app.click(app.byRole("tab", "Withholding"));
    assert.deepEqual(hashParams(app), { fund: "southbank", tab: "withholding" });
    assert.equal(selectedTab(app), "Withholding");
  });

  it("moves between the tabs with the arrow keys, Home and End, wrapping at both ends", async () => {
    const app = await open("southbank");
    const press = async (key: string, expected: string): Promise<void> => {
      await app.press(document.activeElement as HTMLElement, key);
      assert.equal(selectedTab(app), expected, key);
      expectSame(document.activeElement, app.byRole("tab", expected), `${key}: focus follows the selection`);
    };
    await app.focus(app.byRole("tab", "Withholding"));
    await press("ArrowRight", "Statements");
    await press("ArrowRight", "Checks 2 exceptions");
    await press("ArrowLeft", "Statements");
    await press("End", "Rules");
    await press("ArrowRight", "Withholding");
    await press("ArrowLeft", "Rules");
    await press("Home", "Withholding");
    assert.deepEqual(hashParams(app), { fund: "southbank", tab: "withholding" });
  });

  it("moves focus into the panel when something outside the strip opens a tab", async () => {
    const app = await open("southbank");
    const link = fundHeaderState(app)?.queries;
    assert.deepEqual(link, { text: "1 open query", href: "#/?fund=southbank&tab=queries" });
    await app.click(app.byRole("link", link!.text));
    assert.equal(selectedTab(app), "Queries 1 open");
    expectSame(document.activeElement, panel(app), "focus moves into the panel");
    assert.equal(accessibleName(panel(app)), "Queries 1 open");
  });

  it("stays on the tab when another fund is opened from the rail, and starts the statements on that fund's own holder", async () => {
    const app = await open("southbank", "checks");
    await app.click(app.allByRole("link").find((link) => link.getAttribute("href") === "#/?fund=kurrajong&tab=checks")!);
    assert.equal(selectedTab(app), "Checks 3 exceptions");
    assert.deepEqual(
      checkEntries(app)
        .slice(0, 3)
        .map((check) => [check.tag, check.title]),
      [
        ["Exception", "Unit register out of balance"],
        ["Exception", "AMMA statements overdue"],
        ["Exception", "Withholding reconciliation variance"],
      ],
    );

    await app.navigate("#/?fund=southbank&tab=statements&holder=h-sb-4");
    assert.equal(holderSelect(app).value, "h-sb-4");
    await app.click(app.allByRole("link").find((link) => link.getAttribute("href")?.startsWith("#/?fund=harbourline"))!);
    assert.deepEqual(hashParams(app), { fund: "harbourline", tab: "statements" });
    assert.equal(holderSelect(app).value, "h-hl-3");
  });
});

// ---------------------------------------------------------------------------------------------------------------- Withholding
describe("the Withholding tab", () => {
  it("shows each unitholder's units, cash, withholding and net cash, the register total and the reconciliation, with no boxes for someone who cannot edit", async () => {
    const app = await open("southbank");
    assert.equal(flatText(app.$(".rv-note--lock")), "In review — return to preparer to edit");
    assert.equal(inputsIn(panel(app)).length, 0, "nothing to type into");

    assert.deepEqual(
      Array.from(withholdingTable(app).querySelectorAll("thead th")).map((th) => flatText(th)),
      ["Components", "Holder", "Tax status", "Units", "Gross cash", "Withheld", "Net cash", "Statement"],
    );
    assert.deepEqual(holderRows(app), [
      { name: "Banksia Super Fund", country: "Australia", status: "Australian resident", rates: "No withholding", units: "205,264,500", cash: "A$14,163,600.00", withheld: "Nil", net: "A$14,163,600.00" },
      { name: "Eucalypt Industry Super", country: "Australia", status: "Australian resident", rates: "No withholding", units: "136,843,000", cash: "A$9,442,400.00", withheld: "Nil", net: "A$9,442,400.00" },
      {
        name: "Kestrel Pension Plan",
        country: "Canada",
        status: "Foreign resident — EOI country",
        rates: "15% fund payment · 10% interest",
        units: "171,053,750",
        cash: "A$11,803,000.00",
        withheld: "A$1,946,049.63",
        net: "A$9,856,950.37",
      },
      {
        name: "Serangoon Capital Pte Ltd",
        country: "Singapore",
        status: "Foreign resident — EOI country",
        rates: "15% fund payment · 10% interest",
        units: "171,053,750",
        cash: "A$11,803,000.00",
        withheld: "A$1,946,049.62",
        net: "A$9,856,950.38",
      },
    ]);
    assert.deepEqual(footRows(app), {
      "Register total": ["684,215,000", "A$47,212,000.00", "A$3,892,099.25", "A$43,319,900.75", ""],
      "Units on issue": ["684,215,000", "Register matches the units on issue."],
    });
    assert.deepEqual(recon(app), {
      "Computed withholding": "A$3,892,099.25",
      "Remitted to the ATO": "A$2,410,099.25",
      Result: "Variance A$1,482,000.00 under-remitted",
    });
    expectNone(app.queryByRole("button", "Mark as not remitted"), "nothing has been remitted, so there is nothing to clear");
  });

  it("reads a nil amount as a dash to the eye and as Nil to a screen reader", async () => {
    const app = await open("southbank");
    const cell = withholdingTable(app).querySelector<HTMLElement>("tbody tr:first-child td:nth-child(6)")!;
    assert.equal(cell.querySelector('[aria-hidden="true"]')?.textContent, "–");
    assert.equal(cell.querySelector(".sr-only")?.textContent, "Nil");
    assert.equal(flatText(cell), "Nil");
  });

  it("names the authority a Singapore fund remits to", async () => {
    const app = await open("telok-ayer", "withholding", "n-pillai");
    assert.deepEqual(Object.keys(recon(app)), ["Computed withholding", "Remitted to IRAS", "Result"]);
    assert.deepEqual(recon(app), { "Computed withholding": "S$1,869,203.20", "Remitted to IRAS": "Not yet remitted", Result: "Not yet remitted" });
    assert.equal(holderRows(app).find((row) => row.name === "Sakuragawa Life Assurance")?.withheld, "S$876,189.00");
  });

  it("opens and closes the components of any number of holders, each under its own row", async () => {
    const app = await open("southbank");
    const toggle = app.byRole("button", "Components for Kestrel Pension Plan");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.hasAttribute("aria-controls"), false);
    expectNone(app.queryByRole("table", /^Components for/), "no components are open to begin with");

    await app.click(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    const detail = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expectSame(toggle.closest("tr")!.nextElementSibling, detail, "the components sit directly under the holder");
    const nested = app.byRole("table", "Components for Kestrel Pension Plan");
    assert.ok(detail.contains(nested));
    assert.deepEqual(
      Array.from(nested.querySelectorAll("thead th")).map((th) => flatText(th)),
      ["Component", "Amount", "Rate", "Withheld"],
    );
    const rows = Array.from(nested.querySelectorAll(":scope > tbody > tr")).map((tr) => Array.from(tr.children).map((cell) => flatText(cell)));
    assert.deepEqual(rows[0], ["Australian income — other", "A$7,966,562.50", "15%", "A$1,194,984.38"]);
    const line = calcOf(app, "southbank").holders.find((l) => l.holder.id === "h-sb-3")!;
    const withAnAmount = line.lines.filter((l) => l.amount !== 0).length;
    assert.equal(rows.length, withAnAmount, "one row for each component the holder has an amount of");
    assert.ok(withAnAmount > 0 && withAnAmount < line.lines.length, "the components with nothing in them are left out");
    assert.equal(flatText(nested.querySelector("tfoot")!), "Total withheld A$1,946,049.63");

    await app.click(app.byRole("button", "Components for Banksia Super Fund"));
    assert.equal(app.allByRole("table", /^Components for/).length, 2, "the first holder stays open");

    await app.press(toggle, "Enter");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.hasAttribute("aria-controls"), false);
    expectNone(app.queryByRole("table", "Components for Kestrel Pension Plan"), "the Kestrel components are closed again");
    assert.equal(app.allByRole("table", /^Components for/).length, 1);
  });

  it("opens the Statements tab on the holder whose Statement button is pressed, with focus in the panel", async () => {
    const app = await open("southbank");
    await app.click(app.byRole("button", "Statement for Serangoon Capital Pte Ltd"));
    assert.deepEqual(hashParams(app), { fund: "southbank", tab: "statements", holder: "h-sb-4" });
    assert.equal(selectedTab(app), "Statements");
    assert.equal(holderSelect(app).value, "h-sb-4");
    expectSame(document.activeElement, panel(app), "focus moves into the panel");
    assert.equal(app.byRole("article", "AMIT member annual statement").querySelector("dl.doc__meta dd")?.textContent, "Serangoon Capital Pte Ltd");
  });
});

// ---------------------------------------------------------------------------------------------------------------- editing
describe("editing the register and the amount remitted", () => {
  it("offers a box for each holder's units, for the units on issue and for the amount remitted to a preparer, on a fund being prepared", async () => {
    const app = await open("coastline", undefined, "r-okafor");
    assert.match(flatText(app.$(".rv-note")), /^Edit the units held, the units on issue and the amount remitted here\./);
    expectNone(app.maybe(".rv-note--lock"), "no lock note for someone who can edit");
    assert.deepEqual(
      inputsIn(panel(app)).map((input) => [accessibleName(input), input.value]),
      [
        ["Units held by Australian resident unitholders (retail register)", "191,364,000"],
        ["Units held by Banksia Super Fund", "63,788,000"],
        ["Units held by Kestrel Pension Plan", "47,841,000"],
        ["Units held by Offshore nominee account", "15,947,000"],
        ["Units on issue", "318,940,000"],
        ["Withholding remitted", ""],
      ],
    );
    assert.equal(box(app, "Withholding remitted").placeholder, "Not yet remitted");
    assert.equal(accessibleDescription(box(app, "Withholding remitted")).startsWith("The amount paid to the ATO. Leave it empty while nothing has been paid."), true);
  });

  it("saves the units a holder holds, shows what that does to the register, and says so", async () => {
    const app = await open("coastline", undefined, "r-okafor");
    const banksia = await enter(app, "Units held by Banksia Super Fund", "63,788,500");
    assert.equal(banksia.value, "63,788,500");
    const over = "Register holds 318,940,500 units against 318,940,000 on issue (500 units over-allocated).";
    assert.equal(calcOf(app, "coastline").holders.find((line) => line.holder.id === "h-cl-2")!.holder.units, 63_788_500);
    assert.equal(footRows(app)["Register total"]![0], "318,940,500");
    assert.deepEqual(footRows(app)["Units on issue"], ["318,940,000", over]);
    assert.ok(app.$(".rv-register--warn"));
    assert.equal(announced(app), `Saved: Units held by Banksia Super Fund. ${over}`);

    // The same fault is a check, and an entry in the audit trail.
    assert.deepEqual(tabNames(app), strip("2 exceptions", null));
    await app.click(app.byRole("tab", /^Checks/));
    assert.deepEqual(checkEntries(app)[0], { tag: "Exception", title: "Unit register out of balance", detail: over });
    await app.click(app.byRole("tab", "Audit trail"));
    assert.equal(auditEntries(app)[0]!.action, "Unitholder register updated");
    assert.equal(auditEntries(app)[0]!.actor, "R. Okafor");
    assert.equal(auditEntries(app)[0]!.at, TODAY_TEXT);

    // Putting the units back balances the register again.
    await app.click(app.byRole("tab", "Withholding"));
    await enter(app, "Units held by Banksia Super Fund", "63,788,000");
    assert.deepEqual(footRows(app)["Units on issue"], ["318,940,000", "Register matches the units on issue."]);
    expectNone(app.maybe(".rv-register--warn"), "the warning goes with the fault");
    assert.equal(announced(app), "Saved: Units held by Banksia Super Fund. Register matches the units on issue.");
    assert.deepEqual(tabNames(app), strip("1 exception", null));
  });

  it("saves the units on issue and words a register that falls short", async () => {
    const app = await open("coastline", undefined, "r-okafor");
    await enter(app, "Units on issue", "319,000,000");
    const short = "Register holds 318,940,000 units against 319,000,000 on issue (60,000 units not allocated to a holder).";
    assert.deepEqual(footRows(app)["Units on issue"], ["319,000,000", short]);
    assert.equal(announced(app), `Saved: Units on issue. ${short}`);
    assert.equal(getFund(dataOf(app), "coastline").unitsOnIssue, 319_000_000);
  });

  it("keeps what was there when a box is left unchanged, or escaped, and says nothing", async () => {
    const app = await open("coastline", undefined, "r-okafor");
    const field = box(app, "Units held by Kestrel Pension Plan");
    await enter(app, "Units held by Kestrel Pension Plan", "47,841,000");
    assert.equal(announced(app), "");
    await app.type(field, "1");
    assert.equal(field.value, "1");
    await app.press(field, "Escape");
    assert.equal(field.value, "47,841,000");
    await app.blur(field);
    assert.equal(announced(app), "");
    assert.equal(calcOf(app, "coastline").holders.find((line) => line.holder.id === "h-cl-3")!.holder.units, 47_841_000);
  });

  it("reconciles the amount remitted as it is entered, and clears it again with the Not remitted button", async () => {
    const app = await open("coastline", undefined, "r-okafor");
    assert.deepEqual(recon(app), { "Computed withholding": "A$640,637.88", "Remitted to the ATO": "Not yet remitted", Result: "Not yet remitted" });
    expectNone(app.queryByRole("button", "Mark as not remitted"), "nothing has been remitted yet");

    const remitted = await enter(app, "Withholding remitted", "640,637.88");
    assert.deepEqual(recon(app), { "Computed withholding": "A$640,637.88", "Remitted to the ATO": "A$640,637.88", Result: "Reconciled" });
    assert.equal(remitted.value, "640,637.88");
    assert.equal(announced(app), "Saved: Withholding remitted. Reconciled.");
    assert.equal(getFund(dataOf(app), "coastline").whtRemitted, 64_063_788);

    await enter(app, "Withholding remitted", "700,000");
    assert.equal(recon(app).Result, "Variance A$59,362.12 over-remitted");
    assert.equal(announced(app), "Saved: Withholding remitted. Variance A$59,362.12 over-remitted.");

    await enter(app, "Withholding remitted", "600,000");
    assert.equal(recon(app).Result, "Variance A$40,637.88 under-remitted");

    await app.click(app.byRole("button", "Mark as not remitted"));
    assert.deepEqual(recon(app), { "Computed withholding": "A$640,637.88", "Remitted to the ATO": "Not yet remitted", Result: "Not yet remitted" });
    assert.equal(remitted.value, "");
    expectSame(document.activeElement, remitted, "focus goes back to the box the button cleared");
    expectNone(app.queryByRole("button", "Mark as not remitted"), "the button goes once there is nothing to clear");
    assert.equal(getFund(dataOf(app), "coastline").whtRemitted, null);
    assert.equal(announced(app), "Saved: Withholding remitted. Not yet remitted.");
  });

  it("refuses an amount that is not a number or is negative, beside the box, and saves nothing", async () => {
    const app = await open("coastline", undefined, "r-okafor");
    const remitted = await enter(app, "Withholding remitted", "abc");
    const alerts = panel(app).querySelectorAll('[role="alert"]');
    assert.equal(alerts.length, 1);
    assert.equal(remitted.getAttribute("aria-invalid"), "true");
    assert.ok(accessibleDescription(remitted).includes(flatText(alerts[0]!)));
    assert.equal(getFund(dataOf(app), "coastline").whtRemitted, null);
    await app.press(remitted, "Escape");
    assert.equal(panel(app).querySelectorAll('[role="alert"]').length, 0);
    assert.equal(remitted.value, "");

    await enter(app, "Withholding remitted", "-5");
    assert.equal(panel(app).querySelectorAll('[role="alert"]').length, 1);
    assert.equal(getFund(dataOf(app), "coastline").whtRemitted, null);
  });

  it("works the same for a Singapore preparer: S$ amounts, IRAS and the variance", async () => {
    const app = await open("telok-ayer", undefined, "w-l-teo");
    assert.match(accessibleDescription(box(app, "Withholding remitted")), /^The amount paid to IRAS\./);
    await enter(app, "Withholding remitted", "1,870,000");
    assert.deepEqual(recon(app), { "Computed withholding": "S$1,869,203.20", "Remitted to IRAS": "S$1,870,000.00", Result: "Variance S$796.80 over-remitted" });
    await enter(app, "Withholding remitted", "1,869,203.20");
    assert.equal(recon(app).Result, "Reconciled");
    assert.equal(announced(app), "Saved: Withholding remitted. Reconciled.");
    await enter(app, "Units held by Sakuragawa Life Assurance", "635,427,001");
    assert.equal(announced(app), "Saved: Units held by Sakuragawa Life Assurance. Register holds 4,236,180,001 units against 4,236,180,000 on issue (1 unit over-allocated).");
  });

  it("is view-only for the roles and the workflow states that cannot edit, and says why", async () => {
    const cases: [string, string, string, string][] = [
      ["r-okafor", "southbank", "In review", "In review — return to preparer to edit"],
      ["l-brennan", "coastline", "Preparing", "View only for your role"],
      ["m-castillo", "coastline", "Preparing", "View only for your role"],
    ];
    for (const [user, fund, status, reason] of cases) {
      const app = await open(fund, "withholding", user);
      assert.equal(fundHeaderState(app)?.status, status, `${user} on ${fund}`);
      assert.equal(flatText(app.$(".rv-note--lock")), reason, `${user} on ${fund}`);
      assert.equal(inputsIn(panel(app)).length, 0, `${user} on ${fund}: no boxes`);
      expectNone(app.queryByRole("button", "Mark as not remitted"), `${user} on ${fund}: nothing to clear`);
      await app.unmount();
    }
    const head = await open("coastline", "withholding", "a-moreno");
    assert.equal(inputsIn(panel(head)).length, 6, "the head of tax edits a fund being prepared");
  });
});

// ---------------------------------------------------------------------------------------------------------------- Statements
describe("the Statements tab", () => {
  const DEFAULT_HOLDER: Record<string, string> = {
    harbourline: "h-hl-3",
    southbank: "h-sb-3",
    wattle: "h-wt-3",
    kurrajong: "h-kj-3",
    coastline: "h-cl-3",
    "telok-ayer": "h-ta-4",
    loyang: "h-ly-3",
    meranti: "h-mr-3",
    kallang: "h-kr-4",
  };

  it("lists the register and shows the statement of the first holder that has tax withheld", async () => {
    const app = await open("southbank", "statements");
    const select = holderSelect(app);
    assert.equal(select.value, "h-sb-3");
    assert.deepEqual(
      Array.from(select.options).map((option) => [option.value, flatText(option)]),
      [
        ["h-sb-1", "Banksia Super Fund · Australia"],
        ["h-sb-2", "Eucalypt Industry Super · Australia"],
        ["h-sb-3", "Kestrel Pension Plan · Canada"],
        ["h-sb-4", "Serangoon Capital Pte Ltd · Singapore"],
      ],
    );
    const statement = app.byRole("article", "AMIT member annual statement");
    assert.equal(statement.querySelector("h4")?.textContent, "AMIT member annual statement");
    assert.equal(statement.querySelector(".doc__subtitle")?.textContent, "Southbank Industrial Partners Fund");
    const meta = Object.fromEntries(Array.from(statement.querySelectorAll("dl.doc__meta > div")).map((row) => [flatText(row.querySelector("dt")!), flatText(row.querySelector("dd")!)]));
    assert.equal(meta.Member, "Kestrel Pension Plan");
    assert.equal(meta.Country, "Canada");
    assert.match(flatText(statement), /Total A\$13,007,215\.00 .*A\$1,946,049\.63/);
    assert.ok(app.byRole("button", "Download PDF"));
  });

  it("opens each fund on the statement its own model produces", async () => {
    const app = await open("harbourline", "statements");
    for (const [fund, holder] of Object.entries(DEFAULT_HOLDER)) {
      await app.navigate(`#/?fund=${fund}&tab=statements`);
      assert.equal(holderSelect(app).value, holder, fund);
      const doc = statementDoc(dataOf(app), fund, holder, new Date(clock.now.getTime()));
      const statement = app.byRole("article", doc.title);
      assert.equal(statement.querySelector(".doc__subtitle")?.textContent ?? "", doc.subtitle ?? "", fund);
      assert.equal(flatText(statement.querySelector("dl.doc__meta dd")!), doc.meta?.[0]?.value, fund);
    }
  });

  it("follows the holder chosen in the list, in the hash, and ignores a holder that is not on the register", async () => {
    const app = await open("southbank", "statements");
    const select = holderSelect(app);
    await app.select(select, "Banksia Super Fund · Australia");
    assert.deepEqual(hashParams(app), { fund: "southbank", tab: "statements", holder: "h-sb-1" });
    assert.equal(select.value, "h-sb-1");
    assert.equal(app.byRole("article", "AMIT member annual statement").querySelector("dl.doc__meta dd")?.textContent, "Banksia Super Fund");

    await app.navigate("#/?fund=southbank&tab=statements&holder=nobody");
    assert.equal(holderSelect(app).value, "h-sb-3");
  });

  it("downloads the statement shown as a PDF and says so", async () => {
    const app = await open("southbank", "statements");
    await app.click(app.byRole("button", "Download PDF"));
    await nextDownload(app);
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0]!.fileName, "southbank-industrial-partners-fund-amma-kestrel-pension-plan.pdf");
    assert.equal(downloads[0]!.blob.type, "application/pdf");
    assert.equal(Buffer.from(await downloads[0]!.blob.slice(0, 5).arrayBuffer()).toString("latin1"), "%PDF-");
    assert.equal(announced(app), "Download started.");
  });
});

// ---------------------------------------------------------------------------------------------------------------- Checks
describe("the Checks tab", () => {
  it("lists the exceptions before the notes with their detail, under a summary", async () => {
    const app = await open("southbank", "checks");
    assert.equal(flatText(panel(app).querySelector(".rv-summary")!), "2 exceptions · 2 notes");
    assert.deepEqual(checkEntries(app), [
      { tag: "Exception", title: "AMMA statements overdue", detail: "Due 30 Sep 2026, three months after the income year ended 30 Jun 2026." },
      {
        tag: "Exception",
        title: "Withholding reconciliation variance",
        detail: "Computed A$3,892,099 against A$2,410,099 remitted — under-remitted by A$1,482,000.",
      },
      {
        tag: "Note",
        title: "AMIT cost base shortfall",
        detail: "Attributed amounts and the AMIT CGT gross-up amount exceed the cash distribution by A$4,816,860 (0.7040 c/unit); members increase their cost base.",
      },
      {
        tag: "Note",
        title: "Notices understate the year's fund payment by A$19,760,000",
        detail: "Fund payment — other: notified A$31,866,250, year A$51,626,250. Withholding on the shortfall may be payable by the trustee as a deemed payment.",
      },
    ]);
  });

  it("says when every check passed", async () => {
    const app = await open("wattle", "checks");
    assert.equal(checkEntries(app).length, 0);
    assert.equal(flatText(panel(app)), "No checks raised Every check passed for this distribution.");
  });

  it("shows the notes alone when there is no exception", async () => {
    const app = await open("telok-ayer", "checks", "n-pillai");
    assert.equal(flatText(panel(app).querySelector(".rv-summary")!), "No exceptions · 2 notes");
    assert.deepEqual(
      checkEntries(app).map((check) => check.tag),
      ["Note", "Note"],
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------- Queries
describe("the Queries tab", () => {
  it("lists the threads newest first, with who raised each and what was said", async () => {
    const app = await open("kurrajong", "queries");
    const views = threads(app);
    assert.deepEqual(
      views.map((view) => [view.subject, view.status, view.raised, view.messages.length]),
      [
        ["Register short by 1,250,000 units", "Open", "Raised by D. Harrow · 10 Oct 2026, 16:03", 1],
        ["Cross-staple rent: NCMI or transitional?", "Open", "Raised by L. Brennan · 8 Oct 2026, 10:47", 2],
      ],
    );
    assert.deepEqual(views[1]!.messages.map((message) => [message.by, message.at]), [
      ["L. Brennan", "8 Oct 2026, 10:47"],
      ["R. Okafor", "9 Oct 2026, 09:12"],
    ]);
    assert.deepEqual(views[0]!.actions, ["Reply to Register short by 1,250,000 units", "Resolve Register short by 1,250,000 units"]);
    assert.ok(app.byRole("heading", { name: "Threads", level: 4 }));
    assert.ok(app.byRole("heading", { name: "Register short by 1,250,000 units", level: 5 }));
  });

  it("shows a resolved thread without anything to answer", async () => {
    const app = await open("meranti", "queries", "s-lim");
    assert.deepEqual(
      threads(app).map((view) => [view.subject, view.status, view.messages.map((message) => message.by), view.actions]),
      [["Co-location income as specified income", "Resolved", ["S. Lim", "W. L. Teo", "S. Lim"], []]],
    );
    assert.deepEqual(tabNames(app), strip("2 notes", null), "nothing open, so no badge");
  });

  it("asks for a subject and a message, shows both errors, and puts focus on the first box with one", async () => {
    const app = await open("southbank", "queries");
    await app.click(app.byRole("button", "Raise query"));
    const subject = box(app, "Subject");
    const message = box(app, "Message");
    assert.equal(accessibleDescription(subject), "Enter a subject");
    assert.equal(accessibleDescription(message), "Enter a message");
    assert.equal(subject.getAttribute("aria-invalid"), "true");
    expectSame(document.activeElement, subject, "focus goes to the first box with an error");
    assert.equal(threads(app).length, 1, "nothing was raised");
    assert.equal(announced(app), "");

    await app.type(subject, "   ");
    assert.equal(subject.hasAttribute("aria-invalid"), false, "typing clears the error of that box");
    assert.equal(accessibleDescription(message), "Enter a message");
    await app.type(subject, "Dates for the estate sale");
    await app.click(app.byRole("button", "Raise query"));
    assert.equal(accessibleDescription(subject), "");
    expectSame(document.activeElement, message, "the message is the first box still wrong");
    assert.equal(threads(app).length, 1);
  });

  it("raises a query: the new thread comes first, the badges and the audit trail count it, the form empties and it is announced", async () => {
    const app = await open("southbank", "queries");
    await app.type(box(app, "Subject"), "  Dates for the estate sale ");
    await app.type(box(app, "Message"), "Please confirm the contract date.\nWe need it for the AIIR.");
    await app.click(app.byRole("button", "Raise query"));

    const views = threads(app);
    assert.deepEqual(
      views.map((view) => view.subject),
      ["Dates for the estate sale", ESTATE_QUERY],
    );
    assert.deepEqual(views[0], {
      subject: "Dates for the estate sale",
      status: "Open",
      raised: `Raised by A. Moreno · ${TODAY_TEXT}`,
      messages: [{ by: "A. Moreno", at: TODAY_TEXT, text: "Please confirm the contract date. We need it for the AIIR." }],
      actions: ["Reply to Dates for the estate sale", "Resolve Dates for the estate sale"],
    });
    assert.equal(box(app, "Subject").value, "");
    assert.equal(box(app, "Message").value, "");
    assert.equal(announced(app), "Query raised: Dates for the estate sale.");
    assert.deepEqual(tabNames(app), strip("2 exceptions", "2 open"));
    assert.equal(fundHeaderState(app)?.queries?.text, "2 open queries");

    await app.click(app.byRole("tab", "Audit trail"));
    assert.deepEqual(auditEntries(app)[0], { at: TODAY_TEXT, action: "Query raised", actor: "A. Moreno", detail: "Dates for the estate sale" });
  });

  it("opens a reply box under the thread, asks for text, sends it, and puts focus back on the Reply button", async () => {
    const app = await open("southbank", "queries");
    const reply = app.byRole("button", `Reply to ${ESTATE_QUERY}`);
    assert.equal(reply.getAttribute("aria-expanded"), "false");
    await app.click(reply);
    assert.equal(reply.getAttribute("aria-expanded"), "true");
    const text = box(app, `Reply to ${ESTATE_QUERY}`);
    expectSame(document.activeElement, text, "the box takes focus");
    assert.equal(reply.getAttribute("aria-controls"), text.closest("form")!.id);

    await app.click(app.byRole("button", "Send reply"));
    assert.equal(accessibleDescription(text), "Enter a reply");
    expectSame(document.activeElement, text, "focus stays in the box to fix");
    assert.equal(threads(app)[0]!.messages.length, 1);

    await app.type(text, "Contract dates and the cost base workpaper are attached.");
    assert.equal(accessibleDescription(text), "");
    await app.click(app.byRole("button", "Send reply"));
    expectNone(app.queryByRole("button", "Send reply"), "the box closes");
    assert.deepEqual(threads(app)[0]!.messages.at(-1), { by: "A. Moreno", at: TODAY_TEXT, text: "Contract dates and the cost base workpaper are attached." });
    assert.equal(threads(app)[0]!.messages.length, 2);
    expectSame(document.activeElement, reply, "focus goes back to the Reply button");
    assert.equal(reply.getAttribute("aria-expanded"), "false");
    assert.equal(announced(app), `Reply sent on ${ESTATE_QUERY}.`);

    await app.click(app.byRole("tab", "Audit trail"));
    assert.deepEqual(auditEntries(app)[0], { at: TODAY_TEXT, action: "Query answered", actor: "A. Moreno", detail: ESTATE_QUERY });
  });

  it("closes the reply box without sending when Esc or Cancel is used, and forgets what was typed", async () => {
    const app = await open("southbank", "queries");
    const reply = app.byRole("button", `Reply to ${ESTATE_QUERY}`);
    await app.click(reply);
    await app.type(box(app, `Reply to ${ESTATE_QUERY}`), "Draft that is never sent");
    await app.press(box(app, `Reply to ${ESTATE_QUERY}`), "Escape");
    expectNone(app.queryByRole("button", "Send reply"), "Esc closes the box");
    expectSame(document.activeElement, reply, "focus goes back to the Reply button");
    assert.equal(threads(app)[0]!.messages.length, 1);

    await app.click(reply);
    assert.equal(box(app, `Reply to ${ESTATE_QUERY}`).value, "", "the draft did not survive");
    await app.click(app.byRole("button", "Cancel"));
    expectNone(app.queryByRole("button", "Send reply"), "Cancel closes the box");
    expectSame(document.activeElement, reply, "focus goes back to the Reply button");
    assert.equal(threads(app)[0]!.messages.length, 1);
    assert.equal(announced(app), "");
  });

  it("resolves a thread: the tag changes, the buttons go, focus moves to the thread and the open count drops", async () => {
    const app = await open("southbank", "queries");
    await app.click(app.byRole("button", `Resolve ${ESTATE_QUERY}`));
    assert.deepEqual(
      threads(app).map((view) => [view.subject, view.status, view.actions]),
      [[ESTATE_QUERY, "Resolved", []]],
    );
    expectSame(document.activeElement, app.byRole("heading", { name: ESTATE_QUERY, level: 5 }), "focus moves to the thread");
    assert.equal(announced(app), `Query resolved: ${ESTATE_QUERY}.`);
    assert.deepEqual(tabNames(app), strip("2 exceptions", null));
    assert.equal(fundHeaderState(app)?.queries, null, "the header has no open queries to link to");

    await app.click(app.byRole("tab", "Audit trail"));
    assert.deepEqual(auditEntries(app)[0], { at: TODAY_TEXT, action: "Query resolved", actor: "A. Moreno", detail: ESTATE_QUERY });
  });

  it("lets a tax agent raise and answer, but not someone from fund finance, who can only read", async () => {
    const agent = await open("southbank", "queries", "d-harrow");
    expectNone(agent.maybe(".rv-note--lock"), "a tax agent is not told the form is locked");
    assert.equal(box(agent, "Subject").disabled, false);
    assert.deepEqual(threads(agent)[0]!.actions, [`Reply to ${ESTATE_QUERY}`, `Resolve ${ESTATE_QUERY}`]);
    await agent.unmount();

    const finance = await open("southbank", "queries", "m-castillo");
    const form = finance.byRole("form", "New query");
    assert.equal(flatText(form.querySelector(".rv-note--lock")!), "You can read queries, but you don't have permission to raise or answer them.");
    const subject = box(finance, "Subject");
    assert.equal(subject.disabled, true);
    assert.equal(box(finance, "Message").disabled, true);
    const raise = finance.byRole("button", "Raise query");
    assert.equal(raise.getAttribute("aria-disabled"), "true");
    assert.equal(accessibleDescription(raise), "You can read queries, but you don't have permission to raise or answer them.");
    await finance.click(raise);
    assert.equal(threads(finance).length, 1, "nothing is raised");
    assert.deepEqual(threads(finance)[0]!.actions, [], "no Reply or Resolve either");
    assert.equal(threads(finance)[0]!.messages.length, 1, "the thread can still be read");
  });

  it("says so when a fund has no queries, in words that fit what the person can do", async () => {
    const canRaise = await open("wattle", "queries");
    assert.equal(threads(canRaise).length, 0);
    assert.match(flatText(panel(canRaise)), /No queries on this distribution Use the form above to raise a question about it\.$/);
    await canRaise.unmount();

    const readOnly = await open("wattle", "queries", "m-castillo");
    assert.match(flatText(panel(readOnly)), /No queries on this distribution Nobody has raised a query about it yet\.$/);
  });
});

// ---------------------------------------------------------------------------------------------------------------- Audit trail and Rules
describe("the Audit trail tab", () => {
  it("lists what was done to the distribution, newest first, with who did it", async () => {
    const app = await open("southbank", "audit");
    assert.equal(flatText(panel(app).querySelector(".rv-summary")!), "Every change to this distribution, newest first.");
    assert.deepEqual(auditEntries(app), [
      { at: "7 Oct 2026, 11:30", action: "Query raised", actor: "D. Harrow", detail: ESTATE_QUERY },
      { at: "6 Oct 2026, 17:21", action: "Submitted for review", actor: "R. Okafor", detail: "" },
      { at: "18 Sep 2026, 14:02", action: "Discounted capital gains — TARP updated", actor: "R. Okafor", detail: "A$0 → A$9,880,000 — estate sale settled 26 Jun 2026" },
      { at: "5 Aug 2026, 09:30", action: "Trust components loaded", actor: "R. Okafor", detail: "FY2026 tax trial balance mapped to AMIT components" },
    ]);
    const times = Array.from(panel(app).querySelectorAll("time"));
    assert.equal(times[0]!.getAttribute("datetime"), "2026-10-07T11:30:00");
    assert.match(flatText(panel(app).querySelector(".rv-audit__line")!), /^Query raised by D\. Harrow$/);
  });

  it("follows a change made in the other tabs", async () => {
    const app = await open("coastline", "withholding", "r-okafor");
    assert.equal(auditEntries(app).length, 0, "the audit trail is not on screen yet");
    await enter(app, "Withholding remitted", "640,637.88");
    await app.click(app.byRole("tab", "Audit trail"));
    const [latest, previous] = auditEntries(app);
    assert.deepEqual(latest, { at: TODAY_TEXT, action: "Withholding remitted updated", actor: "R. Okafor", detail: "Not remitted → A$640,638" });
    assert.equal(previous!.action, "Trust components loaded");
  });
});

describe("the Rules tab", () => {
  it("shows the market's own table of rules: the item, its treatment and the basis for it", async () => {
    const app = await open("southbank", "rules");
    const rules = rulesFor(getFund(dataOf(app), "southbank"));
    const table = app.byRole("table", rules.title);
    assert.equal(rules.title, "Rules applied to Australian AMITs for the 2025–26 income year.");
    assert.equal(flatText(table.querySelector("caption")!), rules.title);
    assert.deepEqual(
      Array.from(table.querySelectorAll("thead th")).map((th) => flatText(th)),
      ["Item", "Treatment", "Basis"],
    );
    const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) => ({ item: flatText(tr.querySelector("th")!), cells: Array.from(tr.querySelectorAll("td")).map((td) => flatText(td)) }));
    assert.equal(rows.length, rules.rows.length);
    assert.deepEqual(rows[0], {
      item: "Fund payment — address in an information exchange (EOI) country",
      cells: ["15% final withholding", "Income Tax (Managed Investment Trust Withholding Tax) Act 2008 s4"],
    });
  });

  it("shows each fund its own market's rules", async () => {
    const app = await open("harbourline", "rules");
    for (const fund of ["harbourline", "southbank", "wattle", "kurrajong", "coastline", "telok-ayer", "loyang", "meranti", "kallang"]) {
      await app.navigate(`#/?fund=${fund}&tab=rules`);
      const rules = rulesFor(getFund(dataOf(app), fund));
      const table = app.byRole("table", rules.title);
      const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) => [flatText(tr.querySelector("th")!), ...Array.from(tr.querySelectorAll("td")).map((td) => flatText(td))]);
      assert.deepEqual(
        rows,
        rules.rows.map((row) => [row.item, row.treatment, row.basis]),
        fund,
      );
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------- audits
describe("the page audits (names, ids, tables, tabs, headings, landmarks)", () => {
  const ALL = ["withholding", "statements", "checks", "queries", "audit", "rules"];
  const CASES: [fund: string, user: string, tabs: string[], what: string][] = [
    ["southbank", "a-moreno", ALL, "view-only, with exceptions and an open query"],
    ["coastline", "r-okafor", ["withholding", "checks", "queries"], "the edit boxes and a query form that can be used"],
    ["telok-ayer", "w-l-teo", ["withholding", "statements"], "Singapore, the edit boxes"],
    ["kurrajong", "m-castillo", ["queries"], "two open queries that fund finance can read but not answer"],
    ["wattle", "a-moreno", ["checks", "queries", "audit"], "no checks and no queries"],
  ];

  for (const [fund, user, tabs, what] of CASES) {
    it(`${fund} as ${user} (${what}): ${tabs.join(", ")} pass`, async () => {
      const app = await open(fund, tabs[0], user);
      for (const tab of tabs) {
        await app.navigate(`#/?fund=${fund}&tab=${tab}`);
        expectAuditsClean(app, `${fund} / ${tab} as ${user}`);
      }
    });
  }

  it("passes with every holder's components open", async () => {
    const app = await open("southbank", "withholding");
    for (const toggle of app.allByRole("button", /^Components for /)) await app.click(toggle);
    assert.equal(app.allByRole("table", /^Components for /).length, 4);
    expectAuditsClean(app, "every components row open");
  });

  it("passes with the errors showing in the boxes", async () => {
    const app = await open("coastline", "withholding", "r-okafor");
    await enter(app, "Withholding remitted", "abc");
    expectAuditsClean(app, "an error beside the amount remitted");

    await app.navigate("#/?fund=coastline&tab=queries");
    await app.click(app.byRole("button", "Raise query"));
    expectAuditsClean(app, "both query errors showing");
  });

  it("passes with a reply box open and its error showing", async () => {
    const app = await open("southbank", "queries");
    await app.click(app.byRole("button", `Reply to ${ESTATE_QUERY}`));
    expectAuditsClean(app, "a reply box open");
    await app.click(app.byRole("button", "Send reply"));
    expectAuditsClean(app, "the reply error showing");
  });
});
