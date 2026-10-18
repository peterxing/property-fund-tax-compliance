// OWNER: GST & BAS agent (F1). Fictional demo records for the nine seeded funds (integer cents).
import type { GstEntry, GstFiling } from "./types.ts";
import { buildAuBas } from "../../engine/au/gst.ts";
import { buildGstReturn } from "../../engine/gst.ts";
import type { ISODate as EngineDate } from "../../engine/dates.ts";

interface FundSeed {
  id: string;
  market: "AU" | "SG";
  periodStart: string;
  periodEnd: string;
  revenue: number;
  expenses: number;
  capex: number;
}

const FUNDS: readonly FundSeed[] = [
  { id: "harbourline", market: "AU", periodStart: "2025-07-01", periodEnd: "2026-06-30", revenue: 87_112_478_00, expenses: 27_055_775_00, capex: 4_800_000_00 },
  { id: "southbank", market: "AU", periodStart: "2025-07-01", periodEnd: "2026-06-30", revenue: 45_074_401_00, expenses: 9_949_295_00, capex: 3_200_000_00 },
  { id: "wattle", market: "AU", periodStart: "2025-07-01", periodEnd: "2026-06-30", revenue: 133_902_095_00, expenses: 40_846_197_00, capex: 6_400_000_00 },
  { id: "kurrajong", market: "AU", periodStart: "2025-07-01", periodEnd: "2026-06-30", revenue: 59_742_059_00, expenses: 17_721_226_00, capex: 3_900_000_00 },
  { id: "coastline", market: "AU", periodStart: "2025-10-01", periodEnd: "2026-09-30", revenue: 25_823_165_00, expenses: 6_646_673_00, capex: 2_500_000_00 },
  { id: "telok-ayer", market: "SG", periodStart: "2025-10-01", periodEnd: "2026-09-30", revenue: 86_604_821_00, expenses: 29_410_991_00, capex: 7_200_000_00 },
  { id: "loyang", market: "SG", periodStart: "2025-07-01", periodEnd: "2026-06-30", revenue: 100_310_346_00, expenses: 30_455_637_00, capex: 8_500_000_00 },
  { id: "meranti", market: "SG", periodStart: "2025-10-01", periodEnd: "2026-09-30", revenue: 38_460_000_00, expenses: 13_730_000_00, capex: 4_900_000_00 },
  { id: "kallang", market: "SG", periodStart: "2025-10-01", periodEnd: "2026-09-30", revenue: 61_300_000_00, expenses: 21_200_000_00, capex: 5_100_000_00 },
];

const QUARTERS: Record<string, Array<[string, string]>> = {
  standardAu: [["2025-07-01", "2025-09-30"], ["2025-10-01", "2025-12-31"], ["2026-01-01", "2026-03-31"], ["2026-04-01", "2026-06-30"]],
  coastline: [["2025-10-01", "2025-12-31"], ["2026-01-01", "2026-03-31"], ["2026-04-01", "2026-06-30"], ["2026-07-01", "2026-09-30"]],
  sgSep: [["2025-10-01", "2025-12-31"], ["2026-01-01", "2026-03-31"], ["2026-04-01", "2026-06-30"], ["2026-07-01", "2026-09-30"]],
  loyang: [["2025-07-01", "2025-09-30"], ["2025-10-01", "2025-12-31"], ["2026-01-01", "2026-03-31"], ["2026-04-01", "2026-06-30"]],
};

const WEIGHTS = [0.24, 0.25, 0.26, 0.25] as const;
const cents = (n: number): number => Math.round(n);
const tax = (net: number, bps: number): number => Math.round((net * bps) / 10_000);
const invoice = (fundId: string, q: number, line: number): string => `${fundId.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)}-GST-${q + 1}${String(line + 1).padStart(2, "0")}`;

function quarters(fund: FundSeed): Array<[string, string]> {
  if (fund.id === "coastline") return QUARTERS.coastline!;
  if (fund.id === "loyang") return QUARTERS.loyang!;
  return fund.market === "AU" ? QUARTERS.standardAu! : QUARTERS.sgSep!;
}

