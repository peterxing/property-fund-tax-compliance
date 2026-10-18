import test from "node:test";
import assert from "node:assert/strict";
import { appDataProblem } from "../../../src/domain/core/schema.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import { applyGstAction } from "../../../src/domain/gst/reducer.ts";
import { gstPeriods, gstReturnView } from "../../../src/domain/gst/index.ts";
import { gstRateByDate } from "../../../src/engine/gst.ts";
import { gstRateByDate as auGstRateByDate } from "../../../src/engine/au/gst.ts";
import { calculateAuBasDueDate } from "../../../src/engine/au/calendar.ts";
import type { AppData, Ctx } from "../../../src/domain/types.ts";

const NOW = new Date("2026-10-12T09:00:00");

function ctx(data: AppData, userId = "a-moreno"): Ctx {
  return { now: NOW, user: data.users.find((user) => user.id === userId)! };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function expectValid(result: ReturnType<typeof applyGstAction>): AppData {
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
  const data = result.ok ? result.data : seedData();
  assert.equal(appDataProblem(data), null);
  return data;
}

test("GST seed records pass the exact persisted schema", () => {
  assert.equal(appDataProblem(seedData()), null);
});

test("rate and due-date rules come from the engine", () => {
  assert.equal(gstRateByDate("2024-01-01"), 900);
  assert.equal(auGstRateByDate("2026-06-30"), 1000);
  // Oct-Dec 2025 BAS: statutory date is 28 Feb 2026; 2026-02-28 is Saturday, so the engine rolls forward to Monday 2 Mar.
  assert.equal(calculateAuBasDueDate({ periodStart: "2025-10-01", periodEnd: "2025-12-31", frequency: "QUARTERLY" }), "2026-03-02");
  // Jul-Sep 2025 with the registered-agent concession uses the lodgment-program 25 Nov date, not the ordinary 28 Oct date.
  assert.equal(calculateAuBasDueDate({ periodStart: "2025-07-01", periodEnd: "2025-09-30", frequency: "QUARTERLY", taxAgentConcession: true }), "2025-11-25");
});

test("builds hand-checked BAS labels for Harbourline Jul-Sep 2025", () => {
  const data = seedData();
  const view = gstReturnView(data, "harbourline", "2025-09-30", ctx(data));
  // Seed arithmetic:
  // revenue = 87,112,478.00 * 24% = 20,906,994.72.
  // Taxable sales = 58% revenue + 72% revenue = 27,179,093.14, GST 2,717,909.31.
  // GST-free = 2% revenue = 418,139.89. Input-taxed = 3% revenue = 627,209.84.
  // G1 = taxable gross + margin/input-taxed/gst-free gross where reportable = 30,942,352.18, rounded down to whole dollars.
  // Purchase credits = 55% and 25% expenses plus capital works at 10%, rounded down to whole dollars for 1B.
  assert.deepEqual(Object.fromEntries(view.boxes.map((box) => [box.ref, box.amount])), {
    "AU_BAS.G1": 3_094_235_200,
    "AU_BAS.G2": 41_813_900,
    "AU_BAS.G3": 0,
    "AU_BAS.G10": 79_200_000,
    "AU_BAS.G11": 585_703_400,
    "AU_BAS.1A": 271_790_900,
    "AU_BAS.1B": 59_147_000,
  });
  assert.equal(view.netGst, 212_643_900);
  assert.equal(view.period.status, "lodged");
});

test("builds hand-checked GST F5 boxes and IAF export for Telok Ayer Jul-Sep 2026", () => {
  const data = seedData();
  const view = gstReturnView(data, "telok-ayer", "2026-09-30", ctx(data));
  // Seed arithmetic:
  // revenue = 86,604,821.00 * 25% = 21,651,205.25.
  // Box 1 = 68% revenue = 14,722,819.57; Box 2 = 2% revenue; Box 3 = 3.5% exempt residential component.
  // Box 5 = TX/TX-RE/ZP purchases; Box 6 = 9% of SR; Box 7 = claimable TX plus residual recovery after partial exemption.
  assert.deepEqual(Object.fromEntries(view.boxes.map((box) => [box.ref, box.amount])), {
    "SG_F5.1": 1_472_281_957,
    "SG_F5.2": 43_302_411,
    "SG_F5.3": 75_779_218,
    "SG_F5.4": 1_591_363_586,
    "SG_F5.5": 704_030_811,
    "SG_F5.6": 132_505_376,
    "SG_F5.7": 55_322_073,
    "SG_F5.8": 77_183_303,
    "SG_F5.9": 0,
    "SG_F5.13": 1_591_363_586,
    "SG_F5.14": 0,
    "SG_F5.19": 0,
    "SG_F5.21": 0,
  });
  assert.equal(view.iaf?.text.includes("[CompanyInfo]"), true);
  assert.equal(view.iaf?.text.includes("[SupplyLedger]"), true);
  assert.match(view.checks.map((check) => check.title).join("\n"), /Partial exemption review/);
});

test("providers expose overdue GST periods at the demo date", async () => {
  const data = seedData();
  const { gstProviders } = await import("../../../src/domain/gst/providers.ts");
  const rows = data.funds.flatMap((fund) => gstProviders.deadlines!(data, fund, NOW));
  const overdue = rows.filter((row) => row.status === "overdue").map((row) => `${row.fundId}:${row.obligation}`);
  assert.deepEqual(overdue, ["southbank:BAS Apr–Jun 2026", "meranti:GST return (F5) Apr–Jun 2026"]);
  assert.equal(rows.every((row) => row.workspace === "/gst"), true);
  assert.equal(data.funds.flatMap((fund) => gstProviders.risks!(data, fund, NOW)).filter((risk) => /overdue/.test(risk.title)).length, 2);
  assert.equal(gstProviders.compareSources!(data, data.funds.find((fund) => fund.id === "meranti")!, NOW).at(-1)?.lines.some((line) => line.ref === "SG_F5.8"), true);
});

test("seed filings snapshot the figures that the return selector computes", () => {
  const data = seedData();
  for (const filing of data.gstFilings) {
    const view = gstReturnView(data, filing.fundId, filing.periodEnd, ctx(data));
    assert.deepEqual(filing.figures, Object.fromEntries(view.boxes.map((box) => [box.ref, box.amount])), filing.id);
  }
});

test("reducers enforce lodged-period locks, unlock permission, audit text and schema validity", () => {
  const data = seedData();
  const frozen = deepFreeze(structuredClone(data));
  const original = data.gstLedger.find((entry) => entry.fundId === "harbourline" && entry.date === "2025-07-01")!;
  const denied = applyGstAction(frozen, { type: "gst-update-entry", id: original.id, changes: { description: "Changed rent" } }, ctx(data));
  assert.equal(denied.ok, false);
  assert.match(denied.ok ? "" : denied.reason, /lodged/i);

  const reviewerUnlock = applyGstAction(data, { type: "gst-unlock-period", fundId: "harbourline", periodEnd: "2025-09-30", reason: "Need amendment" }, ctx(data, "l-brennan"));
  assert.equal(reviewerUnlock.ok, false);
  assert.match(reviewerUnlock.ok ? "" : reviewerUnlock.reason, /permission/i);

  const unlocked = applyGstAction(data, { type: "gst-unlock-period", fundId: "harbourline", periodEnd: "2025-09-30", reason: "Correcting tenant tax invoice support" }, ctx(data));
  const unlockedData = expectValid(unlocked);
  assert.equal(unlockedData.audit.at(-1)?.action, "BAS unlocked");

  const updated = applyGstAction(unlockedData, { type: "gst-update-entry", id: original.id, changes: { description: "Changed rent" } }, ctx(unlockedData));
  const updatedData = expectValid(updated);
  assert.equal(updatedData.gstLedger.find((entry) => entry.id === original.id)?.description, "Changed rent");
  assert.equal(updatedData.audit.at(-1)?.action, "GST entry updated");
});

test("reducers cover add, delete, import and record lodgment without mutating inputs", () => {
  const data = seedData();
  const frozen = deepFreeze(structuredClone(data));
  const add = applyGstAction(frozen, { type: "gst-add-entry", entry: { fundId: "coastline", date: "2026-07-02", description: "Clinic rent", counterparty: "Clinic tenant", code: "SALE_TAXABLE", net: 10_000_00, tax: 1_000_00, invoiceRef: "COAS-GST-X01" } }, ctx(data, "r-okafor"));
  const added = expectValid(add);
  assert.equal(data.gstLedger.some((entry) => entry.invoiceRef === "COAS-GST-X01"), false);
  assert.equal(added.audit.at(-1)?.action, "GST entry added");

  const imported = expectValid(applyGstAction(added, { type: "gst-import-entries", fundId: "coastline", entries: [{ fundId: "coastline", date: "2026-07-03", description: "Rent import", counterparty: "Tenant", code: "SALE_TAXABLE", net: 20_000_00, tax: 2_000_00, invoiceRef: "COAS-GST-X02" }] }, ctx(added, "r-okafor")));
  assert.equal(imported.gstLedger.filter((entry) => entry.fundId === "coastline" && entry.date >= "2026-07-01").length, 1);
  assert.equal(imported.audit.at(-1)?.action, "GST ledger imported");

  const deleted = expectValid(applyGstAction(imported, { type: "gst-delete-entry", id: imported.gstLedger.find((entry) => entry.invoiceRef === "COAS-GST-X02")!.id }, ctx(imported, "r-okafor")));
  assert.equal(deleted.audit.at(-1)?.action, "GST entry deleted");

  const lodged = expectValid(applyGstAction(deleted, { type: "gst-record-lodgment", fundId: "coastline", periodEnd: "2026-09-30", reference: "ATO BAS COAS-2026-09", lodgedDate: "2026-10-20" }, ctx(deleted)));
  assert.equal(lodged.gstFilings.some((filing) => filing.fundId === "coastline" && filing.periodEnd === "2026-09-30"), true);
  assert.equal(lodged.audit.at(-1)?.action, "BAS lodged");
});

test("permissions refuse view-only users and users without fund access", () => {
  const data = seedData();
  const viewOnly = applyGstAction(data, {
    type: "gst-import-entries",
    fundId: "coastline",
    entries: [{ fundId: "coastline", date: "2026-07-01", description: "Rent", counterparty: "Tenant", code: "SALE_TAXABLE", net: 100_00, tax: 10_00 }],
  }, ctx(data, "m-castillo"));
  assert.equal(viewOnly.ok, false);
  assert.match(viewOnly.ok ? "" : viewOnly.reason, /permission|access/i);

  const noAccess = applyGstAction(data, {
    type: "gst-add-entry",
    entry: { fundId: "coastline", date: "2026-07-01", description: "Rent", counterparty: "Tenant", code: "SALE_TAXABLE", net: 100_00, tax: 10_00 },
  }, ctx(data, "s-lim"));
  assert.equal(noAccess.ok, false);
  assert.match(noAccess.ok ? "" : noAccess.reason, /access/i);
});

test("CSV/import validation rejects bad date, unknown code, wrong market code and GST mismatches", () => {
  const data = seedData();
  const base = { fundId: "coastline", description: "Rent", counterparty: "Tenant", net: 100_00, tax: 10_00 };
  const cases = [
    { ...base, date: "bad", code: "SALE_TAXABLE", error: /date/i },
    { ...base, date: "2026-07-01", code: "NOPE", error: /not a AU GST code/i },
    { ...base, date: "2026-07-01", code: "SR", error: /not a AU GST code/i },
    { ...base, date: "2026-07-01", code: "SALE_TAXABLE", tax: 9_00, error: /should be/i },
  ];
  for (const row of cases) {
    const result = applyGstAction(data, { type: "gst-import-entries", fundId: "coastline", entries: [row] }, ctx(data, "r-okafor"));
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, row.error);
  }
});

