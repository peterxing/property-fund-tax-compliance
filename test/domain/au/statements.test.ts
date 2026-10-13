import assert from "node:assert/strict";
import { test } from "node:test";
import { auModule } from "../../../src/domain/au/index.ts";
import { dateLabel } from "../../../src/domain/format.ts";
import type { AppData, AuInvestorView, DocBlock, DocModel } from "../../../src/domain/types.ts";
import { AU_IDS, allStrings, auFund, calcFor, ctxFor, freshData, NOW, sum } from "./helpers.ts";

type Table = Extract<DocBlock, { kind: "table" }>;
type Kv = Extract<DocBlock, { kind: "kv" }>;

const statement = (data: AppData, fundId: string, holderId: string): DocModel => {
  const fund = auFund(data, fundId);
  return auModule.statementDoc(data, fund, auModule.fundCalc(data, fund, NOW), holderId);
};
const table = (doc: DocModel): Table => {
  const block = doc.blocks.find((b): b is Table => b.kind === "table");
  assert.ok(block, "the components table");
  return block;
};
const kv = (doc: DocModel, title: string): Kv => {
  const block = doc.blocks.find((b): b is Kv => b.kind === "kv" && b.title === title);
  assert.ok(block, `the "${title}" block`);
  return block;
};
const cents = (text: string): number => Math.round(Number(text.replace(/[^0-9.-]/g, "")) * 100);
const aiirOf = (data: AppData, fundId: string): AuInvestorView["aiir"] => {
  const fund = auFund(data, fundId);
  const view = auModule.investorView(data, fund, auModule.fundCalc(data, fund, NOW), ctxFor(data));
  assert.equal(view.market, "AU");
  return (view as AuInvestorView).aiir;
};

test("a foreign investor's statement: member details, each trust component with its withholding, and the figures for the tax return", () => {
  const doc = statement(freshData(), "harbourline", "h-hl-3");
  assert.equal(doc.fileName, "harbourline-office-trust-amma-sakuragawa-life-assurance.pdf");
  assert.equal(doc.title, "AMIT member annual statement");
  assert.equal(doc.subtitle, "Harbourline Office Trust");
  assert.deepEqual(doc.meta, [
    { label: "Member", value: "Sakuragawa Life Assurance" },
    { label: "Country", value: "Japan" },
    { label: "Tax status", value: "Foreign resident — EOI country" },
    { label: "Units held", value: "211,902,000" },
    { label: "Income year ended", value: "30 Jun 2026" },
    { label: "Statement due", value: "30 Sep 2026" },
  ]);

  const t = table(doc);
  assert.equal(t.title, "Your share of the trust components");
  assert.deepEqual(t.columns.map((c) => c.label), ["Tax character", "Amount", "Withholding", "Withheld"]);
  assert.deepEqual(t.rows, [
    { component: "Australian income — other", amount: "A$7,247,760.00", rate: "15%", withheld: "A$1,087,164.00" },
    { component: "Clean building MIT income", amount: "A$930,795.00", rate: "10%", withheld: "A$93,079.50" },
    { component: "Australian interest", amount: "A$177,735.00", rate: "10%", withheld: "A$17,773.50" },
    { component: "Discounted capital gains — TARP", amount: "A$586,800.00", rate: "15%", withheld: "A$88,020.00" },
    { component: "AMIT CGT gross-up amount — TARP", amount: "A$586,800.00", rate: "15%", withheld: "A$88,020.00" },
    { component: "Other non-attributable amounts", amount: "A$4,337,010.00", rate: "—", withheld: "—" },
  ]);
  assert.deepEqual(t.totalRow, { component: "Total", amount: "A$13,866,900.00", rate: "", withheld: "A$1,374,057.00" });

  assert.deepEqual(kv(doc, "Cost base").rows, [
    { label: "Attributed amounts (assessable)", value: "A$9,529,890.00" },
    { label: "Cash distribution received", value: "A$13,866,900.00" },
    { label: "AMIT cost base net amount — excess (decreases the cost base)", value: "A$4,337,010.00", emphasis: true },
  ]);

  const returnFigures = Object.fromEntries(kv(doc, "Amounts for your tax return").rows.map((r) => [r.label, r.value]));
  assert.equal(returnFigures["Managed investment trust fund payments"], "A$9,352,155.00", "interest is not a fund payment");
  assert.equal(returnFigures["Amounts withheld from MIT fund payments"], "A$1,356,283.50", "the withholding on the fund payment, without the interest withholding");
  assert.equal(Object.keys(returnFigures).length, 7);
  assert.deepEqual(
    doc.blocks.filter((b) => b.kind === "paragraph"),
    [{ kind: "paragraph", text: "Interest withholding of A$17,773.50 is separate from the fund payment withholding above.", tone: "muted" }],
  );
});

