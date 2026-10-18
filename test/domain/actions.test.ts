import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../../src/domain/actions.ts";
import { moduleFor } from "../../src/domain/modules.ts";
import { investorView, tbView } from "../../src/domain/selectors.ts";
import type { Action, AppData } from "../../src/domain/types.ts";
import { NOW, NOW_STAMP, TODAY, chain, ctxOf, deepFreeze, denied, frozenSeed, fundOf, ok, seed, skipUnlessReady } from "./core-fixtures.ts";

const approve = (fundId: string, level: "review" | "agent"): Action => ({ type: "approve", fundId, level });
const inputs = (fundId: string, values: Record<string, number>): Action => ({ type: "update-inputs", fundId, inputs: values }) as Action;
const lastAudit = (data: AppData) => data.audit[data.audit.length - 1];
const withoutId = (entry: AppData["audit"][number]) => ({ ...entry, id: undefined });
const changedKeys = (before: AppData, after: AppData) =>
  (Object.keys(before) as Array<keyof AppData>).filter((key) => before[key] !== after[key]).sort();

// ------------------------------------------------------------------------------------------------ update-inputs
test("update-inputs changes one component and audits it with the old and new amount", () => {
  const before = frozenSeed();
  const after = ok(before, "w-l-teo", inputs("telok-ayer", { taxableDistributed: 5000000000 }));
  const fund = fundOf(after, "telok-ayer");
  assert.deepEqual(fund.inputs, { ...fundOf(before, "telok-ayer").inputs, taxableDistributed: 5000000000 });
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "telok-ayer",
    at: NOW_STAMP,
    actor: "W. L. Teo",
    action: "Taxable income distribution updated",
    detail: "S$58,412,600 → S$50,000,000",
  });
  assert.equal(after.audit.length, before.audit.length + 1);
  assert.deepEqual(changedKeys(before, after), ["audit", "funds"]);
  assert.equal(fundOf(after, "kallang"), fundOf(before, "kallang"), "other funds are shared, not copied");
});

test("update-inputs with several components writes one audit entry that lists each change", () => {
  const after = ok(frozenSeed(), "a-moreno", inputs("telok-ayer", { taxableSpecifiedIncome: 6000000000, capitalDistribution: 190580000, taxExemptDistribution: 300000000 }));
  assert.equal(after.audit.length, frozenSeed().audit.length + 1);
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "telok-ayer",
    at: NOW_STAMP,
    actor: "A. Moreno",
    action: "Components updated",
    detail: "Taxable specified income: S$58,412,600 → S$60,000,000; Tax-exempt income distribution: S$3,118,400 → S$3,000,000",
  });
  const inputsAfter = fundOf(after, "telok-ayer").inputs as unknown as Record<string, number>;
  assert.equal(inputsAfter.capitalDistribution, 190580000, "an unchanged key stays as it was");
});

test("update-inputs works on Australian funds in Australian dollars", () => {
  const after = ok(frozenSeed(), "r-okafor", inputs("coastline", { cashDistribution: 2200000000 }));
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "coastline",
    at: NOW_STAMP,
    actor: "R. Okafor",
    action: "Cash distribution updated",
    detail: "A$21,048,000 → A$22,000,000",
  });
});

test("update-inputs that changes nothing succeeds without touching the data or the trail", () => {
  const before = frozenSeed();
  const same = fundOf(before, "telok-ayer").inputs as unknown as Record<string, number>;
  const payloads: Array<Record<string, number>> = [{}, { taxableDistributed: same.taxableDistributed }, { capitalDistribution: same.capitalDistribution, taxExemptDistribution: same.taxExemptDistribution }];
  for (const payload of payloads) {
    const result = applyAction(before, inputs("telok-ayer", payload), ctxOf(before, "w-l-teo"));
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.data, before, "the very same data object comes back");
  }
  const skipped = applyAction(before, inputs("telok-ayer", { taxableDistributed: undefined as unknown as number }), ctxOf(before, "w-l-teo"));
  assert.equal(skipped.ok && skipped.data, before, "undefined values are ignored");
});

test("update-inputs rejects anything that is not an amount of zero or more in whole cents", () => {
  const data = frozenSeed();
  const refused = (values: Record<string, unknown>) => denied(data, "w-l-teo", inputs("telok-ayer", values as Record<string, number>));
  assert.equal(refused({ taxableDistributed: -1 }), "Taxable income distribution must be an amount of zero or more");
  assert.equal(refused({ taxableDistributed: 1.5 }), "Taxable income distribution must be an amount of zero or more");
  assert.equal(refused({ capitalDistribution: Number.NaN }), "Capital distribution must be an amount of zero or more");
  assert.equal(refused({ capitalDistribution: Number.POSITIVE_INFINITY }), "Capital distribution must be an amount of zero or more");
  assert.equal(refused({ taxExemptDistribution: "5" }), "Tax-exempt income distribution must be an amount of zero or more");
  assert.equal(refused({ taxExemptDistribution: null }), "Tax-exempt income distribution must be an amount of zero or more");
  assert.equal(refused({ cashDistribution: 5 }), "cashDistribution is not an input of this fund", "an Australian component on a Singapore fund");
  assert.equal(refused({ nonsense: 5 }), "nonsense is not an input of this fund");
  assert.equal(refused({ toString: 5 }), "toString is not an input of this fund", "inherited names are not inputs");
  assert.equal(denied(data, "w-l-teo", { type: "update-inputs", fundId: "telok-ayer", inputs: null } as unknown as Action), "There is nothing to update");
});

test("update-inputs is all or nothing: one bad value stops the whole update", () => {
  const data = frozenSeed();
  const reason = denied(data, "w-l-teo", inputs("telok-ayer", { taxableDistributed: 5000000000, capitalDistribution: -1 }));
  assert.equal(reason, "Capital distribution must be an amount of zero or more");
});

// ------------------------------------------------------------------------------------------------ permissions and locking, for every edit action
const EDITS: Array<[string, (fundId: string) => Action]> = [
  ["update-inputs", (id) => inputs(id, { capitalDistribution: 1 })],
  ["update-holder-units", (id) => ({ type: "update-holder-units", fundId: id, holderId: "h-x", units: 5 })],
  ["update-units-on-issue", (id) => ({ type: "update-units-on-issue", fundId: id, units: 5 })],
  ["update-remitted", (id) => ({ type: "update-remitted", fundId: id, remitted: 5 })],
  ["update-tb-category", (id) => ({ type: "update-tb-category", fundId: id, rowId: "tb-x", category: "rent" })],
  ["update-tax-adjustment", (id) => ({ type: "update-tax-adjustment", fundId: id, key: "capitalAllowances", amount: 5 })],
  ["import-tb", (id) => ({ type: "import-tb", fundId: id, rows: [{ account: "1", name: "x", current: 1, prior: 1 }] })],
  ["sync-distribution-from-tb", (id) => ({ type: "sync-distribution-from-tb", fundId: id })],
];

