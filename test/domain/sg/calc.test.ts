// Distribution calculation for the four Singapore funds: golden values from the reference app's rendered screens (amounts in cents,
// the displayed S$ amount x 100), the arithmetic invariants of every calculation, the checks, and the unit-register edge cases.
import assert from "node:assert/strict";
import { test } from "node:test";
import { allocate, mulBps } from "../../../src/engine/money.ts";
import { computeReitTax } from "../../../src/engine/reitTax.ts";
import { money, ratePct } from "../../../src/domain/format.ts";
import { sgModule } from "../../../src/domain/sg/index.ts";
import { allocateAcrossRegister, allocateExact } from "../../../src/domain/sg/util.ts";
import type { AppData, FundCalc } from "../../../src/domain/types.ts";
import { calcFor, freshData, NOW, sgFund, SG_IDS } from "./helpers.ts";

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const withheldOf = (calc: FundCalc): Record<string, number> => Object.fromEntries(calc.holders.map((h) => [h.holder.id, h.withheld]));

// ------------------------------------------------------------------------------------------------ golden distributions
test("Loyang: components, per-holder cash and withholding match the reference to the cent", () => {
  const calc = calcFor(freshData(), "loyang");
  assert.deepEqual(
    calc.components.map((c) => [c.key, c.label, c.short, c.amount]),
    [
      ["taxableDistributed", "Taxable income distribution", "Taxable income", 6_981_610_000],
      ["taxExemptDistribution", "Tax-exempt income distribution", "Tax-exempt income", 0],
      ["capitalDistribution", "Capital distribution", "Capital", 430_200_000],
    ],
  );
  assert.deepEqual(
    calc.components.map((c) => c.centsPerUnit.toFixed(6)),
    ["2.431727", "0.000000", "0.149841"],
  );
  assert.equal(calc.characterTotal, 7_411_810_000);
  assert.equal(calc.cash, 7_411_810_000);
  assert.equal(calc.withheld, 279_264_400);
  assert.deepEqual(
    calc.holders.map((h) => [h.holder.id, h.cash, h.withheld, h.net, h.group]),
    [
      ["h-ly-1", 2_594_133_500, 0, 2_594_133_500, "gross"],
      ["h-ly-2", 1_852_952_500, 0, 1_852_952_500, "gross"],
      ["h-ly-3", 1_482_362_000, 139_632_200, 1_342_729_800, "net"],
      ["h-ly-4", 1_111_771_500, 104_724_150, 1_007_047_350, "net"],
      ["h-ly-5", 370_590_500, 34_908_050, 335_682_450, "net"],
    ],
  );
  assert.deepEqual(
    calc.holders.map((h) => [h.statusLabel, h.rateSummary]),
    [
      ["Individual", "Exempt · paid gross"],
      ["Qualifying unitholder", "Paid gross · taxed at own rate"],
      ["Qualifying non-resident non-individual", "10% final"],
      ["Qualifying non-resident fund", "10% final"],
      ["Qualifying non-resident non-individual", "10% final"],
    ],
  );
  assert.deepEqual(calc.holders[2].withholdingParts, [{ label: "Tax deducted at 10% (final)", amount: 139_632_200 }]);
  assert.deepEqual(calc.holders[0].withholdingParts, []);
  assert.deepEqual(calc.recon, { computed: 279_264_400, remitted: 279_264_400, variance: 0, status: "reconciled" });
  assert.equal(calc.sg?.retained, 142_480_000);
  assert.equal(calc.sg?.trusteeTax, 24_221_600);
  assert.equal(calc.sg?.formUtDue, "2027-04-15");
  assert.equal(calc.sg?.undeclaredHolders, 0);
  assert.ok(Math.abs((calc.sg?.payoutRatio ?? 0) - 0.98) < 1e-6);
  assert.equal(calc.checks.length, 0);
  assert.equal(calc.exceptions, 0);
  assert.equal(calc.registerUnits, 2_871_050_000);
  assert.equal(calc.unallocatedUnits, 0);
});

