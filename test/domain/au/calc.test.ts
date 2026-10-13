// Distribution calculation for the five Australian funds: golden values from the reference app's rendered screens and its published
// check list (amounts in cents, the displayed A$ amount x 100), the checks, the reconciliation and the register edge cases.
import assert from "node:assert/strict";
import { test } from "node:test";
import { auModule } from "../../../src/domain/au/index.ts";
import type { AuHolder, FundCalc } from "../../../src/domain/types.ts";
import { auFund, AU_IDS, calcFor, freshData, near, nearDollars, NOW, sum } from "./helpers.ts";

const withheldOf = (calc: FundCalc): Record<string, number> => Object.fromEntries(calc.holders.map((h) => [h.holder.id, h.withheld]));
const checkIds = (calc: FundCalc, severity: "exception" | "note"): string[] => calc.checks.filter((c) => c.severity === severity).map((c) => c.id);
const column = (calc: FundCalc, key: "toGross" | "toNet" | "withheld" | "unallocated"): number => sum(calc.components.map((c) => c[key]));

// ------------------------------------------------------------------------------------------------ golden distributions
test("Harbourline: components, c/unit, destinations and withholding match the reference", () => {
  const calc = calcFor(freshData(), "harbourline");
  assert.deepEqual(
    calc.components.map((c) => [c.key, c.amount]),
    [
      ["ausOtherIncome", 4_831_840_000],
      ["ncmi", 0],
      ["excludedNcmi", 0],
      ["cleanBuilding", 620_530_000],
      ["interest", 118_490_000],
      ["discountGainTarp", 391_200_000],
      ["cgtConcessionTarp", 391_200_000],
      ["otherGainTarp", 0],
      ["foreignIncome", 0],
      ["taxDeferred", 2_891_340_000],
    ],
  );
  assert.deepEqual(
    calc.components.filter((c) => c.amount > 0).map((c) => [c.label, c.treatment, c.short]),
    [
      ["Australian income — other", "Fund payment · 15% EOI · 30% non-EOI", "Other income"],
      ["Clean building MIT income", "Fund payment · 10% EOI · 30% non-EOI", "Clean building"],
      ["Australian interest", "Interest withholding · 10%", "Interest"],
      ["Discounted capital gains — TARP", "Fund payment · after 50% discount", "Discounted gains"],
      ["AMIT CGT gross-up amount — TARP", "Equals the discount · grossed up into fund payment", "CGT gross-up"],
      ["Other non-attributable amounts", "Cash above attributed amounts · reduces cost base", "Cost base excess"],
    ],
  );
  assert.deepEqual(
    calc.components.filter((c) => c.amount > 0).map((c) => c.centsPerUnit.toFixed(4)),
    ["3.4203", "0.4393", "0.0839", "0.2769", "0.2769", "2.0467"],
  );
  assert.deepEqual(
    calc.components.filter((c) => c.amount > 0).map((c) => c.attributed),
    [true, true, true, true, false, false],
  );
  assert.equal(calc.characterTotal, 9_244_600_000);
  assert.equal(calc.cash, 9_244_600_000);
  assert.equal(calc.withheld, 250_448_636);
  assert.deepEqual(
    calc.destinations.map((d) => [d.key, d.label]),
    [
      ["gross", "Australian residents"],
      ["net", "Foreign investors, net"],
      ["withheld", "Withheld for the ATO"],
      ["unallocated", "Units not on register"],
    ],
  );

  // Per component, the reference shows whole dollars to Australian residents, foreign investors (net) and the ATO.
  const golden: Record<string, [number, number, number]> = {
    ausOtherIncome: [35_688_454, 10_652_902, 1_977_044],
    cleanBuilding: [4_583_297, 1_445_667, 176_336],
    interest: [875_179, 278_749, 30_972],
    discountGainTarp: [2_889_442, 862_490, 160_067],
    cgtConcessionTarp: [2_889_442, 862_490, 160_067],
    taxDeferred: [21_355_727, 7_557_673, 0],
  };
  for (const [key, [gross, net, withheld]] of Object.entries(golden)) {
    const c = calc.components.find((x) => x.key === key);
    assert.ok(c, key);
    nearDollars(c.toGross, gross, `${key} to residents`);
    nearDollars(c.toNet, net, `${key} to foreign investors`);
    nearDollars(c.withheld, withheld, `${key} withheld`);
  }
  nearDollars(column(calc, "toGross"), 68_281_542);
  nearDollars(column(calc, "toNet"), 21_659_972);
  assert.equal(column(calc, "withheld"), calc.withheld);
  assert.equal(column(calc, "unallocated"), 0);
  assert.equal(calc.narrative, "A$92.45m by tax character: A$68.28m to Australian residents and A$21.66m to foreign investors after A$2.50m withheld for the ATO.");
});

