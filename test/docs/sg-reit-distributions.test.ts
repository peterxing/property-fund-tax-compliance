import { test } from "node:test";
import assert from "node:assert/strict";
import { readRuleDoc, exampleIds, assertExampleQuotes, assertSectionQuotes, tableRow } from "./docText.ts";
import { seedData } from "../../src/domain/seed/index.ts";
import { sgModule } from "../../src/domain/sg/index.ts";
import { sgCostBaseView } from "../../src/domain/sg/costBase.ts";
import { sgInvestorView } from "../../src/domain/sg/investor.ts";
import { sgScenario } from "../../src/domain/sg/analytics.ts";
import { holderTreatment, concessionWindow, trusteePosition, withholdingOn } from "../../src/domain/sg/withholding.ts";
import { computeReitTax, reitFormUtDueDate, reitWithholdingDueDate } from "../../src/engine/reitTax.ts";
import { centsPerUnit, money, pct, perUnit, ratePct } from "../../src/domain/format.ts";
import type { Fund, SgFund } from "../../src/domain/types.ts";

const DOC = "sg-reit-distributions";
const NOW = new Date("2026-10-12T09:00:00Z");
const m2 = (cents: number): string => money(cents, "SGD", 2);
const m0 = (cents: number): string => money(cents, "SGD", 0);

function sgFund(id: string): SgFund {
  const fund = seedData().funds.find((candidate): candidate is SgFund => candidate.id === id && candidate.market === "SG");
  assert.ok(fund);
  return fund;
}

test("worked examples are fixed and quoted", () => {
  const doc = readRuleDoc(DOC);
  assert.deepEqual(exampleIds(doc), ["REIT-1", "REIT-2", "S45G-1", "ROC-1"]);

  const data = seedData();
  const telok = sgFund("telok-ayer");
  const telokCalc = sgModule.fundCalc(data, telok, NOW);
  const telokInvestor = sgInvestorView(data, telok, telokCalc, { now: NOW, user: data.users[0] });
  const telokComponents = Object.fromEntries(telokCalc.components.map((component) => [component.key, component]));
  const sakuragawa = telokCalc.holders.find((holder) => holder.holder.holder === "Sakuragawa Life Assurance");
  const nominee = telokCalc.holders.find((holder) => holder.holder.holder === "Nominee accounts without a declaration");
  assert.ok(sakuragawa);
  assert.ok(nominee);
  assertExampleQuotes(DOC, "REIT-1", [
    `${m2(telok.inputs.taxableSpecifiedIncome)} taxable specified income`,
    `${m2(telok.inputs.taxableDistributed)} taxable income distribution`,
    `${m2(telok.inputs.taxExemptDistribution)} tax-exempt income distribution`,
    `${m2(telok.inputs.capitalDistribution)} capital distribution`,
    `${perUnit(telokComponents.taxableDistributed.centsPerUnit, 6)} cents per unit`,
    `${perUnit(centsPerUnit(telokCalc.characterTotal, telok.unitsOnIssue), 6)} cents per unit`,
    `Sakuragawa Life Assurance receives ${m2(sakuragawa.lines[0].amount)} of taxable income`,
    `10% final tax is ${m2(sakuragawa.withheld)}`,
    `Nominee accounts without a declaration receive ${m2(nominee.lines[0].amount)} of taxable income`,
    `17% non-final tax is ${m2(nominee.withheld)}`,
    `Total s45G tax deducted is ${m2(telokInvestor.s45g.deducted)}`,
  ]);

  const amount = 100_000;
  const at2026 = "2026-11-27";
  const nrni = holderTreatment("nrni", at2026);
  const nrFund13oaPre = holderTreatment("nr-fund", "2024-12-31", "13OA");
  const nrFund13oaPost = holderTreatment("nr-fund", "2025-01-01", "13OA");
  assertExampleQuotes(DOC, "S45G-1", [
    `On ${m2(amount)} of taxable distribution paid on 27 Nov 2026`,
    `individuals: ${m2(withholdingOn(amount, holderTreatment("individual", at2026).rateBps))}`,
    `qualifying unitholders: ${m2(withholdingOn(amount, holderTreatment("qualifying", at2026).rateBps))}`,
    `qualifying non-resident non-individuals: ${m2(withholdingOn(amount, nrni.rateBps))} final`,
    `other unitholders: ${m2(withholdingOn(amount, holderTreatment("other", at2026).rateBps))} not final`,
    `a section 13OA qualifying non-resident fund is ${nrFund13oaPre.rateSummary} on 31 Dec 2024 (${m2(withholdingOn(amount, nrFund13oaPre.rateBps))})`,
    `${nrFund13oaPost.rateSummary} on 1 Jan 2025 (${m2(withholdingOn(amount, nrFund13oaPost.rateBps))})`,
  ]);

  const kallang = sgFund("kallang");
  const kallangCalc = sgModule.fundCalc(data, kallang, NOW);
  const position = trusteePosition("2026-11-30", kallang.inputs.taxableSpecifiedIncome, kallang.inputs.taxableDistributed);
  const engine = computeReitTax({ distributionDate: "2026-11-30", taxableSpecifiedIncome: kallang.inputs.taxableSpecifiedIncome, taxableSpecifiedIncomeDistributed: kallang.inputs.taxableDistributed });
  const scenario = sgScenario(data, kallang, kallangCalc, 85);
  assertExampleQuotes(DOC, "REIT-2", [
    `${m2(kallang.inputs.taxableSpecifiedIncome)} taxable specified income`,
    `${m2(position.requiredMinimum)} required minimum`,
    `${m2(kallang.inputs.taxableDistributed)} distributed`,
    `${pct((position.payoutRatio ?? 0) * 100, 1)} payout`,
    `${m2(position.retained)} retained`,
    `${ratePct(position.rate)} retained-only trustee tax is ${m2(position.trusteeTax)}`,
    `engine worst case is ${m2(engine.trusteeTax)}`,
    `the app still computes ${m2(kallangCalc.withheld)} of s45G withholding`,
    `Analytics scenario at 85% shows ${scenario.rows.map((row) => row.scenario).join(", ")}`,
  ]);

  const costBase = sgCostBaseView(data, telok, telokCalc);
  const individual = costBase.unitRows.find((row) => row.holder === "Individual unitholders (CDP, SRS & CPFIS)");
  if (!individual) throw new Error("Telok Ayer individual cost-base row not found");
  assertExampleQuotes(DOC, "ROC-1", [
    `capital distribution allocated to the individual register is ${m2(-individual.adjustment)}`,
    `opening cost base ${m2(individual.opening)}`,
    `adjustment ${m2(individual.adjustment)}`,
    `closing cost base ${m2(individual.closing)}`,
    `excess over cost base ${m2(individual.excessOverCostBase ?? 0)}`,
  ]);
});

