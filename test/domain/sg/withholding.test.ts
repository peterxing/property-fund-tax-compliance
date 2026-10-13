// The unitholder-class mapping onto the engine's REIT rules (src/engine/reitTax.ts) and the wording built from it. Rates, concession
// windows and the 90% threshold are read from the engine; these tests pin the behaviour at the edges of each window.
import assert from "node:assert/strict";
import { test } from "node:test";
import { determineReitInvestorTax } from "../../../src/engine/reitTax.ts";
import { sgModule } from "../../../src/domain/sg/index.ts";
import { sgClassOf, sgHolders, SG_CLASS_LABEL } from "../../../src/domain/sg/util.ts";
import {
  ENGINE_MAPPING,
  componentTreatmentText,
  concessionWindow,
  holderTreatment,
  isFinalPart,
  noticeRateText,
  noticeTreatmentText,
  transparencyThresholdPct,
  trusteePosition,
  withholdingOn,
} from "../../../src/domain/sg/withholding.ts";
import type { SgHolderClass } from "../../../src/domain/types.ts";
import { calcFor, freshData, NOW } from "./helpers.ts";

const CLASSES: SgHolderClass[] = ["individual", "qualifying", "nrni", "nr-fund", "other"];

test("each class maps onto an engine investor class and the engine's answer is used as is", () => {
  for (const cls of CLASSES) {
    const mapping = ENGINE_MAPPING[cls];
    const engine = determineReitInvestorTax({ distributionDate: "2026-11-27", investorClass: mapping.investorClass, declarationStatus: mapping.declarationStatus });
    const t = holderTreatment(cls, "2026-11-27");
    assert.equal(t.rateBps, engine.withholdingApplies ? engine.withholdingRateBps : 0, cls);
    assert.equal(t.final, engine.withholdingApplies && engine.finalTax && t.rateBps > 0, cls);
    assert.equal(t.remark, engine.remark, cls);
    assert.equal(t.statusLabel, SG_CLASS_LABEL[cls], cls);
    assert.equal(t.group, t.rateBps > 0 ? "net" : "gross", cls);
  }
});

test("treatment of each class on a distribution paid in November 2026", () => {
  const summary = (cls: SgHolderClass) => {
    const t = holderTreatment(cls, "2026-11-27");
    return [t.rateBps, t.final, t.rateSummary, t.partLabel, t.s45gRateLabel];
  };
  assert.deepEqual(summary("individual"), [0, false, "Exempt · paid gross", null, ""]);
  assert.deepEqual(summary("qualifying"), [0, false, "Paid gross · taxed at own rate", null, ""]);
  assert.deepEqual(summary("nrni"), [1000, true, "10% final", "Tax deducted at 10% (final)", "10% final"]);
  assert.deepEqual(summary("nr-fund"), [1000, true, "10% final", "Tax deducted at 10% (final)", "10% final"]);
  assert.deepEqual(summary("other"), [1700, false, "17% · not final", "Tax deducted at 17%", "17% not final"]);
});

test("the 10% concession starts and stops on the engine's dates", () => {
  const at = (cls: SgHolderClass, date: string) => holderTreatment(cls, date).rateBps;
  assert.equal(at("nrni", "2005-02-17"), 1700);
  assert.equal(at("nrni", "2005-02-18"), 1000);
  assert.equal(at("nrni", "2030-12-31"), 1000);
  assert.equal(at("nrni", "2031-01-01"), 1700);
  assert.equal(at("nr-fund", "2019-06-30"), 1700);
  assert.equal(at("nr-fund", "2019-07-01"), 1000);
  assert.equal(at("nr-fund", "2030-12-31"), 1000);
  assert.equal(at("nr-fund", "2031-01-01"), 1700);
  // Outside the window the withholding is the prevailing rate and is not final.
  assert.equal(holderTreatment("nrni", "2031-01-01").final, false);
  assert.equal(holderTreatment("nrni", "2031-01-01").rateSummary, "17% · not final");
  // Classes without a concession don't move.
  for (const date of ["2004-01-01", "2026-11-27", "2035-06-30"]) {
    assert.equal(at("individual", date), 0);
    assert.equal(at("qualifying", date), 0);
    assert.equal(at("other", date), 1700);
  }
});

test("concession windows are probed from the engine", () => {
  assert.deepEqual(concessionWindow("nrni"), { from: "2005-02-18", to: "2030-12-31" });
  assert.deepEqual(concessionWindow("nr-fund"), { from: "2019-07-01", to: "2030-12-31" });
  for (const section of ["13D", "13U", "13V"] as const) assert.deepEqual(concessionWindow("nr-fund", section), { from: "2019-07-01", to: "2030-12-31" }, section);
  assert.deepEqual(concessionWindow("nr-fund", "13OA"), { from: "2025-01-01", to: "2030-12-31" });
});

