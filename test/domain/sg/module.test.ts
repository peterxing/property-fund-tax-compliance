// Module-wide guarantees for the Singapore module: the MarketModule shape, purity (frozen data in, identical output out, data untouched),
// clean output on every fund and role, safe handling of degenerate funds, and refusal of a fund from the other market.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sgModule } from "../../../src/domain/sg/index.ts";
import type { AppData, SgFund } from "../../../src/domain/types.ts";
import { calcFor, ctxFor, deepFreeze, freshData, NOW, sgFund, SG_IDS, snapshot } from "./helpers.ts";

const METHODS = [
  "costBaseView",
  "deadlines",
  "fundCalc",
  "investorView",
  "leakage",
  "mix",
  "returnView",
  "rules",
  "scenario",
  "statementDoc",
  "tbView",
];

const BAD_TEXT = /\bNaN\b|\bundefined\b|\bnull\b|\[object Object\]|\bInfinity\b/;

/** Every view the module produces for one fund, as one role sees it. */
function outputsFor(data: AppData, fund: SgFund, userId: string, now: Date = NOW) {
  const ctx = ctxFor(data, userId, now);
  const calc = sgModule.fundCalc(data, fund, now);
  const noticeIds = data.sgNotices.filter((n) => n.fundId === fund.id).map((n) => n.id);
  return {
    calc,
    tb: sgModule.tbView(data, fund, now),
    returns: sgModule.returnView(data, fund, calc, ctx),
    investors: [null, ...noticeIds, "no-such-notice"].map((id) => sgModule.investorView(data, fund, calc, ctx, id)),
    costBase: sgModule.costBaseView(data, fund, calc),
    statements: [...data.holders.filter((h) => h.fundId === fund.id).map((h) => h.id), "h-not-on-register"].map((id) =>
      sgModule.statementDoc(data, fund, calc, id),
    ),
    rules: sgModule.rules(fund),
    deadlines: sgModule.deadlines(data, fund, calc, now),
    leakage: sgModule.leakage(fund, calc),
    mix: sgModule.mix(fund, calc),
    scenarios: [undefined, 0, 85, 90, 100, 250].map((value) => sgModule.scenario(data, fund, calc, value)),
  };
}

/** Walks a view model and reports numbers that are not finite (or are negative zero) and text that would show a JavaScript artefact. */
function problemsIn(value: unknown, path: string, found: string[] = []): string[] {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) found.push(`${path} = ${value}`);
    else if (Object.is(value, -0)) found.push(`${path} = -0`);
  } else if (typeof value === "string") {
    if (BAD_TEXT.test(value)) found.push(`${path} = "${value}"`);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => problemsIn(item, `${path}[${i}]`, found));
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) problemsIn(child, `${path}.${key}`, found);
  }
  return found;
}

// ------------------------------------------------------------------------------------------------------------------------ shape
test("the Singapore module serves the SG market with exactly the eleven MarketModule functions", () => {
  assert.equal(sgModule.market, "SG");
  const functions = Object.entries(sgModule)
    .filter(([, member]) => typeof member === "function")
    .map(([name]) => name)
    .sort();
  assert.deepEqual(functions, METHODS);
  assert.deepEqual(Object.keys(sgModule).sort(), [...METHODS, "market"].sort());
});

// ------------------------------------------------------------------------------------------------------------------------ purity
test("every function runs on deep-frozen data for every fund and role, and repeating a call gives the same answer", () => {
  const frozen = deepFreeze(freshData());
  for (const id of SG_IDS) {
    const fund = sgFund(frozen, id);
    for (const user of frozen.users) {
      const first = snapshot(outputsFor(frozen, fund, user.id));
      const second = snapshot(outputsFor(frozen, fund, user.id));
      assert.equal(first, second, `${id} as ${user.id}`);
    }
  }
});

test("nothing the module does changes the data it is given", () => {
  const data = freshData();
  const pristine = snapshot(data);
  for (const id of SG_IDS) {
    for (const user of data.users) outputsFor(data, sgFund(data, id), user.id);
  }
  assert.equal(snapshot(data), pristine);
});

test("the answers depend on the data and the date passed in, not on the clock or on earlier calls", () => {
  const data = freshData();
  const fund = sgFund(data, "loyang");
  const before = snapshot(outputsFor(data, fund, "a-moreno", NOW));
  // A call for another fund, another role and another date in between leaves the original answers alone.
  outputsFor(data, sgFund(data, "kallang"), "s-lim", new Date(2027, 3, 20, 9, 0, 0));
  assert.equal(snapshot(outputsFor(data, fund, "a-moreno", NOW)), before);
  const later = outputsFor(data, fund, "a-moreno", new Date(2031, 0, 5, 9, 0, 0));
  assert.notEqual(snapshot(later.deadlines), snapshot(outputsFor(data, fund, "a-moreno", NOW).deadlines));
});

// ------------------------------------------------------------------------------------------------------------------------ clean output
test("no view for any fund or role carries a non-finite number, negative zero or a JavaScript artefact in its text", () => {
  const data = freshData();
  const found: string[] = [];
  for (const id of SG_IDS) {
    for (const user of data.users) problemsIn(outputsFor(data, sgFund(data, id), user.id), `${id}/${user.id}`, found);
  }
  assert.deepEqual(found, []);
});

