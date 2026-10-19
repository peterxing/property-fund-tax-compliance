import assert from "node:assert/strict";
import { test } from "node:test";
import { persistedProblem } from "../../../src/domain/core/schema.ts";
import { applyGstAction } from "../../../src/domain/gst/reducer.ts";
import { gstCodeLabel, gstPeriods, gstReturnView } from "../../../src/domain/gst/index.ts";
import { gstProviders } from "../../../src/domain/gst/providers.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import type { AppData, Cents, Ctx, Fund, Market, User } from "../../../src/domain/types.ts";
import type { GstEntry } from "../../../src/domain/gst/types.ts";

const NOW = new Date("2026-10-12T09:00:00");
const UI = { currentUserId: "a-moreno", jurisdiction: "all" as const, selectedFundId: "harbourline" };

type AuRate = "STANDARD_10" | "ZERO" | "MARGIN_1_11";
type SgRate = "STANDARD" | "ZERO";

interface AuCodeRule {
  label: string;
  labels: readonly string[];
  rate: AuRate;
}

interface SgCodeRule {
  label: string;
  baseBoxes: readonly number[];
  taxBoxes: readonly number[];
  side: "SUPPLY" | "PURCHASE";
  rate: SgRate;
  claim: "FULL" | "NONE" | "RESIDUAL" | "NOT_APPLICABLE";
}

const AU_CODES: Record<string, AuCodeRule> = {
  SALE_TAXABLE: { label: "Taxable sale (10%)", labels: ["G1", "1A"], rate: "STANDARD_10" },
  SALE_GST_FREE_EXPORT: { label: "GST-free sale - export", labels: ["G1", "G2"], rate: "ZERO" },
  SALE_GST_FREE_GOING_CONCERN: { label: "GST-free sale - going concern", labels: ["G1", "G3"], rate: "ZERO" },
  SALE_INPUT_TAXED_RESIDENTIAL_RENT: { label: "Input-taxed sale - residential rent", labels: ["G1", "G4"], rate: "ZERO" },
  SALE_MARGIN_SCHEME: { label: "Taxable sale - margin scheme", labels: ["G1", "1A"], rate: "MARGIN_1_11" },
  PURCHASE_CAPITAL_TAXABLE: { label: "Taxable purchase - capital", labels: ["G10", "1B"], rate: "STANDARD_10" },
  PURCHASE_NON_CAPITAL_TAXABLE: { label: "Taxable purchase - non-capital", labels: ["G11", "1B"], rate: "STANDARD_10" },
  PURCHASE_NON_CAPITAL_NO_CREDIT: { label: "Blocked purchase - non-capital", labels: ["G11"], rate: "STANDARD_10" },
};

const SG_CODES: Record<string, SgCodeRule> = {
  SR: { label: "Standard-rated local supplies of goods or services.", baseBoxes: [1, 13], taxBoxes: [6], side: "SUPPLY", rate: "STANDARD", claim: "NOT_APPLICABLE" },
  ZR: { label: "Zero-rated supplies such as exports and qualifying international services.", baseBoxes: [2, 13], taxBoxes: [], side: "SUPPLY", rate: "ZERO", claim: "NOT_APPLICABLE" },
  ESN33: { label: "Non-Regulation 33 exempt supplies, including sale and lease of residential property.", baseBoxes: [3, 13], taxBoxes: [], side: "SUPPLY", rate: "ZERO", claim: "NOT_APPLICABLE" },
  OS: { label: "Out-of-scope supplies not reported in the GST return.", baseBoxes: [], taxBoxes: [], side: "SUPPLY", rate: "ZERO", claim: "NOT_APPLICABLE" },
  TX: { label: "Standard-rated purchases directly attributable to taxable supplies.", baseBoxes: [5], taxBoxes: [7], side: "PURCHASE", rate: "STANDARD", claim: "FULL" },
  "TX-RE": { label: "Residual input tax attributable to both taxable and exempt supplies or general overheads.", baseBoxes: [5], taxBoxes: [7], side: "PURCHASE", rate: "STANDARD", claim: "RESIDUAL" },
  BL: { label: "Blocked / disallowed input-tax expenses.", baseBoxes: [], taxBoxes: [], side: "PURCHASE", rate: "STANDARD", claim: "NONE" },
  IM: { label: "Imports of goods with import GST paid.", baseBoxes: [5], taxBoxes: [7], side: "PURCHASE", rate: "STANDARD", claim: "FULL" },
  ZP: { label: "Zero-rated purchases from GST-registered suppliers.", baseBoxes: [5], taxBoxes: [], side: "PURCHASE", rate: "ZERO", claim: "NONE" },
};

