import assert from "node:assert/strict";
import { test } from "node:test";
import { downloads, mountApp } from "../../ui/harness.tsx";
import type { MountedApp } from "../../ui/harness.tsx";
import { buildXlsx } from "../../../src/app/exports/xlsx.ts";
import { rowsToCsv } from "../../../src/app/imports/xlsx.ts";

const NOW = "2026-10-12T09:00:00";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function workbookFile(rows: readonly (readonly (string | number)[])[], name = "verify.xlsx"): File {
  return new File([buildXlsx({ fileName: name, sheets: [{ name: "Import", columns: [], rows: rows.map((row) => [...row]) }] })], name, { type: XLSX_TYPE });
}

function csvFile(rows: readonly (readonly (string | number)[])[], name = "verify.csv"): File {
  return new File([rowsToCsv(rows.map((row) => row.map(String)))], name, { type: "text/csv" });
}

async function waitFor(app: MountedApp, predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await app.flush();
    if (predicate()) return;
  }
  throw new Error(`Timed out waiting for ${label}. Text was: ${app.flat().slice(0, 3000)}`);
}

async function chooseFile(app: MountedApp, label: RegExp | string, file: File): Promise<void> {
  const input = app.byLabel(label) as HTMLInputElement;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await app.act(() => { input.dispatchEvent(new Event("change", { bubbles: true })); });
}

async function trialBalanceImportSnapshot(file: File) {
  const app = await mountApp({ hash: "#/trial-balance?fund=coastline", user: "a-moreno", now: NOW });
  await app.click(app.byRole("button", { name: /Import trial balance/i }));
  await chooseFile(app, "CSV or Excel file", file);
  await waitFor(app, () => /ready to import/.test(app.text()), "trial balance preview");
  await app.click(app.byRole("button", { name: /Replace trial balance/i }));
  await waitFor(app, () => !/Import trial balance/.test(app.byRole("heading", { name: /Coastline Healthcare Property Fund/i }).textContent ?? ""), "trial balance import close");
  const rows = app.store.getState().data.tbRows.filter((row) => row.fundId === "coastline" && row.account.startsWith("99"));
  const snapshot = rows.map((row) => ({ account: row.account, name: row.name, current: row.current, prior: row.prior, category: row.category })).sort((a, b) => a.account.localeCompare(b.account));
  await app.unmount();
  return snapshot;
}

async function gstImportSnapshot(file: File) {
  const app = await mountApp({ hash: "#/gst?fund=coastline", user: "a-moreno", now: NOW });
  await app.click(app.byRole("button", { name: /Import CSV or Excel/i }));
  await chooseFile(app, /Choose CSV or Excel file/i, file);
  await waitFor(app, () => /rows ready to import/.test(app.text()), "GST import preview");
  await app.click(app.byRole("button", { name: /Replace GST ledger/i }));
  await waitFor(app, () => app.store.getState().data.gstLedger.some((row) => row.fundId === "coastline" && row.invoiceRef === "VX-1"), "GST imported rows");
  const snapshot = app.store.getState().data.gstLedger.filter((row) => row.fundId === "coastline" && row.invoiceRef === "VX-1").map((row) => ({ date: row.date, description: row.description, counterparty: row.counterparty, code: row.code, net: row.net, tax: row.tax, invoiceRef: row.invoiceRef }));
  await app.unmount();
  return snapshot;
}

