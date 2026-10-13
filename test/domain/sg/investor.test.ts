// Investor reporting for the Singapore funds: the distribution tax notice (draft and published) and the s45G withholding filing,
// against the reference app's rendered Investor reporting screens.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sgModule } from "../../../src/domain/sg/index.ts";
import type { AppData, DocBlock, DocModel, SgInvestorView } from "../../../src/domain/types.ts";
import { ctxFor, freshData, NOW, sgFund } from "./helpers.ts";

function investorOf(data: AppData, id: string, userId = "a-moreno", now: Date = NOW, selected?: string | null): SgInvestorView {
  const fund = sgFund(data, id);
  const view = sgModule.investorView(data, fund, sgModule.fundCalc(data, fund, now), ctxFor(data, userId, now), selected);
  assert.equal(view.market, "SG");
  return view as SgInvestorView;
}
const tableOf = (doc: DocModel, title: string) => {
  const found = doc.blocks.find((b): b is Extract<DocBlock, { kind: "table" }> => b.kind === "table" && b.title === title);
  assert.ok(found, `table "${title}"`);
  return found;
};

const TELOK_NOTICE_BLOCKS: DocBlock[] = [
  { kind: "paragraph", text: "DRAFT", tone: "note" },
  {
    kind: "table",
    title: "Distribution by type",
    columns: [
      { key: "distribution", label: "Distribution" },
      { key: "centsPerUnit", label: "Cents per unit", align: "right" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "treatment", label: "Tax treatment" },
    ],
    rows: [
      { distribution: "Taxable income distribution", centsPerUnit: "1.378898", amount: "S$58,412,600.00", treatment: "Gross to individuals and qualifying unitholders · 10% qualifying non-residents · 17% others" },
      { distribution: "Tax-exempt income distribution", centsPerUnit: "0.073613", amount: "S$3,118,400.00", treatment: "Not taxable" },
      { distribution: "Capital distribution", centsPerUnit: "0.044989", amount: "S$1,905,800.00", treatment: "Not taxable · reduces the cost of units for traders" },
    ],
    totalRow: { distribution: "Total distribution", centsPerUnit: "1.497500", amount: "S$63,436,800.00", treatment: "" },
  },
  {
    kind: "table",
    title: "Tax deducted from the taxable income distribution",
    columns: [
      { key: "unitholder", label: "Unitholder" },
      { key: "treatment", label: "Taxable income distribution" },
    ],
    rows: [
      { unitholder: "Individuals, unless received through a partnership or a trade or business", treatment: "Exempt — paid gross" },
      { unitholder: "Qualifying unitholders, such as Singapore companies, with a declaration", treatment: "Paid gross — taxed at own rate" },
      { unitholder: "Qualifying non-resident non-individuals and funds, with a declaration", treatment: "10% final" },
      { unitholder: "Other unitholders, or no declaration", treatment: "17% — not final" },
    ],
  },
  {
    kind: "paragraph",
    text: "IRAS requires unitholders other than individuals to submit Form A, and depository agents Form B, before every distribution (IRAS e-Tax Guide para 13.1). The declaration cut-off set by the manager is 13 Nov 2026: submit by then to be paid gross or at 10%. Without a declaration, tax is deducted at 17%.",
  },
  { kind: "paragraph", text: "Tax-exempt income and capital distributions are not taxable (ITA s35(15)).", tone: "muted" },
  { kind: "paragraph", text: "The 10% rate applies to distributions made up to 31 December 2030.", tone: "muted" },
];

