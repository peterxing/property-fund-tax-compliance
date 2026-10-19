// Analytics for a Singapore fund: tax leakage, distribution mix and the payout scenario.
import { mulRatio } from "../../engine/money.ts";
import { money, pct, ratePct } from "../format.ts";
import type { AppData, Cents, Fund, FundCalc, LeakageRow, MixRow, ScenarioView } from "../types.ts";
import { allocateAcrossRegister, paymentDateOf, requireSgFund, sgClassOf, sgNoticeFor, sumOf } from "./util.ts";
import { holderTreatment, isFinalPart, transparencyThresholdPct, trusteePosition, withholdingOn } from "./withholding.ts";

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const m0 = (cents: Cents) => money(cents, "SGD", 0);

/** Final withholding is what the holder bears; withholding that isn't final is recoverable by the holder. */
export function sgLeakage(fundIn: Fund, calc: FundCalc): LeakageRow {
  const fund = requireSgFund(fundIn);
  let finalWithholding = 0;
  let recoverable = 0;
  for (const h of calc.holders) {
    for (const part of h.withholdingParts) {
      if (isFinalPart(part.label)) finalWithholding += part.amount;
      else recoverable += part.amount;
    }
  }
  const trusteeTax = calc.sg?.trusteeTax ?? 0;
  const distribution = calc.cash;
  const totalPct = distribution > 0 ? round1(((finalWithholding + recoverable + trusteeTax) / distribution) * 100) : 0;
  return { fundId: fund.id, fundName: fund.name, currency: fund.currency, distribution, finalWithholding, recoverable, trusteeTax, totalPct };
}

export function sgMix(fundIn: Fund, calc: FundCalc): MixRow {
  const fund = requireSgFund(fundIn);
  const amount = (key: string) => calc.components.find((c) => c.key === key)?.amount ?? 0;
  const total = sumOf(calc.components.map((c) => c.amount));
  const share = (cents: Cents) => (total > 0 ? round1((cents / total) * 100) : 0);
  return {
    fundId: fund.id,
    fundName: fund.name,
    taxable: share(amount("taxableDistributed")),
    capitalGains: 0,
    taxExempt: share(amount("taxExemptDistribution")),
    taxDeferredAndCapital: share(amount("capitalDistribution")),
  };
}

interface Outcome {
  taxable: Cents;
  retained: Cents;
  trusteeTax: Cents;
  withheld: Cents;
  meets: boolean;
}

/**
 * The taxable payout is a share of the taxable specified income. Withholding is re-worked holder by holder on the new taxable
 * distribution at today's unitholder mix, so the cents add up the way the distribution's own withholding does.
 */
export function sgScenario(data: AppData, fundIn: Fund, calc: FundCalc, value?: number): ScenarioView {
  const fund = requireSgFund(fundIn);
  const date = paymentDateOf(fund, sgNoticeFor(data, fund.id));
  const income = Math.round(fund.inputs.taxableSpecifiedIncome);
  const taxableNow = calc.components.find((c) => c.key === "taxableDistributed")?.amount ?? 0;
  const now = trusteePosition(date, income, taxableNow);
  const currentPct = income > 0 ? (taxableNow / income) * 100 : 100;
  const defaultValue = round2(currentPct);

  const requested = value !== undefined && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : defaultValue;
  const atNow = value === undefined || !Number.isFinite(value) || round2(requested) === defaultValue;
  const inputValue = atNow ? defaultValue : requested;

  const nowOutcome: Outcome = { taxable: taxableNow, retained: now.retained, trusteeTax: now.trusteeTax, withheld: calc.withheld, meets: now.passes };
  let scenarioOutcome = nowOutcome;
  if (!atNow) {
    const taxable = mulRatio(income, Math.round(requested * 10_000), 1_000_000);
    const position = trusteePosition(date, income, taxable);
    const parts = allocateAcrossRegister(taxable, calc.holders.map((h) => h.holder.units), fund.unitsOnIssue).holders;
    const withheld = sumOf(calc.holders.map((h, i) => withholdingOn(parts[i] ?? 0, holderTreatment(sgClassOf(h.holder), date, "sgFundSection" in h.holder ? h.holder.sgFundSection : undefined).rateBps)));
    scenarioOutcome = { taxable, retained: position.retained, trusteeTax: position.trusteeTax, withheld, meets: position.passes };
  }

  const yesNo = (b: boolean) => (b ? "Yes" : "No");
  const threshold = pct(transparencyThresholdPct(), 0);
  return {
    fundId: fund.id,
    currency: fund.currency,
    inputKind: "payout",
    inputLabel: "Taxable payout (% of taxable specified income)",
    inputValue,
    defaultValue,
    rows: [
      { measure: "Taxable distribution", now: m0(nowOutcome.taxable), scenario: m0(scenarioOutcome.taxable) },
      { measure: "Retained by the trust", now: m0(nowOutcome.retained), scenario: m0(scenarioOutcome.retained) },
      { measure: `Trustee tax at ${ratePct(now.rate)}`, now: m0(nowOutcome.trusteeTax), scenario: m0(scenarioOutcome.trusteeTax) },
      { measure: "Withholding on the distribution", now: m0(nowOutcome.withheld), scenario: m0(scenarioOutcome.withheld) },
      { measure: `Meets the ${threshold} condition`, now: yesNo(nowOutcome.meets), scenario: yesNo(scenarioOutcome.meets) },
    ],
    note: `The ${threshold} condition applies to the year as a whole; withholding scales with the taxable distribution at today's unitholder mix (${pct(currentPct, 1)} paid out now).`,
  };
}