function auEntries(fund: FundSeed): GstEntry[] {
  return quarters(fund).flatMap(([start], q): GstEntry[] => {
    const revenue = cents(fund.revenue * WEIGHTS[q]!);
    const expenses = cents(fund.expenses * WEIGHTS[q]!);
    const capex = q === 2 ? fund.capex : cents(fund.capex * 0.15);
    const saleCode = fund.id === "southbank" && q === 3 ? "SALE_GST_FREE_GOING_CONCERN" : fund.id === "wattle" && q === 3 ? "SALE_MARGIN_SCHEME" : "SALE_TAXABLE";
    const saleNet = saleCode === "SALE_MARGIN_SCHEME" ? 4_400_000_00 : cents(revenue * 0.72);
    const saleTax = saleCode === "SALE_TAXABLE" ? tax(saleNet, 1000) : saleCode === "SALE_MARGIN_SCHEME" ? Math.round(saleNet / 11) : 0;
    const rows = [
      ["01", "Base rent and tenant recoveries", "Major tenant group", "SALE_TAXABLE", cents(revenue * 0.58), tax(cents(revenue * 0.58), 1000)],
      ["07", "Commercial property transaction", "Purchaser nominee", saleCode, saleNet, saleTax],
      ["10", "GST-free recharge", "Council authority", "SALE_GST_FREE_EXPORT", cents(revenue * 0.02), 0],
      ["12", "Residential manager recharge", "Residential SPV", "SALE_INPUT_TAXED_RESIDENTIAL_RENT", cents(revenue * 0.03), 0],
      ["15", "Property operating expenses", "Facilities supplier", "PURCHASE_NON_CAPITAL_TAXABLE", cents(expenses * 0.55), tax(cents(expenses * 0.55), 1000)],
      ["18", "Responsible entity and audit fees", "Professional adviser", "PURCHASE_NON_CAPITAL_TAXABLE", cents(expenses * 0.25), tax(cents(expenses * 0.25), 1000)],
      ["21", "Capital works acquisition", "Construction contractor", "PURCHASE_CAPITAL_TAXABLE", capex, tax(capex, 1000)],
      ["24", "Blocked entertainment input tax", "Corporate venue", "PURCHASE_NON_CAPITAL_NO_CREDIT", cents(expenses * 0.02), tax(cents(expenses * 0.02), 1000)],
    ] as const;
    return rows.map(([day, description, counterparty, code, net, gst], line) => ({
      id: `gst-${fund.id}-${q + 1}-${line + 1}`,
      fundId: fund.id,
      date: `${start.slice(0, 8)}${day}`,
      description,
      counterparty,
      code,
      net,
      tax: gst,
      invoiceRef: invoice(fund.id, q, line),
    }));
  });
}

function sgEntries(fund: FundSeed): GstEntry[] {
  return quarters(fund).flatMap(([start], q): GstEntry[] => {
    const revenue = cents(fund.revenue * WEIGHTS[q]!);
    const expenses = cents(fund.expenses * WEIGHTS[q]!);
    const capex = q === 1 ? fund.capex : cents(fund.capex * 0.12);
    const exempt = fund.id === "telok-ayer" ? cents(revenue * 0.035) : fund.id === "kallang" ? cents(revenue * 0.025) : 0;
    const rows = [
      ["01", "Commercial rent and recoveries", "Anchor tenants", "SR", cents(revenue * 0.68), tax(cents(revenue * 0.68), 900)],
      ["06", "Exported management support", "Offshore affiliate", "ZR", cents(revenue * 0.02), 0],
      ["09", "Residential exempt component", "Residential lessee pool", exempt ? "ESN33" : "OS", exempt, 0],
      ["12", "Property operating expenses", "Facilities supplier", "TX", cents(expenses * 0.48), tax(cents(expenses * 0.48), 900)],
      ["15", "Manager and trustee fees", "Manager", "TX", cents(expenses * 0.28), tax(cents(expenses * 0.28), 900)],
      ["18", "Residual overheads", "Shared service centre", "TX-RE", cents(expenses * 0.08), tax(cents(expenses * 0.08), 900)],
      ["21", "Blocked input tax item", "Corporate venue", "BL", cents(expenses * 0.02), tax(cents(expenses * 0.02), 900)],
      ["24", "Imported lift equipment", "Overseas vendor", q === 2 ? "IM" : "ZP", capex, q === 2 ? tax(capex, 900) : 0],
    ] as const;
    return rows.filter(([, , , , net]) => net !== 0).map(([day, description, counterparty, code, net, gst], line) => ({
      id: `gst-${fund.id}-${q + 1}-${line + 1}`,
      fundId: fund.id,
      date: `${start.slice(0, 8)}${day}`,
      description,
      counterparty,
      code,
      net,
      tax: gst,
      invoiceRef: invoice(fund.id, q, line),
    }));
  });
}

export const SEED_GST_LEDGER: readonly GstEntry[] = FUNDS.flatMap((fund) => (fund.market === "AU" ? auEntries(fund) : sgEntries(fund)));