function user(data: AppData, id: string): User {
  const found = data.users.find((entry) => entry.id === id);
  assert.ok(found, `${id} user exists`);
  return found;
}

function fund(data: AppData, id: string): Fund {
  const found = data.funds.find((entry) => entry.id === id);
  assert.ok(found, `${id} fund exists`);
  return found;
}

function ctx(data: AppData, userId = "a-moreno"): Ctx {
  return { now: NOW, user: user(data, userId) };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function persistedOk(data: AppData, selectedFundId = "harbourline"): void {
  assert.equal(persistedProblem({ data, ui: { ...UI, selectedFundId } }), null);
}

function expectOk(result: ReturnType<typeof applyGstAction>, selectedFundId = "harbourline"): AppData {
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
  const data = result.ok ? result.data : seedData();
  persistedOk(data, selectedFundId);
  return data;
}

function floorDollars(cents: Cents): Cents {
  return Math.trunc(cents / 100) * 100;
}

function roundBps(amount: Cents, bps: number): Cents {
  return Math.round((amount * bps) / 10_000);
}

function sgRate(date: string): number {
  if (date >= "2024-01-01") return 900;
  if (date >= "2023-01-01") return 800;
  if (date >= "2007-07-01") return 700;
  if (date >= "2004-01-01") return 500;
  if (date >= "2003-01-01") return 400;
  return 300;
}

function expectedTax(entry: GstEntry, market: Market): Cents {
  if (market === "AU") {
    const code = AU_CODES[entry.code];
    assert.ok(code, `AU code ${entry.code} is independently mapped`);
    if (code.rate === "ZERO") return 0;
    if (code.rate === "MARGIN_1_11") return Math.round(entry.net / 11);
    return roundBps(entry.net, 1000);
  }
  const code = SG_CODES[entry.code];
  assert.ok(code, `SG code ${entry.code} is independently mapped`);
  return code.rate === "STANDARD" ? roundBps(entry.net, sgRate(entry.date)) : 0;
}

function entries(data: AppData, fundId: string, start: string, end: string): GstEntry[] {
  return data.gstLedger.filter((entry) => entry.fundId === fundId && entry.date >= start && entry.date <= end);
}

function auIndependent(data: AppData, fundId: string, start: string, end: string): Record<string, Cents> {
  const raw: Record<string, Cents> = { G1: 0, G2: 0, G3: 0, G4: 0, G10: 0, G11: 0, "1A": 0, "1B": 0 };
  for (const entry of entries(data, fundId, start, end)) {
    const code = AU_CODES[entry.code];
    assert.ok(code, `${entry.code} is mapped`);
    assert.equal(entry.tax, expectedTax(entry, "AU"), `${entry.invoiceRef ?? entry.id} tax follows ${entry.code}`);
    for (const label of code.labels) {
      if (label === "1A" || label === "1B") raw[label] += entry.tax;
      else if (label === "G1" || label === "G10" || label === "G11") raw[label] += code.rate === "STANDARD_10" ? entry.net + entry.tax : entry.net;
      else raw[label] += entry.net;
    }
  }
  return {
    "AU_BAS.G1": floorDollars(raw.G1),
    "AU_BAS.G2": floorDollars(raw.G2),
    "AU_BAS.G3": floorDollars(raw.G3),
    "AU_BAS.G10": floorDollars(raw.G10),
    "AU_BAS.G11": floorDollars(raw.G11),
    "AU_BAS.1A": floorDollars(raw["1A"]),
    "AU_BAS.1B": floorDollars(raw["1B"]),
    "AU_INTERNAL.G4": floorDollars(raw.G4),
  };
}

function monthCount(start: string, end: string): number {
  const sy = Number(start.slice(0, 4));
  const sm = Number(start.slice(5, 7));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(5, 7));
  return (ey - sy) * 12 + em - sm + 1;
}

function roundHalfUpPercent(numerator: Cents, denominator: Cents): number {
  if (denominator <= 0) return 0;
  return Number((BigInt(numerator) * 100n + BigInt(denominator) / 2n) / BigInt(denominator));
}

