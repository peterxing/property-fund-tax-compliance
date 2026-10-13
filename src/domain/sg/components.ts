// Distribution calculation for a Singapore fund: components, per-holder s45G withholding, destinations, checks and the Sankey model.
import type { AppData, ComponentLine, DestinationDef, Fund, FundCalc, HolderLine, HolderLineDetail, SgFund, SgHolder, SgNotice, WithholdingRecon } from "../types.ts";
import { centsPerUnit, moneyCompact } from "../format.ts";
import { reitFormUtDueDate } from "../../engine/reitTax.ts";
import { buildSankey } from "../shared/sankey.ts";
import { sgChecks } from "./checks.ts";
import { allocateAcrossRegister, paymentDateOf, requireSgFund, sgHolders, sgNoticeFor, sumOf } from "./util.ts";
import type { RegisterShares } from "./util.ts";
import { componentTreatmentText, holderTreatment, trusteePosition, withholdingOn } from "./withholding.ts";

export type SgComponentKey = "taxableDistributed" | "taxExemptDistribution" | "capitalDistribution";

export const SG_DESTINATIONS: DestinationDef[] = [
  { key: "gross", label: "Paid gross" },
  { key: "net", label: "Non-residents & others, net" },
  { key: "withheld", label: "Withheld for IRAS" },
  { key: "unallocated", label: "Units not on register" },
];

interface ComponentDef {
  key: SgComponentKey;
  label: string;
  short: string;
}

export const SG_COMPONENTS: ComponentDef[] = [
  { key: "taxableDistributed", label: "Taxable income distribution", short: "Taxable income" },
  { key: "taxExemptDistribution", label: "Tax-exempt income distribution", short: "Tax-exempt income" },
  { key: "capitalDistribution", label: "Capital distribution", short: "Capital" },
];

function treatmentOf(key: SgComponentKey, date: string): string {
  if (key === "taxableDistributed") return componentTreatmentText(date);
  if (key === "taxExemptDistribution") return "Not taxable · no withholding";
  return "Not taxable · reduces cost of units for traders";
}

export function componentAmounts(fund: SgFund): Record<SgComponentKey, number> {
  return {
    taxableDistributed: Math.round(fund.inputs.taxableDistributed),
    taxExemptDistribution: Math.round(fund.inputs.taxExemptDistribution),
    capitalDistribution: Math.round(fund.inputs.capitalDistribution),
  };
}

/** The distribution at the unit register: every holder's share of each component to the cent, with the missing units as a bucket. */
export function registerShares(fund: SgFund, holders: readonly SgHolder[]): Record<SgComponentKey, RegisterShares> {
  const units = holders.map((h) => h.units);
  const amounts = componentAmounts(fund);
  return {
    taxableDistributed: allocateAcrossRegister(amounts.taxableDistributed, units, fund.unitsOnIssue),
    taxExemptDistribution: allocateAcrossRegister(amounts.taxExemptDistribution, units, fund.unitsOnIssue),
    capitalDistribution: allocateAcrossRegister(amounts.capitalDistribution, units, fund.unitsOnIssue),
  };
}

export function buildHolderLines(fund: SgFund, holders: readonly SgHolder[], notice: SgNotice | null): HolderLine[] {
  const date = paymentDateOf(fund, notice);
  const shares = registerShares(fund, holders);
  const registerUnits = sumOf(holders.map((h) => h.units));
  const denominator = Math.max(fund.unitsOnIssue, registerUnits);
  return holders.map((holder, i) => {
    const t = holderTreatment(holder.sgClass, date);
    const taxable = shares.taxableDistributed.holders[i];
    const withheld = withholdingOn(taxable, t.rateBps);
    const lines: HolderLineDetail[] = SG_COMPONENTS.map((def) => {
      const isTaxable = def.key === "taxableDistributed";
      return { key: def.key, label: def.label, amount: shares[def.key].holders[i], rate: isTaxable ? t.rate : 0, withheld: isTaxable ? withheld : 0 };
    });
    const cash = sumOf(lines.map((l) => l.amount));
    return {
      holder,
      share: denominator > 0 ? holder.units / denominator : 0,
      cash,
      withheld,
      net: cash - withheld,
      group: t.group,
      statusLabel: t.statusLabel,
      rateSummary: t.rateSummary,
      withholdingParts: withheld > 0 && t.partLabel ? [{ label: t.partLabel, amount: withheld }] : [],
      lines,
    };
  });
}