test("Telok Ayer: the unpublished notice is a draft with the reference's content", () => {
  const { notice } = investorOf(freshData(), "telok-ayer");
  assert.equal(notice.published, false);
  assert.equal(notice.publishedOn, null);
  assert.equal(notice.recordDate, "2026-11-06");
  assert.equal(notice.declarationDeadline, "2026-11-13");
  assert.equal(notice.paymentDate, "2026-11-27");
  assert.equal(notice.assessmentYear, 2027);
  assert.equal(notice.canPublish, true);
  assert.equal(notice.doc.fileName, "telok-ayer-commercial-reit-distribution-tax-notice.pdf");
  assert.equal(notice.doc.title, "Distribution tax notice");
  assert.equal(notice.doc.subtitle, "Telok Ayer Commercial REIT");
  assert.deepEqual(notice.doc.meta, [
    { label: "Distribution period", value: "1 Jul – 30 Sep 2026" },
    { label: "Record date", value: "6 Nov 2026" },
    { label: "Declaration cut-off set by the manager", value: "13 Nov 2026" },
    { label: "Payment date", value: "27 Nov 2026" },
    { label: "Year of assessment", value: "YA2027" },
  ]);
  assert.deepEqual(notice.doc.blocks, TELOK_NOTICE_BLOCKS);
});

test("the notice calls the declaration date the manager's cut-off and cites IRAS only for Form A / Form B before every distribution", () => {
  for (const id of ["telok-ayer", "loyang", "meranti", "kallang"]) {
    const { notice } = investorOf(freshData(), id);
    const paragraphs = notice.doc.blocks.flatMap((b) => (b.kind === "paragraph" ? [b.text] : []));
    const forms = paragraphs.filter((p) => p.includes("Form A"));
    assert.equal(forms.length, 1, id);
    assert.ok(forms[0].startsWith("IRAS requires unitholders other than individuals to submit Form A, and depository agents Form B, before every distribution (IRAS e-Tax Guide para 13.1). The declaration cut-off set by the manager is "), id);
    const words = [...paragraphs, ...(notice.doc.meta ?? []).map((m) => m.label)].join(" ");
    assert.ok(!/\bdue\b|seven days|7 days/i.test(words), `${id}: no sentence presents the cut-off as a legal due date`);
  }
});

test("Loyang: the published notice has no draft marker and the announced amounts", () => {
  const { notice } = investorOf(freshData(), "loyang");
  assert.equal(notice.published, true);
  assert.equal(notice.publishedOn, "2026-07-30");
  assert.equal(notice.canPublish, false, "a published notice stays locked");
  assert.equal(notice.recordDate, "2026-08-07");
  assert.equal(notice.declarationDeadline, "2026-08-14");
  assert.equal(notice.paymentDate, "2026-08-28");
  assert.ok(!notice.doc.blocks.some((b) => b.kind === "paragraph" && b.text === "DRAFT"));
  assert.deepEqual(
    tableOf(notice.doc, "Distribution by type").rows.map((r) => [r.centsPerUnit, r.amount]),
    [["2.431727", "S$69,816,100.00"], ["0.000000", "S$0.00"], ["0.149841", "S$4,302,000.00"]],
  );
  assert.deepEqual(tableOf(notice.doc, "Distribution by type").totalRow, { distribution: "Total distribution", centsPerUnit: "2.581568", amount: "S$74,118,100.00", treatment: "" });
  assert.deepEqual(notice.doc.meta?.map((m) => m.value), ["1 Jan – 30 Jun 2026", "7 Aug 2026", "14 Aug 2026", "28 Aug 2026", "YA2027"]);
  assert.ok(notice.doc.blocks.some((b) => b.kind === "paragraph" && b.text.includes("The declaration cut-off set by the manager is 14 Aug 2026: submit by then to be paid gross or at 10%")));
});

test("publishing a notice removes the draft marker and the publish button", () => {
  const data = freshData();
  const record = data.sgNotices.find((n) => n.fundId === "telok-ayer");
  assert.ok(record);
  record.publishedOn = "2026-10-12";
  record.notified = { taxable: 5_841_260_000, exempt: 311_840_000, capital: 190_580_000 };
  const { notice } = investorOf(data, "telok-ayer");
  assert.equal(notice.published, true);
  assert.equal(notice.publishedOn, "2026-10-12");
  assert.equal(notice.canPublish, false);
  assert.ok(!notice.doc.blocks.some((b) => b.kind === "paragraph" && b.text === "DRAFT"));
});