// The ATO's names: the doubled discount gain is the "AMIT CGT gross up amount", and under AMIT the amount above the attributed amounts is not
// "tax deferred" (that term was retired) but a non-attributable amount that reduces the cost base.
test("the ten components carry the ATO's names, in the reference's order, for every fund and every holder", () => {
  const data = freshData();
  const labels = [
    "Australian income — other",
    "Non-concessional MIT income",
    "Excluded from NCMI — transitional",
    "Clean building MIT income",
    "Australian interest",
    "Discounted capital gains — TARP",
    "AMIT CGT gross-up amount — TARP",
    "Other capital gains — TARP",
    "Assessable foreign income",
    "Other non-attributable amounts",
  ];
  const shorts = ["Other income", "NCMI", "Excluded NCMI", "Clean building", "Interest", "Discounted gains", "CGT gross-up", "Other gains", "Foreign income", "Cost base excess"];
  for (const id of AU_IDS) {
    const calc = calcFor(data, id);
    assert.deepEqual(calc.components.map((c) => c.label), labels, id);
    assert.deepEqual(calc.components.map((c) => c.short), shorts, id);
    for (const h of calc.holders) assert.deepEqual(h.lines.map((l) => l.label), labels, `${id} ${h.holder.id}`);
    assert.deepEqual(calc.sankey.sources.map((s) => s.label), shorts.filter((_, i) => calc.components[i].amount > 0), `${id}: the Sankey nodes use the short names`);
  }
});

test("Harbourline: per-holder cash, withholding and net match the reference to the dollar", () => {
  const calc = calcFor(freshData(), "harbourline");
  assert.deepEqual(
    calc.holders.map((h) => [h.holder.id, h.cash, h.withheld, h.net, h.group]),
    [
      ["h-hl-1", 5_903_694_171, 0, 5_903_694_171, "gross"],
      ["h-hl-2", 924_460_000, 0, 924_460_000, "gross"],
      ["h-hl-3", 1_386_690_000, 137_405_700, 1_249_284_300, "net"],
      ["h-hl-4", 924_460_000, 91_603_800, 832_856_200, "net"],
      ["h-hl-5", 105_295_829, 21_439_136, 83_856_693, "net"],
    ],
  );
  const golden: Record<string, [number, number]> = {
    "h-hl-1": [0, 59_036_942],
    "h-hl-2": [0, 9_244_600],
    "h-hl-3": [1_374_057, 12_492_843],
    "h-hl-4": [916_038, 8_328_562],
    "h-hl-5": [214_391, 838_567],
  };
  for (const h of calc.holders) {
    const [withheld, net] = golden[h.holder.id];
    nearDollars(h.withheld, withheld, `${h.holder.id} withheld`);
    nearDollars(h.net, net, `${h.holder.id} net`);
  }
  assert.deepEqual(
    calc.holders.map((h) => [h.statusLabel, h.rateSummary]),
    [
      ["Australian resident", "No withholding"],
      ["Australian resident", "No withholding"],
      ["Foreign resident — EOI country", "15% fund payment · 10% clean building · 10% interest"],
      ["Foreign resident — EOI country", "15% fund payment · 10% clean building · 10% interest"],
      ["Foreign resident — non-EOI", "30% fund payment · 10% interest"],
    ],
  );
  assert.deepEqual(calc.holders[0].withholdingParts, []);
  assert.deepEqual(calc.holders[4].withholdingParts, [
    { label: "Fund payment withholding at 30%", amount: 21_304_176 },
    { label: "Interest withholding at 10%", amount: 134_960 },
  ]);
  assert.deepEqual(calc.recon, { computed: 250_448_636, remitted: 250_448_636, variance: 0, status: "reconciled" });
});

test("Harbourline: AMIT facts and the only check, a note about the non-EOI holder", () => {
  const calc = calcFor(freshData(), "harbourline");
  assert.deepEqual(calc.au, {
    attributed: 5_962_060_000,
    cgtConcession: 391_200_000,
    taxDeferred: 2_891_340_000,
    costBaseNet: 2_891_340_000,
    fundPayment: 6_234_770_000,
    ammaDue: "2026-09-30",
    foreignHolderCount: 3,
  });
  assert.deepEqual(calc.checks.map((c) => [c.severity, c.id, c.title]), [["note", "au-non-eoi-30", "30% fund payment rate for 1 holder"]]);
  assert.equal(calc.exceptions, 0);
  assert.equal(calc.registerUnits, 1_412_680_000);
  assert.equal(calc.unallocatedUnits, 0);
});

