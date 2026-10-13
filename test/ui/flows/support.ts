// Helpers shared by the cross-workspace flow tests: reading the store and the page the way a person does, switching persona, pressing the header
// buttons, and waiting for the files the export helpers make asynchronously.
import assert from "node:assert/strict";
import type { AppData, AuFund, AuditEntry, Fund, SgFund } from "../../../src/domain/index.ts";
import { allByLabel, flatText } from "../dom.ts";
import { downloads, type MountedApp } from "../harness.tsx";
import { expectFundHeader } from "../expect.ts";
import { oracle } from "../oracle.ts";
import { announced, fundHeaderState, personaSelect, type FundHeaderState } from "../shell.ts";

/** The clock every flow runs on (the harness default), as the store writes it into audit entries and approvals. */
export const NOW_LOCAL = "2026-10-12T09:00:00";
export const NOW_AUDIT_TIME = "12 Oct 2026, 09:00";

export const dataOf = (app: MountedApp): AppData => app.store.getState().data;
export const fundOf = (app: MountedApp, fundId: string): Fund => {
  const fund = dataOf(app).funds.find((candidate) => candidate.id === fundId);
  assert.ok(fund, `fund ${fundId} exists`);
  return fund;
};
export const auFundOf = (app: MountedApp, fundId: string): AuFund => {
  const fund = fundOf(app, fundId);
  assert.ok(fund.market === "AU", `${fundId} is an Australian fund`);
  return fund;
};
export const sgFundOf = (app: MountedApp, fundId: string): SgFund => {
  const fund = fundOf(app, fundId);
  assert.ok(fund.market === "SG", `${fundId} is a Singapore fund`);
  return fund;
};

/** Switches persona with the "Working as" select, the way a person does; the data and the page stay where they are. */
export async function asUser(app: MountedApp, userId: string): Promise<void> {
  await app.select(personaSelect(app), userId);
  assert.equal(app.ui().currentUserId, userId);
}

/** The whole fund header (name, status, governance, approvals, queries, buttons and their reasons) against what the domain layer says for this persona right now. */
export function expectHeader(app: MountedApp, fundId: string, where: string): void {
  expectFundHeader(app, oracle(app.ui().currentUserId, "all", dataOf(app)), fundId, where);
}

/** Types into a box and leaves it: the edit saves on blur. */
export async function enter(app: MountedApp, label: string | RegExp, text: string): Promise<void> {
  const box = app.byLabel(label);
  await app.focus(box);
  await app.type(box, text);
  await app.blur(box);
}

/** Opens a tab of the Distributions workspace and checks it is the selected one. */
export async function openTab(app: MountedApp, name: RegExp): Promise<void> {
  await app.click(app.byRole("tab", name));
  assert.equal(app.byRole("tab", name).getAttribute("aria-selected"), "true", `the ${String(name)} tab is selected`);
}

export const header = (app: MountedApp): FundHeaderState => {
  const state = fundHeaderState(app);
  assert.ok(state, "the page has a fund header");
  return state;
};

/** "Submit for review", "Sign off (unavailable: reason)": what the header offers, in order. */
export const offered = (app: MountedApp): string[] =>
  header(app).actions.map((action) => (action.disabled ? `${action.label} (unavailable: ${action.reason ?? "no reason given"})` : action.label));

/** Presses an available header button and returns the announcement it caused. */
export async function pressHeader(app: MountedApp, label: string): Promise<string> {
  const action = header(app).actions.find((candidate) => candidate.label === label);
  assert.ok(action, `"${label}" is offered; the header shows ${JSON.stringify(offered(app))}`);
  assert.equal(action.disabled, false, `"${label}" is available (${action.reason ?? ""})`);
  await app.click(action.element);
  return announced(app);
}