test("IAF output has the expected section structure", () => {
  const data = seedData();
  const view = gstReturnView(data, "telok-ayer", "2026-09-30", ctx(data));
  assert.match(view.iaf?.text ?? "", /\[CompanyInfo\][\s\S]*\[PurchaseLedger\][\s\S]*\[SupplyLedger\][\s\S]*\[GeneralLedger\]/);
  assert.match(view.iaf?.text ?? "", /TELO-GST-401/);
});

test("import keeps lodged-period entries and refuses rows dated in lodged periods", () => {
  const data = seedData();
  const coastBefore = data.gstLedger.filter((entry) => entry.fundId === "coastline");
  const lodgedBefore = coastBefore.filter((entry) => entry.date < "2026-07-01");
  assert.ok(lodgedBefore.length > 0);

  const imported = expectValid(applyGstAction(data, {
    type: "gst-import-entries",
    fundId: "coastline",
    entries: [{ fundId: "coastline", date: "2026-07-03", description: "Open-period rent", counterparty: "Tenant", code: "SALE_TAXABLE", net: 20_000_00, tax: 2_000_00, invoiceRef: "COAS-OPEN" }],
  }, ctx(data, "r-okafor")));
  const coastAfter = imported.gstLedger.filter((entry) => entry.fundId === "coastline");
  for (const lodged of lodgedBefore) assert.equal(coastAfter.some((entry) => entry.id === lodged.id), true, lodged.id);
  assert.equal(coastAfter.some((entry) => entry.invoiceRef === "COAS-OPEN"), true);

  const lodgedRow = applyGstAction(imported, {
    type: "gst-import-entries",
    fundId: "coastline",
    entries: [{ fundId: "coastline", date: "2026-04-03", description: "Locked rent", counterparty: "Tenant", code: "SALE_TAXABLE", net: 10_000_00, tax: 1_000_00 }],
  }, ctx(imported, "r-okafor"));
  assert.equal(lodgedRow.ok, false);
  assert.match(lodgedRow.ok ? "" : lodgedRow.reason, /lodged period BAS Apr.*Jun 2026|BAS Apr.*Jun 2026.*lodged/i);
});

