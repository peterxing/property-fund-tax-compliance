import assert from "node:assert/strict";
import { test } from "node:test";
import { auModule } from "../../../src/domain/au/index.ts";
import { lodgmentOf, withholdingTotals } from "../../../src/domain/au/returns.ts";
import type { AppData, AuHolder, DocBlock, ReturnView } from "../../../src/domain/types.ts";
import { AU_IDS, auFund, ctxFor, docLines, freshData, NOW } from "./helpers.ts";
import { WORKING_PAPERS } from "./papersCapture.ts";

function returnFor(data: AppData, id: string, userId = "a-moreno"): ReturnView {
  const fund = auFund(data, id);
  return auModule.returnView(data, fund, auModule.fundCalc(data, fund, NOW), ctxFor(data, userId));
}

function kv(view: ReturnView, title: string): Record<string, string> {
  const block = view.papers.blocks.find((b): b is Extract<DocBlock, { kind: "kv" }> => b.kind === "kv" && b.title === title);
  assert.ok(block, `${view.papers.subtitle}: block "${title}"`);
  return Object.fromEntries(block.rows.map((r) => [r.label, r.value]));
}

const paragraphs = (view: ReturnView): string[] => view.papers.blocks.flatMap((b) => (b.kind === "paragraph" ? [b.text] : []));

const OBLIGATIONS: Record<string, Record<string, string>> = {
  harbourline: {
    "Fund payments": "A$62,347,700",
    "Clean building fund payment at 10%": "A$155,133",
    "Fund payment withholding at 15%": "A$2,105,340",
    "Fund payment withholding at 30%": "A$213,042",
    "Interest withholding at 10%": "A$30,972",
    "Total withheld": "A$2,504,486",
    "Remitted to the ATO": "A$2,504,486",
  },
  southbank: {
    "Fund payments": "A$51,626,250",
    "Fund payment withholding at 15%": "A$3,871,969",
    "Interest withholding at 10%": "A$20,131",
    "Total withheld": "A$3,892,099",
    "Remitted to the ATO": "A$2,410,099",
  },
  wattle: {
    "Fund payments": "A$112,315,700",
    "Fund payment withholding at 15%": "A$2,695,577",
    "Interest withholding at 10%": "A$47,069",
    "Total withheld": "A$2,742,646",
    "Remitted to the ATO": "A$2,742,646",
  },
  kurrajong: {
    "Fund payments": "A$39,859,900",
    "Fund payment withholding at 15%": "A$1,134,154",
    "Fund payment withholding at 30%": "A$582,187",
    "Interest withholding at 10%": "A$15,469",
    "NCMI fund payment at 30%": "A$721,185",
    "Total withheld": "A$2,452,995",
    "Remitted to the ATO": "A$2,092,403",
  },
  coastline: {
    "Fund payments": "A$16,970,450",
    "Fund payment withholding at 15%": "A$381,835",
    "Fund payment withholding at 30%": "A$254,557",
    "Interest withholding at 10%": "A$4,246",
    "Total withheld": "A$640,638",
    "Remitted to the ATO": "Not yet remitted",
  },
};

const KEY_FINANCIALS: Record<string, [string, string, string, string]> = {
  harbourline: ["A$96,312,745", "A$70,644,488", "A$25,668,257", "A$92,446,000"],
  southbank: ["A$91,355,844", "A$11,189,104", "A$80,166,740", "A$47,212,000"],
  wattle: ["A$170,766,928", "A$41,749,110", "A$129,017,818", "A$129,688,000"],
  kurrajong: ["A$60,637,860", "A$24,624,536", "A$36,013,324", "A$58,036,000"],
  coastline: ["A$35,352,326", "A$6,649,896", "A$28,702,430", "A$21,048,000"],
};

test("withholding obligations in the working papers match the reference, line by line", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    assert.deepEqual(kv(returnFor(data, id), "Withholding obligations"), OBLIGATIONS[id], id);
  }
});