export function sgFundCalc(data: AppData, fundIn: Fund, now: Date): FundCalc {
  const fund = requireSgFund(fundIn);
  const notice = sgNoticeFor(data, fund.id);
  const date = paymentDateOf(fund, notice);
  const holders = sgHolders(data, fund.id);
  const amounts = componentAmounts(fund);
  const shares = registerShares(fund, holders);
  const holderLines = buildHolderLines(fund, holders, notice);

  const components: ComponentLine[] = SG_COMPONENTS.map((def, idx) => {
    let toGross = 0;
    let toNet = 0;
    let withheld = 0;
    for (const h of holderLines) {
      const line = h.lines[idx];
      if (h.group === "gross") toGross += line.amount;
      else toNet += line.amount - line.withheld;
      withheld += line.withheld;
    }
    const amount = amounts[def.key];
    return {
      key: def.key,
      label: def.label,
      short: def.short,
      treatment: treatmentOf(def.key, date),
      amount,
      centsPerUnit: centsPerUnit(amount, fund.unitsOnIssue),
      toGross,
      toNet,
      withheld,
      unallocated: shares[def.key].unallocated,
      attributed: true,
    };
  });

  const characterTotal = sumOf(components.map((c) => c.amount));
  const cash = characterTotal;
  const withheld = sumOf(components.map((c) => c.withheld));
  const gross = sumOf(components.map((c) => c.toGross));
  const net = sumOf(components.map((c) => c.toNet));
  const unallocated = sumOf(components.map((c) => c.unallocated));
  const registerUnits = sumOf(holders.map((h) => h.units));
  const unallocatedUnits = Math.max(0, fund.unitsOnIssue - registerUnits);

  const remitted = fund.whtRemitted;
  const variance = remitted === null ? null : withheld - remitted;
  const recon: WithholdingRecon = {
    computed: withheld,
    remitted,
    variance,
    status: variance === null ? "not-remitted" : variance === 0 ? "reconciled" : variance > 0 ? "under-remitted" : "over-remitted",
  };

  const position = trusteePosition(date, fund.inputs.taxableSpecifiedIncome, amounts.taxableDistributed);
  const undeclaredHolders = holders.filter((h) => h.sgClass === "other").length;

  const checks = sgChecks({ fund, notice, now, registerUnits, withheld, undeclaredHolders, recon, position });

  let narrative = `${moneyCompact(characterTotal, "SGD")} distributed: ${moneyCompact(gross, "SGD")} paid gross and ${moneyCompact(net, "SGD")} to non-resident and other holders after ${moneyCompact(withheld, "SGD")} withheld for IRAS.`;
  if (unallocated > 0) narrative += ` ${moneyCompact(unallocated, "SGD")} is for units not on the register.`;

  return {
    fundId: fund.id,
    market: "SG",
    currency: "SGD",
    components,
    characterTotal,
    cash,
    withheld,
    holders: holderLines,
    registerUnits,
    unallocatedUnits,
    checks,
    exceptions: checks.filter((c) => c.severity === "exception").length,
    destinations: SG_DESTINATIONS.map((d) => ({ ...d })),
    recon,
    narrative,
    sankey: buildSankey({ components, destinations: SG_DESTINATIONS, currency: "SGD" }),
    sg: {
      payoutRatio: position.payoutRatio,
      retained: position.retained,
      trusteeTax: position.trusteeTax,
      formUtDue: reitFormUtDueDate(fund.assessmentYear),
      undeclaredHolders,
    },
  };
}
