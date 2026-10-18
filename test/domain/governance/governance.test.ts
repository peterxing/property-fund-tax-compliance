import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "../../../src/domain/actions.ts";
import { appDataProblem } from "../../../src/domain/core/schema.ts";
import { inputHash, canonicalJson, fnv1a64Hex, lastSignOffVersion, versionDiff } from "../../../src/domain/governance/versions.ts";
import { tbView } from "../../../src/domain/selectors.ts";
import type { Action, AppData } from "../../../src/domain/types.ts";
import { NOW, ctxOf, denied, frozenSeed, fundOf, ok } from "../core-fixtures.ts";

const reopen = (fundId: string, reason = "Correcting signed-off inputs"): Action => ({ type: "reopen", fundId, reason });
const approve = (fundId: string, level: "review" | "agent"): Action => ({ type: "approve", fundId, level });

test("canonical JSON and input hashes are stable regardless of object key order", () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
  assert.equal(fnv1a64Hex(canonicalJson({ b: 2, a: 1 })), fnv1a64Hex(canonicalJson({ a: 1, b: 2 })));
  const data = frozenSeed();
  const shuffled: AppData = { ...data, tbRows: [...data.tbRows].reverse(), holders: [...data.holders].reverse() };
  assert.equal(inputHash(data, "harbourline"), inputHash(shuffled, "harbourline"));
});

test("submit, sign-off and reopen append immutable calculation versions with hashes and compact snapshots", () => {
  let data = frozenSeed();
  data = ok(data, "w-l-teo", { type: "submit", fundId: "kallang" });
  data = ok(data, "n-pillai", approve("kallang", "review"));
  data = ok(data, "a-moreno", { type: "sign-off", fundId: "kallang" });
  data = ok(data, "a-moreno", reopen("kallang", "Fixing imported trial balance"));
  const versions = data.versions.filter((v) => v.fundId === "kallang");
  assert.deepEqual(versions.map((v) => [v.trigger, v.label, v.reason]), [
    ["submit", "Submitted for review", null],
    ["sign-off", "Signed off", null],
    ["reopen", "Reopened", "Fixing imported trial balance"],
  ]);
  assert.ok(versions.every((v) => /^[0-9a-f]{16}$/.test(v.inputHash)));
  assert.ok(versions.every((v) => v.snapshot.some((line) => line.ref === "tb:result")));
  assert.equal(appDataProblem(data), null);
});

test("reopen requires a reason after the ordinary workflow gates pass", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "a-moreno", { type: "reopen", fundId: "loyang", reason: "" }), "Enter a reopen reason between 5 and 500 characters");
  assert.equal(denied(data, "a-moreno", { type: "reopen", fundId: "loyang", reason: "abcd" }), "Enter a reopen reason between 5 and 500 characters");
  assert.equal(denied(data, "a-moreno", { type: "reopen", fundId: "loyang", reason: "x".repeat(501) }), "Enter a reopen reason between 5 and 500 characters");
  assert.equal(denied(data, "n-pillai", { type: "reopen", fundId: "loyang", reason: "" }), "You don't have permission to reopen a fund");
});

test("manual adjustments flow into AU and SG book-to-tax and derived inputs", () => {
  let data = frozenSeed();
  data = ok(data, "r-okafor", { type: "gov-add-adjustment", fundId: "coastline", label: "Manager tax true-up", component: "ausOtherIncome", amount: 123_000_00, reason: "True-up from manager workpaper" });
  let au = tbView(data, "coastline", NOW);
  const coastlineInputs = fundOf(frozenSeed(), "coastline").inputs as unknown as Record<string, number>;
  assert.equal((au.derivedInputs as unknown as Record<string, number>).ausOtherIncome, coastlineInputs.ausOtherIncome + 123_000_00);
  assert.ok(au.bookToTax.rows.some((row) => row.label === "Manual adjustment: Manager tax true-up" && row.amount === 123_000_00));

  data = ok(data, "w-l-teo", { type: "gov-add-adjustment", fundId: "telok-ayer", label: "Specified income true-up", component: "taxableSpecifiedIncome", amount: -50_000_00, reason: "Late trustee manager schedule" });
  const sg = tbView(data, "telok-ayer", NOW);
  const telokInputs = fundOf(frozenSeed(), "telok-ayer").inputs as unknown as Record<string, number>;
  assert.equal((sg.derivedInputs as unknown as Record<string, number>).taxableSpecifiedIncome, telokInputs.taxableSpecifiedIncome - 50_000_00);
  assert.ok(sg.bookToTax.rows.some((row) => row.label === "Manual adjustment: Specified income true-up" && row.amount === -50_000_00));
  assert.equal(appDataProblem(data), null);
});