test("key financial information is read from the trial balance and the distribution", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const rows = kv(returnFor(data, id), "Key financial information");
    assert.deepEqual(
      Object.values(rows),
      KEY_FINANCIALS[id],
      id,
    );
    assert.deepEqual(Object.keys(rows), ["Total income per accounts", "Total expenses per accounts", "Net profit per accounts", "Distributions to unitholders"]);
  }
});

test("assessable income in the working papers: clean building MIT income is its own row and part of both totals", () => {
  const data = freshData();
  const harbourline = returnFor(data, "harbourline");
  assert.deepEqual(Object.entries(kv(harbourline, "Trust components — assessable income other than capital gains")), [
    ["Australian income — other", "A$48,318,400"],
    ["Clean building MIT income", "A$6,205,300"],
    ["Interest", "A$1,184,900"],
    ["Assessable income other than capital gains", "A$55,708,600"],
    ["NCMI", "A$0"],
    ["Excluded from NCMI — transitional", "A$0"],
    ["NCMI and excluded from NCMI", "A$0"],
    ["Total assessable income excluding capital gains", "A$55,708,600"],
  ]);
  assert.deepEqual(Object.entries(kv(harbourline, "Trust components — capital gains")), [
    ["TARP capital gains — discount method (gross)", "A$7,824,000"],
    ["Less: CGT discount", "−A$3,912,000"],
    ["TARP capital gains — other method", "A$0"],
    ["Net capital gain", "A$3,912,000"],
  ]);
  const kurrajong = kv(returnFor(data, "kurrajong"), "Trust components — assessable income other than capital gains");
  assert.deepEqual([kurrajong["Australian income — other"], kurrajong.Interest, kurrajong.NCMI, kurrajong["Total assessable income excluding capital gains"]], ["A$30,244,100", "A$517,900", "A$9,615,800", "A$40,377,800"]);
  assert.equal(kurrajong["Assessable income other than capital gains"], "A$30,762,000", "NCMI sits outside the first subtotal and inside the total");
  const coastline = kv(returnFor(data, "coastline"), "Trust components — assessable income other than capital gains");
  assert.deepEqual(
    [coastline["Australian income — other"], coastline.Interest, coastline["Foreign income"], coastline["Total assessable income excluding capital gains"]],
    ["A$16,970,450", "A$212,300", "A$1,104,800", "A$18,287,550"],
  );
  const wattle = kv(returnFor(data, "wattle"), "Trust components — capital gains");
  assert.deepEqual([wattle["TARP capital gains — discount method (gross)"], wattle["TARP capital gains — other method"], wattle["Net capital gain"]], ["A$22,813,000", "A$1,288,000", "A$12,694,500"]);

  for (const id of AU_IDS) {
    const rows = kv(returnFor(data, id), "Trust components — assessable income other than capital gains");
    assert.equal("Clean building MIT income" in rows, id === "harbourline", `${id}: clean building MIT income only appears when the fund has some`);
    assert.equal("Foreign income" in rows, id === "coastline", `${id}: foreign income only appears when the fund has some`);
  }
});

test("the working papers read line for line like the reference's, for every fund", () => {
  const data = freshData();
  for (const id of AU_IDS) assert.deepEqual(docLines(returnFor(data, id).papers), WORKING_PAPERS[id], id);
});