test("Telok Ayer: the nominee without a declaration is withheld at 17% and is not final", () => {
  const calc = calcFor(freshData(), "telok-ayer");
  assert.deepEqual(
    calc.components.map((c) => c.amount),
    [5_841_260_000, 311_840_000, 190_580_000],
  );
  assert.deepEqual(
    calc.components.map((c) => c.centsPerUnit.toFixed(6)),
    ["1.378898", "0.073613", "0.044989"],
  );
  assert.equal(calc.cash, 6_343_680_000);
  assert.equal(calc.withheld, 186_920_320);
  assert.deepEqual(withheldOf(calc), { "h-ta-1": 0, "h-ta-2": 0, "h-ta-3": 0, "h-ta-4": 87_618_900, "h-ta-5": 99_301_420 });
  const nominee = calc.holders[4];
  assert.equal(nominee.statusLabel, "Other unitholder");
  assert.equal(nominee.rateSummary, "17% · not final");
  assert.deepEqual(nominee.withholdingParts, [{ label: "Tax deducted at 17%", amount: 99_301_420 }]);
  assert.equal(calc.recon.status, "not-remitted");
  assert.equal(calc.recon.remitted, null);
  assert.equal(calc.recon.variance, null);
  assert.equal(calc.sg?.retained, 0);
  assert.equal(calc.sg?.trusteeTax, 0);
  assert.equal(calc.sg?.payoutRatio, 1);
  assert.equal(calc.sg?.undeclaredHolders, 1);
});

test("Meranti: withholding, trustee tax on the retained 3% and the checks", () => {
  const calc = calcFor(freshData(), "meranti");
  assert.equal(calc.cash, 2_827_710_000);
  assert.equal(calc.withheld, 152_956_080);
  assert.deepEqual(withheldOf(calc), { "h-mr-1": 0, "h-mr-2": 0, "h-mr-3": 67_086_000, "h-mr-4": 40_251_600, "h-mr-5": 45_618_480 });
  assert.equal(calc.sg?.retained, 82_990_000);
  assert.equal(calc.sg?.trusteeTax, 14_108_300);
  assert.ok(Math.abs((calc.sg?.payoutRatio ?? 0) - 0.97) < 1e-5);
});

test("Kallang: an 85% payout leaves S$6,286,000 taxed at the trustee, S$1,068,620", () => {
  const calc = calcFor(freshData(), "kallang");
  assert.equal(calc.cash, 3_562_050_000);
  assert.equal(calc.withheld, 83_708_175);
  assert.deepEqual(withheldOf(calc), { "h-kr-1": 0, "h-kr-2": 0, "h-kr-3": 0, "h-kr-4": 53_430_750, "h-kr-5": 30_277_425 });
  assert.equal(calc.sg?.retained, 628_600_000);
  assert.equal(calc.sg?.trusteeTax, 106_862_000);
  assert.ok(Math.abs((calc.sg?.payoutRatio ?? 0) - 0.85) < 1e-5);
});

test("narratives match the reference sentence for each fund", () => {
  const data = freshData();
  assert.equal(calcFor(data, "telok-ayer").narrative, "S$63.44m distributed: S$47.58m paid gross and S$13.99m to non-resident and other holders after S$1.87m withheld for IRAS.");
  assert.equal(calcFor(data, "loyang").narrative, "S$74.12m distributed: S$44.47m paid gross and S$26.85m to non-resident and other holders after S$2.79m withheld for IRAS.");
  assert.equal(calcFor(data, "meranti").narrative, "S$28.28m distributed: S$14.14m paid gross and S$12.61m to non-resident and other holders after S$1.53m withheld for IRAS.");
  assert.equal(calcFor(data, "kallang").narrative, "S$35.62m distributed: S$28.50m paid gross and S$6.29m to non-resident and other holders after S$837.1k withheld for IRAS.");
});

test("destinations and Sankey follow the reference wording", () => {
  const calc = calcFor(freshData(), "loyang");
  assert.deepEqual(
    calc.destinations.map((d) => [d.key, d.label]),
    [
      ["gross", "Paid gross"],
      ["net", "Non-residents & others, net"],
      ["withheld", "Withheld for IRAS"],
      ["unallocated", "Units not on register"],
    ],
  );
  assert.ok(calc.sankey.sources.length >= 2);
  assert.ok(calc.sankey.links.length > 0);
  assert.ok(calc.sankey.links.every((l) => l.value > 0));
  const targetLabels = calc.sankey.targets.map((t) => t.label);
  assert.ok(targetLabels.includes("Paid gross"));
  assert.ok(targetLabels.includes("Withheld for IRAS"));
});