for (const [name, build] of EDITS) {
  test(`${name}: gates run in order (fund, access, permission, status) before anything is read`, () => {
    const data = frozenSeed();
    assert.equal(denied(data, "w-l-teo", build("nope")), "Fund not found");
    assert.equal(denied(data, "r-okafor", build("telok-ayer")), "You don't have access to this fund");
    assert.equal(denied(data, "n-pillai", build("telok-ayer")), "You don't have permission to edit this fund", "a reviewer cannot edit");
    assert.equal(denied(data, "s-lim", build("telok-ayer")), "You don't have permission to edit this fund", "a tax agent cannot edit");
    assert.equal(denied(data, "m-castillo", build("telok-ayer")), "You don't have permission to edit this fund", "finance is view only");
    assert.equal(denied(data, "m-castillo", build("meranti")), "You don't have permission to edit this fund", "permission is checked before status");
    assert.equal(denied(data, "a-moreno", build("meranti")), "This fund is in review. Return it to the preparer to edit.");
    assert.equal(denied(data, "w-l-teo", build("meranti")), "This fund is in review. Return it to the preparer to edit.");
    assert.equal(denied(data, "a-moreno", build("loyang")), "This fund is signed off. Reopen it to edit.");
    assert.equal(denied(data, "a-moreno", build("harbourline")), "This fund is signed off. Reopen it to edit.");
  });
}

test("a fund can be edited again once it has been returned or reopened", () => {
  let data = frozenSeed();
  assert.equal(denied(data, "w-l-teo", inputs("meranti", { capitalDistribution: 1 })), "This fund is in review. Return it to the preparer to edit.");
  data = ok(data, "n-pillai", { type: "return", fundId: "meranti" });
  data = ok(data, "w-l-teo", inputs("meranti", { capitalDistribution: 1 }));
  assert.equal((fundOf(data, "meranti").inputs as unknown as Record<string, number>).capitalDistribution, 1);
  data = ok(data, "a-moreno", { type: "reopen", fundId: "loyang", reason: "Correcting signed-off inputs" });
  data = ok(data, "w-l-teo", { type: "update-remitted", fundId: "loyang", remitted: 100 });
  assert.equal(fundOf(data, "loyang").whtRemitted, 100);
});

// ------------------------------------------------------------------------------------------------ units
test("update-holder-units changes one holder's units and audits the register change", () => {
  const before = frozenSeed();
  const after = ok(before, "w-l-teo", { type: "update-holder-units", fundId: "telok-ayer", holderId: "h-ta-1", units: 1700000000 });
  assert.equal(after.holders.find((h) => h.id === "h-ta-1")?.units, 1700000000);
  assert.deepEqual(after.holders.filter((h) => h.id !== "h-ta-1"), before.holders.filter((h) => h.id !== "h-ta-1"));
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "telok-ayer",
    at: NOW_STAMP,
    actor: "W. L. Teo",
    action: "Unitholder register updated",
    detail: "Individual unitholders (CDP, SRS & CPFIS): 1,694,472,000 → 1,700,000,000 units",
  });
  assert.deepEqual(changedKeys(before, after), ["audit", "holders"]);
  assert.equal(after.holders.length, before.holders.length);
});

test("update-holder-units validates the holder and the number of units", () => {
  const data = frozenSeed();
  const holder = (holderId: string, units: number): Action => ({ type: "update-holder-units", fundId: "telok-ayer", holderId, units });
  assert.equal(denied(data, "w-l-teo", holder("h-ta-1", -1)), "Units must be a whole number of zero or more");
  assert.equal(denied(data, "w-l-teo", holder("h-ta-1", 10.5)), "Units must be a whole number of zero or more");
  assert.equal(denied(data, "w-l-teo", holder("h-ta-1", Number.NaN)), "Units must be a whole number of zero or more");
  assert.equal(denied(data, "w-l-teo", holder("h-nope", 5)), "Unitholder not found");
  assert.equal(denied(data, "w-l-teo", holder("h-kr-1", 5)), "Unitholder not found", "a holder of another fund");
  const zero = ok(data, "w-l-teo", holder("h-ta-1", 0));
  assert.equal(zero.holders.find((h) => h.id === "h-ta-1")?.units, 0, "zero units is allowed");
  const result = applyAction(data, holder("h-ta-1", 1694472000), ctxOf(data, "w-l-teo"));
  assert.equal(result.ok && result.data, data, "the same units is a no-op");
});

test("update-units-on-issue changes the units on issue and audits it", () => {
  const before = frozenSeed();
  const after = ok(before, "w-l-teo", { type: "update-units-on-issue", fundId: "telok-ayer", units: 4300000000 });
  assert.equal(fundOf(after, "telok-ayer").unitsOnIssue, 4300000000);
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "telok-ayer",
    at: NOW_STAMP,
    actor: "W. L. Teo",
    action: "Unitholder register updated",
    detail: "Units on issue: 4,236,180,000 → 4,300,000,000",
  });
  const units = (value: number): Action => ({ type: "update-units-on-issue", fundId: "telok-ayer", units: value });
  assert.equal(denied(before, "w-l-teo", units(0)), "Units on issue must be a whole number of at least 1");
  assert.equal(denied(before, "w-l-teo", units(-5)), "Units on issue must be a whole number of at least 1");
  assert.equal(denied(before, "w-l-teo", units(1.5)), "Units on issue must be a whole number of at least 1");
  assert.equal(denied(before, "w-l-teo", units(Number.MAX_SAFE_INTEGER + 2)), "Units on issue must be a whole number of at least 1");
  const same = applyAction(before, units(4236180000), ctxOf(before, "w-l-teo"));
  assert.equal(same.ok && same.data, before);
});

// ------------------------------------------------------------------------------------------------ withholding remitted
test("update-remitted records an amount, null means not remitted", () => {
  const start = frozenSeed();
  assert.equal(fundOf(start, "telok-ayer").whtRemitted, null);
  const remitted = ok(start, "w-l-teo", { type: "update-remitted", fundId: "telok-ayer", remitted: 1000000 });
  assert.equal(fundOf(remitted, "telok-ayer").whtRemitted, 1000000);
  assert.equal(withoutId(lastAudit(remitted)).detail, "Not remitted → S$10,000");
  assert.equal(lastAudit(remitted).action, "Withholding remitted updated");

  const cleared = ok(remitted, "w-l-teo", { type: "update-remitted", fundId: "telok-ayer", remitted: null });
  assert.equal(fundOf(cleared, "telok-ayer").whtRemitted, null);
  assert.equal(lastAudit(cleared).detail, "S$10,000 → Not remitted");

  const zero = ok(start, "w-l-teo", { type: "update-remitted", fundId: "telok-ayer", remitted: 0 });
  assert.equal(fundOf(zero, "telok-ayer").whtRemitted, 0, "zero is different from not remitted");
  assert.equal(lastAudit(zero).detail, "Not remitted → S$0");

  const none = applyAction(start, { type: "update-remitted", fundId: "telok-ayer", remitted: null }, ctxOf(start, "w-l-teo"));
  assert.equal(none.ok && none.data, start, "null to null is a no-op");
});