test("readiness lists the four things a return needs, with the reference's wording", () => {
  const data = freshData();
  const flat = (id: string): unknown[] => returnFor(data, id).items.map((i) => [i.id, i.label, i.done, i.detail]);
  const labels = ["Distribution signed off", "No open exceptions", "Trial balance agrees to the distribution", "Withholding remitted and reconciled"];
  const ids = ["signed-off", "no-exceptions", "tb-agrees", "withholding-reconciled"];
  assert.deepEqual(flat("harbourline"), [
    [ids[0], labels[0], true, "Components and withholding are locked"],
    [ids[1], labels[1], true, "All checks clear"],
    [ids[2], labels[2], true, "Every component agrees"],
    [ids[3], labels[3], true, "Remitted amount matches"],
  ]);
  assert.deepEqual(flat("southbank"), [
    [ids[0], labels[0], false, "Status: In review"],
    [ids[1], labels[1], false, "AMMA statements overdue; Withholding reconciliation variance"],
    [ids[2], labels[2], true, "Every component agrees"],
    [ids[3], labels[3], false, "Remitted amount differs from computed"],
  ]);
  assert.deepEqual(flat("kurrajong"), [
    [ids[0], labels[0], false, "Status: In review"],
    [ids[1], labels[1], false, "Unit register out of balance; AMMA statements overdue; Withholding reconciliation variance"],
    [ids[2], labels[2], true, "Every component agrees"],
    [ids[3], labels[3], false, "Remitted amount differs from computed"],
  ]);
  assert.deepEqual(flat("coastline"), [
    [ids[0], labels[0], false, "Status: Preparing"],
    [ids[1], labels[1], false, "1 trial balance account without a tax category"],
    [ids[2], labels[2], false, "1 account(s) need a tax category"],
    [ids[3], labels[3], false, "Not yet remitted"],
  ]);
  assert.deepEqual(
    AU_IDS.map((id) => [id, returnFor(data, id).ready]),
    [
      ["harbourline", true],
      ["southbank", false],
      ["wattle", true],
      ["kurrajong", false],
      ["coastline", false],
    ],
  );
});

test("readiness follows the fund: status, mapping, component differences and remittance", () => {
  const data = freshData();
  const fund = auFund(data, "harbourline");
  fund.status = "In review";
  let view = returnFor(data, "harbourline");
  assert.equal(view.ready, false);
  assert.deepEqual([view.items[0].done, view.items[0].detail], [false, "Status: In review"]);

  fund.status = "Signed off";
  fund.inputs.interest += 500_00;
  view = returnFor(data, "harbourline");
  const tbItem = view.items.find((i) => i.id === "tb-agrees");
  assert.deepEqual([tbItem?.done, tbItem?.detail], [false, "1 component(s) differ from the distribution"]);
  assert.equal(view.ready, false);

  const over = freshData();
  auFund(over, "harbourline").whtRemitted = 250_448_636 + 100;
  assert.deepEqual(returnFor(over, "harbourline").items[3].detail, "Remitted amount differs from computed");
});

test("the due label is the AMMA deadline in the fund's own year", () => {
  const data = freshData();
  assert.deepEqual(
    AU_IDS.map((id) => returnFor(data, id).dueLabel),
    ["AMMA due 30 Sep 2026", "AMMA due 30 Sep 2026", "AMMA due 30 Sep 2026", "AMMA due 30 Sep 2026", "AMMA due 31 Dec 2026"],
  );
});

test("lodgment: the ATO receipt only where one was recorded", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const view = returnFor(data, id);
    assert.equal(view.title, "Tax return lodgment");
    assert.equal(view.referenceLabel, "ATO receipt reference");
    assert.equal(view.lodgmentKind, "return");
    if (id === "wattle") {
      assert.deepEqual(view.lodgment, { fundId: "wattle", kind: "return", reference: "Receipt 418806221407", date: "2026-10-09", actor: "A. Moreno" });
    } else {
      assert.equal(view.lodgment, null, id);
    }
  }
  const fund = auFund(data, "wattle");
  assert.equal(lodgmentOf(data, fund, "aiir")?.reference, "Receipt 418806117352");
  assert.equal(lodgmentOf(data, fund, "form-ut"), null);
  assert.equal(lodgmentOf(data, auFund(data, "harbourline"), "aiir"), null);
});

test("working papers: title, file name, period and the standing statements", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const view = returnFor(data, id);
    assert.equal(view.papers.title, "AMIT tax return and schedule — working papers");
    assert.equal(view.papers.subtitle, fund.name);
    assert.match(view.papers.fileName, /^[a-z0-9-]+-amit-return-working-papers\.pdf$/);
    assert.equal(view.papers.fileName, `${fund.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-amit-return-working-papers.pdf`);
    const text = paragraphs(view);
    assert.equal(text[0], fund.periodLabel);
    assert.ok(text.includes("Lodged electronically with the ATO through Standard Business Reporting"));
    assert.ok(text.includes("NCMI is reported at its own label and forms part of total assessable income."));
    assert.ok(text.includes("No exempt income, non-assessable non-exempt income or tax offsets are recorded for this fund."));
  }
});