function partialBox7(input: {
  start: string;
  end: string;
  taxable: Cents;
  exempt: Cents;
  directTaxable: Cents;
  directReg33: Cents;
  directExempt: Cents;
  residual: Cents;
  reg33Exempt: Cents;
  nonReg33Exempt: Cents;
}): Cents {
  const months = monthCount(input.start, input.end);
  const relevantTotal = input.taxable + input.exempt;
  const deMinimis = input.exempt <= 4_000_000 * months && BigInt(input.exempt) * 100n <= BigInt(relevantTotal) * 5n;
  const reg35 = relevantTotal === 0 || BigInt(input.nonReg33Exempt) * 100n <= BigInt(relevantTotal) * 5n;
  if (deMinimis) return input.directTaxable + input.directReg33 + input.directExempt + input.residual;
  const residualBps = roundHalfUpPercent(input.taxable + (reg35 ? input.reg33Exempt : 0), relevantTotal) * 100;
  return input.directTaxable + (reg35 ? input.directReg33 : 0) + roundBps(input.residual, residualBps);
}

function sgIndependent(data: AppData, fundId: string, start: string, end: string): Record<string, Cents> {
  const boxes: Record<string, Cents> = { "SG_F5.1": 0, "SG_F5.2": 0, "SG_F5.3": 0, "SG_F5.4": 0, "SG_F5.5": 0, "SG_F5.6": 0, "SG_F5.7": 0, "SG_F5.8": 0 };
  let directTaxable = 0;
  let directReg33 = 0;
  let directExempt = 0;
  let residual = 0;
  let reg33Exempt = 0;
  let nonReg33Exempt = 0;
  for (const entry of entries(data, fundId, start, end)) {
    const code = SG_CODES[entry.code];
    assert.ok(code, `${entry.code} is mapped`);
    assert.equal(entry.tax, expectedTax(entry, "SG"), `${entry.invoiceRef ?? entry.id} tax follows ${entry.code} at ${sgRate(entry.date) / 100}%`);
    if (code.baseBoxes.includes(1)) boxes["SG_F5.1"] += entry.net;
    if (code.baseBoxes.includes(2)) boxes["SG_F5.2"] += entry.net;
    if (code.baseBoxes.includes(3)) boxes["SG_F5.3"] += entry.net;
    if (code.baseBoxes.includes(5)) boxes["SG_F5.5"] += entry.net;
    if (code.taxBoxes.includes(6)) boxes["SG_F5.6"] += entry.tax;
    if (code.side === "SUPPLY" && entry.code !== "OS") boxes["SG_F5.13"] = (boxes["SG_F5.13"] ?? 0) + entry.net;
    if (entry.code === "ES33") reg33Exempt += entry.net;
    if (entry.code === "ESN33") nonReg33Exempt += entry.net;
    if (code.claim === "FULL") directTaxable += entry.tax;
    if (code.claim === "RESIDUAL") residual += entry.tax;
    if (code.claim === "NONE" && code.taxBoxes.includes(7)) directExempt += entry.tax;
  }
  boxes["SG_F5.4"] = boxes["SG_F5.1"] + boxes["SG_F5.2"] + boxes["SG_F5.3"];
  boxes["SG_F5.7"] = partialBox7({ start, end, taxable: boxes["SG_F5.1"] + boxes["SG_F5.2"], exempt: boxes["SG_F5.3"], directTaxable, directReg33, directExempt, residual, reg33Exempt, nonReg33Exempt });
  boxes["SG_F5.8"] = boxes["SG_F5.6"] - boxes["SG_F5.7"];
  return boxes;
}

function boxMap(data: AppData, fundId: string, end: string): Record<string, Cents> {
  return Object.fromEntries(gstReturnView(data, fundId, end, ctx(data)).boxes.map((box) => [box.ref, box.amount]));
}

test("independent AU BAS recomputation matches two seeded fund quarters", () => {
  const data = seedData();
  for (const [fundId, start, end] of [
    ["southbank", "2026-04-01", "2026-06-30"],
    ["coastline", "2026-07-01", "2026-09-30"],
  ] as const) {
    const expected = auIndependent(data, fundId, start, end);
    const actual = boxMap(data, fundId, end);
    assert.deepEqual(actual, Object.fromEntries(Object.entries(expected).filter(([ref]) => ref.startsWith("AU_BAS."))), `${fundId} ${end}`);
    const g4 = expected["AU_INTERNAL.G4"];
    assert.ok(g4 > 0, `${fundId} has input-taxed sales independently tracked at AU internal G4`);
  }
});

