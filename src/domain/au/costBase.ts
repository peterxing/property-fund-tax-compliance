// Cost base & CGT: unrealised gains on properties, the deferred tax an investor type would bear, and the unit cost base roll-forward.
import type {
  AppData,
  AuFund,
  Cents,
  CostBaseView,
  CsvModel,
  DeferredTaxInvestor,
  DocModel,
  Fund,
  FundCalc,
  Property,
  PropertyGainRow,
  UnitCostBaseRow,
} from "../types.ts";
import { dateLabel, perUnit, ratePct, slug } from "../format.ts";
import { aiirLines } from "./investor.ts";
import { auRates, heldForDiscount, superNetGain, trustNetGain } from "./rates.ts";
import { aud, asAuFund, dollars, mulBpsExact, nz, propertiesOf } from "./util.ts";

const INVESTORS: ReadonlyArray<{ id: DeferredTaxInvestor; label: string }> = [
  { id: "foreign-eoi", label: "Foreign investor — EOI country" },
  { id: "foreign-non-eoi", label: "Foreign investor — non-EOI country" },
  { id: "complying-super", label: "Australian complying super fund" },
  { id: "company", label: "Australian company" },
];

const taxCostBase = (p: Property): Cents => p.cost + p.improvements - p.capitalWorksClaimed;

function propertyRows(properties: readonly Property[], asAt: string): PropertyGainRow[] {
  return properties.map((p) => {
    const costBase = taxCostBase(p);
    const discountApplies = heldForDiscount(p.acquired, asAt);
    return {
      id: p.id,
      name: p.name,
      location: p.location,
      acquired: p.acquired,
      heldLabel: discountApplies ? "Held 12 months — discount applies" : "Held under 12 months — no discount",
      discountApplies,
      costBase,
      capitalWorks: p.capitalWorksClaimed,
      valuation: p.valuation,
      unrealised: p.valuation - costBase,
    };
  });
}

/** Gains and losses if every property were sold at its valuation, losses applied to the gains that carry no discount first. */
function cgtPosition(rows: readonly PropertyGainRow[]) {
  let discountable = 0;
  let other = 0;
  let losses = 0;
  for (const r of rows) {
    if (r.unrealised > 0) {
      if (r.discountApplies) discountable += r.unrealised;
      else other += r.unrealised;
    } else {
      losses -= r.unrealised;
    }
  }
  const otherAfterLosses = Math.max(0, other - losses);
  const lossesLeft = Math.max(0, losses - other);
  return {
    gains: discountable + other,
    losses,
    otherAfterLosses,
    discountableAfterLosses: Math.max(0, discountable - lossesLeft),
    netLoss: Math.max(0, lossesLeft - discountable),
  };
}

function deferredTax(
  position: ReturnType<typeof cgtPosition>,
  asAt: string,
  investor: DeferredTaxInvestor,
): { investors: Array<{ id: DeferredTaxInvestor; label: string; amount: Cents }>; selected: DeferredTaxInvestor; note: string } {
  const rates = auRates(asAt);
  const { otherAfterLosses: f, discountableAfterLosses: m } = position;
  const amounts: Record<DeferredTaxInvestor, Cents> = {
    "foreign-eoi": mulBpsExact(f + m, rates.ordinary.eoi),
    "foreign-non-eoi": mulBpsExact(f + m, rates.ordinary.nonEoi),
    "complying-super": mulBpsExact(f + superNetGain(asAt, m), rates.superBps),
    company: mulBpsExact(f + m, rates.companyBps),
  };
  const basis: Record<DeferredTaxInvestor, string> = {
    "foreign-eoi": `${ratePct(rates.ordinary.eoi / 10000)} withholding on the fund payment, which includes the gain before the discount`,
    "foreign-non-eoi": `${ratePct(rates.ordinary.nonEoi / 10000)} withholding on the fund payment, which includes the gain before the discount`,
    "complying-super": `${ratePct(rates.superBps / 10000)} tax after its one-third discount on gains from property held 12 months or more`,
    company: `${ratePct(rates.companyBps / 10000)} tax with no CGT discount`,
  };
  const loss = position.netLoss > 0 ? ` Net capital loss of ${aud(position.netLoss, 0)} carries forward to offset later gains.` : "";
  return {
    investors: INVESTORS.map((i) => ({ id: i.id, label: i.label, amount: amounts[i.id] })),
    selected: investor,
    note: `${basis[investor]}.${loss}`,
  };
}

