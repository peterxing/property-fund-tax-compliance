// Tax returns workspace (Form UT) for the Singapore funds: readiness checklist, lodgment lookup and the working papers, against the
// reference app's rendered Tax returns screens (amounts in S$, the reference prints whole dollars).
import assert from "node:assert/strict";
import { test } from "node:test";
import { sgModule } from "../../../src/domain/sg/index.ts";
import { UNMAPPED_CATEGORY } from "../../../src/domain/types.ts";
import type { AppData, DocBlock, Lodgment, ReturnView } from "../../../src/domain/types.ts";
import { calcFor, ctxFor, freshData, NOW, sgFund, SG_IDS } from "./helpers.ts";

function returnOf(data: AppData, id: string, now: Date = NOW): ReturnView {
  const fund = sgFund(data, id);
  return sgModule.returnView(data, fund, sgModule.fundCalc(data, fund, now), ctxFor(data, "a-moreno", now));
}
const items = (view: ReturnView) => view.items.map((i) => [i.id, i.detail, i.done]);
const block = (view: ReturnView, kind: DocBlock["kind"], title: string): DocBlock => {
  const found = view.papers.blocks.find((b) => b.kind === kind && "title" in b && b.title === title);
  assert.ok(found, `${kind} block "${title}"`);
  return found;
};
const kvRows = (view: ReturnView, title: string) => {
  const b = block(view, "kv", title);
  assert.ok(b.kind === "kv");
  return b.rows.map((r) => [r.label, r.value]);
};

test("header fields for every fund: Form UT filing, IRAS reference and the due date from the engine", () => {
  const data = freshData();
  for (const id of SG_IDS) {
    const view = returnOf(data, id);
    assert.equal(view.title, "Form UT filing", id);
    assert.equal(view.referenceLabel, "IRAS acknowledgement reference", id);
    assert.equal(view.lodgmentKind, "form-ut", id);
    assert.equal(view.lodgment, null, id);
    assert.equal(view.dueLabel, "Form UT YA2027 · due 15 Apr 2027", id);
    assert.deepEqual(
      view.items.map((i) => [i.id, i.label]),
      [
        ["signed-off", "Distribution signed off"],
        ["no-exceptions", "No open exceptions"],
        ["tb-agrees", "Trial balance agrees to the distribution"],
        ["wht", "Withholding remitted and reconciled"],
      ],
      id,
    );
  }
});

test("readiness: only the signed-off, reconciled Loyang is ready", () => {
  const data = freshData();
  const loyang = returnOf(data, "loyang");
  assert.equal(loyang.ready, true);
  assert.deepEqual(items(loyang), [
    ["signed-off", "Components and withholding are locked", true],
    ["no-exceptions", "All checks clear", true],
    ["tb-agrees", "Every component agrees", true],
    ["wht", "Remitted amount matches", true],
  ]);
  const telok = returnOf(data, "telok-ayer");
  assert.equal(telok.ready, false);
  assert.deepEqual(items(telok), [
    ["signed-off", "Status: Preparing", false],
    ["no-exceptions", "All checks clear", true],
    ["tb-agrees", "Every component agrees", true],
    ["wht", "Not yet remitted", false],
  ]);
  assert.deepEqual(
    items(returnOf(data, "meranti")).map((i) => i[1]),
    ["Status: In review", "All checks clear", "Every component agrees", "Not yet remitted"],
  );
  const kallang = returnOf(data, "kallang");
  assert.deepEqual(items(kallang), [
    ["signed-off", "Status: Preparing", false],
    ["no-exceptions", "Taxable payout below 90%", false],
    ["tb-agrees", "Every component agrees", true],
    ["wht", "Not yet remitted", false],
  ]);
});

test("readiness follows the trial balance and the remittance", () => {
  const unmapped = freshData();
  const row = unmapped.tbRows.find((r) => r.id === "tb-loyang-4010");
  assert.ok(row);
  row.category = UNMAPPED_CATEGORY;
  let view = returnOf(unmapped, "loyang");
  assert.deepEqual(items(view)[2], ["tb-agrees", "1 account needs a tax category", false]);
  assert.equal(view.ready, false);

  const two = freshData();
  for (const id of ["tb-loyang-4010", "tb-loyang-4000"]) {
    const r = two.tbRows.find((x) => x.id === id);
    assert.ok(r);
    r.category = UNMAPPED_CATEGORY;
  }
  assert.equal(returnOf(two, "loyang").items[2].detail, "2 accounts need a tax category");

  const unbalanced = freshData();
  const cash = unbalanced.tbRows.find((r) => r.id === "tb-loyang-1000");
  assert.ok(cash);
  cash.current += 123_400;
  view = returnOf(unbalanced, "loyang");
  assert.deepEqual(items(view)[2], ["tb-agrees", "Trial balance is out of balance by S$1,234", false]);

  const differs = freshData();
  sgFund(differs, "loyang").inputs.taxableSpecifiedIncome += 1_000_000;
  assert.deepEqual(items(returnOf(differs, "loyang"))[2], ["tb-agrees", "1 component differs from the distribution", false]);

  const variance = freshData();
  sgFund(variance, "loyang").whtRemitted = 1;
  view = returnOf(variance, "loyang");
  assert.deepEqual(items(view)[3], ["wht", "Remitted amount differs from computed", false]);
  assert.deepEqual(items(view)[1], ["no-exceptions", "Withholding reconciliation variance", false]);
});