test("independent SG F5 recomputation matches two seeded fund quarters", () => {
  const data = seedData();
  for (const [fundId, start, end] of [
    ["telok-ayer", "2026-07-01", "2026-09-30"],
    ["meranti", "2026-04-01", "2026-06-30"],
  ] as const) {
    const expected = sgIndependent(data, fundId, start, end);
    const actual = boxMap(data, fundId, end);
    for (const ref of Object.keys(expected)) assert.equal(actual[ref], expected[ref], `${fundId} ${end} ${ref}`);
  }
});

test("every seeded GST code maps to the expected BAS label/F5 box, rate and UI label", () => {
  const data = seedData();
  for (const entry of data.gstLedger) {
    const f = fund(data, entry.fundId);
    assert.equal(entry.tax, expectedTax(entry, f.market), `${entry.invoiceRef ?? entry.id} rate`);
    if (f.market === "AU") {
      const code = AU_CODES[entry.code];
      assert.ok(code, `${entry.code} is in verifier AU catalogue`);
      assert.equal(gstCodeLabel("AU", entry.code, entry.date), code.label);
      assert.ok(code.labels.length > 0, `${entry.code} feeds at least one BAS label`);
    } else {
      const code = SG_CODES[entry.code];
      assert.ok(code, `${entry.code} is in verifier SG catalogue`);
      assert.equal(gstCodeLabel("SG", entry.code, entry.date), code.label);
      if (entry.code !== "OS" && entry.code !== "BL") assert.ok(code.baseBoxes.length + code.taxBoxes.length > 0, `${entry.code} feeds F5`);
    }
  }
});

test("GST due dates and displayed basis match the applied AU concession and SG F5 rules", () => {
  const data = seedData();
  const harbourlineDec = gstPeriods(data, fund(data, "harbourline"), NOW).find((period) => period.end === "2025-12-31");
  const southbankJun = gstPeriods(data, fund(data, "southbank"), NOW).find((period) => period.end === "2026-06-30");
  const coastlineJun = gstPeriods(data, fund(data, "coastline"), NOW).find((period) => period.end === "2026-06-30");
  const merantiJun = gstPeriods(data, fund(data, "meranti"), NOW).find((period) => period.end === "2026-06-30");
  assert.equal(harbourlineDec?.dueDate, "2026-03-02");
  assert.match(harbourlineDec?.dueBasis ?? "", /28 February|weekend|public holiday/i);
  assert.equal(southbankJun?.dueDate, "2026-08-25");
  assert.match(southbankJun?.dueBasis ?? "", /registered-agent lodgment program concession/i);
  assert.equal(coastlineJun?.dueDate, "2026-07-28");
  assert.match(coastlineJun?.dueBasis ?? "", /28 days after quarter end/i);
  assert.equal(merantiJun?.dueDate, "2026-07-31", "IRAS: the Apr–Jun period is due 31 Jul");
  assert.match(merantiJun?.dueBasis ?? "", /one month after the quarter end/i);
});

