import { test } from "node:test";
import assert from "node:assert/strict";
import { moduleFor } from "../../src/domain/modules.ts";
import { GOVERNANCE } from "../../src/domain/permissions.ts";
import {
  analyticsView,
  auditFor,
  bulkRows,
  costBaseView,
  fundCalc,
  fundGroups,
  getFund,
  investorView,
  queriesFor,
  returnView,
  rulesFor,
  scenarioView,
  statementDoc,
  tbView,
  visibleFunds,
  workbookModel,
  workflowView,
} from "../../src/domain/selectors.ts";
import type { AppData, JurisdictionFilter, WorkbookModel } from "../../src/domain/types.ts";
import { AU_FUNDS, NOW, NOW_STAMP, PERSONAS, SG_FUNDS, chain, ctxOf, frozenSeed, fundOf, ok, sampleStates, skipUnlessReady, userOf } from "./core-fixtures.ts";

const ALL_FUNDS = [...AU_FUNDS, ...SG_FUNDS];
const JURISDICTIONS: JurisdictionFilter[] = ["all", "AU", "SG"];
const REACH: Record<(typeof PERSONAS)[number], string[]> = {
  "a-moreno": ALL_FUNDS,
  "m-castillo": ALL_FUNDS,
  "l-brennan": AU_FUNDS,
  "r-okafor": AU_FUNDS,
  "n-pillai": SG_FUNDS,
  "w-l-teo": SG_FUNDS,
  "d-harrow": ["harbourline", "southbank", "kurrajong"],
  "s-lim": ["telok-ayer", "meranti"],
};
const inJurisdiction = (fundId: string, jurisdiction: JurisdictionFilter): boolean =>
  jurisdiction === "all" || (jurisdiction === "AU" ? AU_FUNDS : SG_FUNDS).includes(fundId);

// ---------------------------------------------------------------------------------------------------- visibility

test("visibleFunds: every persona sees their own funds, in seed order, under every jurisdiction", () => {
  const data = frozenSeed();
  for (const id of PERSONAS) {
    for (const jurisdiction of JURISDICTIONS) {
      const expected = REACH[id].filter((fundId) => inJurisdiction(fundId, jurisdiction));
      assert.deepEqual(visibleFunds(data, userOf(data, id), jurisdiction).map((f) => f.id), expected, `${id} / ${jurisdiction}`);
    }
  }
});

test("visibleFunds returns the fund objects of the data, so views can compare them by identity", () => {
  const data = frozenSeed();
  const funds = visibleFunds(data, userOf(data, "a-moreno"), "all");
  assert.equal(funds.length, data.funds.length);
  funds.forEach((fund, i) => assert.equal(fund, data.funds[i]));
});

test("visibleFunds ignores fund ids the data does not have and honours an empty list", () => {
  const data = frozenSeed();
  const user = userOf(data, "w-l-teo");
  assert.deepEqual(visibleFunds(data, { ...user, funds: ["ghost", "kallang"] }, "all").map((f) => f.id), ["kallang"]);
  assert.deepEqual(visibleFunds(data, { ...user, funds: [] }, "all"), []);
  assert.deepEqual(visibleFunds(data, { ...user, funds: "all" }, "SG").map((f) => f.id), SG_FUNDS);
});

test("visibleFunds reads the user it is given, so a change of access shows in the next call only", () => {
  const data = frozenSeed();
  const next = chain(data, [["a-moreno", { type: "set-user-funds", userId: "s-lim", funds: ["telok-ayer", "meranti", "kallang"] }]]);
  assert.deepEqual(visibleFunds(next, userOf(next, "s-lim"), "all").map((f) => f.id), ["telok-ayer", "meranti", "kallang"]);
  assert.deepEqual(visibleFunds(data, userOf(data, "s-lim"), "all").map((f) => f.id), ["telok-ayer", "meranti"]);
});

// ---------------------------------------------------------------------------------------------------- fund rail