test("update-remitted refuses negative and fractional amounts", () => {
  const data = frozenSeed();
  const remitted = (value: number | null): Action => ({ type: "update-remitted", fundId: "telok-ayer", remitted: value });
  assert.equal(denied(data, "w-l-teo", remitted(-1)), "Withholding remitted must be an amount of zero or more");
  assert.equal(denied(data, "w-l-teo", remitted(0.5)), "Withholding remitted must be an amount of zero or more");
  assert.equal(denied(data, "w-l-teo", remitted(Number.NaN)), "Withholding remitted must be an amount of zero or more");
  assert.equal(denied(data, "w-l-teo", { type: "update-remitted", fundId: "telok-ayer", remitted: undefined } as unknown as Action), "Withholding remitted must be an amount of zero or more");
});

// ------------------------------------------------------------------------------------------------ trial balance
test("update-tb-category re-maps one account and audits the change in words", () => {
  const before = frozenSeed();
  const after = ok(before, "w-l-teo", { type: "update-tb-category", fundId: "telok-ayer", rowId: "tb-telok-ayer-1000", category: "rent" });
  assert.equal(after.tbRows.find((r) => r.id === "tb-telok-ayer-1000")?.category, "rent");
  assert.deepEqual(after.tbRows.filter((r) => r.id !== "tb-telok-ayer-1000"), before.tbRows.filter((r) => r.id !== "tb-telok-ayer-1000"));
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "telok-ayer",
    at: NOW_STAMP,
    actor: "W. L. Teo",
    action: "Account 1000 mapped",
    detail: "Cash and cash equivalents: Balance sheet → Rental and property income",
  });
  const unmapped = ok(after, "w-l-teo", { type: "update-tb-category", fundId: "telok-ayer", rowId: "tb-telok-ayer-1000", category: "unmapped" });
  assert.equal(lastAudit(unmapped).detail, "Cash and cash equivalents: Rental and property income → Needs a tax category");
});

test("the trail calls an account without a tax category what the Singapore trial balance screen calls it", { skip: skipUnlessReady("SG") }, () => {
  const data = frozenSeed();
  const unmapped = ok(data, "w-l-teo", { type: "update-tb-category", fundId: "telok-ayer", rowId: "tb-telok-ayer-1000", category: "unmapped" });
  const shown = tbView(unmapped, "telok-ayer", NOW).rows.find((r) => r.id === "tb-telok-ayer-1000");
  assert.equal(shown?.categoryLabel, "Needs a tax category");
  assert.ok(lastAudit(unmapped).detail?.endsWith(`→ ${shown?.categoryLabel}`));
});

test("the trail calls an account without a tax category what the Australian trial balance screen calls it", { skip: skipUnlessReady("AU") }, () => {
  const data = frozenSeed();
  const seeded = tbView(data, "coastline", NOW).rows.find((r) => r.id === "tb-coastline-4510");
  assert.equal(seeded?.category, "unmapped", "the one seeded account without a category");
  assert.equal(seeded?.categoryLabel, "Needs a tax category");
  const rent = data.tbCategories.AU.find((c) => c.id === "rent")?.label;
  const mapped = ok(data, "r-okafor", { type: "update-tb-category", fundId: "coastline", rowId: "tb-coastline-4510", category: "rent" });
  assert.equal(lastAudit(mapped).action, "Account 4510 mapped");
  assert.equal(lastAudit(mapped).detail, `Make-good income received: ${seeded?.categoryLabel} → ${rent}`);
  assert.equal(tbView(mapped, "coastline", NOW).rows.find((r) => r.id === "tb-coastline-4510")?.categoryLabel, rent);
});

test("update-tb-category validates the account and the category for the fund's market", () => {
  const data = frozenSeed();
  const map = (rowId: string, category: string): Action => ({ type: "update-tb-category", fundId: "telok-ayer", rowId, category });
  assert.equal(denied(data, "w-l-teo", map("tb-telok-ayer-9999", "rent")), "Trial balance account not found");
  assert.equal(denied(data, "w-l-teo", map("tb-kallang-1000", "rent")), "Trial balance account not found", "an account of another fund");
  assert.equal(denied(data, "w-l-teo", map("tb-telok-ayer-1000", "nonsense")), "Unknown trial balance category");
  assert.equal(denied(data, "w-l-teo", map("tb-telok-ayer-1000", "ncmi-rent")), "Unknown trial balance category", "an Australian category on a Singapore fund");
  const same = applyAction(data, map("tb-telok-ayer-1000", "balance-sheet"), ctxOf(data, "w-l-teo"));
  assert.equal(same.ok && same.data, data, "the same category is a no-op");
  const au = ok(data, "r-okafor", { type: "update-tb-category", fundId: "coastline", rowId: "tb-coastline-1000", category: "ncmi-rent" });
  assert.equal(au.tbRows.find((r) => r.id === "tb-coastline-1000")?.category, "ncmi-rent");
});

test("import-tb replaces the fund's trial balance and keeps its place in the list", () => {
  const before = frozenSeed();
  const firstIndex = before.tbRows.findIndex((r) => r.fundId === "telok-ayer");
  const after = ok(before, "w-l-teo", {
    type: "import-tb",
    fundId: "telok-ayer",
    rows: [
      { account: "1000", name: "Cash", category: "balance-sheet", current: 100, prior: 90 },
      { account: " 4000 ", name: "  Rent  ", category: "rent", current: -5000, prior: 0 },
      { account: "9999", name: "", category: "not-a-category", current: 0, prior: 0 },
      { account: "9998", name: "Uncategorised", current: 7, prior: 8 },
    ],
  });
  const mine = after.tbRows.filter((r) => r.fundId === "telok-ayer");
  assert.deepEqual(mine, [
    { id: "tb-telok-ayer-1000", fundId: "telok-ayer", account: "1000", name: "Cash", category: "balance-sheet", current: 100, prior: 90 },
    { id: "tb-telok-ayer-4000", fundId: "telok-ayer", account: "4000", name: "Rent", category: "rent", current: -5000, prior: 0 },
    { id: "tb-telok-ayer-9999", fundId: "telok-ayer", account: "9999", name: "9999", category: "unmapped", current: 0, prior: 0 },
    { id: "tb-telok-ayer-9998", fundId: "telok-ayer", account: "9998", name: "Uncategorised", category: "unmapped", current: 7, prior: 8 },
  ]);
  assert.deepEqual(after.tbRows.filter((r) => r.fundId !== "telok-ayer"), before.tbRows.filter((r) => r.fundId !== "telok-ayer"));
  assert.equal(after.tbRows.findIndex((r) => r.fundId === "telok-ayer"), firstIndex, "the block stays where it was");
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "telok-ayer",
    at: NOW_STAMP,
    actor: "W. L. Teo",
    action: "Trial balance imported",
    detail: "4 accounts",
  });
  const single = ok(before, "w-l-teo", { type: "import-tb", fundId: "telok-ayer", rows: [{ account: "1", name: "x", current: 1, prior: 1 }] });
  assert.equal(lastAudit(single).detail, "1 account");
});

