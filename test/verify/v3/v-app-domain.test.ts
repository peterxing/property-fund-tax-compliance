import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { buildXlsx, columnRef } from "../../../src/app/exports/xlsx.ts";
import { crc32, zipStore, type ZipEntry } from "../../../src/app/exports/zip.ts";
import { parsePropertiesCsv } from "../../../src/app/workspaces/data/model.ts";
import { parseAssetCsv } from "../../../src/app/workspaces/assets/model.ts";
import { rowsToCsv, XLSX_IMPORT_LIMITS, xlsxToCsv } from "../../../src/app/imports/xlsx.ts";
import { applyAction } from "../../../src/domain/actions.ts";
import { assetRegisterView } from "../../../src/domain/assets/index.ts";
import { appDataProblem } from "../../../src/domain/core/schema.ts";
import { normaliseAppData } from "../../../src/domain/core/normalise.ts";
import { dueDiligenceView } from "../../../src/domain/duediligence/index.ts";
import { obligationOccurrences } from "../../../src/domain/entities/obligations.ts";
import { gstPeriods } from "../../../src/domain/gst/index.ts";
import { inputHash, lastSignOffVersion } from "../../../src/domain/governance/versions.ts";
import { moduleFor } from "../../../src/domain/modules.ts";
import { ptaxProviders } from "../../../src/domain/ptax/providers.ts";
import { dutiesView, propertyTaxView } from "../../../src/domain/ptax/index.ts";
import { calendarView, icsCalendar, riskRegister, rulesRegister } from "../../../src/domain/portfolio/index.ts";
import { FEATURE_PROVIDERS } from "../../../src/domain/providers.ts";
import { costBaseView, fundCalc, investorView, returnView, tbView, workflowView } from "../../../src/domain/selectors.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import { createStore } from "../../../src/domain/store.ts";
import { defaultUi } from "../../../src/domain/seed/index.ts";
import { holderTreatment } from "../../../src/domain/sg/withholding.ts";
import type { FixedAsset } from "../../../src/domain/assets/types.ts";
import type { Action, AppData, AuFund, Ctx, DeadlineRow, Fund, FundId, SgHolder, User } from "../../../src/domain/types.ts";

const NOW = new Date("2026-10-12T09:00:00Z");
const encoder = new TextEncoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function xlsxEntries(overrides: Partial<Record<string, string | Uint8Array>> = {}): ZipEntry[] {
  const defaults: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>",
    "_rels/.rels": "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>",
    "xl/workbook.xml": "<?xml version=\"1.0\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Sheet1\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
    "xl/_rels/workbook.xml.rels": "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>",
    "xl/styles.xml": "<?xml version=\"1.0\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"yyyy-mm-dd\"/></numFmts><cellXfs count=\"2\"><xf numFmtId=\"0\"/><xf numFmtId=\"164\" applyNumberFormat=\"1\"/></cellXfs></styleSheet>",
    "xl/sharedStrings.xml": "<?xml version=\"1.0\"?><sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><si><t>Shared</t></si><si><r><t>Rich </t></r><r><t>text</t></r></si></sst>",
    "xl/worksheets/sheet1.xml": "<?xml version=\"1.0\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData><row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c></row></sheetData></worksheet>",
  };
  return Object.entries({ ...defaults, ...overrides }).map(([name, data]) => ({ name, data: typeof data === "string" ? bytes(data) : data ?? new Uint8Array() }));
}

function xlsxPackage(overrides: Partial<Record<string, string | Uint8Array>> = {}): Uint8Array {
  return zipStore(xlsxEntries(overrides));
}