/** The rows of the Audit trail tab, newest first. */
export function auditRows(app: MountedApp): Array<{ at: string; action: string; actor: string; detail: string }> {
  return app.$$("ol.rv-audit > li").map((row) => ({
    at: flatText(row.querySelector("time")!),
    action: flatText(row.querySelector(".rv-audit__action")!),
    actor: flatText(row.querySelector(".rv-audit__line > span:last-child")!),
    detail: row.querySelector(".rv-audit__detail") ? flatText(row.querySelector(".rv-audit__detail")!) : "",
  }));
}

/** The items of the Checks tab. */
export function checkRows(app: MountedApp): Array<{ tag: string; title: string; detail: string }> {
  return app.$$("ol.rv-checks > li").map((row) => ({
    tag: flatText(row.querySelector(".tag")!),
    title: flatText(row.querySelector(".rv-check__title")!),
    detail: flatText(row.querySelector(".rv-check__detail")!),
  }));
}

/** What the store gained between two snapshots: the audit entries added, in order, without their ids. */
export function recordedSince(before: AppData, after: AppData): Array<Omit<AuditEntry, "id">> {
  const known = new Set(before.audit.map((entry) => entry.id));
  return after.audit.filter((entry) => !known.has(entry.id)).map(({ id: _id, ...rest }) => rest);
}

const REAL_TIMEOUT_MS = 30_000;