test("import-tb puts a first import at the end and validates every row", () => {
  const data = frozenSeed();
  const without = { ...data, tbRows: data.tbRows.filter((r) => r.fundId !== "kallang") };
  const first = ok(deepFreeze(without), "w-l-teo", { type: "import-tb", fundId: "kallang", rows: [{ account: "1000", name: "Cash", current: 1, prior: 2 }] });
  assert.equal(first.tbRows[first.tbRows.length - 1].id, "tb-kallang-1000");
  assert.equal(first.tbRows.length, without.tbRows.length + 1);

  const row = (extra: Record<string, unknown>) => ({ account: "1000", name: "Cash", current: 1, prior: 1, ...extra });
  const importing = (rows: unknown[]): Action => ({ type: "import-tb", fundId: "telok-ayer", rows }) as Action;
  assert.equal(denied(data, "w-l-teo", importing([])), "The import has no accounts");
  assert.equal(denied(data, "w-l-teo", { type: "import-tb", fundId: "telok-ayer", rows: null } as unknown as Action), "The import has no accounts");
  assert.equal(denied(data, "w-l-teo", importing([row({ account: "  " })])), "Every row needs an account code");
  assert.equal(denied(data, "w-l-teo", importing([row({ account: 1000 })])), "Every row needs an account code");
  assert.equal(denied(data, "w-l-teo", importing([row({}), row({ account: " 1000" })])), "Account 1000 appears more than once");
  assert.equal(denied(data, "w-l-teo", importing([row({ current: 1.5 })])), "Account 1000: amounts must be whole cents");
  assert.equal(denied(data, "w-l-teo", importing([row({ prior: Number.NaN })])), "Account 1000: amounts must be whole cents");
  assert.equal(denied(data, "w-l-teo", importing([row({ current: "5" })])), "Account 1000: amounts must be whole cents");
  assert.deepEqual(data.tbRows, frozenSeed().tbRows);
});

// ------------------------------------------------------------------------------------------------ tax adjustments
test("update-tax-adjustment records a manual adjustment and audits it by its label", () => {
  const before = frozenSeed();
  const after = ok(before, "w-l-teo", { type: "update-tax-adjustment", fundId: "telok-ayer", key: "capitalAllowances", amount: 200000000 });
  assert.equal(after.taxAdjustments["telok-ayer"].capitalAllowances, 200000000);
  assert.deepEqual(after.taxAdjustments.kallang, before.taxAdjustments.kallang);
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "telok-ayer",
    at: NOW_STAMP,
    actor: "W. L. Teo",
    action: "Capital allowances updated",
    detail: "S$1,625,972 → S$2,000,000",
  });
  assert.deepEqual(changedKeys(before, after), ["audit", "taxAdjustments"]);

  const au = ok(before, "r-okafor", { type: "update-tax-adjustment", fundId: "coastline", key: "div40", amount: 60000000 });
  assert.equal(lastAudit(au).action, "Tax depreciation — Div 40 updated");
  assert.equal(lastAudit(au).detail, "A$521,979 → A$600,000");
});

test("update-tax-adjustment validates the key and the amount, and handles a fund with no adjustments yet", () => {
  const data = frozenSeed();
  const adjust = (key: string, amount: number): Action => ({ type: "update-tax-adjustment", fundId: "telok-ayer", key, amount }) as Action;
  assert.equal(denied(data, "w-l-teo", adjust("div40", 5)), "Unknown tax adjustment", "an Australian key on a Singapore fund");
  assert.equal(denied(data, "w-l-teo", adjust("nonsense", 5)), "Unknown tax adjustment");
  assert.equal(denied(data, "w-l-teo", adjust("capitalAllowances", -1)), "Capital allowances must be an amount of zero or more");
  assert.equal(denied(data, "w-l-teo", adjust("capitalAllowances", 2.5)), "Capital allowances must be an amount of zero or more");
  const same = applyAction(data, adjust("capitalAllowances", 162597200), ctxOf(data, "w-l-teo"));
  assert.equal(same.ok && same.data, data, "the same amount is a no-op");

  const bare = deepFreeze({ ...structuredClone(data), taxAdjustments: Object.fromEntries(Object.entries(data.taxAdjustments).filter(([id]) => id !== "kallang")) });
  const created = ok(bare, "w-l-teo", { type: "update-tax-adjustment", fundId: "kallang", key: "capitalAllowances", amount: 100 });
  assert.deepEqual(created.taxAdjustments.kallang, { capitalAllowances: 100 });
  assert.equal(lastAudit(created).detail, "S$0 → S$1");
  const zero = applyAction(bare, { type: "update-tax-adjustment", fundId: "kallang", key: "capitalAllowances", amount: 0 }, ctxOf(bare, "w-l-teo"));
  assert.equal(zero.ok && zero.data, bare, "a missing adjustment counts as zero");
});

// ------------------------------------------------------------------------------------------------ sync from the trial balance
test("sync-distribution-from-tb copies the trial balance components into the inputs (Singapore)", { skip: skipUnlessReady("SG") }, () => {
  const knocked = ok(frozenSeed(), "w-l-teo", inputs("telok-ayer", { taxableSpecifiedIncome: 1 }));
  const fund = fundOf(knocked, "telok-ayer");
  const view = moduleFor("SG").tbView(knocked, fund, NOW);
  const derived = view.derivedInputs as unknown as Record<string, number>;
  const after = ok(knocked, "w-l-teo", { type: "sync-distribution-from-tb", fundId: "telok-ayer" });
  const now = fundOf(after, "telok-ayer").inputs as unknown as Record<string, number>;
  for (const component of view.components) assert.equal(now[component.key], Math.round(derived[component.key]), component.key);
  assert.equal(lastAudit(after).action, "Components updated from trial balance");
  assert.equal(lastAudit(after).actor, "W. L. Teo");
  assert.match(lastAudit(after).detail ?? "", /: S\$0 → S\$[\d,]+/);

  const again = applyAction(after, { type: "sync-distribution-from-tb", fundId: "telok-ayer" }, ctxOf(after, "w-l-teo"));
  assert.equal(again.ok && again.data, after, "syncing twice changes nothing the second time");
});