test("Southbank: the reference's published checks, to the cent", () => {
  const data = freshData();
  const calc = calcFor(data, "southbank");
  assert.deepEqual(checkIds(calc, "exception"), ["au-amma-overdue", "au-wht-variance"]);
  assert.deepEqual(checkIds(calc, "note"), ["au-costbase-shortfall", "au-notices-understate"]);
  assert.equal(calc.exceptions, 2);
  assert.equal(auFund(data, "southbank").whtRemitted, 241_009_925);
  assert.deepEqual(calc.recon, { computed: 389_209_925, remitted: 241_009_925, variance: 148_200_000, status: "under-remitted" });
  assert.equal(calc.withheld, 389_209_925);

  const byId = Object.fromEntries(calc.checks.map((c) => [c.id, c]));
  assert.equal(byId["au-amma-overdue"].title, "AMMA statements overdue");
  assert.match(byId["au-amma-overdue"].detail, /Due 30 Sep 2026/);
  assert.match(byId["au-wht-variance"].detail, /A\$3,892,099 against A\$2,410,099 remitted — under-remitted by A\$1,482,000/);
  assert.equal(
    byId["au-costbase-shortfall"].detail,
    "Attributed amounts and the AMIT CGT gross-up amount exceed the cash distribution by A$4,816,860 (0.7040 c/unit); members increase their cost base.",
  );
  assert.equal(byId["au-notices-understate"].title, "Notices understate the year's fund payment by A$19,760,000");
  assert.deepEqual(calc.au, {
    attributed: 4_214_886_000,
    cgtConcession: 988_000_000,
    taxDeferred: 0,
    costBaseNet: -481_686_000,
    fundPayment: 5_162_625_000,
    ammaDue: "2026-09-30",
    foreignHolderCount: 2,
  });
});

test("Southbank: attributed amounts exceed the cash, so the tax characters add up to more than the distribution", () => {
  const calc = calcFor(freshData(), "southbank");
  assert.equal(calc.cash, 4_721_200_000);
  assert.equal(calc.characterTotal, 5_202_886_000);
  assert.ok(calc.characterTotal > calc.cash);
  assert.equal(calc.components.find((c) => c.key === "taxDeferred")?.amount, 0);
  nearDollars(column(calc, "toGross"), 26_014_430);
  nearDollars(column(calc, "toNet"), 22_122_331);
  nearDollars(calc.withheld, 3_892_099);
  near(calc.components.reduce((s, c) => s + c.centsPerUnit, 0), 7.6042, 0.0001);
  assert.equal(calc.narrative, "A$52.03m by tax character: A$26.01m to Australian residents and A$22.12m to foreign investors after A$3.89m withheld for the ATO. Attributed amounts exceed the A$47,212,000 cash distribution, so members' cost base increases.");
  // The two EOI holders hold the same units, so they differ by at most the one cent that cannot be split.
  const w = withheldOf(calc);
  assert.equal(w["h-sb-3"] + w["h-sb-4"], 389_209_925);
  assert.ok(Math.abs(w["h-sb-3"] - w["h-sb-4"]) <= 1);
});

test("Wattle: every check clear, withholding remitted in full", () => {
  const data = freshData();
  const calc = calcFor(data, "wattle");
  assert.deepEqual(calc.checks, []);
  assert.equal(calc.exceptions, 0);
  assert.equal(calc.withheld, 274_264_560);
  assert.deepEqual(calc.recon, { computed: 274_264_560, remitted: 274_264_560, variance: 0, status: "reconciled" });
  assert.equal(calc.characterTotal, 12_968_800_000);
  nearDollars(column(calc, "toGross"), 108_937_920);
  nearDollars(column(calc, "toNet"), 18_007_434);
  near(calc.components.reduce((s, c) => s + c.centsPerUnit, 0), 6.16, 0.0001);
  const w = withheldOf(calc);
  nearDollars(w["h-wt-3"], 1_714_154);
  nearDollars(w["h-wt-4"], 1_028_492);
  assert.equal(w["h-wt-1"] + w["h-wt-2"], 0);
  assert.equal(calc.narrative, "A$129.69m by tax character: A$108.94m to Australian residents and A$18.01m to foreign investors after A$2.74m withheld for the ATO.");
});