function propertiesCsv(fund: AuFund, properties: readonly Property[], rows: readonly PropertyGainRow[]): CsvModel {
  return {
    fileName: `${slug(fund.name)}-unrealised-cgt-properties.csv`,
    columns: [
      "Property",
      "Location",
      "Acquired",
      "Cost",
      "Improvements",
      "Capital works claimed",
      "Tax cost base",
      "Valuation",
      "Unrealised gain",
      "Held 12 months",
    ],
    rows: rows.map((r, i) => [
      r.name,
      r.location,
      r.acquired,
      dollars(properties[i].cost),
      dollars(properties[i].improvements),
      dollars(r.capitalWorks),
      dollars(r.costBase),
      dollars(r.valuation),
      dollars(r.unrealised),
      r.discountApplies ? "Yes" : "No",
    ]),
  };
}

function unitsCsv(fund: AuFund, rows: readonly UnitCostBaseRow[], unitPrice: number): CsvModel {
  return {
    fileName: `${slug(fund.name)}-unit-cost-base.csv`,
    columns: [
      "Holder",
      "Tax status",
      "Units",
      "Opening cost base",
      "Adjustment",
      "Closing cost base",
      "Cost per unit",
      "Unit price",
      "Market value",
      "Unrealised gain",
      "CGT event E10 gain",
    ],
    rows: rows.map((r) => [
      r.holder,
      r.statusLabel,
      r.units,
      dollars(r.opening),
      dollars(r.adjustment),
      dollars(r.closing),
      Number(perUnit(r.perUnit, 6)),
      Number(perUnit(unitPrice, 3)),
      dollars(r.marketValue),
      dollars(r.unrealised),
      dollars(Math.max(0, -(r.opening + r.adjustment))),
    ]),
  };
}