test("sync-distribution-from-tb copies the trial balance components into the inputs (Australia)", { skip: skipUnlessReady("AU") }, () => {
  const knocked = ok(frozenSeed(), "r-okafor", inputs("coastline", { ausOtherIncome: 1 }));
  const fund = fundOf(knocked, "coastline");
  const view = moduleFor("AU").tbView(knocked, fund, NOW);
  const derived = view.derivedInputs as unknown as Record<string, number>;
  const after = ok(knocked, "r-okafor", { type: "sync-distribution-from-tb", fundId: "coastline" });
  const now = fundOf(after, "coastline").inputs as unknown as Record<string, number>;
  for (const component of view.components) assert.equal(now[component.key], Math.round(derived[component.key]), component.key);
  assert.equal(lastAudit(after).action, "Components updated from trial balance");
  const again = applyAction(after, { type: "sync-distribution-from-tb", fundId: "coastline" }, ctxOf(after, "r-okafor"));
  assert.equal(again.ok && again.data, after);
});

// ------------------------------------------------------------------------------------------------ notices
test("publish-notice on a Singapore fund publishes today and snapshots what holders were told", () => {
  const before = frozenSeed();
  const after = ok(before, "w-l-teo", { type: "publish-notice", fundId: "telok-ayer", noticeId: "telok-ayer-notice" });
  const notice = after.sgNotices.find((n) => n.id === "telok-ayer-notice");
  assert.equal(notice?.publishedOn, TODAY);
  assert.deepEqual(notice?.notified, { taxable: 5841260000, exempt: 311840000, capital: 190580000 });
  assert.deepEqual(after.sgNotices.filter((n) => n.id !== "telok-ayer-notice"), before.sgNotices.filter((n) => n.id !== "telok-ayer-notice"));
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "telok-ayer",
    at: NOW_STAMP,
    actor: "W. L. Teo",
    action: "Distribution tax notice announced",
    detail: "Taxable S$58,412,600, tax-exempt S$3,118,400, capital S$1,905,800",
  });
  assert.deepEqual(changedKeys(before, after), ["audit", "sgNotices"]);

  const edited = ok(after, "w-l-teo", inputs("telok-ayer", { taxableDistributed: 1 }));
  assert.deepEqual(edited.sgNotices.find((n) => n.id === "telok-ayer-notice")?.notified, { taxable: 5841260000, exempt: 311840000, capital: 190580000 }, "later edits do not rewrite a published notice");
});

test("publish-notice on an Australian fund snapshots the notified components and keeps the year whole", () => {
  const before = frozenSeed();
  const after = ok(before, "r-okafor", { type: "publish-notice", fundId: "coastline", noticeId: "coastline-2026-09-30" });
  const notice = after.auNotices.find((n) => n.id === "coastline-2026-09-30");
  assert.equal(notice?.publishedOn, TODAY);
  assert.deepEqual(notice?.notified, { other: 432485242, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 5410382 });
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "coastline",
    at: NOW_STAMP,
    actor: "R. Okafor",
    action: "Fund payment notice published",
    detail: "Quarter ended 30 Sep 2026: fund payment A$4,324,852, interest A$54,104",
  });
  assert.deepEqual(changedKeys(before, after), ["auNotices", "audit"]);
  const notified = after.auNotices.filter((n) => n.fundId === "coastline").map((n) => n.notified);
  const sum = (key: "other" | "interest") => notified.reduce((total, n) => total + (n?.[key] ?? 0), 0);
  const year = fundOf(after, "coastline").inputs as unknown as Record<string, number>;
  assert.equal(sum("other"), year.ausOtherIncome + 2 * year.discountGainTarp + year.otherGainTarp, "the four notices add up to the year");
  assert.equal(sum("interest"), year.interest);
});

test("an Australian notice reads the same before and after publishing, and the year table closes", { skip: skipUnlessReady("AU") }, () => {
  const before = frozenSeed();
  const draft = investorView(before, "coastline", ctxOf(before, "a-moreno"), "coastline-2026-09-30");
  const after = ok(before, "r-okafor", { type: "publish-notice", fundId: "coastline", noticeId: "coastline-2026-09-30" });
  const published = investorView(after, "coastline", ctxOf(after, "a-moreno"), "coastline-2026-09-30");
  assert.equal(draft.market, "AU");
  assert.equal(published.market, "AU");
  if (draft.market !== "AU" || published.market !== "AU") return;
  assert.equal(draft.canPublishSelected, true);
  assert.equal(published.canPublishSelected, false);
  assert.deepEqual(published.noticeDoc?.blocks, draft.noticeDoc?.blocks, "the published notice shows the figures the draft showed");
  assert.ok(draft.vsYear.some((row) => row.difference !== 0), "before publishing, the last quarter is still to be told");
  assert.ok(published.vsYear.every((row) => row.difference === 0), "after publishing, what holders were told adds up to the year");

  const edited = ok(after, "r-okafor", inputs("coastline", { ausOtherIncome: 1500000000 }));
  const later = investorView(edited, "coastline", ctxOf(edited, "a-moreno"), "coastline-2026-09-30");
  if (later.market !== "AU") return assert.fail("expected an Australian view");
  assert.deepEqual(later.noticeDoc?.blocks, published.noticeDoc?.blocks, "a later edit does not rewrite a published notice");
  const other = later.vsYear.find((row) => row.label === "Fund payment — other");
  assert.deepEqual([other?.published, other?.year, other?.difference], [1697045000, 1500000000, -197045000]);
});
test("publish-notice is refused when the notice is published, unknown, someone else's, or the user may not publish", () => {
  const data = frozenSeed();
  const publish = (fundId: string, noticeId: string): Action => ({ type: "publish-notice", fundId, noticeId });
  assert.equal(denied(data, "w-l-teo", publish("loyang", "loyang-notice")), "Published notices are locked");
  assert.equal(denied(data, "r-okafor", publish("coastline", "coastline-2026-06-30")), "Published notices are locked");
  assert.equal(denied(data, "w-l-teo", publish("telok-ayer", "nope")), "Notice not found");
  assert.equal(denied(data, "w-l-teo", publish("telok-ayer", "loyang-notice")), "Notice not found", "a notice of another fund");
  assert.equal(denied(data, "r-okafor", publish("coastline", "telok-ayer-notice")), "Notice not found");
  assert.equal(denied(data, "n-pillai", publish("telok-ayer", "telok-ayer-notice")), "You don't have permission to publish notices");
  assert.equal(denied(data, "s-lim", publish("telok-ayer", "telok-ayer-notice")), "You don't have permission to publish notices");
  assert.equal(denied(data, "m-castillo", publish("telok-ayer", "telok-ayer-notice")), "You don't have permission to publish notices");
  assert.equal(denied(data, "r-okafor", publish("telok-ayer", "telok-ayer-notice")), "You don't have access to this fund");
  assert.equal(denied(data, "w-l-teo", publish("nope", "x")), "Fund not found");
});