async function dataImportSnapshot(tab: "funds" | "holders" | "properties", file: File) {
  const fundParam = tab === "funds" ? "" : "&fund=coastline";
  const app = await mountApp({ hash: `#/data?tab=${tab}${fundParam}`, user: "a-moreno", now: NOW });
  await chooseFile(app, "CSV or Excel file", file);
  const readyText = tab === "funds" ? /funds? ready/i : tab === "holders" ? /holders? ready/i : /propert(y|ies) ready/i;
  await waitFor(app, () => readyText.test(app.text()), `${tab} import preview`);
  await app.click(app.byRole("button", { name: new RegExp(`Import ${tab}`, "i") }));
  await waitFor(app, () => {
    const data = app.store.getState().data;
    if (tab === "funds") return data.funds.some((fund) => fund.name === "Verifier UI Fund");
    if (tab === "holders") return data.holders.some((holder) => holder.fundId === "coastline" && holder.holder === "Verifier Holder");
    return data.properties.some((property) => property.fundId === "coastline" && property.name === "Verifier Property");
  }, `${tab} imported rows`);
  const data = app.store.getState().data;
  const snapshot = tab === "funds"
    ? data.funds.filter((fund) => fund.name === "Verifier UI Fund").map((fund) => ({ name: fund.name, market: fund.market, periodStart: fund.periodStart, periodEnd: fund.periodEnd, unitsOnIssue: fund.unitsOnIssue }))
    : tab === "holders"
      ? data.holders.filter((holder) => holder.fundId === "coastline" && holder.holder === "Verifier Holder").map((holder) => ({ holder: holder.holder, country: holder.country, units: holder.units }))
      : data.properties.filter((property) => property.fundId === "coastline" && property.name === "Verifier Property").map((property) => ({ name: property.name, location: property.location, acquired: property.acquired, cost: property.cost, valuation: property.valuation }));
  await app.unmount();
  return snapshot;
}

async function assetsImportSnapshot(file: File) {
  const app = await mountApp({ hash: "#/assets?fund=coastline", user: "a-moreno", now: NOW });
  await app.click(app.byRole("button", { name: /Import CSV/i }));
  await chooseFile(app, "CSV or Excel file", file);
  await waitFor(app, () => /1 asset ready to import/i.test(app.text()), "asset import preview");
  await app.click(app.byRole("button", { name: /^Import 1$/i }));
  await waitFor(app, () => app.store.getState().data.assets.some((asset) => asset.fundId === "coastline" && asset.description === "Verifier asset"), "asset imported row");
  const snapshot = app.store.getState().data.assets.filter((asset) => asset.fundId === "coastline" && asset.description === "Verifier asset").map((asset) => ({ kind: asset.kind, description: asset.description, cost: asset.cost, startDate: asset.startDate }));
  await app.unmount();
  return snapshot;
}

test("G3 property taxes page shows WA MRIT basis and assessment notice amounts", async () => {
  const app = await mountApp({ hash: "#/property-taxes?fund=wattle", user: "a-moreno", now: NOW });
  const text = app.text();
  assert.match(text, /Banksia Plaza/);
  assert.match(text, /Includes MRIT: Perth metropolitan region/);
  assert.match(text, /Assessed A\$/);
  assert.match(text, /30 Sep 2026/);
});

test("G5 Rules page exposes the read-only Fund settings tab", async () => {
  const app = await mountApp({ hash: "#/rules?tab=funds", user: "l-brennan", now: NOW });
  const text = app.text();
  assert.match(text, /Fund settings/);
  assert.match(text, /Expense allocation/);
  assert.match(text, /Harbourline Office Trust/);
  assert.equal(app.queryByRole("button", { name: /Save|Import|Delete|Add/i }), null);
});

test("G6 due diligence page is readable to view-only and only downloads artifacts", async () => {
  const app = await mountApp({ hash: "#/due-diligence?fund=harbourline", user: "m-castillo", now: NOW });
  const text = app.text();
  app.byRole("heading", { name: /Harbourline Office Trust/ });
  assert.match(text, /Signed off/);
  assert.match(text, /AMIT · Office · Listed/);
  assert.match(text, /Tax due diligence report/);
  assert.match(text, /Entity and regime/);
  assert.match(text, /Scope and limitations|not tax advice/i);
  assert.equal(app.queryByRole("button", { name: /Save|Record|Add|Delete|Reopen|Sign off/i }), null);
  await app.click(app.byRole("button", { name: /Download findings CSV/i }));
  assert.ok(downloads.some((download) => download.fileName.endsWith("tax-due-diligence-findings.csv")));
});