test("GST reducer safety: permissions, lodged locks, schema, import cap, audit, persistence and immutability", () => {
  let data = deepFreeze(seedData());
  const before = structuredClone(data);
  const openCoastline = data.gstLedger.find((entry) => entry.fundId === "coastline" && entry.date >= "2026-07-01");
  assert.ok(openCoastline, "open Coastline row exists");

  const noAccess = applyGstAction(data, { type: "gst-add-entry", entry: { fundId: "coastline", date: "2026-07-02", description: "No access rent", counterparty: "Tenant", code: "SALE_TAXABLE", net: 1_000_00, tax: 100_00 } }, ctx(data, "s-lim"));
  assert.equal(noAccess.ok, false);
  assert.match(noAccess.ok ? "" : noAccess.reason, /access/i);

  const viewOnly = applyGstAction(data, { type: "gst-add-entry", entry: { fundId: "coastline", date: "2026-07-02", description: "View only rent", counterparty: "Tenant", code: "SALE_TAXABLE", net: 1_000_00, tax: 100_00 } }, ctx(data, "m-castillo"));
  assert.equal(viewOnly.ok, false);
  assert.match(viewOnly.ok ? "" : viewOnly.reason, /permission/i);

  const importRows = applyGstAction(data, { type: "gst-import-entries", fundId: "coastline", entries: [{ fundId: "coastline", date: "2026-07-02", description: "Replacement rent", counterparty: "Tenant", code: "SALE_TAXABLE", net: 11_000_00, tax: 1_100_00, invoiceRef: "VGST2-OPEN" }] }, ctx(data, "r-okafor"));
  data = deepFreeze(expectOk(importRows, "coastline"));
  assert.deepEqual(before, seedData(), "deep-frozen input was not mutated");
  assert.equal(data.audit.at(-1)?.action, "GST ledger imported");
  assert.equal(data.gstLedger.some((entry) => entry.fundId === "coastline" && entry.date < "2026-07-01"), true, "lodged-period entries were retained");

  const lodgedImport = applyGstAction(data, { type: "gst-import-entries", fundId: "coastline", entries: [{ fundId: "coastline", date: "2026-04-02", description: "Locked rent", counterparty: "Tenant", code: "SALE_TAXABLE", net: 1_000_00, tax: 100_00 }] }, ctx(data, "r-okafor"));
  assert.equal(lodgedImport.ok, false);
  assert.match(lodgedImport.ok ? "" : lodgedImport.reason, /lodged period/i);

  const currentOpen = data.gstLedger.find((entry) => entry.invoiceRef === "VGST2-OPEN");
  assert.ok(currentOpen, "imported open-period row exists");
  const moveToLodged = applyGstAction(data, { type: "gst-update-entry", id: currentOpen.id, changes: { date: "2026-04-02" } }, ctx(data, "r-okafor"));
  assert.equal(moveToLodged.ok, false);
  assert.match(moveToLodged.ok ? "" : moveToLodged.reason, /lodged/i);

  const idFundIgnored = applyGstAction(data, { type: "gst-update-entry", id: currentOpen.id, changes: { id: "hijack", fundId: "harbourline", description: "Verifier rename" } }, ctx(data, "r-okafor"));
  data = deepFreeze(expectOk(idFundIgnored, "coastline"));
  const changed = data.gstLedger.find((entry) => entry.id === currentOpen.id);
  assert.equal(changed?.id, currentOpen.id);
  assert.equal(changed?.fundId, "coastline");
  assert.equal(changed?.description, "Verifier rename");
  assert.equal(data.audit.at(-1)?.action, "GST entry updated");

  const invalidSchema = applyGstAction(data, { type: "gst-add-entry", entry: { fundId: "coastline", date: "2026-07-02", description: "Long invoice", counterparty: "Tenant", code: "SALE_TAXABLE", net: 1_000_00, tax: 100_00, invoiceRef: "X".repeat(201) } }, ctx(data, "r-okafor"));
  assert.equal(invalidSchema.ok, false);
  assert.match(invalidSchema.ok ? "" : invalidSchema.reason, /GST entry|invoice/i);

  const tooMany = applyGstAction(data, { type: "gst-import-entries", fundId: "coastline", entries: Array.from({ length: 2001 }, (_, index) => ({ fundId: "coastline", date: "2026-07-02", description: `Rent ${index}`, counterparty: "Tenant", code: "SALE_TAXABLE", net: 1_000_00, tax: 100_00 })) }, ctx(data, "r-okafor"));
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.ok ? "" : tooMany.reason, /2,000|2000/);
});

test("providers show exactly one overdue AU BAS and one overdue SG F5, and lodged figures equal independent returns", () => {
  const data = seedData();
  const overdue = data.funds.flatMap((entry) => gstProviders.deadlines?.(data, entry, NOW) ?? []).filter((row) => row.status === "overdue");
  assert.deepEqual(overdue.map((row) => `${row.fundId}:${row.obligation}`), ["southbank:BAS Apr–Jun 2026", "meranti:GST return (F5) Apr–Jun 2026"]);

  for (const filing of data.gstFilings) {
    const expected = fund(data, filing.fundId).market === "AU"
      ? Object.fromEntries(Object.entries(auIndependent(data, filing.fundId, filing.periodStart, filing.periodEnd)).filter(([ref]) => ref.startsWith("AU_BAS.")))
      : sgIndependent(data, filing.fundId, filing.periodStart, filing.periodEnd);
    for (const [ref, amount] of Object.entries(expected)) assert.equal(filing.figures[ref], amount, `${filing.id} ${ref}`);
  }
});
