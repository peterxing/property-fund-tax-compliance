// Unitholder distribution statements for the Singapore funds, assembled on the engine's statement builder.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sgModule } from "../../../src/domain/sg/index.ts";
import type { DocBlock, DocModel } from "../../../src/domain/types.ts";
import { calcFor, freshData, NOW, SG_IDS, sgFund } from "./helpers.ts";

function docFor(fundId: string, holderId: string, mutate?: (data: ReturnType<typeof freshData>) => void): DocModel {
  const data = freshData();
  mutate?.(data);
  const fund = sgFund(data, fundId);
  return sgModule.statementDoc(data, fund, sgModule.fundCalc(data, fund, NOW), holderId);
}

type Block<K extends DocBlock["kind"]> = Extract<DocBlock, { kind: K }>;
function block<K extends DocBlock["kind"]>(doc: DocModel, kind: K): Block<K> {
  const found = doc.blocks.find((b): b is Block<K> => b.kind === kind);
  assert.ok(found, `a ${kind} block`);
  return found;
}

/** "S$13,963,220.00" and "(S$1,396,322.00)" as cents. */
const cents = (text: string): number => Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);

test("a non-resident holder's statement: 10% final withholding on the taxable part", () => {
  const doc = docFor("loyang", "h-ly-3");
  assert.equal(doc.fileName, "loyang-logistics-reit-unitholder-statement-kestrel-pension-plan.pdf");
  assert.equal(doc.title, "Unitholder distribution statement");
  assert.equal(doc.subtitle, "Loyang Logistics REIT");
  assert.deepEqual(doc.meta, [
    { label: "Unitholder", value: "Kestrel Pension Plan" },
    { label: "Country", value: "Canada" },
    { label: "Tax status", value: "Qualifying non-resident non-individual" },
    { label: "Units held", value: "574,210,000" },
    { label: "Distribution period", value: "1 Jan – 30 Jun 2026" },
    { label: "Payment date", value: "28 Aug 2026" },
    { label: "Year of assessment", value: "YA2027" },
  ]);
  const table = block(doc, "table");
  assert.equal(table.title, "Distribution by type");
  assert.deepEqual(table.columns, [
    { key: "distribution", label: "Distribution" },
    { key: "amount", label: "Amount", align: "right" },
    { key: "treatment", label: "Tax treatment" },
  ]);
  assert.deepEqual(table.rows, [
    { distribution: "Taxable income distribution", amount: "S$13,963,220.00", treatment: "10% final" },
    { distribution: "Capital distribution", amount: "S$860,400.00", treatment: "Not taxable · reduces cost base" },
  ]);
  assert.deepEqual(table.totalRow, { distribution: "Total distribution", amount: "S$14,823,620.00", treatment: "" });
  const payment = block(doc, "kv");
  assert.equal(payment.title, "Payment");
  assert.deepEqual(payment.rows, [
    { label: "Gross distribution", value: "S$14,823,620.00" },
    { label: "Tax deducted at 10% (final)", value: "(S$1,396,322.00)" },
    { label: "Net cash paid", value: "S$13,427,298.00", emphasis: true },
  ]);
  const notes = doc.blocks.filter((b): b is Block<"paragraph"> => b.kind === "paragraph").map((b) => b.text);
  assert.deepEqual(notes, [
    "Qualifying non-resident non-individuals get the 10% final withholding-tax concession through 31 Dec 2030.",
    "Return of capital should generally reduce the unitholder's cost base; if it exceeds cost, the excess can become taxable trading income.",
  ]);
});

test("an individual is paid gross: no tax line, net equals gross", () => {
  const doc = docFor("loyang", "h-ly-1");
  const table = block(doc, "table");
  assert.deepEqual(table.rows[0], { distribution: "Taxable income distribution", amount: "S$24,435,635.00", treatment: "Exempt · paid gross" });
  assert.equal(table.totalRow?.amount, "S$25,941,335.00");
  assert.deepEqual(block(doc, "kv").rows, [
    { label: "Gross distribution", value: "S$25,941,335.00" },
    { label: "Net cash paid", value: "S$25,941,335.00", emphasis: true },
  ]);
  assert.ok(doc.blocks.some((b) => b.kind === "paragraph" && b.text === "Other individuals are exempt under section 13(1)(zh) of the ITA."));
});

test("a holder without a declaration is withheld at 17%, and the statement says it is not final", () => {
  const doc = docFor("meranti", "h-mr-5");
  const table = block(doc, "table");
  assert.deepEqual(table.rows, [
    { distribution: "Taxable income distribution", amount: "S$2,683,440.00", treatment: "17% · not final" },
    { distribution: "Tax-exempt income distribution", amount: "S$144,270.00", treatment: "Not taxable" },
  ]);
  assert.deepEqual(block(doc, "kv").rows, [
    { label: "Gross distribution", value: "S$2,827,710.00" },
    { label: "Tax deducted at 17%", value: "(S$456,184.80)" },
    { label: "Net cash paid", value: "S$2,371,525.20", emphasis: true },
  ]);
  assert.equal(doc.meta?.find((m) => m.label === "Tax status")?.value, "Other unitholder");
});