test("fundGroups: Australia first, then Singapore, with labels, status and exception counts", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const groups = fundGroups(data, ctxOf(data, "a-moreno"), "all");
  assert.deepEqual(
    groups.map((g) => [g.market, g.label, g.funds.map((f) => f.fund.id)]),
    [
      ["AU", "Australia · AMIT · AUD", AU_FUNDS],
      ["SG", "Singapore · S-REIT · SGD", SG_FUNDS],
    ],
  );
  assert.deepEqual(
    groups.map((g) => g.funds.map((f) => f.status)),
    [
      ["Signed off", "In review", "Signed off", "In review", "Preparing"],
      ["Preparing", "Signed off", "In review", "Preparing"],
    ],
  );
  assert.deepEqual(
    groups.map((g) => g.funds.map((f) => f.exceptions)),
    [
      [0, 2, 0, 3, 1],
      [0, 0, 0, 1],
    ],
  );
});

test("fundGroups: the jurisdiction toggle drops the other market and a market with nothing visible is omitted", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const moreno = ctxOf(data, "a-moreno");
  assert.deepEqual(fundGroups(data, moreno, "AU").map((g) => g.market), ["AU"]);
  assert.deepEqual(fundGroups(data, moreno, "SG").map((g) => g.market), ["SG"]);
  assert.deepEqual(fundGroups(data, ctxOf(data, "l-brennan"), "SG"), []);
  assert.deepEqual(fundGroups(data, ctxOf(data, "n-pillai"), "AU"), []);
  assert.deepEqual(fundGroups(data, ctxOf(data, "l-brennan"), "all").map((g) => g.market), ["AU"]);
  assert.deepEqual(fundGroups(data, ctxOf(data, "n-pillai"), "all").map((g) => g.market), ["SG"]);
});

test("fundGroups: only the funds the persona has, with the exceptions the calculation reports", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const harrow = fundGroups(data, ctxOf(data, "d-harrow"), "all");
  assert.deepEqual(harrow.map((g) => g.funds.map((f) => [f.fund.id, f.exceptions])), [[["harbourline", 0], ["southbank", 2], ["kurrajong", 3]]]);
  const lim = fundGroups(data, ctxOf(data, "s-lim"), "all");
  assert.deepEqual(lim.map((g) => g.funds.map((f) => f.fund.id)), [["telok-ayer", "meranti"]]);
  for (const id of PERSONAS) {
    const ctx = ctxOf(data, id);
    for (const group of fundGroups(data, ctx, "all")) {
      for (const item of group.funds) {
        assert.equal(item.exceptions, fundCalc(data, item.fund.id, ctx.now).exceptions, `${id} ${item.fund.id}`);
        assert.equal(item.status, item.fund.status);
      }
    }
  }
});

test("fundGroups follows the workflow: a submitted fund is listed as in review", { skip: skipUnlessReady("SG") }, () => {
  const data = frozenSeed();
  const next = chain(data, [["w-l-teo", { type: "submit", fundId: "kallang" }]]);
  const sg = fundGroups(next, ctxOf(next, "w-l-teo"), "SG")[0];
  assert.deepEqual(sg.funds.map((f) => [f.fund.id, f.status]), [
    ["telok-ayer", "Preparing"],
    ["loyang", "Signed off"],
    ["meranti", "In review"],
    ["kallang", "In review"],
  ]);
});

// ---------------------------------------------------------------------------------------------------- one fund

test("getFund finds a fund by id and refuses an unknown one with a clear message", () => {
  const data = frozenSeed();
  assert.equal(getFund(data, "kallang"), data.funds.find((f) => f.id === "kallang"));
  assert.throws(
    () => getFund(data, "ghost"),
    (error: unknown) => error instanceof Error && error.message === "Unknown fund: ghost",
  );
});