test("a fund with nothing withheld has nothing to remit", () => {
  const data = freshData();
  const fund = sgFund(data, "kallang");
  for (const h of data.holders) if (h.fundId === "kallang" && (h.id === "h-kr-4" || h.id === "h-kr-5")) (h as { sgClass: string }).sgClass = "individual";
  fund.inputs.taxableDistributed = Math.round(fund.inputs.taxableSpecifiedIncome * 0.95);
  const view = returnOf(data, "kallang");
  assert.equal(calcFor(data, "kallang").withheld, 0);
  assert.deepEqual(items(view)[3], ["wht", "No withholding to remit", true]);
});

test("the lodgment is the fund's Form UT record, and no other record", () => {
  const data = freshData();
  const aiir: Lodgment = { fundId: "loyang", kind: "aiir", reference: "X-1", date: "2027-01-01", actor: "A. Moreno" };
  const other: Lodgment = { fundId: "kallang", kind: "form-ut", reference: "X-2", date: "2027-04-01", actor: "A. Moreno" };
  const mine: Lodgment = { fundId: "loyang", kind: "form-ut", reference: "IRAS-YA2027-0042", date: "2027-04-12", actor: "A. Moreno" };
  data.lodgments.push(aiir, other, mine);
  assert.deepEqual(returnOf(data, "loyang").lodgment, mine);
  assert.deepEqual(returnOf(data, "kallang").lodgment, other);
  assert.equal(returnOf(data, "meranti").lodgment, null);
});

test("Kallang working papers match the reference document", () => {
  const view = returnOf(freshData(), "kallang");
  const doc = view.papers;
  assert.equal(doc.fileName, "kallang-riverside-retail-reit-form-ut-ya2027-working-papers.pdf");
  assert.equal(doc.title, "Form UT YA2027 — working papers");
  assert.equal(doc.subtitle, "Kallang Riverside Retail REIT");
  assert.deepEqual(
    doc.blocks.map((b) => b.kind),
    ["paragraph", "paragraph", "kv", "paragraph", "kv", "paragraph", "kv", "paragraph", "kv", "kv", "table", "paragraph"],
  );
  assert.deepEqual(doc.blocks[0], { kind: "paragraph", text: "Distribution period 1 Jul – 30 Sep 2026" });
  assert.deepEqual(doc.blocks[1], { kind: "paragraph", text: "File with audited accounts and the tax computation by 15 Apr 2027" });
  assert.deepEqual(kvRows(view, "Tax computation — 1 Jul – 30 Sep 2026"), [
    ["Net profit per accounts", "S$33,881,276"],
    ["Add: fair value loss", "S$7,315,440"],
    ["Add: straight-line rent", "S$412,890"],
    ["Add: accounting depreciation", "S$1,482,357"],
    ["Add: non-deductible expenses", "S$37,604"],
    ["Less: capital allowances", "−S$1,223,067"],
    ["Taxable specified income", "S$41,906,500"],
  ]);
  assert.deepEqual(doc.blocks[3], { kind: "paragraph", text: "Figures are for this distribution period; Form UT reports the full year.", tone: "muted" });
  assert.deepEqual(kvRows(view, "Tax transparency"), [
    ["Taxable specified income", "S$41,906,500"],
    ["Distributed to unitholders", "S$35,620,500"],
    ["Taxable payout", "85.0%"],
    ["Undistributed specified income", "S$6,286,000"],
  ]);
  assert.deepEqual(doc.blocks[5], { kind: "paragraph", text: "Below the 90% condition for tax transparency if it isn't made up over the rest of the year.", tone: "note" });
  assert.deepEqual(kvRows(view, "Tax payable by the trustee"), [
    ["Undistributed specified income", "S$6,286,000"],
    ["Tax at 17%", "S$1,068,620"],
  ]);
  assert.deepEqual(doc.blocks[7], { kind: "paragraph", text: "Income taxed at the trustee can be distributed later without further tax.", tone: "muted" });
  assert.deepEqual(kvRows(view, "Withholding tax on distributions (s45G)"), [
    ["Tax deducted at 10% (final)", "S$534,308"],
    ["Tax deducted at 17%", "S$302,774"],
    ["Total tax deducted", "S$837,082"],
    ["Paid to IRAS", "Not yet paid"],
  ]);
  assert.deepEqual(kvRows(view, "Key financial information"), [
    ["Total income per accounts", "S$65,756,316"],
    ["Total expenses per accounts", "S$31,875,040"],
    ["Net profit per accounts", "S$33,881,276"],
    ["Distributions to unitholders", "S$35,620,500"],
  ]);
  const table = block(view, "table", "Distributions tracking schedule");
  assert.ok(table.kind === "table");
  assert.deepEqual(
    table.columns.map((c) => [c.key, c.label, c.align ?? "left"]),
    [["type", "Type", "left"], ["opening", "Opening", "right"], ["derived", "Derived", "right"], ["distributed", "Distributed", "right"], ["transferred", "Transferred", "right"], ["closing", "Closing", "right"]],
  );
  assert.deepEqual(
    table.rows.map((r) => [r.type, r.opening, r.derived, r.distributed, r.transferred, r.closing]),
    [
      ["Tax transparency income", "S$0", "S$41,906,500", "−S$35,620,500", "−S$6,286,000", "S$0"],
      ["Income taxed at the trustee (after tax)", "S$0", "S$0", "S$0", "S$5,217,380", "S$5,217,380"],
      ["Tax-exempt income", "S$0", "S$0", "S$0", "S$0", "S$0"],
      ["Capital", "S$3,412,606", "S$0", "S$0", "S$0", "S$3,412,606"],
    ],
  );
  assert.equal(
    doc.blocks[11].kind === "paragraph" && doc.blocks[11].text,
    "Filed with the tax computation to track each type of income available for distribution. Undistributed specified income moves to income taxed at the trustee, net of 17% tax.",
  );
});