test("the treatment text on each component comes from the engine rates", () => {
  const calc = calcFor(freshData(), "loyang");
  assert.equal(calc.components[0].treatment, "0% individuals & qualifying · 10% qualifying non-residents · 17% others");
  assert.equal(calc.components[1].treatment, "Not taxable · no withholding");
  assert.equal(calc.components[2].treatment, "Not taxable · reduces cost of units for traders");
});

// ------------------------------------------------------------------------------------------------ checks at 12 Oct 2026
test("checks per fund at 12 Oct 2026", () => {
  const data = freshData();
  const summary = (id: string) => calcFor(data, id).checks.map((c) => `${c.severity}:${c.id}`);
  assert.deepEqual(summary("loyang"), []);
  assert.deepEqual(summary("telok-ayer"), ["note:no-declaration", "note:sg-notice-due"]);
  assert.deepEqual(summary("meranti"), ["note:no-declaration", "note:sg-notice-due"]);
  assert.deepEqual(summary("kallang"), ["exception:payout", "note:no-declaration", "note:sg-notice-due"]);
  assert.equal(calcFor(data, "telok-ayer").exceptions, 0);
  assert.equal(calcFor(data, "meranti").exceptions, 0);
  assert.equal(calcFor(data, "kallang").exceptions, 1);
});

// The capture's wording for Kallang's payout exception, then the sentence this build appends from the engine's figures.
const KALLANG_PAYOUT_CAPTURE =
  "85.0% of taxable specified income is distributed. Tax transparency needs at least 90% for the year; S$6,286,000 retained is taxed at the trustee at 17% (S$1,068,620).";
const KALLANG_WORST_CASE =
  "If the Comptroller denies tax transparency for the year, the trustee would instead be taxed on all of the taxable specified income at 17%: S$7,124,105 (the engine's worst case), and no s45G withholding would apply to distributions out of income already taxed at the trustee (IRAS e-Tax Guide para 8.4), so the S$837,082 of withholding computed here would fall away; this needs a tax adviser's view.";
const FORM_RULE = "IRAS requires Form A (depository agents: Form B) before every distribution (e-Tax Guide para 13.1)";

test("check wording matches the reference", () => {
  const data = freshData();
  const kallang = calcFor(data, "kallang").checks;
  assert.deepEqual(kallang[0], {
    id: "payout",
    severity: "exception",
    title: "Taxable payout below 90%",
    detail: `${KALLANG_PAYOUT_CAPTURE} ${KALLANG_WORST_CASE}`,
  });
  assert.deepEqual(kallang[1], {
    id: "no-declaration",
    severity: "note",
    title: "17% deducted for 1 holder without a qualifying declaration",
    detail: "Not a final tax — the holder can claim a refund of tax over-deducted once a declaration is received.",
  });
  // The reference called 16 Nov "due" as if IRAS set it; it is the manager's cut-off (e-Tax Guide para 13.1 only asks for the form before every distribution).
  assert.deepEqual(kallang[2], {
    id: "sg-notice-due",
    severity: "note",
    title: "Announce the tax notice before the record date, 9 Nov 2026",
    detail: `Declaration cut-off set by the manager: 16 Nov 2026. ${FORM_RULE}; announcing the notice before the record date is market practice, not an IRAS rule.`,
  });
});

test("the 90% test sits exactly on the threshold", () => {
  const data = freshData();
  const fund = sgFund(data, "kallang");
  fund.inputs.taxableDistributed = Math.round(fund.inputs.taxableSpecifiedIncome * 0.9);
  const at90 = sgModule.fundCalc(data, fund, NOW);
  assert.ok(!at90.checks.some((c) => c.id === "payout"), "90% passes");
  assert.equal(at90.sg?.retained, fund.inputs.taxableSpecifiedIncome - fund.inputs.taxableDistributed);
  fund.inputs.taxableDistributed -= 100;
  const below = sgModule.fundCalc(data, fund, NOW);
  assert.ok(below.checks.some((c) => c.id === "payout"), "S$1 under 90% fails");
});