test("fundCalc: the calculation of the fund's own market", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const au = fundCalc(data, "southbank", NOW);
  assert.deepEqual([au.fundId, au.market, au.currency], ["southbank", "AU", "AUD"]);
  assert.equal(au.exceptions, 2);
  const sg = fundCalc(data, "telok-ayer", NOW);
  assert.deepEqual([sg.fundId, sg.market, sg.currency], ["telok-ayer", "SG", "SGD"]);
  for (const id of ALL_FUNDS) {
    const calc = fundCalc(data, id, NOW);
    assert.equal(calc.exceptions, calc.checks.filter((c) => c.severity === "exception").length, `${id}: exceptions are the checks with severity exception`);
  }
  assert.throws(() => fundCalc(data, "ghost", NOW), /Unknown fund: ghost/);
});

test("fundCalc is calculated once per data, fund and day, and again when any of them changes", { skip: skipUnlessReady("AU") }, () => {
  const data = frozenSeed();
  const first = fundCalc(data, "coastline", NOW);
  assert.equal(fundCalc(data, "coastline", NOW), first, "same data, fund and day");
  assert.equal(fundCalc(data, "coastline", new Date(2026, 9, 13, 23, 59, 59)), first, "later the same day");
  assert.notEqual(fundCalc(data, "coastline", new Date(2026, 9, 14, 0, 0, 1)), first, "the next day");
  assert.notEqual(fundCalc(data, "southbank", NOW), first, "another fund");
  const edited = ok(data, "r-okafor", { type: "update-inputs", fundId: "coastline", inputs: { cashDistribution: 2000000000 } });
  const recalculated = fundCalc(edited, "coastline", NOW);
  assert.notEqual(recalculated, first, "edited data");
  assert.equal(recalculated.cash, 2000000000);
  assert.equal(first.cash, 2104800000, "the calculation of the old data is untouched");
});

test("queriesFor lists a fund's queries newest first and nothing for a fund without any", () => {
  const data = frozenSeed();
  assert.deepEqual(queriesFor(data, "kurrajong").map((q) => q.id), ["q-2", "q-1"]);
  assert.deepEqual(queriesFor(data, "southbank").map((q) => q.id), ["q-3"]);
  assert.deepEqual(queriesFor(data, "meranti").map((q) => q.id), ["q-4"]);
  assert.deepEqual(queriesFor(data, "harbourline"), []);
  assert.deepEqual(queriesFor(data, "ghost"), []);
  for (const id of ALL_FUNDS) {
    const stamps = queriesFor(data, id).map((q) => q.raisedAt);
    assert.deepEqual(stamps, [...stamps].sort().reverse(), id);
  }
});

test("queriesFor: queries raised at the same moment come latest first", () => {
  const data = frozenSeed();
  const next = chain(data, [
    ["n-pillai", { type: "raise-query", fundId: "kallang", subject: "Payout", message: "First." }],
    ["n-pillai", { type: "raise-query", fundId: "kallang", subject: "Withholding", message: "Second." }],
  ]);
  assert.deepEqual(queriesFor(next, "kallang").map((q) => [q.id, q.subject]), [
    ["q-6", "Withholding"],
    ["q-5", "Payout"],
  ]);
});

test("auditFor lists a fund's trail newest first and nothing for an unknown fund", () => {
  const data = frozenSeed();
  assert.deepEqual(auditFor(data, "harbourline").map((a) => a.id), ["a-03", "a-02c", "a-02b", "a-02", "a-01"]);
  assert.deepEqual(auditFor(data, "ghost"), []);
  let total = 0;
  for (const id of ALL_FUNDS) {
    const trail = auditFor(data, id);
    total += trail.length;
    assert.ok(trail.every((a) => a.fundId === id));
    const stamps = trail.map((a) => a.at);
    assert.deepEqual(stamps, [...stamps].sort().reverse(), id);
  }
  assert.equal(total, data.audit.length, "every entry belongs to exactly one fund");
});

test("auditFor: entries made at the same moment come latest first", () => {
  const data = frozenSeed();
  const next = chain(data, [
    ["w-l-teo", { type: "submit", fundId: "kallang" }],
    ["n-pillai", { type: "approve", fundId: "kallang", level: "review" }],
    ["a-moreno", { type: "sign-off", fundId: "kallang" }],
  ]);
  const newest = auditFor(next, "kallang").slice(0, 3);
  assert.deepEqual(newest.map((a) => [a.action, a.actor, a.at]), [
    ["Signed off", "A. Moreno", NOW_STAMP],
    ["Approved — reviewer", "N. Pillai", NOW_STAMP],
    ["Submitted for review", "W. L. Teo", NOW_STAMP],
  ]);
});

