// OWNER: GST & BAS agent (F1). Public selectors and view models for this feature (pure; no React, DOM or node: imports).
import { buildAuBas, gstRateByDate as auGstRateByDate } from "../../engine/au/gst.ts";
import { AU_BAS_LABELS, lookupAuGstCode, type AuBasLabel } from "../../engine/au/gstCodes.ts";
import { calculateAuBasDueDate } from "../../engine/au/calendar.ts";
import { buildGstReturn, gstReturnDueDate, gstRateByDate as sgGstRateByDate } from "../../engine/gst.ts";
import { lookupGstCode } from "../../engine/gstCodes.ts";
import { buildIaf, type IafInput } from "../../engine/iaf.ts";
import { addDays, addMonths, endOfMonth, parseISO, toISO, type ISODate as EngineDate } from "../../engine/dates.ts";
import { money, slug, toISODate } from "../format.ts";
import type { AppData, Cents, CsvModel, Ctx, Fund, FundId, Market } from "../types.ts";
import type { GstBoxLine, GstCheck, GstEntry, GstFiling, GstPeriod, GstReturnView, GstWorksheetLine } from "./types.ts";
export type * from "./types.ts";

const SG_BOXES = [
  ["SG_F5.1", "Box 1 · Standard-rated supplies", "box1StandardRatedSupplies"],
  ["SG_F5.2", "Box 2 · Zero-rated supplies", "box2ZeroRatedSupplies"],
  ["SG_F5.3", "Box 3 · Exempt supplies", "box3ExemptSupplies"],
  ["SG_F5.4", "Box 4 · Total supplies", "box4TotalSupplies"],
  ["SG_F5.5", "Box 5 · Taxable purchases", "box5TaxablePurchases"],
  ["SG_F5.6", "Box 6 · Output tax due", "box6OutputTaxDue"],
  ["SG_F5.7", "Box 7 · Input tax and refunds claimed", "box7InputTaxAndRefundsClaimed"],
  ["SG_F5.8", "Box 8 · Net GST", "box8NetGst"],
  ["SG_F5.9", "Box 9 · Imports under suspension schemes", "box9ImportsUnderSuspensionSchemes"],
  ["SG_F5.13", "Box 13 · Revenue", "box13Revenue"],
  ["SG_F5.14", "Box 14 · Reverse-charge imported services/LVG", "box14ReverseChargeImportedServicesAndLvg"],
  ["SG_F5.19", "Box 19 · Deferred import GST payable", "box19DeferredImportGstPayable"],
  ["SG_F5.21", "Box 21 · IGDS imports", "box21IgdsImports"],
] as const;

const AU_LABEL_ORDER: readonly AuBasLabel[] = ["G1", "G2", "G3", "G10", "G11", "1A", "1B"];
const DAY = 24 * 60 * 60 * 1000;

function fund(data: AppData, fundId: FundId): Fund {
  const found = data.funds.find((f) => f.id === fundId);
  if (!found) throw new Error(`Fund not found: ${fundId}`);
  return found;
}

function periodLabel(start: string, end: string): string {
  const s = parseISO(start as EngineDate);
  const e = parseISO(end as EngineDate);
  const month = (m: number) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]!;
  return `${month(s.m)}–${month(e.m)} ${e.y}`;
}

function days(a: string, b: string): number {
  return Math.round((Date.UTC(parseISO(b as EngineDate).y, parseISO(b as EngineDate).m - 1, parseISO(b as EngineDate).d) - Date.UTC(parseISO(a as EngineDate).y, parseISO(a as EngineDate).m - 1, parseISO(a as EngineDate).d)) / DAY);
}

function quartersFor(f: Fund): Array<{ start: string; end: string }> {
  if (f.market === "SG") {
    const out: Array<{ start: string; end: string }> = [];
    let start = addDays(addMonths(f.periodEnd as EngineDate, -12), 1) as string;
    for (let i = 0; i < 4; i += 1) {
      const end = endOfMonth(addMonths(start as EngineDate, 2)) as string;
      out.push({ start, end });
      start = addDays(end as EngineDate, 1) as string;
    }
    return out;
  }
  const out: Array<{ start: string; end: string }> = [];
  let start = f.periodStart;
  while (start <= f.periodEnd) {
    const end = endOfMonth(addMonths(start as EngineDate, 2)) as string;
    out.push({ start, end: end > f.periodEnd ? f.periodEnd : end });
    start = addDays((end > f.periodEnd ? f.periodEnd : end) as EngineDate, 1);
  }
  return out;
}

