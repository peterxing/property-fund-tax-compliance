import assert from "node:assert/strict";
import { test } from "node:test";

import { AU_BAS_LABELS, AU_GST_CODES } from "../../src/engine/au/gstCodes.ts";
import { buildAuBas, computeMarginSchemeGst } from "../../src/engine/au/gst.ts";
import { calculateAuBasDueDate } from "../../src/engine/au/calendar.ts";
import { seedData } from "../../src/domain/seed/index.ts";
import { gstReturnView } from "../../src/domain/gst/index.ts";
import { money } from "../../src/domain/format.ts";
import type { AppData, Ctx } from "../../src/domain/types.ts";
import { assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const DOC = "au-gst";
const AUD = "AUD" as const;
const NOW = new Date("2026-10-12T09:00:00");

function ctx(data: AppData): Ctx {
  return { now: NOW, user: data.users.find((user) => user.id === "a-moreno")! };
}

test("AU GST documentation examples are all covered", () => {
  assert.deepEqual(exampleIds(readRuleDoc(DOC)), ["GSTAU-1", "GSTAU-2", "BAS-1"]);
});

test("GSTAU-1 quotes the ATO taxable sale BAS result", () => {
  const r = buildAuBas({
    periodStart: "2018-10-01",
    periodEnd: "2018-12-31",
    accountingMethod: "NON_CASH",
    reportingCycle: "QUARTERLY",
    reportingMethod: "SIMPLER_BAS",
    transactions: [{ date: "2018-11-25", taxCode: "SALE_TAXABLE_NEW_RESIDENTIAL", netAmount: 90_000_000, gstAmount: 8_181_800 }],
  });
  assert.deepEqual(r.reportedLabels, { G1: 90_000_000, "1A": 8_181_800, "1B": 0 });
  assertExampleQuotes(DOC, "GSTAU-1", [
    money(90_000_000, AUD, 2),
    "GST payable as reported in the ATO example (1/11 of the price, shown in whole dollars on the BAS)",
    money(8_181_800, AUD, 2),
    `G1 ${money(r.reportedLabels.G1!, AUD, 2)}; 1A ${money(r.reportedLabels["1A"]!, AUD, 2)}; 1B ${money(r.reportedLabels["1B"]!, AUD, 2)}`,
    "net GST payable A$81,818",
    "A cent-rounded 1/11 would be A$81,818.18",
  ]);
});

test("GSTAU-2 quotes margin-scheme official examples", () => {
  const consideration = computeMarginSchemeGst({ saleDate: "2020-05-15", salePrice: 51_500_000, method: "CONSIDERATION", purchasePrice: 15_000_000 });
  const valuation = computeMarginSchemeGst({ saleDate: "2018-12-02", salePrice: 144_000_000, method: "VALUATION", valuationAmount: 100_000_000 });
  assertExampleQuotes(DOC, "GSTAU-2", [
    `sale price ${money(51_500_000, AUD, 2)} and purchase price ${money(15_000_000, AUD, 2)}`,
    `Margin is ${money(consideration.margin, AUD, 2)} and GST is one eleventh, ${money(consideration.gstPayable, AUD, 2)}`,
    `sale price ${money(144_000_000, AUD, 2)} and valuation ${money(100_000_000, AUD, 2)}`,
    `Margin is ${money(valuation.margin, AUD, 2)} and GST is ${money(valuation.gstPayable, AUD, 2)}`,
  ]);
});

test("BAS-1 quotes the Harbourline demo BAS labels and due date", () => {
  const data = seedData();
  const view = gstReturnView(data, "harbourline", "2025-09-30", ctx(data));
  const byRef = Object.fromEntries(view.boxes.map((box) => [box.ref, box.amount]));
  assert.equal(view.period.dueDate, "2025-11-25");
  assertExampleQuotes(DOC, "BAS-1", [
    tableRow(["G1", money(byRef["AU_BAS.G1"]!, AUD, 2)]),
    tableRow(["G2", money(byRef["AU_BAS.G2"]!, AUD, 2)]),
    tableRow(["G3", money(byRef["AU_BAS.G3"]!, AUD, 2)]),
    tableRow(["G10", money(byRef["AU_BAS.G10"]!, AUD, 2)]),
    tableRow(["G11", money(byRef["AU_BAS.G11"]!, AUD, 2)]),
    tableRow(["1A", money(byRef["AU_BAS.1A"]!, AUD, 2)]),
    tableRow(["1B", money(byRef["AU_BAS.1B"]!, AUD, 2)]),
    tableRow(["Net GST payable", money(view.netGst, AUD, 2)]),
    "due date is 2025-11-25 rather than the ordinary 2025-10-28",
  ]);
});

test("AU GST rate and BAS label table matches engine labels", () => {
  const g4Text = AU_BAS_LABELS.find((label) => label.id === "G4")!.description
    .split(". ")[0]!
    .replace("Platform subtotal for ", "");
  assertSectionQuotes(DOC, "AU GST rate and BAS label table", [
    tableRow(["GST standard rate", "10%", "2000-07-01", "`au-gst.rate-and-bas.2026-10-10`"]),
    tableRow(["Full BAS labels", ["G1", "G2", "G3", "G10", "G11", "1A", "1B"].join(", "), "2000-07-01", "`au-gst.rate-and-bas.2026-10-10`"]),
    tableRow(["Simpler BAS labels", ["G1", "1A", "1B"].join(", "), "2000-07-01", "`au-gst.rate-and-bas.2026-10-10`"]),
    tableRow(["Platform G4 subtotal", `${g4Text}, not a current displayed BAS label`, "2000-07-01", "`au-gst.codes.platform-catalogue.2026-10-10`"]),
  ]);
});

test("AU GST code mapping table quotes every exported code", () => {
  assertSectionQuotes(DOC, "AU GST code mapping table", AU_GST_CODES.map((code) => tableRow([
    code.id,
    code.side,
    code.basLabels.length ? code.basLabels.join(", ") : "none",
    code.rateModel,
    code.claimability,
  ])));
});

test("AU BAS due-date table and registration table quote coded values", () => {
  assert.equal(calculateAuBasDueDate({ periodStart: "2026-10-01", periodEnd: "2026-12-31", frequency: "QUARTERLY" }), "2027-03-01");
  assertSectionQuotes(DOC, "AU BAS due-date table", [
    tableRow(["Monthly", "21st of the following month", "December agent concession may move to 21 February if turnover is at or below A$10,000,000", "weekend and national public holidays roll forward"]),
    tableRow(["Quarter ending September", "28 October", "agent 25 November; online 11 December", "weekend and national public holidays roll forward"]),
    tableRow(["Annual GST return", "31 October, 28 February if no income-tax return is required, or supplied income-tax return due date", "caller supplies income-tax-return date for that mode", "weekend and national public holidays roll forward"]),
  ]);
  assertSectionQuotes(DOC, "Registration and penalty table", [
    tableRow(["Standard GST registration threshold", money(7_500_000, AUD, 2), "2000-07-01"]),
    tableRow(["Non-profit GST registration threshold", money(15_000_000, AUD, 2), "2000-07-01"]),
    tableRow(["Tax invoice threshold for GST credits", money(8_250, AUD, 2), "2000-07-01"]),
    tableRow(["FTL penalty unit", money(33_000, AUD, 2), "2024-11-07 to 2026-06-30"]),
    tableRow(["FTL penalty unit", money(36_400, AUD, 2), "2026-07-01"]),
  ]);
});