test("queriesFor and auditFor hand out new lists: sorting or trimming them cannot touch the data", () => {
  const data = frozenSeed();
  const queries = queriesFor(data, "kurrajong");
  const trail = auditFor(data, "harbourline");
  queries.pop();
  trail.reverse();
  trail.length = 0;
  assert.equal(queriesFor(data, "kurrajong").length, 2);
  assert.equal(auditFor(data, "harbourline").length, 5);
});

// ---------------------------------------------------------------------------------------------------- views handed to the market modules

const MARKET_VIEWS = [
  { id: "southbank", market: "AU", rules: "Rules applied to Australian AMITs", doc: "AMIT member annual statement", returns: "Tax return lodgment" },
  { id: "telok-ayer", market: "SG", rules: "Rules applied to S-REITs", doc: "Unitholder distribution statement", returns: "Form UT filing" },
] as const;

for (const spec of MARKET_VIEWS) {
  test(`views of ${spec.id} come from the ${spec.market} module`, { skip: skipUnlessReady(spec.market) }, () => {
    const data = frozenSeed();
    const ctx = ctxOf(data, "a-moreno");
    const fund = fundOf(data, spec.id);
    const module = moduleFor(spec.market);
    const calc = fundCalc(data, spec.id, NOW);
    const holder = data.holders.find((h) => h.fundId === spec.id);
    assert.ok(holder);

    const rules = rulesFor(fund);
    assert.deepEqual(rules, module.rules(fund));
    assert.ok(rules.title.startsWith(spec.rules), rules.title);
    assert.ok(rules.rows.length > 0 && rules.rows.every((r) => r.item && r.treatment && r.basis));

    const tb = tbView(data, spec.id, NOW);
    assert.deepEqual(tb, module.tbView(data, fund, NOW));
    assert.equal(tb.fundId, spec.id);

    const doc = statementDoc(data, spec.id, holder.id, NOW);
    assert.deepEqual(doc, module.statementDoc(data, fund, calc, holder.id));
    assert.equal(doc.title, spec.doc);

    const returns = returnView(data, spec.id, ctx);
    assert.deepEqual(returns, module.returnView(data, fund, calc, ctx));
    assert.equal(returns.title, spec.returns);

    const investor = investorView(data, spec.id, ctx);
    assert.deepEqual(investor, module.investorView(data, fund, calc, ctx));
    assert.equal(investor.market, spec.market);

    const costBase = costBaseView(data, spec.id, ctx);
    assert.deepEqual(costBase, module.costBaseView(data, fund, calc));
    assert.equal(costBase.market, spec.market);
  });
}

test("investorView passes the selected notice on, and costBaseView the investor type, to the Australian module", { skip: skipUnlessReady("AU") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  const investor = investorView(data, "southbank", ctx, "southbank-2025-12-31");
  assert.equal(investor.market, "AU");
  if (investor.market === "AU") {
    assert.equal(investor.selectedNoticeId, "southbank-2025-12-31");
    assert.ok(investor.noticeDoc);
  }
  const base = costBaseView(data, "southbank", ctx);
  assert.ok(base.deferredTax);
  const other = base.deferredTax.investors.find((i) => i.id !== base.deferredTax?.selected);
  assert.ok(other);
  const chosen = costBaseView(data, "southbank", ctx, other.id);
  assert.equal(chosen.deferredTax?.selected, other.id);
});