test("the notice and component wording follows the rates in force on the payment date", () => {
  assert.equal(componentTreatmentText("2026-11-27"), "0% individuals & qualifying · 10% qualifying non-residents · 17% others");
  assert.equal(componentTreatmentText("2031-02-01"), "0% individuals & qualifying · 17% qualifying non-residents · 17% others");
  assert.equal(noticeTreatmentText("2026-11-27"), "Gross to individuals and qualifying unitholders · 10% qualifying non-residents · 17% others");
  assert.equal(noticeTreatmentText("2031-02-01"), "Gross to individuals and qualifying unitholders · 17% qualifying non-residents · 17% others");
  assert.deepEqual(
    CLASSES.map((c) => noticeRateText(holderTreatment(c, "2026-11-27"))),
    ["Exempt — paid gross", "Paid gross — taxed at own rate", "10% final", "10% final", "17% — not final"],
  );
});

test("a final part label is recognised, a non-final one is not", () => {
  assert.equal(isFinalPart("Tax deducted at 10% (final)"), true);
  assert.equal(isFinalPart("Tax deducted at 17%"), false);
  assert.equal(isFinalPart(""), false);
});

test("tax deducted rounds half away from zero to the cent and never withholds at a zero rate", () => {
  assert.equal(withholdingOn(1, 1700), 0, "0.17 of a cent");
  assert.equal(withholdingOn(3, 1700), 1, "0.51 of a cent");
  assert.equal(withholdingOn(150, 1000), 15);
  assert.equal(withholdingOn(155, 1000), 16, "15.5 rounds up");
  assert.equal(withholdingOn(-155, 1000), -16, "and away from zero for a negative amount");
  assert.equal(withholdingOn(0, 1000), 0);
  assert.equal(withholdingOn(123_456_789, 0), 0);
  assert.equal(withholdingOn(1_396_322_000, 1000), 139_632_200);
  assert.equal(withholdingOn(584_126_000, 1700), 99_301_420);
});

test("the 90% threshold and the trustee position come from the engine", () => {
  assert.equal(transparencyThresholdPct(), 90);
  const failed = trusteePosition("2026-11-27", 4_190_650_000, 3_562_050_000);
  assert.equal(failed.passes, false);
  assert.equal(failed.retained, 628_600_000);
  assert.equal(failed.trusteeTax, 106_862_000, "tax on the retained income only, not on the whole of the specified income");
  assert.equal(failed.rate, 0.17);
  assert.equal(failed.rateBps, 1700);
  assert.equal(failed.requiredMinimum, 3_771_585_000);
  assert.equal(failed.thresholdPct, 90);
  assert.ok(Math.abs((failed.payoutRatio ?? 0) - 0.85) < 1e-6);

  const atThreshold = trusteePosition("2026-11-27", 10_000, 9_000);
  assert.equal(atThreshold.passes, true);
  assert.equal(atThreshold.retained, 1_000);
  assert.equal(atThreshold.trusteeTax, 170);
  assert.equal(trusteePosition("2026-11-27", 10_000, 8_999).passes, false);

  const nothing = trusteePosition("2026-11-27", 0, 0);
  assert.equal(nothing.payoutRatio, null);
  assert.equal(nothing.passes, true);
  assert.equal(nothing.trusteeTax, 0);
  const over = trusteePosition("2026-11-27", 10_000, 20_000);
  assert.equal(over.retained, 0);
  assert.equal(over.trusteeTax, 0);
  assert.equal(over.payoutRatio, 2);
});

test("a holder's class comes from the register, and the register keeps its order", () => {
  const data = freshData();
  assert.deepEqual(
    sgHolders(data, "loyang").map((h) => [h.id, sgClassOf(h)]),
    [["h-ly-1", "individual"], ["h-ly-2", "qualifying"], ["h-ly-3", "nrni"], ["h-ly-4", "nr-fund"], ["h-ly-5", "nrni"]],
  );
  // The calculation follows the class: moving the nominee onto a declaration removes its withholding.
  const before = calcFor(data, "meranti");
  const nominee = data.holders.find((h) => h.id === "h-mr-5");
  assert.ok(nominee && "sgClass" in nominee);
  assert.equal(before.holders[4].withheld, 45_618_480);
  nominee.sgClass = "qualifying";
  const after = sgModule.fundCalc(data, data.funds.find((f) => f.id === "meranti")!, NOW);
  assert.equal(after.holders[4].withheld, 0);
  assert.equal(after.withheld, 152_956_080 - 45_618_480);
  assert.equal(after.sg?.undeclaredHolders, 0);
  assert.ok(!after.checks.some((c) => c.id === "no-declaration"));
});

test("withholding changes with the payment date: after the concession ends a non-resident is withheld at 17%", () => {
  const data = freshData();
  const notice = data.sgNotices.find((n) => n.fundId === "loyang");
  assert.ok(notice);
  notice.paymentDate = "2031-02-27";
  const calc = sgModule.fundCalc(data, data.funds.find((f) => f.id === "loyang")!, NOW);
  // 17% of the 40% of the S$69,816,100 taxable distribution that goes to the three non-resident holders.
  assert.equal(calc.withheld, 474_749_480);
  assert.deepEqual(calc.holders[2].withholdingParts, [{ label: "Tax deducted at 17%", amount: 237_374_740 }]);
  assert.equal(calc.holders[2].rateSummary, "17% · not final");
});