test("the statement carries the ATO notes, and the AMIT CGT gross-up footnote only where the investor has a gross-up amount", () => {
  const data = freshData();
  const harbourline = statement(data, "harbourline", "h-hl-3");
  assert.equal(harbourline.footnotes?.length, 3);
  assert.ok(harbourline.footnotes?.[0].startsWith("AMMA statements must be given within 3 months after year end"));
  assert.equal(
    harbourline.footnotes?.[2],
    "The AIIR reports attributed amounts after taking out the AMIT CGT gross-up amount of A$586,800.00, which is part of the assessable amount above.",
  );

  const kurrajong = statement(data, "kurrajong", "h-kj-5");
  assert.equal(kurrajong.footnotes?.length, 2, "no capital gain, no gross-up amount");
  assert.ok(!allStrings(kurrajong).some((s) => s.includes("CGT gross-up amount")));
});

test("a resident investor has nothing withheld", () => {
  const doc = statement(freshData(), "harbourline", "h-hl-2");
  const t = table(doc);
  assert.ok(t.rows.every((r) => r.rate === "—" && r.withheld === "—"));
  assert.equal(t.totalRow?.withheld, "A$0.00");
  assert.equal(kv(doc, "Amounts for your tax return").rows[1].value, "A$0.00");
  assert.ok(!doc.blocks.some((b) => b.kind === "paragraph"), "no interest withholding note");
  assert.equal(doc.meta?.[2].value, "Australian resident");
});

test("a shortfall increases the cost base, and the statement says so", () => {
  const doc = statement(freshData(), "southbank", "h-sb-1");
  const row = kv(doc, "Cost base").rows[2];
  assert.equal(row.label, "AMIT cost base net amount — shortfall (increases the cost base)");
  assert.equal(row.value, "A$1,445,058.00");
  assert.equal(row.emphasis, true);
  assert.equal(kv(doc, "Cost base").rows[1].value, "A$14,163,600.00");
});

test("the cost base net amount on every statement is the AIIR's, the same figure the unit cost base screen reverses", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const calc = calcFor(data, id);
    const aiir = aiirOf(data, id);
    const cost = auModule.costBaseView(data, fund, calc);
    for (const line of aiir.lines) {
      const doc = auModule.statementDoc(data, fund, calc, line.holderId);
      const row = kv(doc, "Cost base").rows[2];
      const label = line.costBaseNet > 0 ? "excess (decreases the cost base)" : line.costBaseNet < 0 ? "shortfall (increases the cost base)" : "nil";
      assert.equal(row.label, `AMIT cost base net amount — ${label}`, `${id} ${line.holderId}`);
      assert.equal(cents(row.value), Math.abs(line.costBaseNet), `${id} ${line.holderId}: the statement and the AIIR agree`);
      const unit = cost.unitRows.find((r) => r.holderId === line.holderId);
      assert.equal(unit?.adjustment, line.costBaseNet === 0 ? 0 : -line.costBaseNet, `${id} ${line.holderId}: the cost base screen applies it`);
    }
  }
});

test("the fund payment on every statement is the AIIR's, and the withholding adds up (the AIIR's total includes interest withholding)", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const calc = calcFor(data, id);
    const aiir = aiirOf(data, id);
    aiir.lines.forEach((line, i) => {
      const doc = auModule.statementDoc(data, fund, calc, line.holderId);
      const figures = kv(doc, "Amounts for your tax return").rows;
      const holder = calc.holders.find((h) => h.holder.id === line.holderId);
      assert.ok(holder);
      assert.equal(cents(figures[0].value) / 100, aiir.csv.rows[i][17], `${id} ${line.holderId}: fund payment, as in the AIIR spreadsheet`);
      const t = table(doc);
      assert.equal(cents(t.totalRow?.withheld ?? ""), holder.withheld, `${id} ${line.holderId}: total withheld`);
      const interest = holder.lines.find((l) => l.key === "interest")?.withheld ?? 0;
      assert.equal(cents(figures[1].value), holder.withheld - interest, `${id} ${line.holderId}: withheld on fund payments`);
      assert.equal(line.withheld, holder.withheld, `${id} ${line.holderId}: the AIIR reports the investor's total withholding, interest included`);
      assert.equal(sum(t.rows.map((r) => cents(r.amount))), cents(t.totalRow?.amount ?? ""), `${id} ${line.holderId}: the rows add to the total`);
      assert.equal(sum(t.rows.map((r) => (r.withheld === "—" ? 0 : cents(r.withheld)))), holder.withheld, `${id} ${line.holderId}: withholding by component`);
    });
  }
});