test("update ignores fundId/id changes and checks both old and new period locks", () => {
  const data = seedData();
  const open = data.gstLedger.find((entry) => entry.fundId === "coastline" && entry.date >= "2026-07-01")!;
  const movedToLodged = applyGstAction(data, { type: "gst-update-entry", id: open.id, changes: { date: "2026-04-03" } }, ctx(data, "r-okafor"));
  assert.equal(movedToLodged.ok, false);
  assert.match(movedToLodged.ok ? "" : movedToLodged.reason, /lodged/i);

  const movedFund = expectValid(applyGstAction(data, { type: "gst-update-entry", id: open.id, changes: { fundId: "harbourline", id: "evil-id", description: "Safe rename" } }, ctx(data, "r-okafor")));
  const changed = movedFund.gstLedger.find((entry) => entry.id === open.id)!;
  assert.equal(changed.fundId, "coastline");
  assert.equal(changed.id, open.id);
  assert.equal(changed.description, "Safe rename");

  const lockedOld = data.gstLedger.find((entry) => entry.fundId === "harbourline" && entry.date === "2025-07-01")!;
  const editLockedOld = applyGstAction(data, { type: "gst-update-entry", id: lockedOld.id, changes: { date: "2026-04-03" } }, ctx(data));
  assert.equal(editLockedOld.ok, false);
  assert.match(editLockedOld.ok ? "" : editLockedOld.reason, /lodged/i);
});