test("only the lines a holder actually received are shown, and the taxable line always is", () => {
  const kallang = block(docFor("kallang", "h-kr-1"), "table");
  assert.deepEqual(kallang.rows.map((r) => r.distribution), ["Taxable income distribution"]);
  const meranti = block(docFor("meranti", "h-mr-1"), "table");
  assert.deepEqual(meranti.rows.map((r) => r.distribution), ["Taxable income distribution", "Tax-exempt income distribution"]);
  const loyang = block(docFor("loyang", "h-ly-2"), "table");
  assert.deepEqual(loyang.rows.map((r) => r.distribution), ["Taxable income distribution", "Capital distribution"]);
  const telokAyer = block(docFor("telok-ayer", "h-ta-1"), "table");
  assert.deepEqual(telokAyer.rows.map((r) => r.distribution), [
    "Taxable income distribution",
    "Tax-exempt income distribution",
    "Capital distribution",
  ]);
});

test("every statement agrees with the fund's calculation, holder by holder", () => {
  const data = freshData();
  for (const id of SG_IDS) {
    const fund = sgFund(data, id);
    const calc = calcFor(data, id);
    const fileNames = new Set<string>();
    let gross = 0;
    for (const line of calc.holders) {
      const doc = sgModule.statementDoc(data, fund, calc, line.holder.id);
      const label = `${id} ${line.holder.id}`;
      const table = block(doc, "table");
      const payment = block(doc, "kv");
      const rowTotal = table.rows.reduce((sum, r) => sum + cents(r.amount), 0);
      assert.equal(rowTotal, line.cash, `${label}: the lines add up to the cash`);
      assert.equal(cents(table.totalRow?.amount ?? ""), line.cash, label);
      assert.equal(cents(payment.rows[0].value), line.cash, label);
      const tax = payment.rows.length === 3 ? cents(payment.rows[1].value) : 0;
      assert.equal(tax, line.withheld, `${label}: tax deducted`);
      assert.equal(cents(payment.rows[payment.rows.length - 1].value), line.net, `${label}: net cash`);
      assert.equal(payment.rows[payment.rows.length - 1].emphasis, true, label);
      assert.equal(payment.rows.length, line.withheld > 0 ? 3 : 2, label);
      assert.equal(doc.meta?.find((m) => m.label === "Unitholder")?.value, line.holder.holder, label);
      assert.equal(doc.meta?.find((m) => m.label === "Tax status")?.value, line.statusLabel, label);
      assert.match(doc.fileName, /^[a-z0-9-]+\.pdf$/, label);
      assert.ok(!fileNames.has(doc.fileName), `${label}: file names are distinct`);
      fileNames.add(doc.fileName);
      gross += cents(payment.rows[0].value);
    }
    assert.equal(gross, calc.cash, `${id}: the statements add up to the fund's distribution`);
  }
});

test("a holder who isn't on the register gets a plain notice rather than a statement", () => {
  const doc = docFor("loyang", "h-ly-99");
  assert.equal(doc.fileName, "loyang-logistics-reit-unitholder-statement.pdf");
  assert.equal(doc.title, "Unitholder distribution statement");
  assert.equal(doc.subtitle, "Loyang Logistics REIT");
  assert.deepEqual(doc.blocks, [{ kind: "paragraph", text: "This unitholder is not on the unit register for this fund." }]);
  // A holder of another fund is not on this fund's register either.
  assert.match(docFor("loyang", "h-mr-1").blocks[0].kind, /paragraph/);
});

test("a holder with no units gets a statement of nil", () => {
  const doc = docFor("loyang", "h-ly-5", (data) => {
    const h = data.holders.find((x) => x.id === "h-ly-5");
    assert.ok(h);
    h.units = 0;
  });
  assert.equal(doc.meta?.find((m) => m.label === "Units held")?.value, "0");
  const table = block(doc, "table");
  assert.equal(table.totalRow?.amount, "S$0.00");
  assert.deepEqual(block(doc, "kv").rows, [
    { label: "Gross distribution", value: "S$0.00" },
    { label: "Net cash paid", value: "S$0.00", emphasis: true },
  ]);
});

test("the statement follows the payment date on the notice", () => {
  const doc = docFor("loyang", "h-ly-3", (data) => {
    data.sgNotices.find((n) => n.fundId === "loyang")!.paymentDate = "2031-02-27";
  });
  assert.equal(doc.meta?.find((m) => m.label === "Payment date")?.value, "27 Feb 2031");
  // The concession has ended by then, so the withholding is the prevailing rate and isn't final.
  assert.equal(block(doc, "table").rows[0].treatment, "17% · not final");
  assert.equal(block(doc, "kv").rows[1].label, "Tax deducted at 17%");
});

test("a statement for a fund from another market is refused", () => {
  const data = freshData();
  const au = data.funds.find((f) => f.market === "AU");
  assert.ok(au);
  const calc = calcFor(data, "loyang");
  assert.throws(() => sgModule.statementDoc(data, au, calc, "h-ly-1"), /Singapore module/);
});
