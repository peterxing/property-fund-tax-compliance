// The Australian distribution: every tax character split across the register, withholding by holder, the checks and the chart model.
import type { AppData, AuFund, ComponentLine, DestinationDef, Fund, FundCalc, HolderLine, HolderLineDetail, ISODate, WithholdingRecon } from "../types.ts";
import { ammaDueDate } from "../../engine/au/amit.ts";
import { centsPerUnit, moneyCompact } from "../format.ts";
import { buildSankey } from "../shared/sankey.ts";
import { COMPONENT_DEFS, deriveAmounts, treatmentFor } from "./components.ts";
import { buildChecks } from "./checks.ts";
import { auRates } from "./rates.ts";
import { aud, asAuFund, holdersOf, nz } from "./util.ts";
import { allocate, partLabel, regionOf } from "./withholding.ts";
import type { HolderRegion } from "./components.ts";

const DESTINATIONS: DestinationDef[] = [
  { key: "gross", label: "Australian residents" },
  { key: "net", label: "Foreign investors, net" },
  { key: "withheld", label: "Withheld for the ATO" },
  { key: "unallocated", label: "Units not on register" },
];

export const REGION_LABEL: Record<HolderRegion, string> = {
  resident: "Australian resident",
  "foreign-eoi": "Foreign resident — EOI country",
  "foreign-non-eoi": "Foreign resident — non-EOI",
};

/** AMMA statements are due three months after the income year; the engine finishes a month-end year on a month-end (30 Sep -> 31 Dec). */
export function ammaDue(periodEnd: ISODate): ISODate {
  return ammaDueDate(periodEnd);
}

export function reconcile(fund: AuFund, computed: number): WithholdingRecon {
  const remitted = fund.whtRemitted;
  if (remitted === null) return { computed, remitted: null, variance: null, status: "not-remitted" };
  const variance = computed - remitted;
  return { computed, remitted, variance, status: variance === 0 ? "reconciled" : variance > 0 ? "under-remitted" : "over-remitted" };
}

function narrative(calc: Pick<FundCalc, "characterTotal" | "withheld" | "components" | "cash">, shortfall: boolean, unallocated: number): string {
  const toGross = calc.components.reduce((sum, c) => sum + c.toGross, 0);
  const toNet = calc.components.reduce((sum, c) => sum + c.toNet, 0);
  const money = (c: number): string => moneyCompact(c, "AUD");
  let text = `${money(calc.characterTotal)} by tax character: ${money(toGross)} to Australian residents and ${money(toNet)} to foreign investors after ${money(calc.withheld)} withheld for the ATO`;
  text += unallocated > 0 ? `; ${money(unallocated)} sits on units missing from the register.` : ".";
  if (shortfall) text += ` Attributed amounts exceed the ${aud(calc.cash, 0)} cash distribution, so members' cost base increases.`;
  return text;
}

export function fundCalc(data: AppData, fundIn: Fund, now: Date): FundCalc {
  const fund = asAuFund(fundIn);
  const holders = holdersOf(data, fund.id);
  const rates = auRates(fund.periodEnd);
  const amounts = deriveAmounts(fund.inputs);
  const alloc = allocate(fund, holders, amounts, rates);

  const components: ComponentLine[] = COMPONENT_DEFS.map((def) => {
    let toGross = 0;
    let toNet = 0;
    let withheld = 0;
    holders.forEach((holder, i) => {
      const cell = alloc.cells[def.key][i];
      if (regionOf(holder) === "resident") toGross += cell.amount;
      else {
        toNet += cell.amount - cell.withheld;
        withheld += cell.withheld;
      }
    });
    const amount = amounts.components[def.key];
    return {
      key: def.key,
      label: def.label,
      short: def.short,
      treatment: treatmentFor(def.key, rates),
      amount,
      centsPerUnit: centsPerUnit(amount, fund.unitsOnIssue),
      toGross,
      toNet,
      withheld,
      unallocated: alloc.unallocated[def.key],
      attributed: def.attributed,
    };
  });

  const holderLines: HolderLine[] = holders.map((holder, i) => {
    const region = regionOf(holder);
    const lines: HolderLineDetail[] = COMPONENT_DEFS.map((def) => {
      const cell = alloc.cells[def.key][i];
      return { key: def.key, label: def.label, amount: cell.amount, rate: cell.bps / 10000, withheld: cell.withheld };
    });
    const parts = new Map<string, { short: string; amount: number }>();
    COMPONENT_DEFS.forEach((def, k) => {
      const line = lines[k];
      if (line.withheld <= 0) return;
      const { label, short } = partLabel(def.key, region, alloc.cells[def.key][i].bps);
      const prior = parts.get(label);
      parts.set(label, { short, amount: (prior?.amount ?? 0) + line.withheld });
    });
    const withheld = lines.reduce((sum, l) => sum + l.withheld, 0);
    const cash = alloc.cash[i];
    return {
      holder,
      share: alloc.denominator > 0 ? holder.units / alloc.denominator : 0,
      cash,
      withheld,
      net: cash - withheld,
      group: region === "resident" ? "gross" : "net",
      statusLabel: REGION_LABEL[region],
      rateSummary: parts.size > 0 ? [...parts.values()].map((p) => p.short).join(" · ") : "No withholding",
      withholdingParts: [...parts.entries()].map(([label, p]) => ({ label, amount: p.amount })),
      lines,
    };
  });

  const withheld = components.reduce((sum, c) => sum + c.withheld, 0);
  const recon = reconcile(fund, withheld);
  const due = ammaDue(fund.periodEnd);
  const unallocatedCents = components.reduce((sum, c) => sum + c.unallocated, 0);
  const nonEoiHolders = holders.filter((h) => h.auStatus === "foreign-non-eoi").length;

  const checks = buildChecks({
    data,
    fund,
    amounts,
    rates,
    registerUnits: alloc.registerUnits,
    nonEoiHolders,
    recon,
    ammaDue: due,
    now,
  });

  const base = {
    characterTotal: amounts.characterTotal,
    cash: amounts.cash,
    withheld,
    components,
  };

  return {
    fundId: fund.id,
    market: "AU",
    currency: "AUD",
    components,
    characterTotal: amounts.characterTotal,
    cash: amounts.cash,
    withheld,
    holders: holderLines,
    registerUnits: alloc.registerUnits,
    unallocatedUnits: alloc.unallocatedUnits,
    checks,
    exceptions: checks.filter((c) => c.severity === "exception").length,
    destinations: DESTINATIONS.map((d) => ({ ...d })),
    recon,
    narrative: narrative(base, amounts.costBaseNet < 0, unallocatedCents),
    sankey: buildSankey({ components, destinations: DESTINATIONS, currency: "AUD" }),
    au: {
      attributed: amounts.attributed,
      cgtConcession: amounts.cgtConcession,
      taxDeferred: amounts.taxDeferred,
      costBaseNet: nz(amounts.costBaseNet),
      fundPayment: amounts.fundPayment,
      ammaDue: due,
      foreignHolderCount: holders.filter((h) => h.auStatus !== "resident").length,
    },
  };
}