test("reducer validates generated records with the saved-state schema and caps imports", () => {
  const data = seedData();
  const longInvoice = "x".repeat(201);
  const badSchema = applyGstAction(data, {
    type: "gst-add-entry",
    entry: { fundId: "coastline", date: "2026-07-02", description: "Clinic rent", counterparty: "Clinic tenant", code: "SALE_TAXABLE", net: 10_000_00, tax: 1_000_00, invoiceRef: longInvoice },
  }, ctx(data, "r-okafor"));
  assert.equal(badSchema.ok, false);
  assert.match(badSchema.ok ? "" : badSchema.reason, /Invoice|GST entry/i);

  const tooMany = applyGstAction(data, {
    type: "gst-import-entries",
    fundId: "coastline",
    entries: Array.from({ length: 2001 }, (_, index) => ({ fundId: "coastline", date: "2026-07-02", description: `Rent ${index}`, counterparty: "Tenant", code: "SALE_TAXABLE", net: 100_00, tax: 10_00 })),
  }, ctx(data, "r-okafor"));
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.ok ? "" : tooMany.reason, /2,000|2000/);
});

test("stored filing ranges keep periods locked after a fund period shift", () => {
  const data = seedData();
  const shiftedData: AppData = { ...data, funds: data.funds.map((fund) => fund.id === "coastline" ? { ...fund, periodStart: "2025-10-02" } : fund) };
  const coastline = shiftedData.funds.find((fund) => fund.id === "coastline")!;
  const periods = gstPeriods(shiftedData, coastline, NOW);
  assert.equal(periods.some((period) => period.status === "lodged" && /period changed since lodgment/.test(period.label)), true);

  const addLocked = applyGstAction(shiftedData, {
    type: "gst-add-entry",
    entry: { fundId: "coastline", date: "2025-10-01", description: "Back-dated rent", counterparty: "Tenant", code: "SALE_TAXABLE", net: 100_00, tax: 10_00 },
  }, ctx(shiftedData, "r-okafor"));
  assert.equal(addLocked.ok, false);
  assert.match(addLocked.ok ? "" : addLocked.reason, /lodged/i);
});