/** The blocks under a heading, up to the next heading. */
function under(view: ReturnView, heading: string): DocBlock[] {
  const blocks = view.papers.blocks;
  const at = blocks.findIndex((b) => b.kind === "heading" && b.text === heading);
  assert.ok(at >= 0, `heading "${heading}"`);
  const next = blocks.findIndex((b, i) => i > at && b.kind === "heading");
  return blocks.slice(at + 1, next < 0 ? undefined : next);
}

test("trustee liabilities: units missing from the register leave trust components unattributed", () => {
  const data = freshData();
  assert.deepEqual(under(returnFor(data, "kurrajong"), "Trustee liabilities"), [
    { kind: "kv", rows: [{ label: "Determined trust components not reflected in member components", value: "A$53,051" }] },
    {
      kind: "paragraph",
      text: "1,250,000 units are missing from the register, so part of the trust components isn't attributed to any member. The trustee may be liable to tax on it unless the register is corrected.",
    },
  ]);
  for (const id of ["harbourline", "southbank", "wattle", "coastline"]) {
    assert.deepEqual(under(returnFor(data, id), "Trustee liabilities"), [{ kind: "paragraph", text: "None identified — every determined trust component is attributed to a member." }], id);
  }

  const holder = data.holders.find((h): h is AuHolder => h.id === "h-hl-5" && "auStatus" in h);
  assert.ok(holder);
  holder.units = 0;
  const blocks = under(returnFor(data, "harbourline"), "Trustee liabilities");
  const amount = blocks.find((b): b is Extract<DocBlock, { kind: "kv" }> => b.kind === "kv")?.rows[0].value ?? "";
  const dollars = Number(amount.replace(/[^0-9]/g, ""));
  assert.ok(Math.abs(dollars - 679_078) <= 1, `the holder's attributed amount is now unreported: ${amount}`);
  const note = blocks.find((b): b is Extract<DocBlock, { kind: "paragraph" }> => b.kind === "paragraph");
  assert.match(note?.text ?? "", /^16,090,400 units are missing from the register/);
});
test("unders and overs wait for sign-off, then list what the accounts and the distribution disagree on", () => {
  const data = freshData();
  const waiting = paragraphs(returnFor(data, "southbank"));
  assert.ok(waiting.includes("Worked out once the distribution is signed off."));
  assert.ok(paragraphs(returnFor(data, "harbourline")).includes("None — the trial balance agrees to the attributed components."));

  const fund = auFund(data, "harbourline");
  fund.inputs.interest += 500_00;
  const view = returnFor(data, "harbourline");
  const table = view.papers.blocks.find((b): b is Extract<DocBlock, { kind: "table" }> => b.kind === "table");
  assert.ok(table, "a table of differences");
  assert.deepEqual(
    table.columns.map((c) => c.label),
    ["Component", "Trial balance", "Attributed", "Difference"],
  );
  assert.deepEqual(table.rows, [{ component: "Australian interest", trialBalance: "A$1,184,900", attributed: "A$1,185,400", difference: "−A$500" }]);
});

test("withholdingTotals adds each label across the register in label order", () => {
  const data = freshData();
  const calc = auModule.fundCalc(data, auFund(data, "kurrajong"), NOW);
  const totals = withholdingTotals(calc);
  assert.deepEqual(
    totals.map((t) => t.label),
    ["Fund payment withholding at 15%", "Fund payment withholding at 30%", "Interest withholding at 10%", "NCMI fund payment at 30%"],
  );
  assert.equal(
    totals.reduce((sum, t) => sum + t.amount, 0),
    calc.withheld,
  );
});