test("G8 trial balance, GST and Compare UI read .xlsx the same as CSV", async () => {
  const tbRows = [
    ["account", "name", "current", "prior", "category"],
    ["9991", "Verifier rent", -100, 0, "rent"],
    ["9992", "Verifier repairs", 100, 0, "deductible-expense"],
  ];
  assert.deepEqual(await trialBalanceImportSnapshot(workbookFile(tbRows)), await trialBalanceImportSnapshot(csvFile(tbRows)));

  const gstRows = [
    ["date", "invoice", "description", "counterparty", "code", "net", "tax"],
    ["2025-08-15", "VX-1", "Verifier sale", "Verifier tenant", "SALE_TAXABLE", "110", "11"],
  ];
  assert.deepEqual(await gstImportSnapshot(workbookFile(gstRows)), await gstImportSnapshot(csvFile(gstRows)));

  const compareRows = [
    ["Reference", "Label", "Amount"],
    ["component.ausOtherIncome", "Verifier Australian income", "600067.81"],
  ];
  const app = await mountApp({ hash: "#/compare?fund=coastline", user: "a-moreno", now: NOW });
  await chooseFile(app, /Choose CSV or Excel file/i, workbookFile(compareRows));
  await waitFor(app, () => /Read the first sheet: Import/.test(app.text()) && /Verifier Australian income/.test(app.text()), "Compare xlsx preview");
  const xlsxText = app.flat();
  await app.unmount();
  const csvApp = await mountApp({ hash: "#/compare?fund=coastline", user: "a-moreno", now: NOW });
  await chooseFile(csvApp, /Choose CSV or Excel file/i, csvFile(compareRows));
  await waitFor(csvApp, () => /Verifier Australian income/.test(csvApp.text()), "Compare CSV preview");
  assert.match(xlsxText, /Loaded 1 line/);
  assert.match(csvApp.flat(), /Loaded 1 line/);
  assert.equal(/Verifier Australian income/.test(csvApp.flat()), true);
});

test("G8 Data page funds, holders and properties imports read .xlsx the same as CSV", async () => {
  const fundRows = [
    ["market", "name", "sector", "listed", "periodStart", "periodEnd", "unitsOnIssue", "governance", "assessmentYear"],
    ["AU", "Verifier UI Fund", "Office", "no", "2025-07-01", "2026-06-30", "12345", "no-agent", ""],
  ];
  assert.deepEqual(await dataImportSnapshot("funds", workbookFile(fundRows)), await dataImportSnapshot("funds", csvFile(fundRows)));

  const holderRows = [
    ["holder", "country", "units", "auStatus"],
    ["Verifier Holder", "Australia", "1234", "resident"],
  ];
  assert.deepEqual(await dataImportSnapshot("holders", workbookFile(holderRows)), await dataImportSnapshot("holders", csvFile(holderRows)));

  const propertyRows = [
    ["name", "location", "acquired", "cost", "improvements", "capitalWorksClaimed", "valuation"],
    ["Verifier Property", "Sydney NSW", "2025-09-01", "1000000", "25000", "1000", "1200000"],
  ];
  assert.deepEqual(await dataImportSnapshot("properties", workbookFile(propertyRows)), await dataImportSnapshot("properties", csvFile(propertyRows)));
});

test("G8 Assets import dialog reads .xlsx the same as CSV", async () => {
  const assetRows = [
    ["kind", "propertyId", "description", "cost", "startDate", "assetClassId", "methodOrRegime", "effectiveLifeYears"],
    ["AU_DIV40", "", "Verifier asset", "950", "2025-07-01", "OTHER_PLANT", "PRIME_COST", "10"],
  ];
  assert.deepEqual(await assetsImportSnapshot(workbookFile(assetRows)), await assetsImportSnapshot(csvFile(assetRows)));
});