export function gstPeriods(data: AppData, f: Fund, now: Date = new Date()): GstPeriod[] {
  const today = toISODate(now);
  const usedFilings = new Set<string>();
  const periodFrom = (p: { start: string; end: string }, filing: GstFiling | null): GstPeriod => {
    const taxAgentConcession = f.governance !== "no-agent";
    const dueDate = f.market === "AU"
      ? calculateAuBasDueDate({ periodStart: p.start as EngineDate, periodEnd: p.end as EngineDate, frequency: "QUARTERLY", taxAgentConcession })
      : gstReturnDueDate(p.end as EngineDate);
    const dueBasis = f.market === "SG"
      ? "IRAS GST F5 is due one month after the quarter end."
      : p.end.slice(5, 7) === "12"
        ? "Oct-Dec BAS is due on 28 February; the engine rolls forward when that day is a weekend or national public holiday."
        : taxAgentConcession && dueDate > calculateAuBasDueDate({ periodStart: p.start as EngineDate, periodEnd: p.end as EngineDate, frequency: "QUARTERLY" })
          ? "Quarterly BAS is normally due 28 days after quarter end; this fund uses the registered-agent lodgment program concession."
          : "Quarterly BAS is due 28 days after quarter end, rolled forward for weekends and national public holidays.";
    const changed = filing !== null && (filing.periodStart !== p.start || filing.periodEnd !== p.end);
    return {
      fundId: f.id,
      market: f.market,
      kind: f.market === "AU" ? "BAS" : "GST F5",
      start: p.start,
      end: p.end,
      dueDate,
      dueBasis,
      filing,
      status: filing ? "lodged" : dueDate < today ? "overdue" : "open",
      label: `${f.market === "AU" ? "BAS" : "GST F5"} ${periodLabel(p.start, p.end)}${changed ? " · Lodged period (period changed since lodgment)" : ""}`,
    };
  };
  const derived = quartersFor(f).map((p) => {
    const filing = data.gstFilings.find((record) => record.fundId === f.id && record.periodStart <= p.start && record.periodEnd >= p.end) ?? null;
    if (filing) usedFilings.add(filing.id);
    return periodFrom(p, filing);
  });
  const unmatched = data.gstFilings
    .filter((record) => record.fundId === f.id && !usedFilings.has(record.id))
    .map((filing) => periodFrom({ start: filing.periodStart, end: filing.periodEnd }, filing));
  return [...derived, ...unmatched].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

export function defaultGstPeriod(data: AppData, f: Fund, now: Date = new Date()): GstPeriod {
  const periods = gstPeriods(data, f, now);
  return periods.find((p) => p.status !== "lodged") ?? periods.at(-1)!;
}

function inPeriod(entry: GstEntry, period: Pick<GstPeriod, "start" | "end">): boolean {
  return entry.date >= period.start && entry.date <= period.end;
}

export function gstCodeLabel(market: Market, code: string, date = "2026-10-12"): string {
  if (market === "AU") return lookupAuGstCode(code, date as EngineDate)?.label ?? code;
  return lookupGstCode(code, date as EngineDate)?.description ?? code;
}

function lineFor(entry: GstEntry, amount: Cents): GstWorksheetLine {
  const market = lookupAuGstCode(entry.code, entry.date as EngineDate) ? "AU" : "SG";
  return { id: entry.invoiceRef ?? `${entry.date} ${entry.description}`, date: entry.date, description: entry.description, counterparty: entry.counterparty, code: entry.code, codeLabel: gstCodeLabel(market, entry.code, entry.date), net: entry.net, tax: entry.tax, amount };
}

function entrySide(market: Market, code: string, date: string): "SUPPLY" | "PURCHASE" | null {
  if (market === "AU") return lookupAuGstCode(code, date as EngineDate)?.side ?? null;
  return lookupGstCode(code, date as EngineDate)?.side ?? null;
}

function expectedTax(entry: GstEntry, market: Market): Cents | null {
  if (market === "AU") {
    const def = lookupAuGstCode(entry.code, entry.date as EngineDate);
    if (!def || def.rateModel === "MANUAL") return null;
    if (def.rateModel === "ZERO") return 0;
    if (def.rateModel === "MARGIN_1_11") return Math.round(entry.net / 11);
    return Math.round((entry.net * auGstRateByDate(entry.date as EngineDate)) / 10_000);
  }
  const def = lookupGstCode(entry.code, entry.date as EngineDate);
  if (!def) return null;
  return def.rateBehavior === "PREVAILING_STANDARD_RATE" || def.rateBehavior === "IMPORT_GST_DEFERRED"
    ? Math.round((entry.net * sgGstRateByDate(entry.date as EngineDate)) / 10_000)
    : 0;
}

function checks(data: AppData, f: Fund, period: GstPeriod, entries: readonly GstEntry[], boxes: readonly GstBoxLine[]): GstCheck[] {
  const out: GstCheck[] = [];
  for (const entry of entries) {
    const known = f.market === "AU" ? lookupAuGstCode(entry.code, entry.date as EngineDate) : lookupGstCode(entry.code, entry.date as EngineDate);
    if (!known) out.push({ id: `unknown-${entry.id}`, severity: "exception", title: "Unknown GST code", detail: `${entry.invoiceRef ?? entry.id} uses ${entry.code}.` });
    const expected = expectedTax(entry, f.market);
    if (expected !== null && Math.abs(expected - entry.tax) > 1) {
      out.push({ id: `rate-${entry.id}`, severity: "exception", title: "GST does not match the code rate", detail: `${entry.invoiceRef ?? entry.id}: expected ${money(expected, f.currency, 2)}, entered ${money(entry.tax, f.currency, 2)}.` });
    }
  }
  const outside = data.gstLedger.filter((entry) => entry.fundId === f.id && !gstPeriods(data, f).some((p) => inPeriod(entry, p)));
  for (const entry of outside) out.push({ id: `outside-${entry.id}`, severity: "exception", title: "Entry outside a GST period", detail: `${entry.date} ${entry.description} is outside the fund's configured GST/BAS periods.` });
  if (period.filing) {
    for (const box of boxes) {
      const lodged = period.filing.figures[box.ref];
      if (lodged !== undefined && lodged !== box.amount) {
        out.push({ id: `lodged-edited-${box.ref}`, severity: "exception", title: "Lodged period edited", detail: `${box.ref} now differs from the lodged figure by ${money(box.amount - lodged, f.currency, 2)}.` });
      }
    }
  }
  if (f.market === "SG" && boxes.some((box) => box.ref === "SG_F5.3" && box.amount !== 0)) {
    out.push({ id: "sg-partial-exemption", severity: "note", title: "Partial exemption review", detail: "Exempt supplies exist, so Box 7 claims only the input tax the partial exemption rules allow on residual and exempt-attributable purchases." });
  }
  if (f.market === "AU" && entries.some((entry) => entry.code === "SALE_GST_FREE_GOING_CONCERN")) {
    out.push({ id: "au-going-concern", severity: "note", title: "Going concern treatment used", detail: "GST-free going concern sales require the statutory conditions and written agreement to be retained with the BAS workpaper." });
  }
  if (f.market === "AU" && entries.some((entry) => entry.code === "SALE_MARGIN_SCHEME")) {
    out.push({ id: "au-margin-scheme", severity: "note", title: "Margin scheme treatment used", detail: "The engine treats the recorded net amount as the BAS margin; retain eligibility and valuation support." });
  }
  return out;
}

function csv(fileName: string, columns: string[], rows: CsvModel["rows"]): CsvModel {
  return { fileName, columns, rows };
}

function ledgerCsv(f: Fund, rows: readonly GstEntry[]): CsvModel {
  return csv(`${slug(f.name)}-gst-ledger.csv`, ["Date", "Invoice", "Counterparty", "Description", "Code", "Net", "GST"], rows.map((r) => [r.date, r.invoiceRef ?? r.id, r.counterparty, r.description, r.code, r.net / 100, r.tax / 100]));
}

function returnCsv(f: Fund, period: GstPeriod, boxes: readonly GstBoxLine[]): CsvModel {
  return csv(`${slug(f.name)}-${period.end}-gst-return.csv`, ["Reference", "Label", "Amount"], boxes.map((b) => [b.ref, b.label, b.amount / 100]));
}

function worksheetCsv(f: Fund, period: GstPeriod, boxes: readonly GstBoxLine[]): CsvModel {
  return csv(`${slug(f.name)}-${period.end}-gst-worksheet.csv`, ["Reference", "Box", "Date", "Invoice", "Counterparty", "Description", "Code", "Net", "GST", "Contribution"], boxes.flatMap((b) => b.worksheet.map((w) => [b.ref, b.label, w.date, w.id, w.counterparty, w.description, w.code, w.net / 100, w.tax / 100, w.amount / 100])));
}

function sgIaf(f: Fund, period: GstPeriod, entries: readonly GstEntry[]): GstReturnView["iaf"] {
  if (f.market !== "SG") return undefined;
  const line = (entry: GstEntry) => ({
    date: entry.date as EngineDate,
    documentNo: entry.invoiceRef ?? entry.id,
    counterpartyName: entry.counterparty,
    description: entry.description,
    taxCode: entry.code,
    currency: "SGD",
    netAmount: entry.net,
    gstAmount: entry.tax,
    propertyRef: entry.propertyId,
  });
  const input: IafInput = {
    company: {
      companyName: f.name,
      companyUen: `${f.id.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}X`,
      gstRegistrationNumber: `M${f.id.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}`,
      periodStart: period.start as EngineDate,
      periodEnd: period.end as EngineDate,
      preparedOn: period.filing?.lodgedDate as EngineDate | undefined,
      contactName: period.filing?.actor,
    },
    supplyLedger: entries.filter((e) => entrySide("SG", e.code, e.date) === "SUPPLY").map(line),
    purchaseLedger: entries.filter((e) => entrySide("SG", e.code, e.date) === "PURCHASE").map(line),
    generalLedger: entries.map((e) => ({ date: e.date as EngineDate, journalNo: e.invoiceRef ?? e.id, accountCode: e.code, accountName: e.description, debit: entrySide("SG", e.code, e.date) === "PURCHASE" ? e.net + e.tax : 0, credit: entrySide("SG", e.code, e.date) === "SUPPLY" ? e.net + e.tax : 0, taxCode: e.code, sourceDocumentNo: e.invoiceRef ?? e.id })),
  };
  const result = buildIaf(input);
  const problems = [...new Set(result.findings.map((finding) => (finding.id === "IAF.SPEC.ASSUMED" ? IAF_LAYOUT_NOTE : finding.message)))];
  return { fileName: `${slug(f.name)}-${period.end}-iras-audit-file.txt`, text: result.text, problems };
}

/** What the page says about the IAF layout (the engine flags it as an assumption: no official IRAS field layout was available). */
export const IAF_LAYOUT_NOTE =
  "The file follows published descriptions of the IRAS Audit File, not the IRAS field specification itself, and uses demo UEN and GST registration numbers. Compare it with an IAF from your accounting system before giving it to IRAS.";

function sgWorksheetFor(entries: readonly GstEntry[], ref: string): GstWorksheetLine[] {
  const box = Number(ref.replace("SG_F5.", ""));
  return entries.flatMap((entry) => {
    const def = lookupGstCode(entry.code, entry.date as EngineDate);
    if (!def) return [];
    if (box === 4) return def.feedsBaseBoxes.some((n) => n === 1 || n === 2 || n === 3) ? [lineFor(entry, entry.net)] : [];
    if (box === 8 || box === 18 || box === 20) return [];
    if (box === 13) return def.side === "SUPPLY" && entry.code !== "DS" && entry.code !== "OS" ? [lineFor(entry, entry.net)] : [];
    if (def.feedsBaseBoxes.includes(box)) return [lineFor(entry, entry.net)];
    if (def.feedsTaxBoxes.includes(box)) return [lineFor(entry, entry.tax)];
    if (def.feedsIndicatorBoxes.includes(box)) return [lineFor(entry, entry.net)];
    return [];
  });
}

function sgView(data: AppData, f: Fund, period: GstPeriod): GstReturnView {
  const entries = data.gstLedger.filter((entry) => entry.fundId === f.id && inPeriod(entry, period));
  const result = buildGstReturn({
    periodStart: period.start as EngineDate,
    periodEnd: period.end as EngineDate,
    transactions: entries.map((entry) => ({ date: entry.date as EngineDate, documentNo: entry.invoiceRef ?? entry.id, counterparty: entry.counterparty, taxCode: entry.code, netAmount: entry.net, gstAmount: entry.tax, currency: "SGD", propertyRef: entry.propertyId, description: entry.description })),
  });
  const boxes = SG_BOXES.map(([ref, label, key]) => {
    const amount = result.boxes[key];
    const worksheet = sgWorksheetFor(entries, ref);
    return { ref, label, amount: typeof amount === "boolean" ? 0 : amount, worksheet };
  });
  const netGst = result.boxes.box20TotalTaxAfterIgds;
  const view: GstReturnView = {
    fundId: f.id,
    market: "SG",
    period,
    boxes,
    netGst,
    payable: netGst > 0 ? netGst : 0,
    refundable: netGst < 0 ? -netGst : 0,
    checks: [],
    ledger: entries,
    ledgerCsv: ledgerCsv(f, entries),
    returnCsv: returnCsv(f, period, boxes),
    worksheetCsv: worksheetCsv(f, period, boxes),
    iaf: sgIaf(f, period, entries),
    notes: [...result.notes, "Singapore GST rate is supplied by engine rule gst.rate-and-f5.1994-plus."],
  };
  return { ...view, checks: checks(data, f, period, entries, boxes) };
}

function auWorksheetFor(entries: readonly GstEntry[], label: AuBasLabel): GstWorksheetLine[] {
  return entries.flatMap((entry) => {
    const def = lookupAuGstCode(entry.code, entry.date as EngineDate);
    if (!def?.basLabels.includes(label)) return [];
    return [lineFor(entry, label === "1A" || label === "1B" ? entry.tax : entry.net + (def.rateModel === "STANDARD_10" ? entry.tax : 0))];
  });
}

function auView(data: AppData, f: Fund, period: GstPeriod): GstReturnView {
  const entries = data.gstLedger.filter((entry) => entry.fundId === f.id && inPeriod(entry, period));
  const result = buildAuBas({
    periodStart: period.start as EngineDate,
    periodEnd: period.end as EngineDate,
    accountingMethod: "NON_CASH",
    reportingCycle: "QUARTERLY",
    reportingMethod: "FULL",
    transactions: entries.map((entry) => ({ date: entry.date as EngineDate, taxCode: entry.code, netAmount: entry.net, gstAmount: entry.tax, description: entry.description, amountBasis: "GST_EXCLUSIVE", hasTaxInvoice: true })),
    showAmountsAsGstInclusive: true,
  });
  const labelAmount = (label: AuBasLabel): Cents => result.reportedLabels[label]
    ?? (label === "G1" ? result.labels.g1TotalSales : label === "G2" ? result.labels.g2ExportSales : label === "G3" ? result.labels.g3OtherGstFreeSales : label === "G10" ? result.labels.g10CapitalPurchases : label === "G11" ? result.labels.g11NonCapitalPurchases : label === "1A" ? result.labels.label1aGstOnSales : result.labels.label1bGstOnPurchases);
  const boxes: GstBoxLine[] = AU_LABEL_ORDER.map((id) => ({ ref: `AU_BAS.${id}`, label: AU_BAS_LABELS.find((l) => l.id === id)!.label, amount: labelAmount(id), worksheet: auWorksheetFor(entries, id) }));
  const view: GstReturnView = {
    fundId: f.id,
    market: "AU",
    period,
    boxes,
    netGst: labelAmount("1A") - labelAmount("1B"),
    payable: Math.max(0, labelAmount("1A") - labelAmount("1B")),
    refundable: Math.max(0, labelAmount("1B") - labelAmount("1A")),
    checks: [],
    ledger: entries,
    ledgerCsv: ledgerCsv(f, entries),
    returnCsv: returnCsv(f, period, boxes),
    worksheetCsv: worksheetCsv(f, period, boxes),
    notes: [...result.notes, "Australian BAS label amounts are rounded down to whole dollars by the engine's reportedLabels, matching the ATO form basis.", "Australian GST rate and BAS labels come from engine rule au-gst.rate-and-bas.2026-10-10."],
  };
  return { ...view, checks: checks(data, f, period, entries, boxes) };
}

export function gstReturnView(data: AppData, fundId: FundId, periodEnd: string | null | undefined, ctx: Ctx): GstReturnView {
  const f = fund(data, fundId);
  const period = gstPeriods(data, f, ctx.now).find((p) => p.end === periodEnd) ?? defaultGstPeriod(data, f, ctx.now);
  return f.market === "AU" ? auView(data, f, period) : sgView(data, f, period);
}

export function gstLedgerView(data: AppData, fundId: FundId, filter = "", period?: Pick<GstPeriod, "start" | "end"> | null): { rows: GstEntry[]; totalsByCode: Array<{ code: string; net: Cents; tax: Cents }> } {
  const needle = filter.trim().toLowerCase();
  const rows = data.gstLedger.filter((entry) => entry.fundId === fundId && (!period || inPeriod(entry, period)) && (needle === "" || `${entry.date} ${entry.description} ${entry.counterparty} ${entry.code} ${gstCodeLabel(fund(data, fundId).market, entry.code, entry.date)} ${entry.invoiceRef ?? ""}`.toLowerCase().includes(needle)));
  const totals = new Map<string, { code: string; net: Cents; tax: Cents }>();
  for (const row of rows) {
    const current = totals.get(row.code) ?? { code: row.code, net: 0, tax: 0 };
    current.net += row.net;
    current.tax += row.tax;
    totals.set(row.code, current);
  }
  return { rows, totalsByCode: [...totals.values()].sort((a, b) => a.code.localeCompare(b.code)) };
}

export function periodLengthWeight(period: Pick<GstPeriod, "start" | "end">, f: Fund): number {
  return Math.max(1, days(period.start, period.end) + 1) / Math.max(1, days(f.periodStart, f.periodEnd) + 1);
}