test("every fund view refuses an unknown fund id", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  const calls: Array<[string, () => unknown]> = [
    ["fundCalc", () => fundCalc(data, "ghost", NOW)],
    ["workflowView", () => workflowView(data, "ghost", ctx)],
    ["tbView", () => tbView(data, "ghost", NOW)],
    ["statementDoc", () => statementDoc(data, "ghost", "h-1", NOW)],
    ["returnView", () => returnView(data, "ghost", ctx)],
    ["investorView", () => investorView(data, "ghost", ctx)],
    ["costBaseView", () => costBaseView(data, "ghost", ctx)],
    ["scenarioView", () => scenarioView(data, "ghost", ctx)],
  ];
  for (const [name, call] of calls) assert.throws(call, /Unknown fund: ghost/, name);
});

// ---------------------------------------------------------------------------------------------------- purity

test("selectors read frozen data for every persona and jurisdiction without changing it", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const before = JSON.stringify(data);
  for (const id of PERSONAS) {
    const ctx = ctxOf(data, id);
    for (const jurisdiction of JURISDICTIONS) {
      visibleFunds(data, ctx.user, jurisdiction);
      fundGroups(data, ctx, jurisdiction);
      bulkRows(data, ctx, jurisdiction);
      analyticsView(data, ctx, jurisdiction);
      workbookModel(data, ctx, jurisdiction);
    }
    for (const fund of visibleFunds(data, ctx.user, "all")) {
      workflowView(data, fund.id, ctx);
      returnView(data, fund.id, ctx);
      investorView(data, fund.id, ctx);
      costBaseView(data, fund.id, ctx);
      tbView(data, fund.id, NOW);
      queriesFor(data, fund.id);
      auditFor(data, fund.id);
    }
  }
  assert.equal(JSON.stringify(data), before);
});

test("asking twice gives equal answers", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  assert.deepEqual(fundGroups(data, ctx, "all"), fundGroups(data, ctx, "all"));
  assert.deepEqual(bulkRows(data, ctx, "all"), bulkRows(data, ctx, "all"));
  assert.deepEqual(analyticsView(data, ctx, "all"), analyticsView(data, ctx, "all"));
  assert.deepEqual(workbookModel(data, ctx, "all"), workbookModel(data, ctx, "all"));
  assert.deepEqual(workflowView(data, "southbank", ctx), workflowView(data, "southbank", ctx));
});

// ---------------------------------------------------------------------------------------------------- workbook

type Sheet = WorkbookModel["sheets"][number];
type Cell = string | number;

const SHEET_NAMES = ["Funds", "Components", "Holders", "Leakage", "Mix", "Deadlines", "Checks", "Workflow"];

function sheetOf(model: WorkbookModel, name: string): Sheet {
  const sheet = model.sheets.find((s) => s.name === name);
  assert.ok(sheet, `no sheet ${name}`);
  return sheet;
}

/** The rows of a sheet keyed by their column headers. */
function records(model: WorkbookModel, name: string): Array<Record<string, Cell>> {
  const sheet = sheetOf(model, name);
  return sheet.rows.map((row) => Object.fromEntries(sheet.columns.map((column, i) => [column, row[i]])));
}

const num = (value: Cell | undefined): number => {
  assert.equal(typeof value, "number");
  return value as number;
};
const dollars = (cents: number): number => Math.round(cents) / 100;

test("workbookModel: eight sheets, in a fixed order, named for what they hold", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const model = workbookModel(data, ctxOf(data, "a-moreno"), "all");
  assert.deepEqual(model.sheets.map((s) => s.name), SHEET_NAMES);
  assert.equal(model.fileName, "property-fund-tax-compliance-portfolio.xlsx");
});

test("workbookModel: the file name follows the jurisdiction toggle, not the persona", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  assert.equal(workbookModel(data, ctxOf(data, "a-moreno"), "AU").fileName, "property-fund-tax-compliance-portfolio-au.xlsx");
  assert.equal(workbookModel(data, ctxOf(data, "a-moreno"), "SG").fileName, "property-fund-tax-compliance-portfolio-sg.xlsx");
  assert.equal(workbookModel(data, ctxOf(data, "n-pillai"), "all").fileName, "property-fund-tax-compliance-portfolio.xlsx");
});