test("a failed 90% test shows the reference's figures first and the engine's worst case after them", () => {
  const data = freshData();
  const cases: Array<[string, number | null]> = [["kallang", null], ["loyang", 0.8], ["meranti", 0.5]];
  for (const [id, payout] of cases) {
    const fund = sgFund(data, id);
    if (payout !== null) fund.inputs.taxableDistributed = Math.round(fund.inputs.taxableSpecifiedIncome * payout);
    const { taxableSpecifiedIncome: income, taxableDistributed: distributed } = fund.inputs;
    const calc = sgModule.fundCalc(data, fund, NOW);
    const check = calc.checks.find((c) => c.id === "payout");
    assert.ok(check, id);
    const engine = computeReitTax({ distributionDate: fund.periodEnd, taxableSpecifiedIncome: income, taxableSpecifiedIncomeDistributed: distributed });
    assert.equal(engine.passesTransparencyTest, false, id);
    assert.equal(engine.trusteeTax, mulBps(income, engine.trusteeTaxRateBps), `${id}: the engine taxes all of the specified income`);
    assert.equal(engine.composition.transparentTaxableDistribution, 0, `${id}: the engine treats transparency as denied`);
    const rate = ratePct(engine.trusteeTaxRateBps / 10_000);
    const retained = income - distributed;
    const retainedTax = mulBps(retained, engine.trusteeTaxRateBps);
    // The primary figures stay the reference's: trustee tax on the retained income only, withholding on the whole taxable distribution.
    assert.equal(calc.sg?.retained, retained, id);
    assert.equal(calc.sg?.trusteeTax, retainedTax, id);
    assert.ok(calc.withheld > 0, `${id}: withholding is still deducted from the taxable distribution`);
    assert.ok(check.detail.includes(`${money(retained, "SGD")} retained is taxed at the trustee at ${rate} (${money(retainedTax, "SGD")}). If the Comptroller`), id);
    // The sentence also says the s45G withholding would fall away (e-Tax Guide para 8.4), by the amount the module computed for the holders.
    assert.equal(calc.withheld, sum(calc.holders.map((h) => h.withheld)), `${id}: the amount that would fall away is the computed withholding`);
    assert.ok(
      check.detail.endsWith(
        `would instead be taxed on all of the taxable specified income at ${rate}: ${money(engine.trusteeTax, "SGD")} (the engine's worst case), and no s45G withholding would apply to distributions out of income already taxed at the trustee (IRAS e-Tax Guide para 8.4), so the ${money(calc.withheld, "SGD")} of withholding computed here would fall away; this needs a tax adviser's view.`,
      ),
      id,
    );
    assert.equal((check.detail.match(/Comptroller/g) ?? []).length, 1, `${id}: one extra sentence`);
  }
  assert.equal(calcFor(data, "kallang").withheld, 83_708_175);
});

test("with nothing withheld the worst-case sentence does not quote a withholding amount", () => {
  const data = freshData();
  const fund = sgFund(data, "kallang");
  fund.inputs.taxableDistributed = 0;
  const calc = sgModule.fundCalc(data, fund, NOW);
  assert.equal(calc.withheld, 0);
  const check = calc.checks.find((c) => c.id === "payout");
  assert.ok(check);
  assert.ok(check.detail.endsWith("(the engine's worst case), and no s45G withholding would apply to distributions out of income already taxed at the trustee (IRAS e-Tax Guide para 8.4); this needs a tax adviser's view."));
  assert.ok(!check.detail.includes("fall away") && !check.detail.includes("S$0 "), "no S$0 withholding to quote");
});

test("a notice that is overdue, changed or unpaid raises the matching exception", () => {
  const data = freshData();
  const meranti = sgFund(data, "meranti");
  const late = sgModule.fundCalc(data, meranti, new Date(2026, 10, 6, 9, 0, 0));
  assert.ok(late.checks.some((c) => c.id === "sg-notice-late" && c.severity === "exception" && c.title === "Distribution tax notice not announced before the record date"));
  assert.equal(
    late.checks.find((c) => c.id === "sg-notice-late")?.detail,
    `Record date 5 Nov 2026. Unitholders need the tax breakdown to submit their declarations. ${FORM_RULE}; announcing the notice before the record date is market practice, not an IRAS rule.`,
  );
  assert.ok(!late.checks.some((c) => c.id === "sg-notice-due"));

  const changed = freshData();
  const loyang = sgFund(changed, "loyang");
  loyang.inputs.capitalDistribution += 100;
  const changedCalc = sgModule.fundCalc(changed, loyang, NOW);
  const check = changedCalc.checks.find((c) => c.id === "sg-notice-changed");
  assert.ok(check, "a published notice that no longer matches is an exception");
  assert.equal(check.severity, "exception");
  assert.equal(check.detail, "Capital distribution: announced S$4,302,000, now S$4,302,001");
  assert.ok(Math.abs(loyang.inputs.capitalDistribution - 430_200_000) < 1000);

  const overdue = freshData();
  const kallang = sgFund(overdue, "kallang");
  const afterDue = sgModule.fundCalc(overdue, kallang, new Date(2027, 0, 16, 9, 0, 0));
  const flagged = afterDue.checks.find((c) => c.id === "sg-wht-overdue");
  assert.ok(flagged);
  assert.equal(flagged.detail, "S$837,082 was due to IRAS by 15 Jan 2027.");
  const onTime = sgModule.fundCalc(overdue, kallang, new Date(2027, 0, 15, 9, 0, 0));
  assert.ok(!onTime.checks.some((c) => c.id === "sg-wht-overdue"), "due on the 15th, overdue from the 16th");
});