function entriesFor(fundId: string, start: string, end: string): GstEntry[] {
  return SEED_GST_LEDGER.filter((entry) => entry.fundId === fundId && entry.date >= start && entry.date <= end);
}

function auFigures(fundId: string, start: string, end: string): Record<string, number> {
  const result = buildAuBas({
    periodStart: start as EngineDate,
    periodEnd: end as EngineDate,
    accountingMethod: "NON_CASH",
    reportingCycle: "QUARTERLY",
    reportingMethod: "FULL",
    transactions: entriesFor(fundId, start, end).map((entry) => ({ date: entry.date as EngineDate, taxCode: entry.code, netAmount: entry.net, gstAmount: entry.tax, description: entry.description, amountBasis: "GST_EXCLUSIVE", hasTaxInvoice: true })),
    showAmountsAsGstInclusive: true,
  });
  return {
    "AU_BAS.G1": result.reportedLabels.G1 ?? 0,
    "AU_BAS.G2": result.reportedLabels.G2 ?? 0,
    "AU_BAS.G3": result.reportedLabels.G3 ?? 0,
    "AU_BAS.G10": result.reportedLabels.G10 ?? 0,
    "AU_BAS.G11": result.reportedLabels.G11 ?? 0,
    "AU_BAS.1A": result.reportedLabels["1A"] ?? 0,
    "AU_BAS.1B": result.reportedLabels["1B"] ?? 0,
  };
}

function sgFigures(fundId: string, start: string, end: string): Record<string, number> {
  const result = buildGstReturn({
    periodStart: start as EngineDate,
    periodEnd: end as EngineDate,
    transactions: entriesFor(fundId, start, end).map((entry) => ({ date: entry.date as EngineDate, documentNo: entry.invoiceRef ?? entry.id, counterparty: entry.counterparty, taxCode: entry.code, netAmount: entry.net, gstAmount: entry.tax, currency: "SGD", description: entry.description })),
  });
  return {
    "SG_F5.1": result.boxes.box1StandardRatedSupplies,
    "SG_F5.2": result.boxes.box2ZeroRatedSupplies,
    "SG_F5.3": result.boxes.box3ExemptSupplies,
    "SG_F5.4": result.boxes.box4TotalSupplies,
    "SG_F5.5": result.boxes.box5TaxablePurchases,
    "SG_F5.6": result.boxes.box6OutputTaxDue,
    "SG_F5.7": result.boxes.box7InputTaxAndRefundsClaimed,
    "SG_F5.8": result.boxes.box8NetGst,
    "SG_F5.9": result.boxes.box9ImportsUnderSuspensionSchemes,
    "SG_F5.13": result.boxes.box13Revenue,
    "SG_F5.14": result.boxes.box14ReverseChargeImportedServicesAndLvg,
    "SG_F5.19": result.boxes.box19DeferredImportGstPayable,
    "SG_F5.21": result.boxes.box21IgdsImports,
  };
}

function lodgedDate(end: string): string {
  const [year, month] = end.split("-").map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, Number(end.slice(8, 10)) + 24));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function filing(fund: FundSeed, q: [string, string], i: number): GstFiling {
  const [start, end] = q;
  const kind = fund.market === "AU" ? "BAS" : "GST F5";
  return {
    id: `gstf-${fund.id}-${end.slice(0, 7)}`,
    fundId: fund.id,
    periodStart: start,
    periodEnd: end,
    kind,
    reference: fund.market === "AU" ? `ATO BAS ${fund.id.slice(0, 4).toUpperCase()}-${end.slice(0, 7)}` : `IRAS F5 ${fund.id.slice(0, 4).toUpperCase()}-${end.slice(0, 7)}`,
    lodgedDate: lodgedDate(end),
    actor: fund.market === "AU" ? (i % 2 === 0 ? "A. Moreno" : "Arden Tax Partners") : (i % 2 === 0 ? "A. Moreno" : "Tanjong Tax Advisory"),
    figures: fund.market === "AU" ? auFigures(fund.id, start, end) : sgFigures(fund.id, start, end),
  };
}

const DELIBERATE_OVERDUE = new Set(["southbank/2026-06-30", "meranti/2026-06-30"]);

export const SEED_GST_FILINGS: readonly GstFiling[] = FUNDS.flatMap((fund) =>
  quarters(fund)
    .filter((q) => q[1] < "2026-07-01")
    .filter((q) => !DELIBERATE_OVERDUE.has(`${fund.id}/${q[1]}`))
    .map((q, i) => filing(fund, q, i)),
);