test("publish-notice is allowed in any status, because notices are not part of the sign-off lock", () => {
  const after = ok(frozenSeed(), "a-moreno", { type: "publish-notice", fundId: "meranti", noticeId: "meranti-notice" });
  assert.equal(fundOf(after, "meranti").status, "In review");
  assert.equal(after.sgNotices.find((n) => n.id === "meranti-notice")?.publishedOn, TODAY);
});

// ------------------------------------------------------------------------------------------------ lodgment
const lodge = (fundId: string, kind: "aiir" | "return" | "form-ut", reference: string, date: string): Action => ({ type: "record-lodgment", fundId, kind, reference, date });

test("record-lodgment on a signed-off Singapore fund records Form UT and audits it", () => {
  const before = frozenSeed();
  const after = ok(before, "a-moreno", lodge("loyang", "form-ut", "  FUT-2026-114  ", "2026-10-12"));
  assert.deepEqual(after.lodgments.filter((l) => l.fundId === "loyang"), [{ fundId: "loyang", kind: "form-ut", reference: "FUT-2026-114", date: "2026-10-12", actor: "A. Moreno" }]);
  assert.deepEqual(after.lodgments.filter((l) => l.fundId !== "loyang"), before.lodgments);
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "loyang",
    at: NOW_STAMP,
    actor: "A. Moreno",
    action: "Form UT filed with IRAS",
    detail: "Reference FUT-2026-114, 2026-10-12",
  });
  assert.deepEqual(changedKeys(before, after), ["audit", "lodgments"]);
});

test("record-lodgment replaces an earlier record of the same kind in place", () => {
  const before = frozenSeed();
  const after = ok(before, "a-moreno", lodge("wattle", "aiir", "Receipt 5", "2026-10-13"));
  assert.equal(after.lodgments.length, before.lodgments.length);
  assert.deepEqual(after.lodgments[0], { fundId: "wattle", kind: "aiir", reference: "Receipt 5", date: "2026-10-13", actor: "A. Moreno" });
  assert.deepEqual(after.lodgments[1], before.lodgments[1]);
  assert.equal(lastAudit(after).action, "AIIR lodged with the ATO");
  const again = ok(after, "a-moreno", lodge("wattle", "return", "Receipt 6", "2026-10-13"));
  assert.equal(again.lodgments[1].reference, "Receipt 6");
  assert.equal(lastAudit(again).action, "Tax return lodged with the ATO");
  assert.equal(lastAudit(again).detail, "Reference Receipt 6, 2026-10-13");
});

test("record-lodgment follows the governance: the tax agent lodges where the agent lodges, otherwise the head of tax", () => {
  let data = frozenSeed();
  assert.equal(denied(data, "w-l-teo", lodge("loyang", "form-ut", "R", "2026-10-12")), "Only the head of tax records lodgment for this fund");
  assert.equal(denied(data, "n-pillai", lodge("loyang", "form-ut", "R", "2026-10-12")), "Only the head of tax records lodgment for this fund");
  assert.equal(denied(data, "d-harrow", lodge("harbourline", "aiir", "R", "2026-10-12")), "Only the head of tax records lodgment for this fund", "the agent only signs off at harbourline");
  assert.equal(denied(data, "a-moreno", lodge("meranti", "form-ut", "R", "2026-10-12")), "Only the tax agent records lodgment for this fund");
  data = chain(data, [
    ["s-lim", approve("meranti", "agent")],
    ["a-moreno", { type: "sign-off", fundId: "meranti" }],
  ]);
  assert.equal(denied(data, "a-moreno", lodge("meranti", "form-ut", "R", "2026-10-12")), "Only the tax agent records lodgment for this fund", "even once signed off");
  const done = ok(data, "s-lim", lodge("meranti", "form-ut", "FUT-9", "2026-10-13"));
  assert.equal(done.lodgments.find((l) => l.fundId === "meranti")?.actor, "S. Lim");
  assert.equal(lastAudit(done).actor, "S. Lim");
});

test("record-lodgment needs a signed-off fund, a filing that applies, a reference and a real date", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "a-moreno", lodge("telok-ayer", "form-ut", "R", "2026-10-12")), "Sign the fund off before recording lodgment");
  assert.equal(denied(data, "a-moreno", lodge("kallang", "form-ut", "R", "2026-10-12")), "Sign the fund off before recording lodgment");
  assert.equal(denied(data, "s-lim", lodge("meranti", "form-ut", "R", "2026-10-12")), "Sign the fund off before recording lodgment");
  assert.equal(denied(data, "a-moreno", lodge("loyang", "aiir", "R", "2026-10-12")), "That filing does not apply to this fund");
  assert.equal(denied(data, "a-moreno", lodge("loyang", "return", "R", "2026-10-12")), "That filing does not apply to this fund");
  assert.equal(denied(data, "a-moreno", lodge("wattle", "form-ut", "R", "2026-10-12")), "That filing does not apply to this fund");
  assert.equal(denied(data, "a-moreno", lodge("loyang", "form-ut", "", "2026-10-12")), "Enter the reference");
  assert.equal(denied(data, "a-moreno", lodge("loyang", "form-ut", "   ", "2026-10-12")), "Enter the reference");
  for (const date of ["", "2026-02-30", "2026-13-01", "13/10/2026", "2026-10-1", "tomorrow"]) {
    assert.equal(denied(data, "a-moreno", lodge("loyang", "form-ut", "R", date)), "Enter a valid date", date);
  }
  assert.equal(denied(data, "r-okafor", lodge("loyang", "form-ut", "R", "2026-10-12")), "You don't have access to this fund");
  assert.equal(denied(data, "a-moreno", lodge("nope", "form-ut", "R", "2026-10-12")), "Fund not found");
  assert.deepEqual(data.lodgments, frozenSeed().lodgments);
});