/** Waits (in real time: the harness clock is frozen) until `ready()` holds, letting React and the event loop run in between. */
export async function until(app: MountedApp, ready: () => boolean, what: string, timeoutMs = REAL_TIMEOUT_MS): Promise<void> {
  const started = performance.now();
  while (!ready()) {
    if (performance.now() - started > timeoutMs) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}.`);
    await app.act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
  }
}

export interface Received {
  fileName: string;
  type: string;
  bytes: Buffer;
  /** The bytes as UTF-8 text (for CSV). */
  text: string;
}

/** Clicks a download button and returns the one file it hands to the browser. */
export async function download(app: MountedApp, button: HTMLElement): Promise<Received> {
  const before = downloads.length;
  await app.click(button);
  await until(app, () => downloads.length > before, `the file behind "${flatText(button)}"`);
  await app.flush();
  assert.equal(downloads.length, before + 1, "one click hands over one file");
  const { fileName, blob } = downloads[downloads.length - 1]!;
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { fileName, type: blob.type, bytes, text: bytes.toString("utf8") };
}

// ---------------------------------------------------------------------------------------------------------------- tables
/** Whether the page has a form control with this accessible name. */
export const hasControl = (app: MountedApp, label: string | RegExp): boolean => allByLabel(app.container, label).length > 0;

export const cellsOf = (row: Element): string[] => Array.from(row.querySelectorAll("th, td")).map((cell) => flatText(cell));

/** The body rows of a table, each as the text of its cells. */
export const tableRows = (table: Element): string[][] => Array.from(table.querySelectorAll("tbody tr")).map(cellsOf);

/** The footer rows of a table (totals), each as the text of its cells. */
export const footRows = (table: Element): string[][] => Array.from(table.querySelectorAll("tfoot tr")).map(cellsOf);

/** The row of `table` whose first cell starts with `label` (throws when there is none or more than one). */
export function rowStarting(table: Element, label: string): string[] {
  const found = tableRows(table).filter((cells) => (cells[0] ?? "").startsWith(label));
  assert.equal(found.length, 1, `exactly one row starts with "${label}"; the table has ${JSON.stringify(tableRows(table).map((cells) => cells[0]))}`);
  return found[0]!;
}

/** The distribution table of a fund workspace: one row per component. */
export const distributionTable = (app: MountedApp): HTMLElement => app.$("table.dist-table");

/** One row of the Bulk review table, read as it is on screen. */
export function bulkRow(app: MountedApp, fundName: string): { status: string; approvals: string; exceptions: string; queries: string; next: string; checkbox: HTMLInputElement } {
  const link = app.$$("a.bulk-fund__link").find((candidate) => flatText(candidate) === fundName);
  assert.ok(link, `the Bulk review table has a row for ${fundName}`);
  const row = link.closest("tr")!;
  const cells = cellsOf(row);
  const box = app.byLabel(`Select ${fundName}`) as HTMLInputElement;
  return { status: cells[2]!.replace(/^Workflow status:\s*/, ""), approvals: cells[3]!, exceptions: cells[4]!, queries: cells[5]!, next: cells[6]!, checkbox: box };
}

export interface BulkTableRow {
  name: string;
  governance: string;
  status: string;
  approvals: string;
  exceptions: string;
  queries: string;
  next: string;
  ticked: boolean;
}

/** The whole Bulk review table as it is on screen, one entry per fund. */
export function bulkTable(app: MountedApp): BulkTableRow[] {
  return app.$$("table.bulk-table tbody tr").map((row) => {
    const cells = cellsOf(row);
    return {
      name: flatText(row.querySelector("a.bulk-fund__link")!),
      governance: flatText(row.querySelector(".bulk-fund__governance")!),
      status: cells[2]!.replace(/^Workflow status:\s*/, ""),
      approvals: cells[3]!,
      exceptions: cells[4]!,
      queries: cells[5]!,
      next: cells[6]!,
      ticked: (row.querySelector("input[type=checkbox]") as HTMLInputElement).checked,
    };
  });
}

/** The count line above the table ("3 selected, 1 can be signed off"). */
export const bulkSummary = (app: MountedApp): string => flatText(app.$(".bulk__summary"));

/** The three bulk buttons in order with their state (a button is unavailable when it says aria-disabled). */
export const bulkButtons = (app: MountedApp): Array<{ label: string; disabled: boolean }> =>
  Array.from(app.$(".bulk-actions").querySelectorAll("button")).map((button) => ({ label: flatText(button), disabled: button.getAttribute("aria-disabled") === "true" }));

/** The result banner of the last run (null when there is none). */
export function bulkReport(app: MountedApp): { tone: string; title: string; lines: string[] } | null {
  const banner = app.maybe(".bulk__result .banner");
  if (!banner) return null;
  return {
    tone: /banner--(\w+)/.exec(banner.className)?.[1] ?? "",
    title: flatText(banner.querySelector(".banner__title")!),
    lines: Array.from(banner.querySelectorAll("ul.bulk-result__lines > li")).map((line) => flatText(line)),
  };
}

/** Ticks or clears the select-all box. */
export async function selectAllFunds(app: MountedApp): Promise<void> {
  await app.click(app.byLabel("Select all funds"));
}

/** Ticks one fund by name. */
export async function tickFund(app: MountedApp, fundName: string): Promise<void> {
  await app.click(app.byLabel(`Select ${fundName}`));
}

/** Presses one of the bulk buttons, which must be available. */
export async function runBulk(app: MountedApp, label: string): Promise<void> {
  const button = bulkButtons(app).find((candidate) => candidate.label === label);
  assert.ok(button, `the page has a "${label}" button; it shows ${JSON.stringify(bulkButtons(app))}`);
  assert.equal(button.disabled, false, `"${label}" is available (${bulkSummary(app)})`);
  await app.click(app.byRole("button", label));
}

/** Raises a query from the Queries tab of the fund on screen. */
export async function raiseQuery(app: MountedApp, subject: string, message: string): Promise<void> {
  await openTab(app, /^Queries/);
  await app.type(app.byLabel("Subject"), subject);
  await app.type(app.byLabel("Message"), message);
  await app.click(app.byRole("button", "Raise query"));
}

/** On the Distributions Withholding tab: remit exactly what is computed. Returns the amount shown, e.g. "647,628.88". */
export async function remitComputed(app: MountedApp, currency: "A$" | "S$" = "A$"): Promise<string> {
  await openTab(app, /^Withholding/);
  const computed = new RegExp(`Computed withholding\\s*${currency.replace("$", "\\$")}([\\d,]+\\.\\d\\d)`).exec(app.text())?.[1];
  assert.ok(computed, "the computed withholding is shown");
  await enter(app, "Withholding remitted", computed);
  assert.match(app.text(), /Result\s*Reconciled/);
  return computed;
}