test("workbookModel: every row is as wide as its header and every cell is plain text or a finite number", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  for (const id of PERSONAS) {
    for (const jurisdiction of JURISDICTIONS) {
      const model = workbookModel(data, ctxOf(data, id), jurisdiction);
      for (const sheet of model.sheets) {
        const where = `${id} / ${jurisdiction} / ${sheet.name}`;
        assert.ok(sheet.columns.length > 0, where);
        assert.ok(sheet.columns.every((c) => typeof c === "string" && c.trim() !== ""), `${where}: headers`);
        assert.equal(new Set(sheet.columns).size, sheet.columns.length, `${where}: headers are unique`);
        for (const row of sheet.rows) {
          assert.equal(row.length, sheet.columns.length, `${where}: width`);
          for (const cell of row) {
            assert.ok(typeof cell === "string" || (typeof cell === "number" && Number.isFinite(cell)), `${where}: ${String(cell)}`);
          }
        }
      }
    }
  }
});

test("workbookModel: the same headers for everyone, and only the funds the persona can see", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const reference = workbookModel(data, ctxOf(data, "a-moreno"), "all").sheets.map((s) => s.columns);
  for (const id of PERSONAS) {
    for (const jurisdiction of JURISDICTIONS) {
      const model = workbookModel(data, ctxOf(data, id), jurisdiction);
      assert.deepEqual(model.sheets.map((s) => s.columns), reference, `${id} / ${jurisdiction}`);
      const expected = REACH[id].filter((fundId) => inJurisdiction(fundId, jurisdiction));
      for (const name of ["Funds", "Leakage", "Mix", "Workflow"]) {
        assert.deepEqual(records(model, name).map((r) => r["Fund ID"]), expected, `${id} / ${jurisdiction} / ${name}`);
      }
      for (const name of ["Components", "Holders", "Deadlines", "Checks"]) {
        const ids = new Set(records(model, name).map((r) => r["Fund ID"]));
        for (const fundId of ids) assert.ok(expected.includes(fundId as string), `${id} / ${jurisdiction} / ${name}: ${fundId}`);
      }
    }
  }
  const empty = workbookModel(data, ctxOf(data, "l-brennan"), "SG");
  assert.deepEqual(empty.sheets.map((s) => s.rows.length), [0, 0, 0, 0, 0, 0, 0, 0]);
});

test("workbookModel: the Funds sheet states each fund's position in plain numbers (dollars, not cents)", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  const model = workbookModel(data, ctx, "all");
  const rows = records(model, "Funds");
  assert.equal(rows.length, data.funds.length);
  for (const row of rows) {
    const fund = fundOf(data, row["Fund ID"] as string);
    const calc = fundCalc(data, fund.id, ctx.now);
    const where = fund.id;
    assert.equal(row["Fund"], fund.name, where);
    assert.equal(row["Market"], fund.market, where);
    assert.equal(row["Currency"], fund.currency, where);
    assert.equal(row["Workflow status"], fund.status, where);
    assert.equal(row["Governance"], GOVERNANCE[fund.governance].label, where);
    assert.equal(row["Units on issue"], fund.unitsOnIssue, where);
    assert.equal(row["Units on register"], calc.registerUnits, where);
    assert.equal(row["Cash distribution"], dollars(calc.cash), where);
    assert.equal(row["Characterised total"], dollars(calc.characterTotal), where);
    assert.equal(row["Withholding computed"], dollars(calc.recon.computed), where);
    assert.equal(row["Exceptions"], calc.exceptions, where);
    assert.equal(row["Open queries"], data.queries.filter((q) => q.fundId === fund.id && q.status === "open").length, where);
    assert.match(String(row["Period start"]), /^\d{4}-\d{2}-\d{2}$/, where);
    assert.match(String(row["Period end"]), /^\d{4}-\d{2}-\d{2}$/, where);
    assert.ok(["Yes", "No"].includes(String(row["Listed"])), where);
  }
  const southbank = rows.find((r) => r["Fund ID"] === "southbank");
  assert.equal(southbank?.["Cash distribution"], 47212000);
  assert.equal(southbank?.["Exceptions"], 2);
});