test("the statement due date is the AMMA deadline, for each fund", () => {
  const data = freshData();
  const labels: Record<string, string> = { harbourline: "30 Sep 2026", southbank: "30 Sep 2026", wattle: "30 Sep 2026", kurrajong: "30 Sep 2026", coastline: "31 Dec 2026" };
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const doc = auModule.statementDoc(data, fund, calcFor(data, id), data.holders.find((h) => h.fundId === id)!.id);
    assert.equal(doc.meta?.find((m) => m.label === "Statement due")?.value, labels[id], id);
    const amma = auModule.deadlines(data, fund, calcFor(data, id), NOW).find((d) => d.obligation === "AMMA statements");
    assert.ok(amma, id);
    assert.equal(dateLabel(amma.date), labels[id], `${id}: the deadline row and the statement agree`);
  }
  const coastline = statement(data, "coastline", "h-cl-1");
  assert.equal(coastline.meta?.find((m) => m.label === "Income year ended")?.value, "30 Sep 2026", "a substituted accounting period");
});

test("a holder that is not on the register gets a note, not a statement", () => {
  const doc = statement(freshData(), "harbourline", "nobody");
  assert.equal(doc.fileName, "harbourline-office-trust-amma-nobody.pdf");
  assert.equal(doc.title, "AMIT member annual statement");
  assert.equal(doc.subtitle, "Harbourline Office Trust");
  assert.equal(doc.meta, undefined);
  assert.deepEqual(doc.blocks, [{ kind: "paragraph", text: "This holder is not on the register for the fund, so there is no statement to show.", tone: "note" }]);
  const other = statement(freshData(), "wattle", "h-hl-3");
  assert.equal(other.meta, undefined, "a holder of another fund is not on this register either");
});

test("an investor with no units gets a statement showing nothing, not a broken one", () => {
  const data = freshData();
  const holder = data.holders.find((h) => h.id === "h-cl-4");
  assert.ok(holder);
  holder.units = 0;
  const doc = statement(data, "coastline", "h-cl-4");
  const t = table(doc);
  assert.deepEqual(t.rows, []);
  assert.equal(t.totalRow?.amount, "A$0.00");
  assert.equal(t.totalRow?.withheld, "A$0.00");
  const row = kv(doc, "Cost base").rows[2];
  assert.equal(row.label, "AMIT cost base net amount — nil");
  assert.equal(row.value, "A$0.00");
  assert.equal(doc.meta?.find((m) => m.label === "Units held")?.value, "0");
  assert.ok(!doc.footnotes?.some((n) => n.includes("CGT gross-up amount")));
  assert.ok(allStrings(doc).every((s) => !/NaN|undefined|Infinity|-0\b/.test(s)));
});

test("every investor in every fund has a clean statement with a unique file name", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const holders = data.holders.filter((h) => h.fundId === id);
    const names = new Set<string>();
    for (const h of holders) {
      const doc = statement(data, id, h.id);
      assert.match(doc.fileName, /^[a-z0-9]+(-[a-z0-9]+)*-amma-[a-z0-9]+(-[a-z0-9]+)*\.pdf$/, `${id} ${h.id}`);
      assert.ok(!names.has(doc.fileName), `${id}: ${doc.fileName} is unique`);
      names.add(doc.fileName);
      const strings = allStrings(doc);
      assert.ok(strings.every((s) => !/NaN|undefined|Infinity|-A\$0\.00|A\$-/.test(s)), `${id} ${h.id}: ${strings.find((s) => /NaN|undefined|Infinity|-A\$0\.00|A\$-/.test(s))}`);
      assert.equal(doc.meta?.[0].value, h.holder);
      assert.equal(doc.meta?.[3].value, String(h.units).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
    }
    assert.equal(names.size, holders.length);
  }
});