test("Kurrajong: the register is 1,250,000 units short, so part of every component sits on missing units", () => {
  const data = freshData();
  const calc = calcFor(data, "kurrajong");
  assert.deepEqual(checkIds(calc, "exception"), ["au-register", "au-amma-overdue", "au-wht-variance"]);
  assert.deepEqual(checkIds(calc, "note"), ["au-non-eoi-30", "au-notices-understate"]);
  assert.equal(calc.exceptions, 3);
  assert.equal(auFund(data, "kurrajong").unitsOnIssue, 951_400_000);
  assert.equal(calc.registerUnits, 950_150_000);
  assert.equal(calc.unallocatedUnits, 1_250_000);
  assert.match(calc.checks[0].detail, /950,150,000 units against 951,400,000 on issue \(1,250,000 units not allocated to a holder\)/);
  assert.deepEqual(calc.recon, { computed: 245_299_519, remitted: 209_240_269, variance: 36_059_250, status: "under-remitted" });
  assert.match(calc.checks[2].detail, /A\$2,452,995 against A\$2,092,403 remitted — under-remitted by A\$360,593/);
  nearDollars(column(calc, "unallocated"), 76_251);
  nearDollars(column(calc, "toGross"), 40_625_200);
  nearDollars(column(calc, "toNet"), 14_881_554);
  nearDollars(calc.withheld, 2_452_995);
  assert.equal(calc.narrative, "A$58.04m by tax character: A$40.63m to Australian residents and A$14.88m to foreign investors after A$2.45m withheld for the ATO; A$76.3k sits on units missing from the register.");
  near(calc.components.reduce((s, c) => s + c.centsPerUnit, 0), 6.1001, 0.0001);

  const w = withheldOf(calc);
  nearDollars(w["h-kj-3"], 1_120_972);
  nearDollars(w["h-kj-4"], 747_315);
  nearDollars(w["h-kj-5"], 584_709);
  assert.equal(calc.au?.foreignHolderCount, 3);
});

test("Coastline: a quarter-end fund with one unmapped trial balance account and withholding not yet remitted", () => {
  const data = freshData();
  const calc = calcFor(data, "coastline");
  assert.deepEqual(checkIds(calc, "exception"), ["au-tb-unmapped"]);
  assert.deepEqual(checkIds(calc, "note"), ["au-non-eoi-30", "au-notice-due-coastline-2026-09-30"]);
  assert.equal(calc.exceptions, 1);
  assert.equal(calc.checks[0].title, "1 trial balance account without a tax category");
  assert.equal(calc.checks[2].title, "Fund payment notice due by 13 Nov 2026");
  assert.equal(auFund(data, "coastline").whtRemitted, null);
  assert.deepEqual(calc.recon, { computed: 64_063_788, remitted: null, variance: null, status: "not-remitted" });
  assert.equal(calc.au?.ammaDue, "2026-12-31");
  nearDollars(column(calc, "toGross"), 16_838_400);
  nearDollars(column(calc, "toNet"), 3_568_962);
  nearDollars(calc.withheld, 640_638);
  near(calc.components.reduce((s, c) => s + c.centsPerUnit, 0), 6.5994, 0.0001);
  assert.equal(calc.narrative, "A$21.05m by tax character: A$16.84m to Australian residents and A$3.57m to foreign investors after A$640.6k withheld for the ATO.");
  assert.equal(calc.components.find((c) => c.key === "foreignIncome")?.amount, 110_480_000);
});

// ------------------------------------------------------------------------------------------------ states and edge cases
test("the AMMA is overdue only once the day after it is due has begun", () => {
  const data = freshData();
  const fund = auFund(data, "southbank");
  const dayOf = auModule.fundCalc(data, fund, new Date(2026, 8, 30, 23, 59, 0));
  const dayAfter = auModule.fundCalc(data, fund, new Date(2026, 9, 1, 0, 0, 0));
  assert.equal(dayOf.checks.some((c) => c.id === "au-amma-overdue"), false);
  assert.equal(dayAfter.checks.some((c) => c.id === "au-amma-overdue"), true);
});