test("rate and deadline tables follow the code", () => {
  const date = "2026-11-27";
  const nrni = concessionWindow("nrni");
  const nrFund = concessionWindow("nr-fund");
  const nrFund13oa = concessionWindow("nr-fund", "13OA");
  assert.ok(nrni);
  assert.ok(nrFund);
  assert.ok(nrFund13oa);
  assertSectionQuotes(DOC, "Singapore REIT withholding rates", [
    tableRow(["Holder class", "Declaration / condition", "Rate coded", "Effective window", "App wording"]),
    tableRow(["Individuals", "not through a partnership, trade or business", "0%", "all coded dates", holderTreatment("individual", date).rateSummary]),
    tableRow(["Qualifying unitholders", "valid Form A / Form B", "0%", "all coded dates", holderTreatment("qualifying", date).rateSummary]),
    tableRow(["Qualifying non-resident non-individuals", "valid Form A / Form B", ratePct(holderTreatment("nrni", date).rate), `${nrni.from} to ${nrni.to}`, holderTreatment("nrni", date).rateSummary]),
    tableRow(["Qualifying non-resident funds (13D/13U/13V)", "valid Form A / Form B", ratePct(holderTreatment("nr-fund", date).rate), `${nrFund.from} to ${nrFund.to}`, holderTreatment("nr-fund", date).rateSummary]),
    tableRow(["Qualifying non-resident funds (13OA)", "valid Form A / Form B", ratePct(holderTreatment("nr-fund", date, "13OA").rate), `${nrFund13oa.from} to ${nrFund13oa.to}`, holderTreatment("nr-fund", date, "13OA").rateSummary]),
    tableRow(["Other unitholders / missing declaration", "missing or unsupported status", ratePct(holderTreatment("other", date).rate), "all coded dates", holderTreatment("other", date).rateSummary]),
  ]);

  assertSectionQuotes(DOC, "Singapore REIT filing dates", [
    tableRow(["Obligation", "Code", "Date rule", "Example"]),
    tableRow(["Withholding tax (s45G)", "reitWithholdingDueDate", "15th day of the second month after payment", reitWithholdingDueDate(date)]),
    tableRow(["Form UT", "reitFormUtDueDate", "15 April of the year of assessment", reitFormUtDueDate(2027)]),
    tableRow(["Distribution tax notice", "sgDeadlines / notice record", "manager record date; not an IRAS statutory date in the code", "2026-11-06 for Telok Ayer"]),
  ]);
});

test("scope and caveats are quoted", () => {
  assertSectionQuotes(DOC, "Open decision: failed 90% test", [
    "the displayed primary trustee-tax number is the reference app's retained-only figure",
    "the engine's worst case taxes all taxable specified income at the trustee",
    "the s45G withholding shown by the app would fall away under that worst-case treatment",
    "See docs/parity/sg.md for the reference-app parity decision.",
  ]);
  assertSectionQuotes(DOC, "Evidence", [
    "test/domain/sg/calc.test.ts",
    "test/domain/sg/withholding.test.ts",
    "test/domain/sg/costbase.test.ts",
    "test/domain/sg/investor.test.ts",
    "test/domain/sg/statements.test.ts",
    "test/domain/sg/returns.test.ts",
    "test/domain/sg/deadlines.test.ts",
    "test/domain/sg/rules.test.ts",
    "test/domain/sg/analytics.test.ts",
    "test/engine/reitTax.test.ts",
    "test/engine/distribution.test.ts",
    "test/engine/independent-verification-gst-reit.test.ts",
    "test/verify/v3/v-app-domain.test.ts",
    "test/docs/sg-reit-distributions.test.ts",
  ]);
});
