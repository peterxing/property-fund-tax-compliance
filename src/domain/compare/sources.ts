import { slug } from "../format.ts";
import { costBaseView, fundCalc, getFund, investorView, returnView, tbView } from "../selectors.ts";
import type { AppData, Cents, Ctx, Fund, FundId } from "../types.ts";
import { FEATURE_PROVIDERS, type CompareLine, type CompareSource } from "../providers.ts";

function unique(lines: CompareLine[]): CompareLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (seen.has(line.ref) || !Number.isFinite(line.amount)) return false;
    seen.add(line.ref);
    return true;
  });
}

function source(id: string, label: string, description: string, lines: CompareLine[], tolerance: Cents = 100): CompareSource {
  return { id, label, description, lines: unique(lines), tolerance };
}

function componentsSource(data: AppData, fund: Fund, ctx: Ctx): CompareSource {
  const calc = fundCalc(data, fund.id, ctx.now);
  return source(
    "distribution-components",
    "Distribution components",
    "This platform's distribution by tax character for the selected fund and period.",
    calc.components.map((line) => ({
      ref: `component.${line.key}`,
      label: line.label,
      amount: line.amount,
      section: "Distribution components",
      note: line.treatment,
    })),
  );
}

function withholdingSource(data: AppData, fund: Fund, ctx: Ctx): CompareSource {
  const calc = fundCalc(data, fund.id, ctx.now);
  const lines = calc.holders.flatMap((line) => [
    {
      ref: `withholding.${line.holder.id}.cash`,
      label: `${line.holder.holder} — gross cash`,
      amount: line.cash,
      section: "Withholding by holder",
      note: line.rateSummary,
    },
    {
      ref: `withholding.${line.holder.id}.withheld`,
      label: `${line.holder.holder} — withheld`,
      amount: line.withheld,
      section: "Withholding by holder",
      note: line.rateSummary,
    },
  ]);
  return source("withholding-by-holder", "Withholding by holder", "Gross cash and withholding by registered holder.", lines);
}

function bookToTaxSource(data: AppData, fund: Fund, ctx: Ctx): CompareSource {
  const view = tbView(data, fund.id, ctx.now);
  return source(
    "book-to-tax",
    "Book-to-tax reconciliation",
    view.bookToTax.title,
    view.bookToTax.rows.map((row) => ({
      ref: `bookToTax.${slug(row.label)}`,
      label: row.label,
      amount: row.amount,
      section: "Book to tax",
      note: row.kind === "result" ? view.bookToTax.resultLabel : row.kind,
    })),
  );
}

function returnPapersSource(data: AppData, fund: Fund, ctx: Ctx): CompareSource {
  const view = returnView(data, fund.id, ctx);
  const lines: CompareLine[] = [];
  for (const block of view.papers.blocks) {
    if (block.kind !== "kv") continue;
    for (const row of block.rows) {
      const value = parseDocMoney(row.value);
      if (value === null) continue;
      lines.push({ ref: `return.${slug(block.title ?? "papers")}.${slug(row.label)}`, label: row.label, amount: value, section: block.title ?? "Working papers", note: view.dueLabel });
    }
  }
  return source("tax-return-working-papers", "Tax return working papers", view.papers.title, lines);
}

