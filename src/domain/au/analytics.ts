// Analytics rows for one AMIT: tax leakage, distribution mix and the cash-distribution scenario.
import type { AppData, Cents, Fund, FundCalc, LeakageRow, MixRow, ScenarioView } from "../types.ts";
import { centsPerUnit, perUnit } from "../format.ts";
import { facts } from "./returns.ts";
import { aud, asAuFund } from "./util.ts";

const amountOf = (calc: FundCalc, key: string): Cents => calc.components.find((c) => c.key === key)?.amount ?? 0;

export function leakage(fundIn: Fund, calc: FundCalc): LeakageRow {
  const fund = asAuFund(fundIn);
  return {
    fundId: fund.id,
    fundName: fund.name,
    currency: "AUD",
    distribution: calc.cash,
    finalWithholding: calc.withheld,
    recoverable: 0,
    trusteeTax: 0,
    totalPct: calc.cash > 0 ? (calc.withheld / calc.cash) * 100 : 0,
  };
}

export function mix(fundIn: Fund, calc: FundCalc): MixRow {
  const fund = asAuFund(fundIn);
  const share = (cents: Cents): number => (calc.characterTotal > 0 ? (cents / calc.characterTotal) * 100 : 0);
  const taxable = ["ausOtherIncome", "ncmi", "excludedNcmi", "cleanBuilding", "interest", "foreignIncome"].reduce((s, k) => s + amountOf(calc, k), 0);
  const capitalGains = amountOf(calc, "discountGainTarp") + amountOf(calc, "cgtConcessionTarp") + amountOf(calc, "otherGainTarp");
  return {
    fundId: fund.id,
    fundName: fund.name,
    taxable: share(taxable),
    capitalGains: share(capitalGains),
    taxExempt: 0,
    taxDeferredAndCapital: share(amountOf(calc, "taxDeferred")),
  };
}

const costBaseText = (net: Cents): string => `${aud(Math.abs(net), 0)} ${net >= 0 ? "excess" : "shortfall"}`;

const MINUS = "\u2212";

/** Cents per unit to 4 dp. A shortfall is negative and takes the typographic minus; a value that rounds to zero takes no sign. */
function signedPerUnit(value: number): string {
  const text = perUnit(Math.abs(value), 4);
  return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text;
}

export function scenario(_data: AppData, fundIn: Fund, calc: FundCalc, value?: number): ScenarioView {
  const fund = asAuFund(fundIn);
  const f = facts(calc);
  const cash = value !== undefined && Number.isFinite(value) ? Math.max(0, Math.round(value)) : calc.cash;
  const costBaseNet = (c: Cents): Cents => c - f.attributed - f.cgtConcession;
  // The reference's "Per unit (cents)" is the AMIT cost base net amount per unit, not cash per unit, and it divides by the units on issue
  // (not the register): Harbourline reads 2.0467 in both columns (28,913,400 / 1,412,680,000 x 100). A shortfall is negative.
  const netPerUnit = (c: Cents): string => signedPerUnit(centsPerUnit(costBaseNet(c), fund.unitsOnIssue));

  return {
    fundId: fund.id,
    currency: "AUD",
    inputKind: "cash",
    inputLabel: "Cash distribution for the year",
    inputValue: cash,
    defaultValue: calc.cash,
    rows: [
      { measure: "Cash distribution", now: aud(calc.cash, 0), scenario: aud(cash, 0) },
      { measure: "AMIT cost base net amount", now: costBaseText(costBaseNet(calc.cash)), scenario: costBaseText(costBaseNet(cash)) },
      { measure: "Per unit (cents)", now: netPerUnit(calc.cash), scenario: netPerUnit(cash) },
      { measure: "Attributed to members", now: aud(f.attributed, 0), scenario: aud(f.attributed, 0) },
    ],
    note: "Attributed amounts and the fund payment don't change with cash. Paying less than the attributed amounts creates a shortfall that increases members' cost base.",
  };
}