test("workbookModel: Components, Holders and Checks list every line of every calculation", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  const model = workbookModel(data, ctx, "all");
  const components = records(model, "Components");
  const holders = records(model, "Holders");
  const checks = records(model, "Checks");
  let componentCount = 0;
  let holderCount = 0;
  let checkCount = 0;
  for (const fund of data.funds) {
    const calc = fundCalc(data, fund.id, ctx.now);
    componentCount += calc.components.length;
    holderCount += calc.holders.length;
    checkCount += calc.checks.length;
    const mine = components.filter((r) => r["Fund ID"] === fund.id);
    assert.deepEqual(mine.map((r) => r["Component"]), calc.components.map((c) => c.label), `${fund.id}: components`);
    assert.deepEqual(mine.map((r) => r["Amount"]), calc.components.map((c) => dollars(c.amount)), `${fund.id}: amounts`);
    const people = holders.filter((r) => r["Fund ID"] === fund.id);
    assert.deepEqual(people.map((r) => r["Holder"]), calc.holders.map((h) => h.holder.holder), `${fund.id}: holders`);
    assert.deepEqual(people.map((r) => r["Units"]), calc.holders.map((h) => h.holder.units), `${fund.id}: units`);
    assert.deepEqual(people.map((r) => r["Withholding"]), calc.holders.map((h) => dollars(h.withheld)), `${fund.id}: withholding`);
    const notes = checks.filter((r) => r["Fund ID"] === fund.id);
    assert.equal(notes.filter((r) => r["Severity"] === "Exception").length, calc.exceptions, `${fund.id}: exceptions`);
    assert.deepEqual(notes.map((r) => r["Check"]), calc.checks.map((c) => c.title), `${fund.id}: checks`);
  }
  assert.equal(components.length, componentCount);
  assert.equal(holders.length, holderCount);
  assert.equal(checks.length, checkCount);
  assert.ok(components.length > 0 && holders.length > 0 && checks.length > 0);
});

test("workbookModel: Leakage, Mix and Deadlines carry the same numbers as the analytics view", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  const model = workbookModel(data, ctx, "all");
  const view = analyticsView(data, ctx, "all");
  const round2 = (value: number): number => Math.round(value * 100) / 100;

  const leakage = records(model, "Leakage");
  assert.deepEqual(leakage.map((r) => r["Fund ID"]), view.leakage.map((r) => r.fundId));
  assert.deepEqual(leakage.map((r) => r["Distribution"]), view.leakage.map((r) => dollars(r.distribution)));
  assert.deepEqual(leakage.map((r) => r["Final withholding"]), view.leakage.map((r) => dollars(r.finalWithholding)));
  assert.deepEqual(leakage.map((r) => r["Total leakage (%)"]), view.leakage.map((r) => round2(r.totalPct)));

  const mix = records(model, "Mix");
  assert.deepEqual(mix.map((r) => r["Fund ID"]), view.mix.map((r) => r.fundId));
  assert.deepEqual(mix.map((r) => r["Taxable income (%)"]), view.mix.map((r) => round2(r.taxable)));
  assert.deepEqual(mix.map((r) => r["Capital gains (%)"]), view.mix.map((r) => round2(r.capitalGains)));

  const deadlines = records(model, "Deadlines");
  assert.deepEqual(deadlines.map((r) => [r["Due date"], r["Fund ID"], r["Obligation"]]), view.deadlines.map((d) => [d.date, d.fundId, d.obligation]));
  assert.ok(deadlines.every((r) => ["Overdue", "Open", "Done"].includes(String(r["Status"]))));
  assert.equal(deadlines.filter((r) => r["Status"] === "Overdue").length, view.overdueCount);
  const dates = deadlines.map((r) => String(r["Due date"]));
  assert.deepEqual(dates, [...dates].sort());
});