test("only roles that can publish, with access to the fund, get the publish button", () => {
  const data = freshData();
  const canPublish = (id: string, user: string) => investorOf(data, id, user).notice.canPublish;
  assert.equal(canPublish("telok-ayer", "a-moreno"), true, "head of tax");
  assert.equal(canPublish("telok-ayer", "w-l-teo"), true, "preparer");
  assert.equal(canPublish("telok-ayer", "n-pillai"), false, "reviewer");
  assert.equal(canPublish("telok-ayer", "s-lim"), false, "tax agent");
  assert.equal(canPublish("telok-ayer", "m-castillo"), false, "view only");
  assert.equal(canPublish("telok-ayer", "r-okafor"), false, "a preparer with no access to this fund");
  assert.equal(canPublish("loyang", "a-moreno"), false, "already published");
});

test("a fund with no notice record cannot be published and falls back to its period end", () => {
  const data = freshData();
  data.sgNotices = data.sgNotices.filter((n) => n.fundId !== "kallang");
  const { notice, s45g } = investorOf(data, "kallang");
  assert.equal(notice.canPublish, false);
  assert.equal(notice.published, false);
  assert.equal(notice.recordDate, "2026-09-30");
  assert.equal(notice.paymentDate, "2026-09-30");
  assert.equal(s45g.paymentDate, "2026-09-30");
  assert.equal(s45g.fileAndPayBy, "2026-11-15");
});

test("the selected notice id has no effect: a Singapore fund has one notice", () => {
  const data = freshData();
  assert.deepEqual(investorOf(data, "meranti", "a-moreno", NOW, "anything"), investorOf(data, "meranti"));
  assert.deepEqual(investorOf(data, "meranti", "a-moreno", NOW, null), investorOf(data, "meranti"));
});

// ------------------------------------------------------------------------------------------------ s45G
test("Telok Ayer: the s45G filing lists the two holders with tax deducted", () => {
  const { s45g } = investorOf(freshData(), "telok-ayer");
  assert.equal(s45g.paymentDate, "2026-11-27");
  assert.equal(s45g.fileAndPayBy, "2027-01-15");
  assert.equal(s45g.overdue, false);
  assert.equal(s45g.deducted, 186_920_320);
  assert.equal(s45g.paid, null);
  assert.equal(s45g.status, "not-remitted");
  assert.equal(s45g.emptyMessage, null);
  assert.deepEqual(s45g.rows, [
    { holder: "Sakuragawa Life Assurance", country: "Japan", classLabel: "Qualifying non-resident non-individual", rateLabel: "10% final", taxable: 876_189_000, deducted: 87_618_900 },
    { holder: "Nominee accounts without a declaration", country: "Various", classLabel: "Other unitholder", rateLabel: "17% not final", taxable: 584_126_000, deducted: 99_301_420 },
  ]);
  assert.deepEqual(s45g.totals, { taxable: 1_460_315_000, deducted: 186_920_320 });
  assert.equal(s45g.csv.fileName, "telok-ayer-commercial-reit-withholding-tax.csv");
  assert.deepEqual(s45g.csv.columns, ["Unitholder", "Country", "Class", "Rate", "Final tax", "Taxable distribution", "Tax deducted", "Date of payment", "Due date"]);
  assert.deepEqual(s45g.csv.rows, [
    ["Sakuragawa Life Assurance", "Japan", "Qualifying non-resident non-individual", "10%", "Yes", 8_761_890, 876_189, "2026-11-27", "2027-01-15"],
    ["Nominee accounts without a declaration", "Various", "Other unitholder", "17%", "No", 5_841_260, 993_014.2, "2026-11-27", "2027-01-15"],
  ]);
});