test("a remitted amount that differs from the computed withholding is a reconciliation exception", () => {
  const data = freshData();
  const loyang = sgFund(data, "loyang");
  loyang.whtRemitted = 279_264_400 - 123_400;
  const under = sgModule.fundCalc(data, loyang, NOW);
  assert.equal(under.recon.status, "under-remitted");
  assert.equal(under.recon.variance, 123_400);
  const check = under.checks.find((c) => c.id === "wht-rec");
  assert.ok(check);
  assert.equal(check.severity, "exception");
  assert.equal(check.detail, "Computed S$2,792,644 against S$2,791,410 remitted — under-remitted by S$1,234.");
  loyang.whtRemitted = 279_264_400 + 500;
  const over = sgModule.fundCalc(data, loyang, NOW);
  assert.equal(over.recon.status, "over-remitted");
  assert.equal(over.recon.variance, -500);
});

test("taxable distribution above taxable specified income is flagged as a return of capital", () => {
  const data = freshData();
  const kallang = sgFund(data, "kallang");
  kallang.inputs.taxableDistributed = kallang.inputs.taxableSpecifiedIncome + 25_000_000;
  const calc = sgModule.fundCalc(data, kallang, NOW);
  const check = calc.checks.find((c) => c.id === "over-distribution");
  assert.ok(check);
  assert.equal(check.severity, "exception");
  assert.equal(check.title, "Taxable distribution exceeds taxable specified income");
  assert.equal(check.detail, "The excess of S$250,000 is a return of capital for tax purposes, not taxable income.");
  assert.equal(calc.sg?.retained, 0);
  assert.equal(calc.sg?.trusteeTax, 0);
});

test("a fund with no notice record still calculates, dated at its period end", () => {
  const data = freshData();
  data.sgNotices = data.sgNotices.filter((n) => n.fundId !== "kallang");
  const calc = sgModule.fundCalc(data, sgFund(data, "kallang"), NOW);
  assert.equal(calc.withheld, 83_708_175);
  assert.ok(!calc.checks.some((c) => c.id.startsWith("sg-notice")));
});

// ------------------------------------------------------------------------------------------------ the unit register
test("a short register keeps the missing units as their own bucket and flags the register", () => {
  const data = freshData();
  const loyang = sgFund(data, "loyang");
  const dropped = data.holders.find((h) => h.id === "h-ly-5");
  assert.ok(dropped);
  data.holders = data.holders.filter((h) => h.id !== "h-ly-5");
  const calc = sgModule.fundCalc(data, loyang, NOW);
  assert.equal(calc.unallocatedUnits, dropped.units);
  assert.equal(calc.registerUnits, loyang.unitsOnIssue - dropped.units);
  const register = calc.checks.find((c) => c.id === "register");
  assert.ok(register);
  assert.equal(register.severity, "exception");
  assert.equal(register.title, "Unit register out of balance");
  assert.equal(register.detail, "Register holds 2,727,497,500 units against 2,871,050,000 on issue (143,552,500 units not allocated to a holder).");
  // The remaining holders keep the share they had: removing a holder never moves its cash onto the others.
  const full = calcFor(freshData(), "loyang");
  for (const line of calc.holders) assert.equal(line.cash, full.holders.find((h) => h.holder.id === line.holder.id)?.cash);
  const unallocated = sum(calc.components.map((c) => c.unallocated));
  assert.equal(unallocated, 370_590_500);
  assert.equal(sum(calc.holders.map((h) => h.cash)) + unallocated, calc.cash);
  assert.ok(calc.sankey.targets.some((t) => t.label === "Units not on register"));
});

