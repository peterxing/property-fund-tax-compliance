// Builds the Sankey model (components -> destinations) from a computed set of component lines. Pure and market independent.
import type { ComponentLine, Currency, DestinationDef, SankeyLink, SankeyModel, SankeyNode } from "../types.ts";
import { moneyCompact, pct } from "../format.ts";

export function buildSankey(args: { components: ComponentLine[]; destinations: DestinationDef[]; currency: Currency }): SankeyModel {
  const { components, destinations, currency } = args;
  const valueOf = (c: ComponentLine, key: DestinationDef["key"]): number =>
    key === "gross" ? c.toGross : key === "net" ? c.toNet : key === "withheld" ? c.withheld : c.unallocated;

  const sources: SankeyNode[] = components
    .filter((c) => c.amount > 0)
    .map((c) => ({ key: c.key, label: c.short, valueLabel: moneyCompact(c.amount, currency), value: c.amount }));
  const sourceKeys = new Set(sources.map((s) => s.key));

  const totals = destinations.map((d) => ({ d, total: components.reduce((sum, c) => sum + valueOf(c, d.key), 0) })).filter((x) => x.total > 0);
  const grand = totals.reduce((sum, x) => sum + x.total, 0);
  const targets: SankeyNode[] = totals.map(({ d, total }) => ({
    key: d.key,
    label: d.label,
    valueLabel: `${moneyCompact(total, currency)} · ${pct(grand > 0 ? (total / grand) * 100 : 0)}`,
    value: total,
  }));

  const links: SankeyLink[] = [];
  for (const c of components) {
    if (!sourceKeys.has(c.key)) continue;
    for (const { d } of totals) {
      const value = valueOf(c, d.key);
      if (value > 0) links.push({ source: c.key, target: d.key, value });
    }
  }
  const targetKinds: SankeyModel["targetKinds"] = {};
  for (const { d } of totals) targetKinds[d.key] = d.key;
  return { sources, targets, links, targetKinds };
}