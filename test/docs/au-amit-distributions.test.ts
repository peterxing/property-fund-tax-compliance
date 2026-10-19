import assert from "node:assert/strict";
import { test } from "node:test";
import { seedData } from "../../src/domain/seed/index.ts";
import { fundCalc } from "../../src/domain/selectors.ts";
import { tbView } from "../../src/domain/au/tb.ts";
import { costBaseView } from "../../src/domain/au/costBase.ts";
import { investorView } from "../../src/domain/au/investor.ts";
import { returnView } from "../../src/domain/au/returns.ts";
import { deadlines } from "../../src/domain/au/deadlines.ts";
import { scenario } from "../../src/domain/au/analytics.ts";
import { auRates, buildToRentRates } from "../../src/domain/au/rates.ts";
import { computeMitWithholding } from "../../src/engine/au/mitWithholding.ts";
import { computeAmitCostBaseNetAmount } from "../../src/engine/au/amit.ts";
import { determineMemberWithholding } from "../../src/engine/au/members.ts";
import { calculatorById, defaultValues } from "../../src/app/workspaces/calculators/model.ts";
import type { AppData, AuFund, AuInputs, TbRow } from "../../src/domain/types.ts";
import { money, ratePct } from "../../src/domain/format.ts";
import { assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const DOC = "au-amit-distributions";
const NOW = new Date("2026-10-12T09:00:00+11:00");
const aud = (cents: number, decimals: 0 | 2 = 2): string => money(cents, "AUD", decimals);
const pct = (bps: number): string => ratePct(bps / 10_000);

function auFund(data: AppData, id: string): AuFund {
  const fund = data.funds.find((row): row is AuFund => row.id === id && row.market === "AU");
  assert.ok(fund, id);
  return fund;
}

function rateFor(memberClass: "FOREIGN_COMPANY_EOI" | "FOREIGN_COMPANY_NON_EOI", date: string, bucket: { ordinaryFundPayment: number }): number {
  const result = computeMitWithholding({
    paymentDate: date,
    incomeYearEnd: "2026-06-30",
    trustRegime: "AMIT",
    withholdingMit: true,
    member: { memberClass },
    paymentAmount: 10_000,
    fundPaymentBreakdown: bucket,
  });
  assert.equal(result.memberOutcome.scenario, "MIT_FUND_PAYMENT_WITHHOLDING");
  return result.rateBps;
}

test("worked examples listed in the document are all recomputed here", () => {
  assert.deepEqual(exampleIds(readRuleDoc(DOC)), ["AMIT-1", "AMIT-2", "MITW-1", "MITW-2", "CB-1"]);
});

test("AMIT-1 Harbourline full walk-through quotes the seeded calculation", () => {
  const data = seedData();
  const fund = auFund(data, "harbourline");
  const calc = fundCalc(data, fund.id, NOW);
  const tb = tbView(data, fund, NOW);
  const investor = investorView(data, fund, calc, { now: NOW, user: data.users[0]! });
  const returns = returnView(data, fund, calc, { now: NOW, user: data.users[0]! });
  const cost = costBaseView(data, fund, calc, "foreign-eoi");
  const sakuragawa = calc.holders.find((line) => line.holder.id === "h-hl-3")!;
  const scen = scenario(data, fund, calc);

  assertExampleQuotes(DOC, "AMIT-1", [
    `Net profit per accounts ${aud(tb.bookToTax.rows[0]!.amount)}`,
    `Net income attributed to members ${aud(calc.au!.attributed)}`,
    `cash distribution ${aud(calc.cash)}`,
    `AMIT CGT gross-up amount ${aud(calc.au!.cgtConcession)}`,
    `AMIT cost base net amount ${aud(calc.au!.costBaseNet)}`,
    `Fund payment ${aud(calc.au!.fundPayment)}`,
    `Character total ${aud(calc.characterTotal)}`,
    `withheld ${aud(calc.withheld)}`,
    `Sakuragawa Life Assurance holds ${sakuragawa.holder.units.toLocaleString("en-AU")} units`,
    `cash ${aud(sakuragawa.cash)}`,
    `withheld ${aud(sakuragawa.withheld)}`,
    `net ${aud(sakuragawa.net)}`,
    `Fund payment withholding at 15% ${aud(sakuragawa.withholdingParts[0]!.amount)}`,
    `Clean building fund payment at 10% ${aud(sakuragawa.withholdingParts[1]!.amount)}`,
    `Interest withholding at 10% ${aud(sakuragawa.withholdingParts[2]!.amount)}`,
    `AIIR due ${investor.aiir.aiirDue}`,
    `withholding report due ${investor.aiir.withholdingReportDue}`,
    `Assessable income other than capital gains ${returns.papers.blocks[2]!.kind === "kv" ? returns.papers.blocks[2]!.rows.find((row) => row.label === "Assessable income other than capital gains")!.value : ""}`,
    `Per unit (cents) ${scen.rows[2]!.now}`,
    `deferred tax for a foreign EOI investor ${aud(cost.deferredTax!.investors[0]!.amount)}`,
  ]);
});

test("AMIT-2 expense allocation and absorption quotes the constructed case", () => {
  const data = seedData();
  const fund = auFund(data, "coastline");
  fund.expenseAllocation = { method: "other-income" };
  data.taxAdjustments[fund.id] = { div40: 0, div43: 0, tarpDiscountGross: 0, tarpOther: 50_000_000 };
  const rows: TbRow[] = [
    { id: "doc-rent", fundId: fund.id, account: "4000", name: "Other rent", category: "rent", current: -100_000_000, prior: 0 },
    { id: "doc-ncmi", fundId: fund.id, account: "4010", name: "NCMI rent", category: "ncmi-rent", current: -50_000_000, prior: 0 },
    { id: "doc-clean", fundId: fund.id, account: "4020", name: "Clean rent", category: "clean-building", current: -50_000_000, prior: 0 },
    { id: "doc-interest", fundId: fund.id, account: "4300", name: "Interest", category: "interest-income", current: -10_000_000, prior: 0 },
    { id: "doc-expense", fundId: fund.id, account: "5200", name: "Deductible expenses", category: "deductible-expense", current: 230_000_000, prior: 0 },
  ];
  data.tbRows = [...data.tbRows.filter((row) => row.fundId !== fund.id), ...rows];
  const tb = tbView(data, fund, NOW);
  const derived = tb.derivedInputs as AuInputs;
  assert.equal(derived.ausOtherIncome, 0);
  assert.equal(derived.ncmi, 0);
  assert.equal(derived.cleanBuilding, 0);
  assert.equal(derived.interest, 0);
  assert.equal(derived.otherGainTarp, 30_000_000);
  assert.equal(tb.bookToTax.extra, undefined);

  assertExampleQuotes(DOC, "AMIT-2", [
    `gross rent ${aud(200_000_000)}`,
    `interest ${aud(10_000_000)}`,
    `TARP other gain ${aud(50_000_000)}`,
    `deductions ${aud(230_000_000)}`,
    `Australian income — other ${aud(0)}`,
    `NCMI ${aud(0)}`,
    `clean building ${aud(0)}`,
    `interest ${aud(0)}`,
    `Other capital gains — TARP ${aud(30_000_000)}`,
    "no trust tax loss is shown",
  ]);
});

test("MITW-1 holder-status withholding examples quote engine results", () => {
  const eoi = computeMitWithholding({ paymentDate: "2026-08-31", incomeYearEnd: "2026-06-30", trustRegime: "AMIT", withholdingMit: true, member: { memberClass: "FOREIGN_COMPANY_EOI" }, paymentAmount: 100_000_000, fundPaymentBreakdown: { ordinaryFundPayment: 70_000_000, cleanBuildingFundPayment: 10_000_000, ncmiFundPayment: 20_000_000 } });
  const non = computeMitWithholding({ paymentDate: "2026-08-31", incomeYearEnd: "2026-06-30", trustRegime: "AMIT", withholdingMit: true, member: { memberClass: "FOREIGN_COMPANY_NON_EOI" }, paymentAmount: 100_000_000, fundPaymentBreakdown: { ordinaryFundPayment: 70_000_000, cleanBuildingFundPayment: 10_000_000, ncmiFundPayment: 20_000_000 } });
  const resident = computeMitWithholding({ paymentDate: "2026-08-31", incomeYearEnd: "2026-06-30", trustRegime: "AMIT", withholdingMit: true, member: { memberClass: "RESIDENT_COMPANY", quotedTfn: true }, paymentAmount: 100_000_000, fundPaymentBreakdown: { ordinaryFundPayment: 70_000_000, cleanBuildingFundPayment: 10_000_000, ncmiFundPayment: 20_000_000 } });
  const noTfn = determineMemberWithholding({ trustRegime: "AMIT", paymentDate: "2026-10-10", member: { memberClass: "RESIDENT_INDIVIDUAL" }, actualCashPayment: 12_345, tfnWithholdingBase: 12_345 });

  assertExampleQuotes(DOC, "MITW-1", [
    `${aud(eoi.breakdown.ordinaryFundPayment)} × 15% = ${aud(10_500_000)}`,
    `${aud(eoi.breakdown.cleanBuildingFundPayment)} × 10% = ${aud(1_000_000)}`,
    `${aud(eoi.breakdown.ncmiFundPayment)} × 30% = ${aud(6_000_000)}`,
    `EOI total ${aud(eoi.withholdingAmount)}`,
    `non-EOI total ${aud(non.withholdingAmount)}`,
    `resident total ${aud(resident.withholdingAmount)}`,
    `resident requiresNotice ${String(resident.requiresNotice)}`,
    `TFN/ABN no-quote example ${aud(noTfn.withholdingAmount)}`,
  ]);
});

test("CB-1 AMIT cost base net amount quotes the official example reproduced by the engine", () => {
  const result = computeAmitCostBaseNetAmount({
    assessableAttributed: 71_200,
    naneAttributed: 2_500,
    taxOffsets: 14_900,
    cashPaymentsOrEntitlements: 61_300,
    startingCostBase: 2_000,
  });
  assertExampleQuotes(DOC, "CB-1", [
    `increase amount ${aud(result.increaseAmount)}`,
    `reduction amount ${aud(result.reductionAmount)}`,
    `excess decrease ${aud(result.excessDecrease)}`,
    `shortfall increase ${aud(result.shortfallIncrease)}`,
    `closing cost base ${aud(result.closingCostBase ?? 0)}`,
    `CGT event E10 gain ${aud(result.cgtEventE10Gain)}`,
  ]);
});

test("MITW-2 calculator example quotes the live calculator model", () => {
  const definition = calculatorById("au-mit-withholding");
  const result = definition.compute(defaultValues(definition));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assertExampleQuotes(DOC, "MITW-2", [
    `summary ${result.summary}`,
    `Total fund payment ${result.lines.find((line) => line.label === "Total fund payment")!.value}`,
    `Withholding amount ${result.lines.find((line) => line.label === "Withholding amount")!.value}`,
    `Final tax ${result.lines.find((line) => line.label === "Final tax")!.value}`,
    `Requires notice ${result.lines.find((line) => line.label === "Requires notice")!.value}`,
  ]);
});

test("rate table quotes rates rendered from the engine and domain constants", () => {
  const rates = auRates("2026-06-30");
  const btr = buildToRentRates("2026-06-30")!;
  const rows = [
    tableRow(["Ordinary MIT fund payment — EOI", "from 1 Jul 2008", pct(rateFor("FOREIGN_COMPANY_EOI", "2008-07-01", { ordinaryFundPayment: 10_000 }))]),
    tableRow(["Ordinary MIT fund payment — EOI", "from 1 Jul 2009", pct(rateFor("FOREIGN_COMPANY_EOI", "2009-07-01", { ordinaryFundPayment: 10_000 }))]),
    tableRow(["Ordinary MIT fund payment — EOI", "from 1 Jul 2010", pct(rateFor("FOREIGN_COMPANY_EOI", "2010-07-01", { ordinaryFundPayment: 10_000 }))]),
    tableRow(["Ordinary MIT fund payment — EOI", "from 1 Jul 2012", pct(rates.ordinary.eoi)]),
    tableRow(["Ordinary MIT fund payment — non-EOI", "2008 onward", pct(rates.ordinary.nonEoi)]),
    tableRow(["Clean building MIT income — EOI", "from 1 Jul 2012", pct(rates.clean.eoi)]),
    tableRow(["Clean building MIT income — non-EOI", "from 1 Jul 2012", pct(rates.clean.nonEoi)]),
    tableRow(["NCMI", "from 1 Jul 2019", pct(rates.ncmi.eoi)]),
    tableRow(["Excluded from NCMI — transitional", "current app row", `${pct(rates.excluded.eoi)} EOI / ${pct(rates.excluded.nonEoi)} non-EOI`]),
    tableRow(["Build-to-rent fund payment", "from 1 Jan 2025", `${pct(btr.eoi)} EOI / ${pct(btr.nonEoi)} non-EOI`]),
    tableRow(["Interest paid to a foreign resident", "local domain constant", pct(rates.interest.eoi)]),
    tableRow(["Resident TFN/ABN no-quote", "from 1 Jul 2017", pct(determineMemberWithholding({ trustRegime: "AMIT", paymentDate: "2026-10-10", member: { memberClass: "RESIDENT_INDIVIDUAL" }, actualCashPayment: 10_000, tfnWithholdingBase: 10_000 }).rateBps)]),
    tableRow(["Trust CGT discount", "current", pct(rates.trustDiscountBps)]),
    tableRow(["Company deferred-tax rate", "2026", pct(rates.companyBps)]),
    tableRow(["Complying super deferred-tax rate", "domain constant", pct(rates.superBps)]),
  ];
  assertSectionQuotes(DOC, "AMIT effective rates and thresholds", rows);
});

test("deadline table quotes dates from the seeded Harbourline deadlines", () => {
  const data = seedData();
  const fund = auFund(data, "harbourline");
  const calc = fundCalc(data, fund.id, NOW);
  const rows = deadlines(data, fund, calc, NOW).map((row) => tableRow([row.obligation, row.date, row.status]));
  assertSectionQuotes(DOC, "AMIT deadlines shown by the app", rows);
});