test("an over-allocated register shares the distribution pro rata across the units on the register", () => {
  const data = freshData();
  const loyang = sgFund(data, "loyang");
  const holder = data.holders.find((h) => h.id === "h-ly-1");
  assert.ok(holder);
  holder.units += 287_105_000;
  const calc = sgModule.fundCalc(data, loyang, NOW);
  assert.equal(calc.unallocatedUnits, 0);
  assert.equal(calc.registerUnits, loyang.unitsOnIssue + 287_105_000);
  assert.ok(calc.checks.some((c) => c.id === "register" && c.detail.endsWith("units over-allocated).")));
  assert.equal(sum(calc.holders.map((h) => h.cash)), calc.cash);
  assert.equal(sum(calc.components.map((c) => c.unallocated)), 0);
});

// ------------------------------------------------------------------------------------------------ invariants
test("every fund: the money in each view adds up to the distribution, to the cent", () => {
  const data = freshData();
  for (const id of SG_IDS) {
    const calc = calcFor(data, id);
    const fund = sgFund(data, id);
    const label = `${id}`;
    assert.equal(calc.market, "SG", label);
    assert.equal(calc.currency, "SGD", label);
    assert.equal(calc.fundId, id, label);
    assert.equal(calc.characterTotal, fund.inputs.taxableDistributed + fund.inputs.taxExemptDistribution + fund.inputs.capitalDistribution, label);
    assert.equal(calc.cash, calc.characterTotal, label);
    assert.equal(sum(calc.components.map((c) => c.amount)), calc.characterTotal, label);
    assert.equal(sum(calc.holders.map((h) => h.cash)) + sum(calc.components.map((c) => c.unallocated)), calc.cash, label);
    assert.equal(sum(calc.holders.map((h) => h.withheld)), calc.withheld, label);
    assert.equal(sum(calc.components.map((c) => c.withheld)), calc.withheld, label);
    for (const c of calc.components) {
      assert.equal(c.toGross + c.toNet + c.withheld + c.unallocated, c.amount, `${label} ${c.key}`);
      assert.ok(c.attributed, `${label} ${c.key} is attributed`);
    }
    for (const h of calc.holders) {
      assert.equal(h.cash - h.withheld, h.net, `${label} ${h.holder.id}`);
      assert.equal(sum(h.lines.map((l) => l.amount)), h.cash, `${label} ${h.holder.id}`);
      assert.equal(sum(h.withholdingParts.map((p) => p.amount)), h.withheld, `${label} ${h.holder.id}`);
      if (h.withheld > 0) assert.equal(h.group, "net", `${label} ${h.holder.id} is paid net of withholding`);
    }
    assert.equal(calc.exceptions, calc.checks.filter((c) => c.severity === "exception").length, label);
    assert.equal(calc.recon.computed, calc.withheld, label);
    assert.equal(sum(calc.holders.map((h) => h.holder.units)), calc.registerUnits, label);
    // Whole cents and finite numbers throughout.
    const numbers = [calc.cash, calc.withheld, ...calc.holders.flatMap((h) => [h.cash, h.withheld, h.net, h.share]), ...calc.components.flatMap((c) => [c.amount, c.centsPerUnit, c.toGross, c.toNet])];
    assert.ok(numbers.every(Number.isFinite), label);
    assert.ok(calc.holders.every((h) => Number.isInteger(h.cash) && Number.isInteger(h.withheld)), label);
  }
});

test("holders are listed in register order, not alphabetically", () => {
  const data = freshData();
  const ids = calcFor(data, "loyang").holders.map((h) => h.holder.id);
  assert.deepEqual(ids, ["h-ly-1", "h-ly-2", "h-ly-3", "h-ly-4", "h-ly-5"]);
  assert.deepEqual(
    calcFor(data, "loyang").holders.map((h) => h.holder.holder),
    data.holders.filter((h) => h.fundId === "loyang").map((h) => h.holder),
  );
});

test("an AU fund is rejected rather than miscalculated", () => {
  const data = freshData();
  const au = data.funds.find((f) => f.market === "AU");
  assert.ok(au);
  assert.throws(() => sgModule.fundCalc(data, au, NOW), /Singapore module/);
});

