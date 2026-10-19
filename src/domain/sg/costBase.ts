// Cost base & CGT workspace for a Singapore fund. Singapore has no capital gains tax, so the property table is a valuation view
// and the unit cost base only moves for returns of capital (never below nil: the excess is reported separately).
import { addMonths, isOnOrAfter } from "../../engine/dates.ts";
import { mulRatio } from "../../engine/money.ts";
import { dateLabel, money, slug } from "../format.ts";
import type { AppData, CostBaseView, Cents, DeferredTaxInvestor, DocModel, Fund, FundCalc, PropertyGainRow, UnitCostBaseRow } from "../types.ts";
import { requireSgFund, sumOf, toMajor } from "./util.ts";

const SG_NOTE =
  "Singapore doesn't tax capital gains. A gain on disposal is taxed at the trustee only if it's revenue in nature, and a distribution of a capital gain isn't taxable to unitholders.";
const FOOTNOTE =
  "Unit holders should reduce their cost of units by the amount of return of capital (ITA s35(15C)). For traders, the reduced cost is used for trading gains; if the return of capital exceeds the cost, the excess is taxable as trading income and the proceeds of all later sales of the remaining units are fully taxable.";

export function sgCostBaseView(data: AppData, fundIn: Fund, calc: FundCalc, _investor?: DeferredTaxInvestor): CostBaseView {
  const fund = requireSgFund(fundIn);

  const owned = data.properties.filter((p) => p.fundId === fund.id);
  const properties: PropertyGainRow[] = owned.map((p) => {
    const costBase = p.cost + p.improvements;
    return {
      id: p.id,
      name: p.name,
      location: p.location,
      acquired: p.acquired,
      heldLabel: "",
      discountApplies: false,
      costBase,
      capitalWorks: 0,
      valuation: p.valuation,
      unrealised: p.valuation - costBase,
    };
  });
  const propertyTotals = {
    costBase: sumOf(properties.map((p) => p.costBase)),
    valuation: sumOf(properties.map((p) => p.valuation)),
    unrealised: sumOf(properties.map((p) => p.unrealised)),
  };
  const tbInvestmentProperties = data.tbRows.filter((r) => r.fundId === fund.id && r.category === "balance-sheet" && /investment propert/i.test(r.name)).reduce((total, r) => total + r.current, 0);
  const valuationNote =
    Math.abs(propertyTotals.valuation - tbInvestmentProperties) >= 50
      ? `Valuations total ${money(propertyTotals.valuation, "SGD", 2)}; investment properties in the trial balance are ${money(tbInvestmentProperties, "SGD", 2)}.`
      : undefined;

  const seed = data.unitCostBase[fund.id] ?? { unitPrice: 0, priceBasis: "market price" as const, opening: {} };
  // Price in millionths so units x price stays exact integer arithmetic.
  const priceMicros = Math.round(seed.unitPrice * 1_000_000);
  // Capital returned above a holder's cost isn't a negative cost: the closing cost base stops at nil and the rest is the excess.
  const excess: Cents[] = [];
  const unitRows: UnitCostBaseRow[] = calc.holders.map((h) => {
    const returned = h.lines.find((l) => l.key === "capitalDistribution")?.amount ?? 0;
    const opening = seed.opening[h.holder.id] ?? 0;
    const adjustment = returned === 0 ? 0 : -returned;
    const rawClosing = opening + adjustment;
    const closing = Math.max(0, rawClosing);
    const excessOverCostBase = Math.max(0, -rawClosing);
    excess.push(excessOverCostBase);
    const marketValue = mulRatio(h.holder.units, priceMicros, 10_000);
    return {
      holderId: h.holder.id,
      holder: h.holder.holder,
      statusLabel: h.statusLabel,
      units: h.holder.units,
      opening,
      adjustment,
      closing,
      perUnit: h.holder.units > 0 ? closing / 100 / h.holder.units : 0,
      marketValue,
      unrealised: marketValue - closing,
      excessOverCostBase,
    };
  });
  const aboveCost = unitRows.flatMap((r, i) => (excess[i] >= 1 ? [`${r.holder} ${money(excess[i], "SGD", 2)}`] : []));
  const footnote = aboveCost.length === 0 ? FOOTNOTE : `${FOOTNOTE} Cost can't fall below nil, so the closing cost base is nil. Excess over cost base: ${aboveCost.join("; ")}.`;
  const unitTotals = {
    units: sumOf(unitRows.map((r) => r.units)),
    opening: sumOf(unitRows.map((r) => r.opening)),
    adjustment: sumOf(unitRows.map((r) => r.adjustment)),
    closing: sumOf(unitRows.map((r) => r.closing)),
    marketValue: sumOf(unitRows.map((r) => r.marketValue)),
    unrealised: sumOf(unitRows.map((r) => r.unrealised)),
  };

  const asAtLabel = `${fund.name} · valuations at ${dateLabel(fund.periodEnd)}`;
  const base = slug(fund.name);
  const m0 = (c: Cents) => money(c, "SGD", 0);

  const propertiesDoc: DocModel = {
    fileName: `${base}-unrealised-gains.pdf`,
    title: "Unrealised gains on properties",
    subtitle: asAtLabel,
    blocks: [
      {
        kind: "table",
        title: "Tax cost base, valuation and unrealised gain for each property",
        columns: [
          { key: "property", label: "Property" },
          { key: "location", label: "Location" },
          { key: "acquired", label: "Acquired" },
          { key: "cost", label: "Cost", align: "right" },
          { key: "valuation", label: "Valuation", align: "right" },
          { key: "unrealised", label: "Unrealised gain", align: "right" },
        ],
        rows: properties.map((p) => ({
          property: p.name,
          location: p.location,
          acquired: dateLabel(p.acquired),
          cost: m0(p.costBase),
          valuation: m0(p.valuation),
          unrealised: m0(p.unrealised),
        })),
        totalRow: { property: "Total", location: "", acquired: "", cost: m0(propertyTotals.costBase), valuation: m0(propertyTotals.valuation), unrealised: m0(propertyTotals.unrealised) },
      },
      { kind: "paragraph", text: SG_NOTE, tone: "muted" },
    ],
  };

  return {
    market: "SG",
    asAtLabel,
    properties,
    propertyTotals,
    sgNote: SG_NOTE,
    ...(valuationNote === undefined ? {} : { sgValuationNote: valuationNote }),
    unitPriceLabel: `S$${seed.unitPrice.toFixed(3)} · ${seed.priceBasis}`,
    adjustmentLabel: "Return of capital reduces the cost of units",
    unitRows,
    unitTotals,
    footnote,
    propertiesCsv: {
      fileName: `${base}-unrealised-gains.csv`,
      columns: ["Property", "Location", "Acquired", "Cost", "Improvements", "Capital works claimed", "Tax cost base", "Valuation", "Unrealised gain", "Held 12 months"],
      rows: owned.map((p, i) => [
        p.name,
        p.location,
        p.acquired,
        toMajor(p.cost),
        toMajor(p.improvements),
        toMajor(p.capitalWorksClaimed),
        toMajor(properties[i].costBase),
        toMajor(p.valuation),
        toMajor(properties[i].unrealised),
        isOnOrAfter(fund.periodEnd, addMonths(p.acquired, 12)) ? "Yes" : "No",
      ]),
    },
    unitsCsv: {
      fileName: `${base}-unit-cost-base.csv`,
      columns: ["Holder", "Units", "Opening cost base", "Adjustment", "Closing cost base", "Cost per unit", "Unit price", "Market value", "Unrealised gain", "Excess over cost base"],
      rows: unitRows.map((r, i) => [
        r.holder,
        r.units,
        toMajor(r.opening),
        toMajor(r.adjustment),
        toMajor(r.closing),
        r.perUnit.toFixed(6),
        seed.unitPrice.toFixed(3),
        toMajor(r.marketValue),
        toMajor(r.unrealised),
        toMajor(excess[i]),
      ]),
    },
    propertiesDoc,
  };
}