test("every statement is a document with content and a PDF file name", () => {
  const data = freshData();
  for (const id of SG_IDS) {
    for (const doc of outputsFor(data, sgFund(data, id), "a-moreno").statements) {
      assert.ok(doc.blocks.length > 0, `${id}: ${doc.title}`);
      assert.ok(doc.title.length > 0);
      assert.match(doc.fileName, /^[a-z0-9]+(-[a-z0-9]+)*\.pdf$/, `${id}: ${doc.fileName}`);
    }
  }
});

// ------------------------------------------------------------------------------------------------------------------------ degenerate funds
type Mutation = (data: AppData, fund: SgFund) => void;

const removeHolders: Mutation = (data, fund) => {
  data.holders = data.holders.filter((h) => h.fundId !== fund.id);
};
const removeTrialBalance: Mutation = (data, fund) => {
  data.tbRows = data.tbRows.filter((r) => r.fundId !== fund.id);
};
const removeRecords: Mutation = (data, fund) => {
  data.sgNotices = data.sgNotices.filter((n) => n.fundId !== fund.id);
  data.lodgments = data.lodgments.filter((l) => l.fundId !== fund.id);
  data.approvals = data.approvals.filter((a) => a.fundId !== fund.id);
  data.queries = data.queries.filter((q) => q.fundId !== fund.id);
};
const removeSideTables: Mutation = (data, fund) => {
  delete data.unitCostBase[fund.id];
  delete data.taxAdjustments[fund.id];
  delete data.sgLedger[fund.id];
  data.properties = data.properties.filter((p) => p.fundId !== fund.id);
};
const zeroNumbers: Mutation = (_data, fund) => {
  fund.unitsOnIssue = 0;
  fund.inputs = { taxableSpecifiedIncome: 0, taxableDistributed: 0, taxExemptDistribution: 0, capitalDistribution: 0 };
  fund.whtRemitted = 0;
};

const DEGENERATE: Array<[string, Mutation[]]> = [
  ["no unitholders on the register", [removeHolders]],
  ["no trial balance", [removeTrialBalance]],
  ["no notice, lodgments, approvals or queries", [removeRecords]],
  ["no cost base, adjustments, ledger or properties", [removeSideTables]],
  ["zero units on issue and zero distribution inputs", [zeroNumbers]],
  ["nothing at all", [removeHolders, removeTrialBalance, removeRecords, removeSideTables, zeroNumbers]],
];

for (const [label, mutations] of DEGENERATE) {
  test(`a fund with ${label} still produces every view, without a bad number or text`, () => {
    for (const id of SG_IDS) {
      const data = freshData();
      const fund = sgFund(data, id);
      for (const mutate of mutations) mutate(data, fund);
      const found: string[] = [];
      for (const user of data.users) problemsIn(outputsFor(data, fund, user.id), `${id}/${user.id}`, found);
      assert.deepEqual(found, [], `${id}`);
    }
  });
}

test("a fund with nothing at all reports nothing to distribute, nothing withheld and nothing outstanding", () => {
  for (const id of SG_IDS) {
    const data = freshData();
    const fund = sgFund(data, id);
    for (const mutate of [removeHolders, removeTrialBalance, removeRecords, removeSideTables, zeroNumbers]) mutate(data, fund);
    const out = outputsFor(data, fund, "a-moreno");
    assert.equal(out.calc.holders.length, 0, id);
    assert.equal(out.calc.withheld, 0, id);
    assert.equal(out.leakage.totalPct, 0, id);
    assert.ok(out.deadlines.length > 0, id);
    assert.ok(out.returns.items.length > 0, id);
  }
});

test("a fund that distributes more than it has, or with a negative position, still produces finite views", () => {
  for (const id of SG_IDS) {
    for (const factor of [3, -1]) {
      const data = freshData();
      const fund = sgFund(data, id);
      const scaled = (n: number) => (n === 0 ? 0 : n * factor);
      fund.inputs = {
        taxableSpecifiedIncome: scaled(fund.inputs.taxableSpecifiedIncome),
        taxableDistributed: scaled(fund.inputs.taxableDistributed),
        taxExemptDistribution: scaled(fund.inputs.taxExemptDistribution),
        capitalDistribution: scaled(fund.inputs.capitalDistribution),
      };
      const found: string[] = [];
      for (const user of data.users) problemsIn(outputsFor(data, fund, user.id), `${id}/x${factor}/${user.id}`, found);
      assert.deepEqual(found, [], `${id} x${factor}`);
    }
  }
});

// ------------------------------------------------------------------------------------------------------------------------ other market
test("every function refuses a fund from the other market", () => {
  const data = freshData();
  const au = data.funds.find((f) => f.market === "AU");
  assert.ok(au, "the seed has an AU fund");
  const calc = calcFor(data, "loyang");
  const ctx = ctxFor(data);
  const calls: Array<() => unknown> = [
    () => sgModule.fundCalc(data, au, NOW),
    () => sgModule.tbView(data, au, NOW),
    () => sgModule.returnView(data, au, calc, ctx),
    () => sgModule.investorView(data, au, calc, ctx, null),
    () => sgModule.costBaseView(data, au, calc),
    () => sgModule.statementDoc(data, au, calc, "h-ly-1"),
    () => sgModule.rules(au),
    () => sgModule.deadlines(data, au, calc, NOW),
    () => sgModule.leakage(au, calc),
    () => sgModule.mix(au, calc),
    () => sgModule.scenario(data, au, calc, 85),
  ];
  assert.equal(calls.length, METHODS.length);
  for (const call of calls) assert.throws(call, /Singapore module/);
});