test("Loyang: reconciled remittance and the three non-resident holders", () => {
  const { s45g } = investorOf(freshData(), "loyang");
  assert.equal(s45g.fileAndPayBy, "2026-10-15");
  assert.equal(s45g.paid, 279_264_400);
  assert.equal(s45g.status, "reconciled");
  assert.equal(s45g.overdue, false);
  assert.deepEqual(
    s45g.rows.map((r) => [r.holder, r.rateLabel, r.taxable, r.deducted]),
    [
      ["Kestrel Pension Plan", "10% final", 1_396_322_000, 139_632_200],
      ["Lumen Asia Real Assets Fund", "10% final", 1_047_241_500, 104_724_150],
      ["Nordfjell Sovereign Holdings", "10% final", 349_080_500, 34_908_050],
    ],
  );
  assert.deepEqual(s45g.totals, { taxable: 2_792_644_000, deducted: 279_264_400 });
  assert.deepEqual(
    s45g.csv.rows.map((r) => [r[5], r[6]]),
    [[13_963_220, 1_396_322], [10_472_415, 1_047_241.5], [3_490_805, 349_080.5]],
  );
});

test("Meranti and Kallang: filing totals equal the withholding in the distribution", () => {
  const data = freshData();
  const meranti = investorOf(data, "meranti").s45g;
  assert.deepEqual(
    meranti.rows.map((r) => [r.taxable, r.deducted, r.rateLabel]),
    [[670_860_000, 67_086_000, "10% final"], [402_516_000, 40_251_600, "10% final"], [268_344_000, 45_618_480, "17% not final"]],
  );
  assert.deepEqual(meranti.totals, { taxable: 1_341_720_000, deducted: 152_956_080 });
  const kallang = investorOf(data, "kallang").s45g;
  assert.deepEqual(kallang.rows.map((r) => [r.taxable, r.deducted]), [[534_307_500, 53_430_750], [178_102_500, 30_277_425]]);
  assert.deepEqual(kallang.totals, { taxable: 712_410_000, deducted: 83_708_175 });
  assert.equal(kallang.deducted, kallang.totals.deducted);
});

test("the filing is overdue the day after the 15th of the second month, and only while unpaid", () => {
  const data = freshData();
  const onDue = investorOf(data, "kallang", "a-moreno", new Date(2027, 0, 15, 23, 0, 0)).s45g;
  assert.equal(onDue.overdue, false);
  const after = investorOf(data, "kallang", "a-moreno", new Date(2027, 0, 16, 0, 30, 0)).s45g;
  assert.equal(after.overdue, true);
  sgFund(data, "kallang").whtRemitted = 83_708_175;
  assert.equal(investorOf(data, "kallang", "a-moreno", new Date(2027, 0, 16, 9, 0, 0)).s45g.overdue, false);
});

test("nothing withheld: an empty filing with a message, never overdue", () => {
  const data = freshData();
  for (const h of data.holders) if (h.fundId === "kallang") (h as { sgClass: string }).sgClass = "individual";
  const { s45g } = investorOf(data, "kallang", "a-moreno", new Date(2027, 5, 1, 9, 0, 0));
  assert.equal(s45g.rows.length, 0);
  assert.equal(s45g.emptyMessage, "No tax deducted from this distribution");
  assert.deepEqual(s45g.totals, { taxable: 0, deducted: 0 });
  assert.equal(s45g.deducted, 0);
  assert.equal(s45g.overdue, false);
  assert.deepEqual(s45g.csv.rows, []);
});

test("the notice and filing never change the data, and repeat calls agree", () => {
  const data = freshData();
  const before = JSON.stringify(data);
  const first = investorOf(data, "telok-ayer");
  const second = investorOf(data, "telok-ayer");
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(first, second);
});

test("an AU fund is rejected", () => {
  const data = freshData();
  const au = data.funds.find((f) => f.market === "AU");
  assert.ok(au);
  const calc = sgModule.fundCalc(data, sgFund(data, "loyang"), NOW);
  assert.throws(() => sgModule.investorView(data, au, calc, ctxFor(data)), /Singapore module/);
});
