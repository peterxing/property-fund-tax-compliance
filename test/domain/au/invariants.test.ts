// Arithmetic invariants of the Australian distribution calculation, on the five seeded funds and on randomised funds: nothing is lost or
// invented between components, holders, destinations and the Sankey; money stays in whole cents; the module is pure.
import assert from "node:assert/strict";
import { test } from "node:test";
import { auModule } from "../../../src/domain/au/index.ts";
import type { AppData, AuHolder, FundCalc } from "../../../src/domain/types.ts";
import { allNumbers, allStrings, AU_IDS, auFund, calcFor, ctxFor, deepFreeze, freshData, NOW, snapshot, sum } from "./helpers.ts";

const isRegisterHolder = (h: unknown): h is AuHolder => typeof h === "object" && h !== null && "auStatus" in h;

/** Every identity that must hold for any Australian fund, whatever its inputs and register. */
function assertInvariants(calc: FundCalc, label: string): void {
  const at = (what: string): string => `${label}: ${what}`;
  const byKey = new Map(calc.components.map((c) => [c.key, c]));

  for (const c of calc.components) {
    for (const v of [c.amount, c.toGross, c.toNet, c.withheld, c.unallocated]) assert.ok(Number.isInteger(v), at(`${c.key} is whole cents`));
    assert.ok(c.amount >= 0, at(`${c.key} is not negative`));
    assert.equal(c.toGross + c.toNet + c.withheld + c.unallocated, c.amount, at(`${c.key} splits exactly between destinations`));
  }
  assert.equal(sum(calc.components.map((c) => c.amount)), calc.characterTotal, at("components add up to the character total"));
  assert.equal(sum(calc.components.map((c) => c.withheld)), calc.withheld, at("component withholding adds up"));
  assert.equal(sum(calc.holders.map((h) => h.withheld)), calc.withheld, at("holder withholding adds up"));
  assert.equal(calc.recon.computed, calc.withheld, at("the reconciliation starts from the computed withholding"));
  assert.equal(calc.exceptions, calc.checks.filter((c) => c.severity === "exception").length, at("exceptions are counted from the checks"));

  // The holders' cells partition every component together with the units that are not on the register.
  for (const [key, c] of byKey) {
    const cells = calc.holders.map((h) => h.lines.find((l) => l.key === key));
    assert.ok(cells.every((l) => l !== undefined), at(`every holder has a ${key} line`));
    assert.equal(sum(cells.map((l) => l?.amount ?? 0)) + c.unallocated, c.amount, at(`${key} cells and unallocated add up`));
    assert.equal(sum(cells.map((l) => l?.withheld ?? 0)), c.withheld, at(`${key} cell withholding adds up`));
  }
  // The residents/foreign split of each component comes from the same cells.
  for (const [key, c] of byKey) {
    let gross = 0;
    let net = 0;
    for (const h of calc.holders) {
      const cell = h.lines.find((l) => l.key === key);
      if (!cell) continue;
      if (h.group === "gross") gross += cell.amount;
      else net += cell.amount - cell.withheld;
    }
    assert.equal(c.toGross, gross, at(`${key} to residents`));
    assert.equal(c.toNet, net, at(`${key} to foreign investors`));
  }
  for (const h of calc.holders) {
    assert.equal(h.net, h.cash - h.withheld, at(`${h.holder.id} net`));
    assert.equal(h.group, (h.holder as AuHolder).auStatus === "resident" ? "gross" : "net", at(`${h.holder.id} group`));
    assert.ok(h.withheld >= 0 && h.cash >= 0, at(`${h.holder.id} amounts are not negative`));
    assert.equal(sum(h.withholdingParts.map((p) => p.amount)), h.withheld, at(`${h.holder.id} withholding parts add up`));
    for (const l of h.lines) assert.ok(l.rate >= 0 && l.rate <= 1, at(`${h.holder.id} ${l.key} rate`));
  }
  // The holders' cash is the cash distribution scaled by the share of units on the register.
  const den = calc.registerUnits + calc.unallocatedUnits;
  assert.ok(Math.abs(sum(calc.holders.map((h) => h.cash)) - (calc.cash * calc.registerUnits) / (den || 1)) <= calc.holders.length + 1, at("holder cash is the register's share of the cash"));

  // The Sankey carries the same figures.
  const { sources, targets, links } = calc.sankey;
  assert.equal(sum(sources.map((s) => s.value)), calc.characterTotal, at("sankey sources"));
  assert.equal(sum(targets.map((t) => t.value)), calc.characterTotal, at("sankey targets"));
  for (const s of sources) assert.equal(sum(links.filter((l) => l.source === s.key).map((l) => l.value)), s.value, at(`sankey source ${s.key}`));
  for (const t of targets) assert.equal(sum(links.filter((l) => l.target === t.key).map((l) => l.value)), t.value, at(`sankey target ${t.key}`));

  for (const n of allNumbers(calc)) {
    assert.ok(Number.isFinite(n), at("no NaN or Infinity"));
    assert.ok(!Object.is(n, -0), at("no negative zero"));
  }
}