export function costBaseView(data: AppData, fundIn: Fund, calc: FundCalc, investor: DeferredTaxInvestor = "foreign-eoi"): CostBaseView {
  const fund = asAuFund(fundIn);
  const properties = propertiesOf(data, fund.id);
  const rows = propertyRows(properties, fund.periodEnd);
  const propertyTotals = {
    costBase: rows.reduce((s, r) => s + r.costBase, 0),
    valuation: rows.reduce((s, r) => s + r.valuation, 0),
    unrealised: rows.reduce((s, r) => s + r.unrealised, 0),
  };

  const rates = auRates(fund.periodEnd);
  const position = cgtPosition(rows);
  const discount = position.discountableAfterLosses - trustNetGain(fund.periodEnd, position.discountableAfterLosses);
  const cgtSummary = [
    { label: "Gains", amount: position.gains },
    { label: "Less: losses", amount: nz(-position.losses) },
    { label: "Gains held 12 months or more, after losses", amount: position.discountableAfterLosses },
    { label: "Other gains, after losses", amount: position.otherAfterLosses },
    { label: `Less: ${ratePct(rates.trustDiscountBps / 10000)} CGT discount at the trust`, amount: nz(-discount) },
    { label: "Net capital gain if sold at valuation", amount: position.otherAfterLosses + position.discountableAfterLosses - discount, emphasis: true },
  ];
  const deferred = deferredTax(position, fund.periodEnd, investor);

  const seed = data.unitCostBase[fund.id];
  const unitPrice = seed?.unitPrice ?? 0;
  const adjustments = new Map(aiirLines(calc).map((l) => [l.holderId, -l.costBaseNet]));
  const price10k = Math.round(unitPrice * 10_000);
  const unitRows: UnitCostBaseRow[] = calc.holders.map((line) => {
    const holder = line.holder;
    const opening = seed?.opening[holder.id] ?? 0;
    const adjustment = nz(adjustments.get(holder.id) ?? 0);
    const closing = Math.max(0, opening + adjustment);
    const marketValue = Math.round((holder.units * price10k) / 100);
    return {
      holderId: holder.id,
      holder: holder.holder,
      statusLabel: line.statusLabel,
      units: holder.units,
      opening,
      adjustment,
      closing,
      perUnit: holder.units > 0 ? closing / 100 / holder.units : 0,
      marketValue,
      unrealised: marketValue - closing,
    };
  });
  const unitTotals = {
    units: unitRows.reduce((s, r) => s + r.units, 0),
    opening: unitRows.reduce((s, r) => s + r.opening, 0),
    adjustment: unitRows.reduce((s, r) => s + r.adjustment, 0),
    closing: unitRows.reduce((s, r) => s + r.closing, 0),
    marketValue: unitRows.reduce((s, r) => s + r.marketValue, 0),
    unrealised: unitRows.reduce((s, r) => s + r.unrealised, 0),
  };

  const asAtLabel = `${fund.name} · valuations at ${dateLabel(fund.periodEnd)}`;
  const propertiesDoc: DocModel = {
    fileName: `${slug(fund.name)}-unrealised-cgt-properties.pdf`,
    title: "Unrealised CGT on properties",
    subtitle: asAtLabel,
    blocks: [
      {
        kind: "table",
        title: "Tax cost base, valuation and unrealised gain for each property",
        columns: [
          { key: "property", label: "Property" },
          { key: "acquired", label: "Acquired" },
          { key: "costBase", label: "Tax cost base", align: "right" },
          { key: "valuation", label: "Valuation", align: "right" },
          { key: "unrealised", label: "Unrealised gain", align: "right" },
        ],
        rows: rows.map((r) => ({
          property: `${r.name} — ${r.location}`,
          acquired: `${dateLabel(r.acquired)} · ${r.heldLabel}`,
          costBase: `${aud(r.costBase, 0)} after ${aud(r.capitalWorks, 0)} capital works`,
          valuation: aud(r.valuation, 0),
          unrealised: aud(r.unrealised, 0),
        })),
        totalRow: {
          property: "Total",
          acquired: "",
          costBase: aud(propertyTotals.costBase, 0),
          valuation: aud(propertyTotals.valuation, 0),
          unrealised: aud(propertyTotals.unrealised, 0),
        },
      },
      { kind: "kv", title: "If every property were sold at its valuation", rows: cgtSummary.map((r) => ({ label: r.label, value: aud(r.amount, 0), emphasis: r.emphasis })) },
      { kind: "kv", title: "Deferred tax by investor type", rows: deferred.investors.map((i) => ({ label: i.label, value: aud(i.amount, 0) })) },
      { kind: "paragraph", text: deferred.note, tone: "muted" },
    ],
  };

  return {
    market: "AU",
    asAtLabel,
    properties: rows,
    propertyTotals,
    cgtSummary,
    deferredTax: deferred,
    unitPriceLabel: `A$${perUnit(unitPrice, 3)} · ${seed?.priceBasis ?? "market price"}`,
    adjustmentLabel: "AMIT cost base net amount",
    unitRows,
    unitTotals,
    footnote: "An excess decreases the cost base and a shortfall increases it. Decreases beyond the cost base are a capital gain under CGT event E10.",
    propertiesCsv: propertiesCsv(fund, properties, rows),
    unitsCsv: unitsCsv(fund, unitRows, unitPrice),
    propertiesDoc,
  };
}