// ------------------------------------------------------------------------------------------------ exact allocation
test("allocateExact splits to the cent with largest remainders and ties to the earlier entry", () => {
  assert.deepEqual(allocateExact(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocateExact(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocateExact(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocateExact(5, []), []);
  assert.deepEqual(allocateExact(100, [0, 0]), [0, 0]);
  assert.deepEqual(allocateExact(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.deepEqual(allocateExact(1000, [3, 0, 7]), [300, 0, 700]);
  // Loyang's register is 35 / 25 / 20 / 15 / 5 per cent of the units, so the shares are exact.
  const parts = allocateExact(6_981_610_000, [1_004_867_500, 717_762_500, 574_210_000, 430_657_500, 143_552_500]);
  assert.deepEqual(parts, [2_443_563_500, 1_745_402_500, 1_396_322_000, 1_047_241_500, 349_080_500]);
});

test("allocateExact is exact for register-sized weights, where a float product would pass 2^53", () => {
  // Register-sized weights (billions of units) times a nine-digit amount exceed 2^53.
  const weights = [1_004_867_500, 717_762_500, 574_210_000, 430_657_500, 143_552_500];
  for (const total of [6_981_610_000, 5_841_260_001, 999_999_999_999, 7]) {
    const parts = allocateExact(total, weights);
    assert.equal(sum(parts), total, `total ${total}`);
    assert.ok(parts.every((p) => Number.isInteger(p) && p >= 0), `total ${total}`);
    const exact = weights.map((w) => (BigInt(total) * BigInt(w)) / BigInt(sum(weights)));
    parts.forEach((p, i) => assert.ok(p === Number(exact[i]) || p === Number(exact[i]) + 1, `part ${i} of ${total}`));
  }
});

test("allocateExact agrees with the engine's allocate on the seed registers and on a sweep of register-sized cases", () => {
  const data = freshData();
  for (const id of SG_IDS) {
    const units = data.holders.filter((h) => h.fundId === id).map((h) => h.units);
    const fund = sgFund(data, id);
    for (const total of [fund.inputs.taxableDistributed, fund.inputs.taxExemptDistribution, fund.inputs.capitalDistribution]) {
      assert.deepEqual(allocateExact(total, units), allocate(total, units), `${id} ${total}`);
    }
  }
  // A fixed pseudo-random sweep: percentage splits of a register with amounts that divide exactly, and arbitrary weights.
  let seed = 20261012;
  const next = (lo: number, hi: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return lo + (seed % (hi - lo + 1));
  };
  for (let i = 0; i < 2_000; i++) {
    const k = next(1, 40_000_000);
    const cuts = [next(1, 99), next(1, 99), next(1, 99), next(1, 99)].sort((a, b) => a - b);
    const shares = [cuts[0], cuts[1] - cuts[0], cuts[2] - cuts[1], cuts[3] - cuts[2], 100 - cuts[3]];
    const exactWeights = shares.map((s) => s * k);
    const exactTotal = next(1, 200_000_000) * 100;
    assert.deepEqual(allocateExact(exactTotal, exactWeights), allocate(exactTotal, exactWeights), `exact ${i}`);
    const weights = [next(1, 2_000_000_000), next(1, 2_000_000_000), next(1, 2_000_000_000)];
    const total = next(1, 20_000_000_000);
    assert.deepEqual(allocateExact(total, weights), allocate(total, weights), `arbitrary ${i}`);
  }
});

test("allocateAcrossRegister puts the units that are not on the register in their own bucket", () => {
  const short = allocateAcrossRegister(1_000, [50, 25], 100);
  assert.deepEqual(short, { holders: [500, 250], unallocated: 250 });
  const full = allocateAcrossRegister(1_000, [60, 40], 100);
  assert.deepEqual(full, { holders: [600, 400], unallocated: 0 });
  const over = allocateAcrossRegister(900, [60, 60, 30], 100);
  assert.deepEqual(over, { holders: [360, 360, 180], unallocated: 0 });
  assert.deepEqual(allocateAcrossRegister(500, [], 0), { holders: [], unallocated: 500 });
  assert.deepEqual(allocateAcrossRegister(500, [0, 0], 0), { holders: [0, 0], unallocated: 500 });
});

test("module data is read-only to the calculation", () => {
  const data: AppData = freshData();
  const before = JSON.stringify(data);
  for (const id of SG_IDS) calcFor(data, id);
  assert.equal(JSON.stringify(data), before);
});