test("working papers carry each fund's own accounts and withholding", () => {
  const data = freshData();
  const key = (id: string) => kvRows(returnOf(data, id), "Key financial information").map((r) => r[1]);
  assert.deepEqual(key("loyang"), ["S$130,906,822", "S$30,458,464", "S$100,448,358", "S$74,118,100"]);
  assert.deepEqual(key("meranti"), ["S$54,131,169", "S$15,059,060", "S$39,072,109", "S$28,277,100"]);
  assert.deepEqual(key("telok-ayer"), ["S$91,238,557", "S$47,812,073", "S$43,426,484", "S$63,436,800"]);

  const loyang = returnOf(data, "loyang");
  assert.deepEqual(kvRows(loyang, "Withholding tax on distributions (s45G)"), [
    ["Tax deducted at 10% (final)", "S$2,792,644"],
    ["Total tax deducted", "S$2,792,644"],
    ["Paid to IRAS", "S$2,792,644"],
  ]);
  assert.ok(!loyang.papers.blocks.some((b) => b.kind === "paragraph" && b.tone === "note"), "a fund that passes the 90% test has no warning");
  const schedule = block(loyang, "table", "Distributions tracking schedule");
  assert.ok(schedule.kind === "table");
  assert.deepEqual(
    schedule.rows.map((r) => [r.type, r.opening, r.derived, r.distributed, r.transferred, r.closing]),
    [
      ["Tax transparency income", "S$0", "S$71,240,900", "−S$69,816,100", "−S$1,424,800", "S$0"],
      ["Income taxed at the trustee (after tax)", "S$418,366", "S$0", "S$0", "S$1,182,584", "S$1,600,950"],
      ["Tax-exempt income", "S$0", "S$0", "S$0", "S$0", "S$0"],
      ["Capital", "S$2,166,480", "S$5,988,640", "−S$4,302,000", "S$0", "S$3,853,120"],
    ],
  );
  const telok = block(returnOf(data, "telok-ayer"), "table", "Distributions tracking schedule");
  assert.ok(telok.kind === "table");
  assert.deepEqual(
    telok.rows.map((r) => [r.type, r.opening, r.derived, r.distributed, r.transferred, r.closing]),
    [
      ["Tax transparency income", "S$0", "S$58,412,600", "−S$58,412,600", "S$0", "S$0"],
      ["Income taxed at the trustee (after tax)", "S$0", "S$0", "S$0", "S$0", "S$0"],
      ["Tax-exempt income", "S$1,206,770", "S$3,118,400", "−S$3,118,400", "S$0", "S$1,206,770"],
      ["Capital", "S$9,884,215", "S$0", "−S$1,905,800", "S$0", "S$7,978,415"],
    ],
  );
});

test("the working papers change with the distribution but never mutate it", () => {
  const data = freshData();
  const fund = sgFund(data, "kallang");
  fund.inputs.taxableDistributed = Math.round(fund.inputs.taxableSpecifiedIncome * 0.95);
  const before = JSON.stringify(data);
  const view = returnOf(data, "kallang");
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(kvRows(view, "Tax transparency")[2], ["Taxable payout", "95.0%"]);
  assert.ok(!view.papers.blocks.some((b) => b.kind === "paragraph" && b.tone === "note"));
  assert.deepEqual(kvRows(view, "Tax payable by the trustee")[1][0], "Tax at 17%");
});

test("an AU fund is rejected", () => {
  const data = freshData();
  const au = data.funds.find((f) => f.market === "AU");
  assert.ok(au);
  assert.throws(() => sgModule.returnView(data, au, calcFor(data, "loyang"), ctxFor(data)), /Singapore module/);
});