// ------------------------------------------------------------------------------------------------ queries
test("raise-query opens a query with the first message and the next q- id", () => {
  const before = frozenSeed();
  const after = ok(before, "n-pillai", { type: "raise-query", fundId: "meranti", subject: "  Check the WHT  ", message: "  Please confirm the rate.  " });
  assert.deepEqual(after.queries.slice(0, before.queries.length), before.queries);
  assert.deepEqual(after.queries[after.queries.length - 1], {
    id: "q-5",
    fundId: "meranti",
    subject: "Check the WHT",
    status: "open",
    raisedBy: "N. Pillai",
    raisedAt: NOW_STAMP,
    messages: [{ by: "N. Pillai", at: NOW_STAMP, text: "Please confirm the rate." }],
  });
  assert.deepEqual(withoutId(lastAudit(after)), {
    id: undefined,
    fundId: "meranti",
    at: NOW_STAMP,
    actor: "N. Pillai",
    action: "Query raised",
    detail: "Check the WHT",
  });
  const second = ok(after, "s-lim", { type: "raise-query", fundId: "meranti", subject: "Second", message: "Again" });
  assert.equal(second.queries[second.queries.length - 1].id, "q-6");
  assert.deepEqual(changedKeys(before, after), ["audit", "queries"]);
});

test("reply-query adds a message to an open query; resolve-query closes it", () => {
  let data = frozenSeed();
  data = ok(data, "n-pillai", { type: "raise-query", fundId: "meranti", subject: "Check the WHT", message: "Please confirm." });
  const replied = ok(data, "s-lim", { type: "reply-query", fundId: "meranti", queryId: "q-5", message: "  Confirmed at 15%.  " });
  const query = replied.queries.find((q) => q.id === "q-5");
  assert.deepEqual(query?.messages, [
    { by: "N. Pillai", at: NOW_STAMP, text: "Please confirm." },
    { by: "S. Lim", at: NOW_STAMP, text: "Confirmed at 15%." },
  ]);
  assert.equal(query?.status, "open");
  assert.deepEqual(withoutId(lastAudit(replied)), { id: undefined, fundId: "meranti", at: NOW_STAMP, actor: "S. Lim", action: "Query answered", detail: "Check the WHT" });

  const resolved = ok(replied, "w-l-teo", { type: "resolve-query", fundId: "meranti", queryId: "q-5" });
  assert.equal(resolved.queries.find((q) => q.id === "q-5")?.status, "resolved");
  assert.equal(resolved.queries.find((q) => q.id === "q-5")?.messages.length, 2);
  assert.deepEqual(withoutId(lastAudit(resolved)), { id: undefined, fundId: "meranti", at: NOW_STAMP, actor: "W. L. Teo", action: "Query resolved", detail: "Check the WHT" });
  assert.equal(resolved.queries.filter((q) => q.id !== "q-5").every((q, i) => q === replied.queries.filter((x) => x.id !== "q-5")[i]), true, "other queries are shared");
});

test("queries can be raised, answered and resolved in any workflow status", () => {
  let data = frozenSeed();
  data = ok(data, "n-pillai", { type: "raise-query", fundId: "loyang", subject: "After sign-off", message: "Question" });
  data = ok(data, "a-moreno", { type: "reply-query", fundId: "loyang", queryId: "q-5", message: "Answer" });
  data = ok(data, "a-moreno", { type: "resolve-query", fundId: "loyang", queryId: "q-5" });
  data = ok(data, "d-harrow", { type: "reply-query", fundId: "southbank", queryId: "q-3", message: "In review is fine" });
  assert.equal(data.queries.find((q) => q.id === "q-3")?.messages.length, 2);
});

test("query actions are refused for bad input, closed or unknown queries, and users who may not query", () => {
  const data = frozenSeed();
  const raise = (subject: string, message: string): Action => ({ type: "raise-query", fundId: "meranti", subject, message });
  assert.equal(denied(data, "n-pillai", raise("", "x")), "Enter a subject");
  assert.equal(denied(data, "n-pillai", raise("   ", "x")), "Enter a subject");
  assert.equal(denied(data, "n-pillai", raise("x", "")), "Enter a message");
  assert.equal(denied(data, "n-pillai", raise("x", "  ")), "Enter a message");
  assert.equal(denied(data, "m-castillo", raise("x", "y")), "You don't have permission to raise or answer queries");
  assert.equal(denied(data, "l-brennan", raise("x", "y")), "You don't have access to this fund");
  assert.equal(denied(data, "n-pillai", { type: "raise-query", fundId: "nope", subject: "x", message: "y" }), "Fund not found");

  const reply = (queryId: string, message: string, fundId = "meranti"): Action => ({ type: "reply-query", fundId, queryId, message });
  assert.equal(denied(data, "n-pillai", reply("q-4", "x")), "This query is resolved");
  assert.equal(denied(data, "n-pillai", reply("q-99", "x")), "Query not found");
  assert.equal(denied(data, "n-pillai", reply("q-1", "x")), "Query not found", "a query of another fund");
  assert.equal(denied(data, "l-brennan", reply("q-1", "", "kurrajong")), "Enter a message");
  assert.equal(denied(data, "m-castillo", reply("q-1", "x", "kurrajong")), "You don't have permission to raise or answer queries");

  const resolve = (queryId: string, fundId = "meranti"): Action => ({ type: "resolve-query", fundId, queryId });
  assert.equal(denied(data, "n-pillai", resolve("q-4")), "This query is already resolved");
  assert.equal(denied(data, "n-pillai", resolve("q-99")), "Query not found");
  assert.equal(denied(data, "n-pillai", resolve("q-1")), "Query not found");
  assert.equal(denied(data, "m-castillo", resolve("q-4")), "You don't have permission to raise or answer queries");
});

test("a query's id comes after the highest one, whatever the order of the list", () => {
  const data = deepFreeze({ ...structuredClone(frozenSeed()), queries: [...frozenSeed().queries].reverse() });
  const after = ok(data, "n-pillai", { type: "raise-query", fundId: "meranti", subject: "x", message: "y" });
  assert.equal(after.queries[after.queries.length - 1].id, "q-5");
});

// ------------------------------------------------------------------------------------------------ the clock and the user come from ctx
test("the audit trail and timestamps use ctx: the user's name and the injected time", () => {
  const data = frozenSeed();
  const later = new Date(2027, 0, 2, 3, 4, 5);
  const raised = ok(data, "n-pillai", { type: "raise-query", fundId: "meranti", subject: "S", message: "M" });
  assert.equal(raised.queries[raised.queries.length - 1].raisedAt, NOW_STAMP);
  const result = applyAction(data, { type: "raise-query", fundId: "meranti", subject: "S", message: "M" }, ctxOf(data, "n-pillai", later));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.queries[result.data.queries.length - 1].raisedAt, "2027-01-02T03:04:05");
  assert.equal(lastAudit(result.data).at, "2027-01-02T03:04:05");
  const published = applyAction(data, { type: "publish-notice", fundId: "telok-ayer", noticeId: "telok-ayer-notice" }, ctxOf(data, "w-l-teo", later));
  assert.equal(published.ok && published.data.sgNotices.find((n) => n.id === "telok-ayer-notice")?.publishedOn, "2027-01-02");
});