function zipDeflate(entries: readonly ZipEntry[]): Uint8Array {
  const prepared = entries.map((entry) => {
    const name = bytes(entry.name);
    const compressed = deflateRawSync(entry.data);
    return { name, raw: entry.data, compressed, crc: crc32(entry.data) };
  });
  const total = prepared.reduce((sum, entry) => sum + 30 + entry.name.length + entry.compressed.length + 46 + entry.name.length, 22);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let o = 0;
  const u16 = (v: number) => { view.setUint16(o, v, true); o += 2; };
  const u32 = (v: number) => { view.setUint32(o, v, true); o += 4; };
  const put = (data: Uint8Array) => { out.set(data, o); o += data.length; };
  const offsets: number[] = [];
  for (const entry of prepared) {
    offsets.push(o);
    u32(0x04034b50); u16(20); u16(0); u16(8); u16(0); u16(33);
    u32(entry.crc); u32(entry.compressed.length); u32(entry.raw.length); u16(entry.name.length); u16(0);
    put(entry.name); put(entry.compressed);
  }
  const central = o;
  prepared.forEach((entry, i) => {
    u32(0x02014b50); u16(20); u16(20); u16(0); u16(8); u16(0); u16(33);
    u32(entry.crc); u32(entry.compressed.length); u32(entry.raw.length); u16(entry.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(offsets[i]!);
    put(entry.name);
  });
  const centralSize = o - central;
  u32(0x06054b50); u16(0); u16(0); u16(prepared.length); u16(prepared.length); u32(centralSize); u32(central); u16(0);
  return out;
}

function patchedZip(entry: ZipEntry, patch: (view: DataView, local: number, central: number, end: number) => void): Uint8Array {
  const zip = zipStore([entry]);
  const view = new DataView(zip.buffer);
  const central = 30 + bytes(entry.name).length + entry.data.length;
  const end = zip.byteLength - 22;
  patch(view, 0, central, end);
  return zip;
}

async function rejectsFast(name: string, workbook: Uint8Array, pattern: RegExp, maxMs = 1000): Promise<void> {
  const started = performance.now();
  await assert.rejects(() => xlsxToCsv(workbook), pattern, name);
  assert.ok(performance.now() - started < maxMs, `${name} rejected within ${maxMs} ms`);
}

function userOf(data: AppData, id = "a-moreno"): User {
  const user = data.users.find((entry) => entry.id === id);
  assert.ok(user, `missing user ${id}`);
  return user;
}

function ctx(data: AppData, id = "a-moreno"): Ctx {
  return { now: NOW, user: userOf(data, id) };
}

function fundOf(data: AppData, id: string): Fund {
  const fund = data.funds.find((entry) => entry.id === id);
  assert.ok(fund, `missing fund ${id}`);
  return fund;
}

function ok(data: AppData, action: Action, userId = "a-moreno"): AppData {
  const result = applyAction(data, action, ctx(data, userId));
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
  return result.ok ? result.data : data;
}

function rejected(data: AppData, action: Action, userId = "a-moreno"): string {
  const result = applyAction(data, action, ctx(data, userId));
  assert.equal(result.ok, false, `${action.type} should be rejected`);
  return result.ok ? "" : result.reason;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

type DdStatus = "Clear" | "Attention" | "Issue";

function today(): string {
  return "2026-10-12";
}

function addDaysIso(days: number): string {
  const date = new Date(NOW.getTime());
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function allDeadlinesFor(data: AppData, fund: Fund): DeadlineRow[] {
  const calc = fundCalc(data, fund.id, NOW);
  return [
    ...moduleFor(fund.market).deadlines(data, fund, calc, NOW),
    ...FEATURE_PROVIDERS.flatMap((provider) => provider.deadlines?.(data, fund, NOW) ?? []),
  ];
}

function expectedDueDiligenceStatuses(data: AppData, fundId: FundId): Record<string, DdStatus> {
  const fund = fundOf(data, fundId);
  const context = ctx(data);
  const calc = fundCalc(data, fund.id, NOW);
  const workflow = workflowView(data, fund.id, context);
  const version = lastSignOffVersion(data, fund.id);
  const stale = Boolean(version && version.inputHash !== inputHash(data, fund.id));
  const distIssue = ["under-remitted", "over-remitted"].includes(calc.recon.status) || calc.registerUnits !== fund.unitsOnIssue;
  const returns = returnView(data, fund.id, context);
  const investor = investorView(data, fund.id, context);
  const gst = gstPeriods(data, fund, NOW);
  const deadlines = allDeadlinesFor(data, fund);
  const overdueDeadlines = deadlines.filter((row) => row.status === "overdue");
  const risks = riskRegister(data, context, "all", { fundId: fund.id }).rows.filter((row) => row.fundId === fund.id);
  const openQueries = data.queries.filter((query) => query.fundId === fund.id && query.status === "open");
  const upcoming = deadlines.filter((row) => row.status !== "done" && row.date >= today() && row.date <= addDaysIso(90));
  const annual = propertyTaxView(data, fund.id, { now: NOW });
  const duties = dutiesView(data, fund.id, { now: NOW });
  const annualOpen = annual.rows.filter((row) => row.status === "modelled" && !row.paid);
  const dutyOpen = duties.rows.filter((row) => row.status === "modelled" && !row.paid);
  const assets = assetRegisterView(data, fund.id, context);
  const tb = tbView(data, fund.id, NOW);
  const assumptionRules = rulesRegister({ market: fund.market, confidence: "ASSUMPTION" }).filteredRows;
  return {
    entity: fund.unitsOnIssue > 0 ? "Clear" : "Issue",
    workflow: stale ? "Issue" : fund.status === "Signed off" && workflow.openQueries === 0 && workflow.exceptions === 0 ? "Clear" : "Attention",
    distribution: distIssue ? "Issue" : calc.recon.status === "not-remitted" ? "Attention" : "Clear",
    lodgment: overdueDeadlines.length > 0 || gst.some((period) => period.status === "overdue") ? "Issue" : returns.lodgment || investor.market === "AU" ? (gst.some((period) => period.status === "open") ? "Attention" : "Clear") : "Attention",
    "open-items": risks.some((row) => row.severity === "exception") || overdueDeadlines.length > 0 || openQueries.length > 0 ? "Issue" : risks.some((row) => row.severity === "note") || upcoming.length > 0 ? "Attention" : "Clear",
    "property-taxes": annualOpen.some((row) => row.dueDate !== null && row.dueDate < today()) || dutyOpen.some((row) => row.deadline !== null && row.deadline < today()) ? "Issue" : annual.rows.some((row) => row.status !== "modelled") || duties.rows.some((row) => row.status !== "modelled") || annualOpen.length > 0 || dutyOpen.length > 0 ? "Attention" : "Clear",
    assets: assets.comparisons.some((row) => !row.agrees) ? "Issue" : assets.warnings.length > 0 || assets.rows.length === 0 ? "Attention" : "Clear",
    "data-quality": tb.rows.some((row) => row.category === "unmapped") ? "Issue" : data.manualAdjustments.some((row) => row.fundId === fund.id) || assumptionRules.length > 0 ? "Attention" : "Clear",
  };
}

test("v3 saved-state fields remain optional and old backups normalise through the store", () => {
  const old = seedData();
  delete (old as { obligations?: unknown }).obligations;
  for (const fund of old.funds) if (fund.market === "AU") delete (fund as AuFund).expenseAllocation;
  for (const profile of old.propertyProfiles) {
    delete profile.notices;
    delete profile.auMetropolitanRegion;
  }
  for (const holder of old.holders) delete (holder as SgHolder).sgFundSection;
  for (const asset of old.assets) {
    delete (asset as { poolMethod?: unknown }).poolMethod;
    delete (asset as { claimMode?: unknown }).claimMode;
    delete (asset as { disposalProceeds?: unknown }).disposalProceeds;
  }

  assert.equal(appDataProblem(old), null);
  assert.deepEqual(normaliseAppData(old as AppData).obligations, []);
  const store = createStore({ storage: null, initial: { data: seedData(), ui: defaultUi() } });
  assert.equal(store.importData(old), null);
  assert.deepEqual(store.getState().data.obligations, []);
});

test("G3 WA metropolitan flag removes only MRIT, and notices drive due dates, risk and compare lines", () => {
  const data = seedData();
  const banksiaBefore = propertyTaxView(data, "wattle", { now: NOW }).rows.find((row) => row.propertyId === "wattle-banksia-plaza");
  assert.ok(banksiaBefore);
  // WA MRIT is 0.14% above A$300,000 for land in the metropolitan region:
  // (A$266,398,217.50 - A$300,000) * 0.14% = A$372,537.5045, rounded to cents.
  assert.equal(banksiaBefore.surcharge, 37_253_750);
  assert.match(banksiaBefore.basis, /Includes MRIT: Perth metropolitan region/);

  const off = ok(data, { type: "ptax-update-profile", fundId: "wattle", propertyId: "wattle-banksia-plaza", patch: { auMetropolitanRegion: false } });
  const banksiaAfter = propertyTaxView(off, "wattle", { now: NOW }).rows.find((row) => row.propertyId === "wattle-banksia-plaza");
  assert.equal(banksiaAfter?.tax, banksiaBefore.tax);
  assert.equal(banksiaAfter?.surcharge, 0);
  assert.match(banksiaAfter?.basis ?? "", /No MRIT: outside the metropolitan region/);
  assert.equal(appDataProblem(off), null);

  const noticed = ok(off, {
    type: "ptax-record-notice",
    fundId: "wattle",
    propertyId: "wattle-coral-coast-central",
    period: "land-tax-2026",
    assessedAmount: 585_954_029,
    issueDate: "2026-08-20",
    dueDate: "2026-10-31",
    reference: "QRO-2026-CC",
  });
  const row = propertyTaxView(noticed, "wattle", { now: NOW }).rows.find((entry) => entry.propertyId === "wattle-coral-coast-central");
  assert.equal(row?.dueDate, "2026-10-31");
  assert.equal(row?.dueEstimated, false);
  assert.match(row?.assessedLabel ?? "", /Assessed A\$5,859,540/);
  assert.ok((ptaxProviders.deadlines?.(noticed, fundOf(noticed, "wattle"), NOW) ?? []).some((deadline) => deadline.date === "2026-10-31"));
  assert.ok((ptaxProviders.risks?.(noticed, fundOf(noticed, "wattle"), NOW) ?? []).some((risk) => risk.title === "Coral Coast Central: assessed differs from modelled"));
  const assessedSource = ptaxProviders.compareSources?.(noticed, fundOf(noticed, "wattle"), NOW)?.find((source) => source.id === "ptax-annual-assessed");
  assert.ok(assessedSource?.lines.some((line) => line.amount === 585_954_029 && /QRO-2026-CC/.test(line.note ?? "")));
});

test("G4 asset register exposes balancing adjustments, low-value pool and SG s14N by hand", () => {
  const data = seedData();
  const auAsset: FixedAsset = {
    id: "verify-disposal",
    fundId: "coastline",
    propertyId: null,
    kind: "AU_DIV40",
    description: "Disposed prime-cost plant",
    cost: 100_000_00,
    startDate: "2025-07-01",
    assetClassId: "OTHER_PLANT",
    method: "PRIME_COST",
    effectiveLifeYears: 10,
    disposalDate: "2026-06-30",
    disposalProceeds: 95_000_00,
  };
  const poolAsset: FixedAsset = { ...auAsset, id: "verify-pool", description: "Low-cost controller", cost: 800_00, disposalDate: undefined, disposalProceeds: undefined, poolMethod: "LOW_VALUE_POOL" };
  const auView = assetRegisterView({ ...data, assets: [auAsset, poolAsset] }, "coastline", ctx(data));
  const disposal = auView.rows.find((row) => row.id === "verify-disposal");
  // s40-285: A$100,000 prime cost / 10 years = A$10,000 decline; adjustable value A$90,000; proceeds A$95,000 -> A$5,000 assessable income.
  assert.equal(disposal?.baseDeduction, 10_000_00);
  assert.equal(disposal?.balancingAdjustmentIncome, 5_000_00);
  assert.equal(disposal?.deduction, 5_000_00);
  assert.ok(auView.rows.some((row) => row.source === "pool" && row.deduction === 150_00), "18.75% of A$800 first-year low-value pool deduction");
  assert.ok(auView.schedule.some((row) => row.kind === "AU_DIV40" && row.deduction === 243_75), "37.5% of A$650 second-year pool balance");

  const rrAsset: FixedAsset = { id: "verify-rr", fundId: "telok-ayer", propertyId: null, kind: "SG_RR", description: "Lobby R&R", cost: 120_000_00, startDate: "2026-08-01", claimMode: "THREE_YEAR" };
  const sgView = assetRegisterView({ ...data, assets: [rrAsset] }, "telok-ayer", ctx(data));
  assert.equal(sgView.rows.find((row) => row.id === "verify-rr")?.deduction, 40_000_00);
  assert.deepEqual(sgView.schedule.filter((row) => row.kind === "SG_RR").map((row) => row.deduction), [40_000_00, 40_000_00, 40_000_00]);
});

test("G4 asset reducers are permission-checked, schema-valid and immutable", () => {
  const frozen = deepFreeze(seedData());
  const beforeAssets = frozen.assets.length;
  assert.match(rejected(frozen, { type: "asset-add", fundId: "coastline", asset: { kind: "AU_DIV40", propertyId: null, description: "Viewer plant", cost: 500_00, startDate: "2025-07-01", assetClassId: "OTHER_PLANT", method: "PRIME_COST", effectiveLifeYears: 4 } }, "m-castillo"), /View only|permission/);
  const added = ok(frozen, { type: "asset-add", fundId: "coastline", asset: { kind: "AU_DIV40", propertyId: null, description: "Verifier low-cost plant", cost: 950_00, startDate: "2025-07-01", assetClassId: "OTHER_PLANT", method: "PRIME_COST", effectiveLifeYears: 4, poolMethod: "LOW_VALUE_POOL" } });
  assert.equal(frozen.assets.length, beforeAssets);
  assert.equal(appDataProblem(added), null);
  assert.equal(added.audit.at(-1)?.action, "Asset register updated");
});

test("G5 expense allocation reproduces pro-rata defaults and sets excess allocations against other income", () => {
  const base = seedData();
  const without = tbView(base, "coastline", NOW).derivedInputs;
  const explicit = ok(base, { type: "entity-set-expense-allocation", fundId: "coastline", allocation: { method: "pro-rata" } });
  assert.deepEqual(tbView(explicit, "coastline", NOW).derivedInputs, without);

  const fixture = seedData();
  const fund = fundOf(fixture, "coastline") as AuFund;
  fixture.taxAdjustments[fund.id] = { div40: 0, div43: 0, tarpDiscountGross: 0, tarpOther: 0 };
  fixture.tbRows = [
    { id: "verify-rent", fundId: fund.id, account: "4000", name: "Other rent", category: "rent", current: -100_000_00, prior: 0 },
    { id: "verify-exp", fundId: fund.id, account: "5200", name: "Repairs", category: "deductible-expense", current: 160_000_00, prior: 0 },
    { id: "verify-interest", fundId: fund.id, account: "4300", name: "Interest", category: "interest-income", current: -80_000_00, prior: 0 },
  ];
  fund.expenseAllocation = { method: "other-income" };
  const tb = tbView(fixture, fund.id, NOW);
  assert.equal((tb.derivedInputs as unknown as Record<string, number>).ausOtherIncome, 0);
  // Originally the A$60k excess stayed "not attributed" and interest kept A$80k; the excess now reduces interest (lead fix).
  assert.equal((tb.derivedInputs as unknown as Record<string, number>).interest, 20_000_00);
  assert.equal(tb.bookToTax.extra, undefined);
});

// Fixed defect: Under AMIT principles the trust's net income is worked out overall before attribution; character follows that net income.
// If A$160k of deductions is allocated to A$100k of rent while A$80k interest exists, the A$60k excess deduction should either reduce
// another positive component on a defensible basis or be shown as a trust tax loss/carry-forward. The selector used to floor the rent at
// nil and report the A$60k as "not attributed", leaving A$80k attributed.
test("G5 excess custom expense allocation does not disappear from trust net income (verifier defect, fixed)", () => {
  const data = seedData();
  const fund = fundOf(data, "coastline") as AuFund;
  data.taxAdjustments[fund.id] = { div40: 0, div43: 0, tarpDiscountGross: 0, tarpOther: 0 };
  data.tbRows = [
    { id: "verify-rent", fundId: fund.id, account: "4000", name: "Other rent", category: "rent", current: -100_000_00, prior: 0 },
    { id: "verify-exp", fundId: fund.id, account: "5200", name: "Repairs", category: "deductible-expense", current: 160_000_00, prior: 0 },
    { id: "verify-interest", fundId: fund.id, account: "4300", name: "Interest", category: "interest-income", current: -80_000_00, prior: 0 },
  ];
  fund.expenseAllocation = { method: "other-income" };
  assert.equal(tbView(data, fund.id, NOW).bookToTax.result, 20_000_00);
});

test("G7 bulk fund import, custom obligations and delete cascade work through public actions", () => {
  let data = seedData();
  assert.match(rejected(data, { type: "entity-import-funds", rows: [{ market: "AU", name: "Verifier AU", sector: "Office", listed: false, periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 100, governance: "no-agent" }] }, "m-castillo"), /permission/);
  data = ok(data, {
    type: "entity-import-funds",
    rows: [
      { market: "AU", name: "Verifier AU Fund", sector: "Office", listed: false, periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 1000, governance: "no-agent" },
      { market: "SG", name: "Verifier SG REIT", sector: "Industrial", listed: true, periodStart: "2026-01-01", periodEnd: "2026-12-31", unitsOnIssue: 2000, governance: "agent-signs-off", assessmentYear: 2027 },
    ],
  });
  assert.ok(data.funds.some((fund) => fund.id === "verifier-au-fund"));
  assert.equal(data.audit.at(-1)?.action, "Fund imported");
  assert.equal(appDataProblem(data), null);

  data = ok(data, { type: "entity-add-obligation", obligation: { fundId: "verifier-au-fund", title: "Council rates", category: "council-rates", firstDue: "2026-01-31", recurrence: "monthly", notes: "External council notice" } });
  const obligation = data.obligations.find((entry) => entry.title === "Council rates");
  assert.ok(obligation);
  assert.deepEqual(obligationOccurrences(obligation, NOW).slice(0, 4).map((entry) => entry.dueDate), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  data = ok(data, { type: "entity-set-obligation-done", id: obligation.id, dueDate: "2026-02-28", done: true });
  const calendar = calendarView(data, ctx(data), "all", { fundId: "verifier-au-fund", showCompleted: true });
  assert.ok(calendar.rows.some((row) => row.obligation === "Council rates" && row.date === "2026-02-28" && row.status === "done"));
  assert.match(icsCalendar(calendar.rows, { now: NOW }), /Council rates/);
  assert.ok(riskRegister(data, ctx(data), "all").rows.some((risk) => risk.title === "Council rates is overdue"));

  data = ok(data, { type: "entity-delete-fund", fundId: "verifier-au-fund", confirmName: "Verifier AU Fund" });
  assert.equal(data.obligations.some((entry) => entry.fundId === "verifier-au-fund"), false);
  assert.equal(appDataProblem(data), null);
});

test("G9 Singapore 13OA section changes withholding at the statutory edge and cost base shows excess", () => {
  assert.equal(holderTreatment("nr-fund", "2024-12-31", "13OA").rateBps, 1700);
  assert.equal(holderTreatment("nr-fund", "2025-01-01", "13OA").rateBps, 1000);

  const data = seedData();
  const holder = data.holders.find((entry) => entry.id === "h-ly-4") as SgHolder | undefined;
  assert.ok(holder);
  holder.sgFundSection = "13OA";
  const notice = data.sgNotices.find((entry) => entry.fundId === "loyang");
  assert.ok(notice);
  notice.paymentDate = "2024-12-31";
  const before = fundCalc(data, "loyang", NOW).holders.find((entry) => entry.holder.id === "h-ly-4");
  assert.equal(before?.rateSummary, "17% · not final");
  const afterData = structuredClone(data);
  afterData.sgNotices.find((entry) => entry.fundId === "loyang")!.paymentDate = "2025-01-01";
  const after = fundCalc(afterData, "loyang", NOW).holders.find((entry) => entry.holder.id === "h-ly-4");
  assert.equal(after?.rateSummary, "10% final");

  data.unitCostBase.loyang.opening["h-ly-1"] = 100_000;
  const cost = costBaseView(data, "loyang", ctx(data));
  assert.equal(cost.unitRows.find((row) => row.holderId === "h-ly-1")?.closing, 0);
  assert.equal(cost.unitRows.find((row) => row.holderId === "h-ly-1")?.excessOverCostBase, 150_470_000);
  assert.match(cost.footnote, /Excess over cost base/);
});

test("G6 due diligence statuses agree with underlying selectors for representative funds and empty data", () => {
  const data = seedData();
  for (const fundId of ["harbourline", "kurrajong", "loyang"] as const) {
    const view = dueDiligenceView(data, fundId, ctx(data));
    const expected = expectedDueDiligenceStatuses(data, fundId);
    assert.deepEqual(Object.fromEntries(view.sections.map((section) => [section.id, section.status])), expected, fundId);
  }

  const created = ok(data, { type: "entity-create-fund", fund: { market: "AU", name: "Verifier Empty Fund", sector: "Office", listed: false, periodStart: "2026-07-01", periodEnd: "2027-06-30", unitsOnIssue: 1000, governance: "no-agent" } });
  const empty = created.funds.find((fund) => fund.name === "Verifier Empty Fund");
  assert.ok(empty);
  const view = dueDiligenceView(created, empty.id, ctx(created));
  assert.deepEqual(Object.fromEntries(view.sections.map((section) => [section.id, section.status])), expectedDueDiligenceStatuses(created, empty.id));
  assert.ok(view.sections.every((section) => section.finding.length > 0 && section.evidence.length > 0));
});

test("G6 due diligence exports carry every finding, status flips are visible, and persona isolation holds", () => {
  const data = seedData();
  const view = dueDiligenceView(data, "harbourline", ctx(data));
  assert.equal(view.sections.length, 8);
  assert.equal(view.summary.clear + view.summary.attention + view.summary.issue, 8);
  assert.equal(view.csv.rows.length, view.sections.length);
  assert.equal(view.doc.title, "Tax due diligence report");
  assert.match(JSON.stringify(view.doc.blocks), /not tax advice/);
  const table = view.doc.blocks.find((block) => block.kind === "table" && block.title === "Findings");
  assert.ok(table?.kind === "table");
  assert.deepEqual(table.rows.map((row) => row.section), view.sections.map((section) => section.title));
  assert.deepEqual(view.csv.rows.map((row) => row[0]), view.sections.map((section) => section.title));
  assert.ok(view.csv.rows.every((row, index) => row[1] === view.sections[index]?.status && row[2] === view.sections[index]?.finding));

  const changed = structuredClone(data);
  (fundOf(changed, "harbourline") as AuFund).inputs.interest += 1_000_00;
  assert.equal(dueDiligenceView(data, "harbourline", ctx(data)).sections.find((section) => section.id === "workflow")?.status, "Clear");
  assert.equal(dueDiligenceView(changed, "harbourline", ctx(changed)).sections.find((section) => section.id === "workflow")?.status, "Issue");
  assert.throws(() => dueDiligenceView(data, "loyang", ctx(data, "l-brennan")), /Fund not available/);
});

test("G8 xlsx reader round-trips app workbooks", async () => {
  const bytes = buildXlsx({ fileName: "verify.xlsx", sheets: [{ name: "First", columns: ["Name", "Amount"], rows: [["Alpha", 12.5], ["Comma, quote \"ok\"", -7]] }] });
  const result = await xlsxToCsv(bytes);
  assert.equal(result.sheetName, "First");
  assert.equal(result.text, "Name,Amount\r\nAlpha,12.5\r\n\"Comma, quote \"\"ok\"\"\",-7");
  assert.deepEqual(result.rows, [["Name", "Amount"], ["Alpha", "12.5"], ["Comma, quote \"ok\"", "-7"]]);
});

test("G8 xlsx reader handles cell kinds, cached formulas, rich shared strings and date systems", async () => {
  const workbook = xlsxPackage({
    "xl/workbook.xml": "<?xml version=\"1.0\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><workbookPr date1904=\"1\"/><sheets><sheet name=\"Kinds\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
    "xl/worksheets/sheet1.xml": "<?xml version=\"1.0\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData><row r=\"1\">" +
      "<c r=\"A1\" t=\"s\"><v>1</v></c>" +
      "<c r=\"B1\" t=\"inlineStr\"><is><t>Inline &amp; value</t></is></c>" +
      "<c r=\"C1\"><v>12.5</v></c>" +
      "<c r=\"D1\" t=\"b\"><v>1</v></c>" +
      "<c r=\"E1\" t=\"e\"><v>#N/A</v></c>" +
      "<c r=\"F1\"><f>1+1</f><v>2</v></c>" +
      "<c r=\"G1\" s=\"1\"><v>1</v></c>" +
      "</row></sheetData></worksheet>",
  });
  const result = await xlsxToCsv(workbook);
  assert.deepEqual(result.rows, [["Rich text", "Inline & value", "12.5", "TRUE", "#N/A", "2", "1904-01-02"]]);
});

test("G8 xlsx reader preserves Excel serial 60 as fictitious 1900-02-29 and asset imports reject it", async () => {
  const workbook = xlsxPackage({
    "xl/worksheets/sheet1.xml": "<?xml version=\"1.0\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData><row r=\"1\"><c r=\"A1\" s=\"1\"><v>60</v></c></row></sheetData></worksheet>",
  });
  const result = await xlsxToCsv(workbook);
  assert.deepEqual(result.rows, [["1900-02-29"]]);

  const assetCsv = rowsToCsv([["kind", "propertyId", "description", "cost", "startDate", "assetClassId", "methodOrRegime", "effectiveLifeYears"], ["AU_DIV40", "", "Impossible date plant", "100", result.rows[0]![0]!, "OTHER_PLANT", "PRIME_COST", "10"]]);
  assert.deepEqual(parseAssetCsv(assetCsv, fundOf(seedData(), "coastline"), seedData().properties).errors, ["Row 2: startDate must be a valid YYYY-MM-DD date."]);
});

// Fixed defect: Data > Properties import accepted the fictitious Excel leap-bug date 1900-02-29 because parsePropertiesCsv checked only
// YYYY-MM-DD shape, not calendar validity. The row could then be imported and stored as an impossible acquired date.
test("G8 properties importer rejects Excel serial 60 / 1900-02-29 (verifier defect, fixed)", () => {
  const propertyCsv = rowsToCsv([["name", "location", "acquired", "cost", "improvements", "capitalWorksClaimed", "valuation"], ["Impossible date tower", "Sydney NSW", "1900-02-29", "1", "0", "0", "1"]]);
  assert.match(String(parsePropertiesCsv(propertyCsv)), /valid YYYY-MM-DD date/);
});

test("G8 xlsx hostile workbooks fail fast with readable messages", async () => {
  await rejectsFast("oversize file", new Uint8Array(XLSX_IMPORT_LIMITS.maxBytes + 1), /limit is 1 MB/i);

  const tooManyEntries = Array.from({ length: XLSX_IMPORT_LIMITS.maxEntries + 1 }, (_, i) => ({ name: `xl/worksheets/${i}.xml`, data: bytes("<x/>") }));
  await rejectsFast("too many ZIP entries", zipStore(tooManyEntries), /too many ZIP entries/i);

  await rejectsFast("unsafe path", zipStore([{ name: "../xl/workbook.xml", data: bytes("<x/>") }]), /unsafe ZIP path/i);
  await rejectsFast("ZIP64 end marker", patchedZip({ name: "xl/workbook.xml", data: bytes("<x/>") }, (view, _local, _central, end) => view.setUint16(end + 10, 0xffff, true)), /ZIP64/i);
  await rejectsFast("encrypted ZIP flag", patchedZip({ name: "xl/workbook.xml", data: bytes("<x/>") }, (view, local, central) => { view.setUint16(local + 6, 1, true); view.setUint16(central + 8, 1, true); }), /Password-protected/i);
  await rejectsFast("unknown compression method", patchedZip({ name: "xl/workbook.xml", data: bytes("<x/>") }, (view, local, central) => { view.setUint16(local + 8, 99, true); view.setUint16(central + 10, 99, true); }), /compression method/i);

  await rejectsFast("per-entry uncompressed cap", zipDeflate([{ name: "xl/workbook.xml", data: new Uint8Array(XLSX_IMPORT_LIMITS.maxEntryBytes + 1) }]), /part larger than/i);
  await rejectsFast("total uncompressed cap", zipDeflate([
    { name: "xl/a.xml", data: new Uint8Array(3 * 1024 * 1024) },
    { name: "xl/b.xml", data: new Uint8Array(3 * 1024 * 1024) },
    { name: "xl/c.xml", data: new Uint8Array(3 * 1024 * 1024) },
  ]), /expands to more than/i);

  await rejectsFast("row cap", xlsxPackage({ "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="${XLSX_IMPORT_LIMITS.maxRows + 1}"><c r="A${XLSX_IMPORT_LIMITS.maxRows + 1}"><v>1</v></c></row></sheetData></worksheet>` }), /more than 2,000 rows/i);
  await rejectsFast("column cap", xlsxPackage({ "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="${columnRef(XLSX_IMPORT_LIMITS.maxColumns)}1"><v>1</v></c></row></sheetData></worksheet>` }), /more than 200 columns/i);
  await rejectsFast("cell text cap", xlsxPackage({ "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${"x".repeat(XLSX_IMPORT_LIMITS.maxCellChars + 1)}</t></is></c></row></sheetData></worksheet>` }), /text cell that is too long/i);

  await rejectsFast("DTD refused", xlsxPackage({ "xl/workbook.xml": "<?xml version=\"1.0\"?><!DOCTYPE workbook [<!ENTITY x \"y\">]><workbook/>" }), /DTD or entity declaration/i);
  await rejectsFast("depth cap", xlsxPackage({ "xl/workbook.xml": `<?xml version="1.0"?>${"<a>".repeat(XLSX_IMPORT_LIMITS.maxXmlDepth + 1)}${"</a>".repeat(XLSX_IMPORT_LIMITS.maxXmlDepth + 1)}` }), /nested too deeply/i);
  const noisyXml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${"<ignored/>".repeat(XLSX_IMPORT_LIMITS.maxXmlTokens + 1)}<sheetData/></worksheet>`;
  await rejectsFast("XML token cap", zipDeflate(xlsxEntries({ "xl/worksheets/sheet1.xml": bytes(noisyXml) })), /too complex/i, 3000);

  const tinyZip = new Uint8Array([80, 75, 5, 6, ...new Array(18).fill(0)]);
  const started = Date.now();
  await assert.rejects(() => xlsxToCsv(tinyZip), /missing xl\/_rels\/workbook\.xml\.rels|not readable/i);
  assert.ok(Date.now() - started < 1000, "hostile empty ZIP rejected within one second");
});