/** Every view the module can produce for a fund, so a check can sweep all of them. */
function everyView(data: AppData, id: string): unknown {
  const fund = auFund(data, id);
  const ctx = ctxFor(data);
  const calc = auModule.fundCalc(data, fund, NOW);
  const investor = auModule.investorView(data, fund, calc, ctx);
  return {
    calc,
    tb: auModule.tbView(data, fund, NOW),
    ret: auModule.returnView(data, fund, calc, ctx),
    investor,
    investorEachNotice: investor.market === "AU" ? investor.notices.map((n) => auModule.investorView(data, fund, calc, ctx, n.id)) : [],
    cost: (["foreign-eoi", "foreign-non-eoi", "complying-super", "company"] as const).map((t) => auModule.costBaseView(data, fund, calc, t)),
    statements: data.holders.filter((h) => h.fundId === id).map((h) => auModule.statementDoc(data, fund, calc, h.id)),
    rules: auModule.rules(fund),
    deadlines: auModule.deadlines(data, fund, calc, NOW),
    leakage: auModule.leakage(fund, calc),
    mix: auModule.mix(fund, calc),
    scenarios: [auModule.scenario(data, fund, calc), auModule.scenario(data, fund, calc, 100_000_000), auModule.scenario(data, fund, calc, 0)],
  };
}

function assertCleanViews(views: unknown, label: string): void {
  for (const n of allNumbers(views)) {
    assert.ok(Number.isFinite(n), `${label}: finite numbers only`);
    assert.ok(!Object.is(n, -0), `${label}: no negative zero`);
  }
  for (const s of allStrings(views)) assert.ok(!/NaN|undefined|Infinity|\[object/.test(s), `${label}: no placeholder leaks into text: ${s}`);
}
test("the five seeded funds satisfy every allocation identity", () => {
  const data = freshData();
  for (const id of AU_IDS) assertInvariants(calcFor(data, id), id);
});

// ------------------------------------------------------------------------------------------------ randomised funds
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("randomised inputs, registers and holder classes keep every identity exact", () => {
  const rand = mulberry32(20261012);
  const statuses = ["resident", "foreign-eoi", "foreign-non-eoi"] as const;
  for (let i = 0; i < 400; i++) {
    const data = freshData();
    const fund = auFund(data, AU_IDS[Math.floor(rand() * AU_IDS.length)]);
    const amount = (): number => (rand() < 0.3 ? 0 : Math.floor(rand() * 3_000_000_000) + Math.floor(rand() * 100));
    const inputs = fund.inputs;
    inputs.ausOtherIncome = amount();
    inputs.ncmi = amount();
    inputs.excludedNcmi = amount();
    inputs.cleanBuilding = amount();
    inputs.interest = amount();
    inputs.discountGainTarp = amount();
    inputs.otherGainTarp = amount();
    inputs.foreignIncome = amount();
    inputs.cashDistribution = Math.floor(rand() * 8_000_000_000);

    const holders = data.holders.filter((h): h is AuHolder => h.fundId === fund.id && isRegisterHolder(h));
    const weights = holders.map(() => rand() + 0.01);
    const totalUnits = Math.floor(fund.unitsOnIssue * (0.4 + rand() * 1.2));
    const weightSum = sum(weights);
    holders.forEach((h, k) => {
      h.units = Math.floor((totalUnits * weights[k]) / weightSum) + (rand() < 0.5 ? 1 : 0);
      h.auStatus = statuses[Math.floor(rand() * 3)];
    });
    if (rand() < 0.1) fund.whtRemitted = Math.floor(rand() * 1_000_000_000);

    assertInvariants(auModule.fundCalc(data, fund, NOW), `${fund.id} #${i}`);
    if (i % 10 === 0) assertCleanViews(everyView(data, fund.id), `${fund.id} #${i}`);
  }
});

test("holders with no units get a zero line, not a division by zero", () => {
  const data = freshData();
  const holder = data.holders.find((h): h is AuHolder => h.id === "h-hl-3" && isRegisterHolder(h));
  assert.ok(holder);
  holder.units = 0;
  const calc = calcFor(data, "harbourline");
  const line = calc.holders.find((h) => h.holder.id === "h-hl-3");
  assert.ok(line);
  assert.equal(line.cash, 0);
  assert.equal(line.withheld, 0);
  assert.equal(calc.unallocatedUnits, 211_902_000);
  assertInvariants(calc, "harbourline with an empty holder");
});

// ------------------------------------------------------------------------------------------------ purity
test("the module is pure: frozen data in, identical views out, and nothing is mutated", () => {
  const data = deepFreeze(freshData());
  for (const id of AU_IDS) {
    const first = everyView(data, id);
    const second = everyView(data, id);
    assert.equal(snapshot(first), snapshot(second), `${id}: repeated calls give identical views`);
    assertCleanViews(first, id);
  }
});
test("a returned view can be edited by the caller without changing what the next call returns", () => {
  const data = freshData();
  const fund = auFund(data, "harbourline");
  const calc = auModule.fundCalc(data, fund, NOW);
  const before = snapshot(auModule.fundCalc(data, fund, NOW));
  calc.components[0].amount = 1;
  calc.holders.length = 0;
  const rules = auModule.rules(fund);
  rules.rows.length = 0;
  assert.equal(snapshot(auModule.fundCalc(data, fund, NOW)), before);
  assert.equal(auModule.rules(fund).rows.length, 13);
});

// ------------------------------------------------------------------------------------------------ the ATO's names
test("no view uses the retired names for the AMIT CGT gross-up amount or the non-attributable amount", () => {
  const data = freshData();
  let checked = 0;
  for (const id of AU_IDS) {
    for (const text of allStrings(everyView(data, id))) {
      assert.ok(!/CGT concession/i.test(text), `${id}: "${text}"`);
      assert.ok(!text.includes("Tax deferred"), `${id}: "${text}"`);
      checked += 1;
    }
  }
  assert.ok(checked > 5000, `${checked} strings swept`);
});