test("several audit entries from one action get consecutive ids", () => {
  const before = frozenSeed();
  const after = ok(before, "a-moreno", { type: "set-user-funds", userId: "s-lim", funds: ["telok-ayer", "kallang"] });
  const added = after.audit.slice(before.audit.length);
  assert.equal(added.length, 2);
  assert.deepEqual(added.map((a) => a.id), ["a-21", "a-22"]);
  assert.deepEqual(added.map((a) => [a.fundId, a.detail]), [["meranti", "S. Lim: access removed"], ["kallang", "S. Lim: access granted"]]);
});

// ------------------------------------------------------------------------------------------------ purity
interface PureCase {
  name: string;
  userId: string;
  action: Action;
  build?: (data: AppData) => AppData;
  touches: Array<keyof AppData>;
}

const PURE_CASES: PureCase[] = [
  { name: "submit", userId: "w-l-teo", action: { type: "submit", fundId: "kallang" }, touches: ["audit", "funds", "versions"] },
  { name: "return", userId: "n-pillai", action: { type: "return", fundId: "meranti" }, touches: ["approvals", "audit", "funds"] },
  { name: "approve", userId: "s-lim", action: approve("meranti", "agent"), touches: ["approvals", "audit"] },
  {
    name: "sign-off",
    userId: "a-moreno",
    action: { type: "sign-off", fundId: "meranti" },
    build: (d) => ok(d, "s-lim", approve("meranti", "agent")),
    touches: ["audit", "funds", "versions"],
  },
  { name: "reopen", userId: "a-moreno", action: { type: "reopen", fundId: "loyang", reason: "Correcting signed-off inputs" }, touches: ["approvals", "audit", "funds", "versions"] },
  { name: "update-inputs", userId: "w-l-teo", action: inputs("telok-ayer", { capitalDistribution: 5 }), touches: ["audit", "funds"] },
  { name: "update-holder-units", userId: "w-l-teo", action: { type: "update-holder-units", fundId: "telok-ayer", holderId: "h-ta-1", units: 5 }, touches: ["audit", "holders"] },
  { name: "update-units-on-issue", userId: "w-l-teo", action: { type: "update-units-on-issue", fundId: "telok-ayer", units: 5 }, touches: ["audit", "funds"] },
  { name: "update-remitted", userId: "w-l-teo", action: { type: "update-remitted", fundId: "telok-ayer", remitted: 5 }, touches: ["audit", "funds"] },
  { name: "update-tb-category", userId: "w-l-teo", action: { type: "update-tb-category", fundId: "telok-ayer", rowId: "tb-telok-ayer-1000", category: "rent" }, touches: ["audit", "tbRows"] },
  { name: "update-tax-adjustment", userId: "w-l-teo", action: { type: "update-tax-adjustment", fundId: "telok-ayer", key: "capitalAllowances", amount: 5 }, touches: ["audit", "taxAdjustments"] },
  { name: "import-tb", userId: "w-l-teo", action: { type: "import-tb", fundId: "telok-ayer", rows: [{ account: "1", name: "x", current: 1, prior: 1 }] }, touches: ["audit", "tbRows"] },
  { name: "publish-notice (SG)", userId: "w-l-teo", action: { type: "publish-notice", fundId: "telok-ayer", noticeId: "telok-ayer-notice" }, touches: ["audit", "sgNotices"] },
  { name: "publish-notice (AU)", userId: "r-okafor", action: { type: "publish-notice", fundId: "coastline", noticeId: "coastline-2026-09-30" }, touches: ["auNotices", "audit"] },
  { name: "record-lodgment", userId: "a-moreno", action: lodge("loyang", "form-ut", "R", "2026-10-12"), touches: ["audit", "lodgments"] },
  { name: "raise-query", userId: "n-pillai", action: { type: "raise-query", fundId: "meranti", subject: "S", message: "M" }, touches: ["audit", "queries"] },
  { name: "reply-query", userId: "l-brennan", action: { type: "reply-query", fundId: "southbank", queryId: "q-3", message: "M" }, touches: ["audit", "queries"] },
  { name: "resolve-query", userId: "l-brennan", action: { type: "resolve-query", fundId: "kurrajong", queryId: "q-1" }, touches: ["audit", "queries"] },
  { name: "set-governance", userId: "a-moreno", action: { type: "set-governance", fundId: "coastline", mode: "agent-signs-off" }, touches: ["approvals", "audit", "funds"] },
  { name: "set-user-funds", userId: "a-moreno", action: { type: "set-user-funds", userId: "s-lim", funds: ["telok-ayer", "meranti", "kallang"] }, touches: ["audit", "users"] },
];

for (const c of PURE_CASES) {
  test(`${c.name}: never mutates its input, shares what it does not change, and always audits`, () => {
    const data = deepFreeze(c.build ? c.build(seed()) : seed());
    const snapshot = structuredClone(data);
    const after = ok(data, c.userId, c.action);
    assert.deepEqual(data, snapshot);
    assert.notEqual(after, data);
    assert.deepEqual(changedKeys(data, after), [...c.touches].sort());
    assert.ok(after.audit.length > data.audit.length);
    assert.deepEqual(after.audit.slice(0, data.audit.length), data.audit, "the earlier trail is untouched");
    assert.ok(after.audit.slice(data.audit.length).every((a) => a.at === NOW_STAMP && /^a-\d+$/.test(a.id)));
  });
}

test("sync-distribution-from-tb never mutates its input either", { skip: skipUnlessReady("SG") }, () => {
  const data = deepFreeze(ok(seed(), "w-l-teo", inputs("telok-ayer", { taxableSpecifiedIncome: 1 })));
  const snapshot = structuredClone(data);
  const after = ok(data, "w-l-teo", { type: "sync-distribution-from-tb", fundId: "telok-ayer" });
  assert.deepEqual(data, snapshot);
  assert.deepEqual(changedKeys(data, after), ["audit", "funds"]);
});

test("an unknown action type is refused rather than ignored or thrown", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "a-moreno", { type: "bogus", fundId: "kallang" } as unknown as Action), "Unknown action");
  assert.equal(denied(data, "a-moreno", { type: "approve", fundId: "meranti", level: "x" } as unknown as Action), "Unknown approval level");
});
