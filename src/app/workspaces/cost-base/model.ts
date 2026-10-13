// Pure view-model helpers for the Cost base & CGT workspace: the text and flags the tables render, kept free of React so the wording and
// the sign handling are unit-tested without a DOM.
import type { Cents, CostBaseView, Currency, DeferredTaxInvestor, ISODate, Market } from "../../../domain/types.ts";
import { dateLabel, integer, money, perUnit } from "../../../domain/format.ts";

type PropertyRef = CostBaseView["properties"][number];
type UnitRowRef = CostBaseView["unitRows"][number];
type CgtLineRef = NonNullable<CostBaseView["cgtSummary"]>[number];
type DeferredRef = NonNullable<CostBaseView["deferredTax"]>;

export const DEFAULT_INVESTOR: DeferredTaxInvestor = "foreign-eoi";
const INVESTOR_IDS: readonly DeferredTaxInvestor[] = ["foreign-eoi", "foreign-non-eoi", "complying-super", "company"];

/** The investor type in `?investor=`; anything unknown falls back to the default rather than an error. */
export function parseInvestor(param: string | null | undefined): DeferredTaxInvestor {
  return INVESTOR_IDS.find((id) => id === param) ?? DEFAULT_INVESTOR;
}

export const currencyOf = (market: Market): Currency => (market === "AU" ? "AUD" : "SGD");

/** An amount that can be a loss: the text carries the sign, and `loss` lets the cell also say "loss" in words. */
export interface GainCell {
  amount: string;
  loss: boolean;
}

export function gainCell(cents: Cents, currency: Currency): GainCell {
  return { amount: money(cents, currency), loss: cents < 0 && Math.round(Math.abs(cents) / 100) > 0 };
}

// ------------------------------------------------------------------------------------------------------------ properties
export interface PropertyRowModel {
  id: string;
  name: string;
  location: string;
  /** "18 Mar 2014" */
  acquired: string;
  /** "Held 12 months — discount applies"; empty for Singapore, which has no CGT discount. */
  held: string;
  costBase: string;
  /** "after A$81,170,778 capital works"; null for Singapore. */
  capitalWorks: string | null;
  valuation: string;
  unrealised: GainCell;
}

export interface PropertyTotalModel {
  costBase: string;
  valuation: string;
  unrealised: GainCell;
}

export interface PropertyTableModel {
  rows: PropertyRowModel[];
  total: PropertyTotalModel;
}

export function propertyTable(view: Pick<CostBaseView, "market" | "properties" | "propertyTotals">): PropertyTableModel {
  const currency = currencyOf(view.market);
  return {
    rows: view.properties.map((p: PropertyRef) => ({
      id: p.id,
      name: p.name,
      location: p.location,
      acquired: dateLabel(p.acquired),
      held: p.heldLabel,
      costBase: money(p.costBase, currency),
      capitalWorks: view.market === "AU" ? `after ${money(p.capitalWorks, currency)} capital works` : null,
      valuation: money(p.valuation, currency),
      unrealised: gainCell(p.unrealised, currency),
    })),
    total: {
      costBase: money(view.propertyTotals.costBase, currency),
      valuation: money(view.propertyTotals.valuation, currency),
      unrealised: gainCell(view.propertyTotals.unrealised, currency),
    },
  };
}

// ------------------------------------------------------------------------------------------------------------ CGT summary and deferred tax
export interface CgtLineModel {
  label: string;
  amount: string;
  emphasis: boolean;
}

export function cgtSummary(lines: readonly CgtLineRef[] | undefined, currency: Currency): CgtLineModel[] {
  return (lines ?? []).map((l) => ({ label: l.label, amount: money(l.amount, currency), emphasis: l.emphasis === true }));
}

export interface DeferredTaxModel {
  options: Array<{ value: DeferredTaxInvestor; label: string }>;
  selected: DeferredTaxInvestor;
  /** "Deferred tax — Foreign investor — EOI country" */
  heading: string;
  amount: string;
  note: string;
}

export function deferredTaxModel(deferred: DeferredRef, currency: Currency): DeferredTaxModel {
  const current = deferred.investors.find((i) => i.id === deferred.selected);
  return {
    options: deferred.investors.map((i) => ({ value: i.id, label: i.label })),
    selected: deferred.selected,
    heading: `Deferred tax — ${current?.label ?? ""}`,
    amount: money(current?.amount ?? 0, currency),
    note: deferred.note,
  };
}

// ------------------------------------------------------------------------------------------------------------ unit cost base
export interface UnitRowModel {
  id: string;
  holder: string;
  status: string;
  units: string;
  opening: string;
  adjustment: string;
  closing: string;
  /** Closing cost base per unit, 4 decimals and no currency symbol ("0.6563"). */
  perUnit: string;
  marketValue: string;
  unrealised: GainCell;
}

export interface UnitTotalModel {
  units: string;
  opening: string;
  adjustment: string;
  closing: string;
  marketValue: string;
  unrealised: GainCell;
}

export interface UnitTableModel {
  rows: UnitRowModel[];
  total: UnitTotalModel;
}

export function unitTable(view: Pick<CostBaseView, "market" | "unitRows" | "unitTotals">): UnitTableModel {
  const currency = currencyOf(view.market);
  return {
    rows: view.unitRows.map((r: UnitRowRef) => ({
      id: r.holderId,
      holder: r.holder,
      status: r.statusLabel,
      units: integer(r.units),
      opening: money(r.opening, currency),
      adjustment: money(r.adjustment, currency),
      closing: money(r.closing, currency),
      perUnit: perUnit(r.perUnit, 4),
      marketValue: money(r.marketValue, currency),
      unrealised: gainCell(r.unrealised, currency),
    })),
    total: {
      units: integer(view.unitTotals.units),
      opening: money(view.unitTotals.opening, currency),
      adjustment: money(view.unitTotals.adjustment, currency),
      closing: money(view.unitTotals.closing, currency),
      marketValue: money(view.unitTotals.marketValue, currency),
      unrealised: gainCell(view.unitTotals.unrealised, currency),
    },
  };
}

/** "Unit price at 30 Jun 2026" */
export function unitPriceHeading(periodEnd: ISODate): string {
  return `Unit price at ${dateLabel(periodEnd)}`;
}