test("manual save, diff and stale detection compare a version to current inputs", () => {
  let data = frozenSeed();
  data = ok(data, "a-moreno", { type: "gov-save-version", fundId: "telok-ayer", label: "Base case" });
  const saved = data.versions.at(-1);
  assert.ok(saved);
  const current = fundOf(data, "telok-ayer").inputs as unknown as Record<string, number>;
  data = ok(data, "w-l-teo", { type: "update-inputs", fundId: "telok-ayer", inputs: { taxableSpecifiedIncome: current.taxableSpecifiedIncome + 100_000_00 } });
  const diff = versionDiff(data, saved, "current", NOW);
  assert.equal(diff.hashEqual, false);
  assert.ok(diff.inputs.some((row) => row.ref === "input:taxableSpecifiedIncome"));
});

test("seeded in-review and signed-off funds have current-matching versions and no stale sign-off", () => {
  const data = frozenSeed();
  const expected: Record<string, string[]> = {
    harbourline: ["submit", "sign-off"],
    southbank: ["submit"],
    wattle: ["submit", "sign-off"],
    kurrajong: ["submit"],
    loyang: ["submit", "sign-off"],
    meranti: ["submit"],
  };
  for (const [fundId, triggers] of Object.entries(expected)) {
    const versions = data.versions.filter((v) => v.fundId === fundId);
    assert.deepEqual(versions.map((v) => v.trigger), triggers, fundId);
    assert.ok(versions.every((v) => v.inputHash === inputHash(data, fundId)), fundId);
    for (const version of versions) assert.equal(versionDiff(data, version, "current", NOW).hashEqual, true, `${fundId} ${version.trigger}`);
    const signOff = lastSignOffVersion(data, fundId);
    if (signOff) assert.equal(signOff.inputHash, inputHash(data, fundId), `${fundId} sign-off is current`);
  }
  assert.equal(appDataProblem(data), null);
});

test("prior-year book-to-tax columns use TB prior balances for Harbourline and Loyang", () => {
  const data = frozenSeed();
  const harbourline = tbView(data, "harbourline", NOW).bookToTax.rows;
  assert.deepEqual(
    harbourline.map((row) => [row.label, row.amount, row.prior, row.change]),
    [
      ["Net profit per accounts", 2_566_825_700, 8_463_148_100, -5_896_322_400],
      ["Add: fair value loss", 4_120_658_000, 0, 4_120_658_000],
      ["Less: straight-line rent", -118_423_300, -144_239_600, 25_816_300],
      ["Less: accounting gain on disposal", -683_113_400, 0, -683_113_400],
      ["Add: accounting depreciation", 238_245_700, 233_803_400, 4_442_300],
      ["Add: non-deductible expenses", 4_187_200, 5_736_500, -1_549_300],
      ["Less: tax depreciation — Div 40", -185_549_600, 0, -185_549_600],
      ["Less: capital works — Div 43", -371_970_300, 0, -371_970_300],
      ["Add: TARP capital gains after discount", 391_200_000, 0, 391_200_000],
      ["Net income attributed to members", 5_962_060_000, 5_962_433_900, -373_900],
    ],
  );

  const loyang = tbView(data, "loyang", NOW).bookToTax;
  assert.deepEqual(
    loyang.rows.map((row) => [row.label, row.amount, row.prior, row.change]),
    [
      ["Net profit per accounts", 10_044_835_800, 10_044_835_800, 0],
      ["Less: fair value gain", -2_260_948_000, 0, -2_260_948_000],
      ["Less: straight-line rent", -105_671_200, -124_058_000, 18_386_800],
      ["Less: accounting gain on disposal", -598_864_000, 0, -598_864_000],
      ["Add: accounting depreciation", 228_254_400, 222_253_600, 6_000_800],
      ["Add: non-deductible expenses", 4_811_700, 4_234_300, 577_400],
      ["Less: capital allowances", -188_328_700, 0, -188_328_700],
    ],
  );
  assert.deepEqual([loyang.result, loyang.resultPrior, loyang.resultChange], [7_124_090_000, 7_201_023_100, -76_933_100]);
});