test("workbookModel: the Workflow sheet says who approved, who signed off, and what is still open", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  const rows = records(workbookModel(data, ctx, "all"), "Workflow");
  const byFund = (id: string) => {
    const row = rows.find((r) => r["Fund ID"] === id);
    assert.ok(row, id);
    return row;
  };

  const harbourline = byFund("harbourline");
  assert.equal(harbourline["Workflow status"], "Signed off");
  assert.equal(harbourline["Reviewer approval"], "Done");
  assert.equal(harbourline["Tax agent approval"], "Done");
  assert.equal(harbourline["Tax agent approved by"], data.approvals.find((a) => a.fundId === "harbourline" && a.level === "agent")?.by);
  assert.equal(harbourline["Signed off by"], "A. Moreno");
  assert.equal(harbourline["Last activity"], "Signed off");

  const wattle = byFund("wattle");
  assert.equal(wattle["Tax agent approval"], "Not required");
  assert.equal(wattle["Tax agent approved by"], "");
  assert.equal(wattle["Lodgments recorded"], 2);

  const loyang = byFund("loyang");
  assert.equal(loyang["Signed off by"], "A. Moreno");
  assert.equal(loyang["Signed off at"], "2026-08-03T17:46:00");

  const kurrajong = byFund("kurrajong");
  assert.equal(kurrajong["Workflow status"], "In review");
  assert.equal(kurrajong["Reviewer approval"], "Pending");
  assert.equal(kurrajong["Signed off by"], "");
  assert.equal(kurrajong["Signed off at"], "");
  assert.equal(kurrajong["Open queries"], 2);
  assert.equal(kurrajong["Open exceptions"], 3);

  const kallang = byFund("kallang");
  assert.equal(kallang["Workflow status"], "Preparing");
  assert.equal(kallang["Lodgments recorded"], 0);
});

test("workbookModel follows the workflow through every sample state", { skip: skipUnlessReady("AU", "SG") }, () => {
  for (const [state, data] of sampleStates()) {
    const ctx = ctxOf(data, "a-moreno");
    const rows = records(workbookModel(data, ctx, "all"), "Workflow");
    assert.deepEqual(rows.map((r) => r["Fund ID"]), data.funds.map((f) => f.id), state);
    for (const row of rows) {
      const fund = fundOf(data, row["Fund ID"] as string);
      assert.equal(row["Workflow status"], fund.status, `${state}: ${fund.id}`);
      const approvedBy = (level: string) => data.approvals.find((a) => a.fundId === fund.id && a.level === level)?.by ?? "";
      assert.equal(row["Reviewer approved by"], GOVERNANCE[fund.governance].levels.includes("review") ? approvedBy("review") : "", `${state}: ${fund.id}`);
      assert.equal(row["Open queries"], data.queries.filter((q) => q.fundId === fund.id && q.status === "open").length, `${state}: ${fund.id}`);
      assert.equal(num(row["Open exceptions"]), fundCalc(data, fund.id, ctx.now).exceptions, `${state}: ${fund.id}`);
    }
  }
});

test("workbookModel hands out a fresh model each time", { skip: skipUnlessReady("AU", "SG") }, () => {
  const data = frozenSeed();
  const ctx = ctxOf(data, "a-moreno");
  const first = workbookModel(data, ctx, "all");
  first.sheets[0].rows.push(["scribble"]);
  first.sheets.length = 0;
  assert.equal(workbookModel(data, ctx, "all").sheets.length, 8);
  assert.equal(workbookModel(data, ctx, "all").sheets[0].rows.length, data.funds.length);
});

test("workbookModel never lets a failed division reach the file", { skip: skipUnlessReady("AU", "SG") }, () => {
  const base: AppData = frozenSeed();
  const data: AppData = {
    ...base,
    funds: base.funds.map((f) => (f.id === "telok-ayer" ? { ...f, unitsOnIssue: 0 } : f)),
  };
  const model = workbookModel(data, ctxOf(data, "a-moreno"), "SG");
  for (const sheet of model.sheets) {
    for (const row of sheet.rows) for (const cell of row) assert.ok(typeof cell === "string" || Number.isFinite(cell), `${sheet.name}: ${String(cell)}`);
  }
});