test("import after a fund period shift cannot delete entries inside a stored filing range", () => {
  const data = seedData();
  const shiftedData: AppData = { ...data, funds: data.funds.map((fund) => fund.id === "coastline" ? { ...fund, periodStart: "2025-10-02" } : fund) };
  const protectedIds = new Set(shiftedData.gstLedger.filter((entry) => entry.fundId === "coastline" && entry.date >= "2025-10-01" && entry.date <= "2025-12-31").map((entry) => entry.id));
  assert.equal(protectedIds.size, 8);

  const open = shiftedData.gstLedger.find((entry) => entry.fundId === "coastline" && entry.date >= "2026-07-01")!;
  const imported = expectValid(applyGstAction(shiftedData, {
    type: "gst-import-entries",
    fundId: "coastline",
    entries: [{ fundId: "coastline", date: open.date, description: open.description, counterparty: open.counterparty, code: open.code, net: open.net, tax: open.tax }],
  }, ctx(shiftedData, "r-okafor")));
  for (const id of protectedIds) assert.equal(imported.gstLedger.some((entry) => entry.id === id), true, id);

  const lockedImport = applyGstAction(shiftedData, {
    type: "gst-import-entries",
    fundId: "coastline",
    entries: [{ fundId: "coastline", date: "2025-10-02", description: "Locked import", counterparty: "Tenant", code: "SALE_TAXABLE", net: 100_00, tax: 10_00 }],
  }, ctx(shiftedData, "r-okafor"));
  assert.equal(lockedImport.ok, false);
  assert.match(lockedImport.ok ? "" : lockedImport.reason, /lodged period/i);
});