test("signing the fund off clears the overdue AMMA exception", () => {
  const data = freshData();
  const fund = auFund(data, "southbank");
  assert.equal(auModule.fundCalc(data, fund, NOW).checks.some((c) => c.id === "au-amma-overdue"), true);
  fund.status = "Signed off";
  assert.equal(auModule.fundCalc(data, fund, NOW).checks.some((c) => c.id === "au-amma-overdue"), false);
});

test("withholding that exceeds the amount remitted by a single cent is a variance; matching it exactly is reconciled", () => {
  const data = freshData();
  const fund = auFund(data, "wattle");
  fund.whtRemitted = 274_264_559;
  const under = auModule.fundCalc(data, fund, NOW);
  assert.equal(under.recon.status, "under-remitted");
  assert.equal(under.recon.variance, 1);
  assert.equal(checkIds(under, "exception").includes("au-wht-variance"), true);
  fund.whtRemitted = 274_264_561;
  const over = auModule.fundCalc(data, fund, NOW);
  assert.equal(over.recon.status, "over-remitted");
  assert.equal(over.recon.variance, -1);
  fund.whtRemitted = 274_264_560;
  assert.equal(auModule.fundCalc(data, fund, NOW).recon.status, "reconciled");
});

test("a fund with no unitholders on the register leaves every component unallocated and does not divide by zero", () => {
  const data = freshData();
  data.holders = data.holders.filter((h) => h.fundId !== "wattle");
  const calc = calcFor(data, "wattle");
  assert.equal(calc.registerUnits, 0);
  assert.equal(calc.unallocatedUnits, 2_105_330_000);
  assert.equal(calc.holders.length, 0);
  assert.equal(calc.withheld, 0);
  assert.equal(column(calc, "unallocated"), calc.characterTotal);
  assert.equal(column(calc, "toGross") + column(calc, "toNet"), 0);
  assert.equal(checkIds(calc, "exception").includes("au-register"), true);
  for (const c of calc.components) assert.ok(Number.isFinite(c.centsPerUnit));
});

test("a nil cash distribution leaves only attributed amounts and a shortfall equal to them", () => {
  const data = freshData();
  const fund = auFund(data, "wattle");
  fund.inputs.cashDistribution = 0;
  const calc = auModule.fundCalc(data, fund, NOW);
  assert.equal(calc.cash, 0);
  assert.equal(calc.components.find((c) => c.key === "taxDeferred")?.amount, 0);
  assert.equal((calc.au?.costBaseNet ?? 0) < 0, true);
  assert.equal(calc.au?.costBaseNet, -(calc.au?.attributed ?? 0) - (calc.au?.cgtConcession ?? 0));
  assert.equal(calc.holders.every((h) => h.cash === 0), true);
});

test("a holder moving from the EOI list to a non-EOI address is withheld at 30% instead of 15%", () => {
  const data = freshData();
  const before = calcFor(data, "wattle");
  const holder = data.holders.find((h): h is AuHolder => h.id === "h-wt-3" && "auStatus" in h);
  assert.ok(holder);
  holder.auStatus = "foreign-non-eoi";
  const after = calcFor(data, "wattle");
  const was = before.holders.find((h) => h.holder.id === "h-wt-3");
  const now = after.holders.find((h) => h.holder.id === "h-wt-3");
  assert.ok(was && now);
  assert.equal(now.rateSummary, "30% fund payment · 10% interest");
  assert.ok(now.withheld > was.withheld);
  // Fund payment doubles from 15% to 30%; interest stays at 10% for everyone.
  const interest = (line: typeof was): number => line.withholdingParts.find((p) => p.label.startsWith("Interest"))?.amount ?? 0;
  assert.equal(interest(now), interest(was));
  near(now.withheld - interest(now), 2 * (was.withheld - interest(was)), 5);
});

test("the interest withholding for an EOI and a non-EOI holder is identical per unit", () => {
  const calc = calcFor(freshData(), "harbourline");
  const perUnit = (id: string): number => {
    const h = calc.holders.find((x) => x.holder.id === id);
    assert.ok(h);
    const interest = h.withholdingParts.find((p) => p.label.startsWith("Interest"))?.amount ?? 0;
    return interest / h.holder.units;
  };
  near(perUnit("h-hl-3"), perUnit("h-hl-5"), 1e-7);
  near(perUnit("h-hl-3"), perUnit("h-hl-4"), 1e-7);
});

test("fundCalc rejects a fund from the other market", () => {
  const data = freshData();
  const sg = data.funds.find((f) => f.market === "SG");
  assert.ok(sg);
  assert.throws(() => auModule.fundCalc(data, sg, NOW), /not an Australian fund/);
});