function parseDocMoney(value: string): Cents | null {
  const match = /[AS]\$[\d,]+(?:\.\d{2})?/.exec(value);
  if (!match) return null;
  const negative = value.includes("−") || /^\s*\(/.test(value);
  const cents = Number(match[0].replace(/[AS]|\$|,/g, "")) * 100;
  if (!Number.isSafeInteger(Math.round(cents))) return null;
  return (negative ? -1 : 1) * Math.round(cents);
}

function investorReportingSource(data: AppData, fund: Fund, ctx: Ctx): CompareSource {
  const view = investorView(data, fund.id, ctx);
  if (view.market === "AU") {
    const lines = view.aiir.lines.flatMap((line) => [
      { ref: `investor.${line.holderId}.attributed`, label: `${line.holder} — attributed`, amount: line.attributed, section: "AIIR investor lines", note: "AIIR investor line" },
      { ref: `investor.${line.holderId}.cash`, label: `${line.holder} — cash`, amount: line.cash, section: "AIIR investor lines", note: "AIIR investor line" },
      { ref: `investor.${line.holderId}.withheld`, label: `${line.holder} — withheld`, amount: line.withheld, section: "AIIR investor lines", note: "AIIR investor line" },
      { ref: `investor.${line.holderId}.costBaseNet`, label: `${line.holder} — AMIT cost base net amount`, amount: line.costBaseNet, section: "AIIR investor lines", note: "AIIR investor line" },
    ]);
    return source("investor-reporting", "Investor reporting", "AU AIIR investor lines by holder.", lines);
  }
  const lines = view.s45g.rows.flatMap((row) => [
    { ref: `investor.${slug(row.holder)}.taxable`, label: `${row.holder} — taxable distribution`, amount: row.taxable, section: "s45G rows", note: row.rateLabel },
    { ref: `investor.${slug(row.holder)}.deducted`, label: `${row.holder} — tax deducted`, amount: row.deducted, section: "s45G rows", note: row.rateLabel },
  ]);
  return source("investor-reporting", "Investor reporting", "SG s45G withholding rows by unitholder.", lines);
}

function costBaseSource(data: AppData, fund: Fund, ctx: Ctx): CompareSource {
  const view = costBaseView(data, fund.id, ctx);
  const lines: CompareLine[] = [
    { ref: "costBase.units.opening", label: "Unit cost base — opening", amount: view.unitTotals.opening, section: "Unit cost base", note: view.footnote },
    { ref: "costBase.units.adjustment", label: `Unit cost base — ${view.adjustmentLabel}`, amount: view.unitTotals.adjustment, section: "Unit cost base", note: view.footnote },
    { ref: "costBase.units.closing", label: "Unit cost base — closing", amount: view.unitTotals.closing, section: "Unit cost base", note: view.footnote },
    { ref: "costBase.units.marketValue", label: "Unit cost base — market value", amount: view.unitTotals.marketValue, section: "Unit cost base", note: view.unitPriceLabel },
  ];
  for (const investor of view.deferredTax?.investors ?? []) {
    lines.push({ ref: `costBase.deferred.${investor.id}`, label: `Deferred tax — ${investor.label}`, amount: investor.amount, section: "Deferred tax", note: view.deferredTax?.note ?? "" });
  }
  return source("cost-base", "Cost base and deferred tax", `Unit cost base totals. ${view.asAtLabel}`, lines);
}

function summarySource(data: AppData, fund: Fund, ctx: Ctx): CompareSource {
  const calc = fundCalc(data, fund.id, ctx.now);
  const lines: CompareLine[] = [
    { ref: "summary.cash", label: "Cash distribution", amount: calc.cash, section: "Summary", note: fund.periodLabel },
    { ref: "summary.withheld", label: "Withholding computed", amount: calc.withheld, section: "Summary", note: calc.recon.status },
    { ref: "summary.characterTotal", label: "Total by tax character", amount: calc.characterTotal, section: "Summary", note: calc.narrative },
  ];
  if (calc.au) {
    lines.push(
      { ref: "summary.au.fundPayment", label: "Fund payment", amount: calc.au.fundPayment, section: "Summary", note: "MIT withholding fund payment" },
      { ref: "summary.au.costBaseNet", label: "AMIT cost base net amount", amount: calc.au.costBaseNet, section: "Summary", note: "AMIT cost base adjustment" },
    );
  }
  if (calc.sg && fund.market === "SG") {
    lines.push(
      { ref: "summary.sg.taxableSpecifiedIncome", label: "Taxable specified income", amount: fund.inputs.taxableSpecifiedIncome, section: "Summary", note: "Singapore tax transparency" },
      { ref: "summary.sg.trusteeTax", label: "Trustee tax on retained income", amount: calc.sg.trusteeTax, section: "Summary", note: "17% of retained taxable specified income" },
    );
  }
  return source("summary", "Statement summary", "Headline distribution and withholding figures.", lines);
}

export function compareSources(data: AppData, fundId: FundId, ctx: Ctx): CompareSource[] {
  const fund = getFund(data, fundId);
  const core = [summarySource(data, fund, ctx), componentsSource(data, fund, ctx), withholdingSource(data, fund, ctx), bookToTaxSource(data, fund, ctx), returnPapersSource(data, fund, ctx), investorReportingSource(data, fund, ctx), costBaseSource(data, fund, ctx)];
  const feature = FEATURE_PROVIDERS.flatMap((provider) => provider.compareSources?.(data, fund, ctx.now) ?? []);
  return [...core, ...feature].filter((s) => s.lines.length > 0);
}
