// Tax return readiness and the AMIT return working papers.
import type { AppData, AuFund, Cents, Ctx, DocBlock, DocModel, Fund, FundCalc, Lodgment, ReadinessItem, ReturnView, TbView } from "../types.ts";
import { UNMAPPED_CATEGORY } from "../types.ts";
import { dateLabel, integer, slug } from "../format.ts";
import { tbView } from "./tb.ts";
import { aud, asAuFund, nz, tbRowsOf } from "./util.ts";

const PROFIT_CATEGORIES: ReadonlySet<string> = new Set([
  "rent",
  "ncmi-rent",
  "ncmi-transitional",
  "clean-building",
  "interest-income",
  "foreign-income",
  "deductible-expense",
  "depreciation-book",
  "fair-value",
  "straight-line",
  "book-gain-sale",
  "non-deductible",
]);

export function facts(calc: FundCalc): NonNullable<FundCalc["au"]> {
  if (!calc.au) throw new Error(`Fund ${calc.fundId} has no Australian facts`);
  return calc.au;
}

export function lodgmentOf(data: AppData, fund: Fund, kind: Lodgment["kind"]): Lodgment | null {
  return data.lodgments.find((l) => l.fundId === fund.id && l.kind === kind) ?? null;
}

const byLabel = (a: [string, Cents], b: [string, Cents]): number => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/** What each withholding label adds up to across the register, in label order. */
export function withholdingTotals(calc: FundCalc): Array<{ label: string; amount: Cents }> {
  const totals = new Map<string, Cents>();
  for (const line of calc.holders) {
    for (const part of line.withholdingParts) totals.set(part.label, (totals.get(part.label) ?? 0) + part.amount);
  }
  return [...totals.entries()].sort(byLabel).map(([label, amount]) => ({ label, amount }));
}

function readiness(data: AppData, fund: AuFund, calc: FundCalc, tb: TbView): ReadinessItem[] {
  const unmapped = tbRowsOf(data, fund.id).filter((r) => r.category === UNMAPPED_CATEGORY).length;
  const differing = tb.components.filter((c) => !c.agrees).length;
  const exceptions = calc.checks.filter((c) => c.severity === "exception");
  const reconciled = calc.recon.status === "reconciled";

  return [
    {
      id: "signed-off",
      label: "Distribution signed off",
      done: fund.status === "Signed off",
      detail: fund.status === "Signed off" ? "Components and withholding are locked" : `Status: ${fund.status}`,
    },
    {
      id: "no-exceptions",
      label: "No open exceptions",
      done: exceptions.length === 0,
      detail: exceptions.length === 0 ? "All checks clear" : exceptions.map((c) => c.title).join("; "),
    },
    {
      id: "tb-agrees",
      label: "Trial balance agrees to the distribution",
      done: unmapped === 0 && differing === 0,
      detail:
        unmapped > 0
          ? `${unmapped} account(s) need a tax category`
          : differing > 0
            ? `${differing} component(s) differ from the distribution`
            : "Every component agrees",
    },
    {
      id: "withholding-reconciled",
      label: "Withholding remitted and reconciled",
      done: reconciled,
      detail: reconciled ? "Remitted amount matches" : calc.recon.status === "not-remitted" ? "Not yet remitted" : "Remitted amount differs from computed",
    },
  ];
}

/** Total income and expenses per the accounts: profit-and-loss accounts by the side of their balance. */
function profitAndLoss(data: AppData, fund: AuFund): { income: Cents; expenses: Cents } {
  let income = 0;
  let expenses = 0;
  for (const row of tbRowsOf(data, fund.id)) {
    if (!PROFIT_CATEGORIES.has(row.category)) continue;
    if (row.current < 0) income -= row.current;
    else expenses += row.current;
  }
  return { income, expenses };
}

type KvRow = { label: string; value: string; emphasis?: boolean };

function workingPapers(data: AppData, fund: AuFund, calc: FundCalc, tb: TbView): DocModel {
  const f = facts(calc);
  const amount = (key: string): Cents => calc.components.find((c) => c.key === key)?.amount ?? 0;
  const a = (cents: Cents): string => aud(nz(cents), 0);

  const otherIncome = amount("ausOtherIncome");
  const cleanBuilding = amount("cleanBuilding");
  const interest = amount("interest");
  const foreign = amount("foreignIncome");
  const ncmi = amount("ncmi");
  const excluded = amount("excludedNcmi");
  const discount = amount("discountGainTarp");
  const concession = amount("cgtConcessionTarp");
  const otherGain = amount("otherGainTarp");
  // Clean building MIT income and foreign income show a row only when the fund has some; NCMI sits outside the subtotal at its own labels.
  const assessableExCapital = otherIncome + cleanBuilding + interest + foreign;

  const incomeRows: KvRow[] = [{ label: "Australian income — other", value: a(otherIncome) }];
  if (cleanBuilding !== 0) incomeRows.push({ label: "Clean building MIT income", value: a(cleanBuilding) });
  incomeRows.push({ label: "Interest", value: a(interest) });
  if (foreign !== 0) incomeRows.push({ label: "Foreign income", value: a(foreign) });
  incomeRows.push(
    { label: "Assessable income other than capital gains", value: a(assessableExCapital), emphasis: true },
    { label: "NCMI", value: a(ncmi) },
    { label: "Excluded from NCMI — transitional", value: a(excluded) },
    { label: "NCMI and excluded from NCMI", value: a(ncmi + excluded) },
    { label: "Total assessable income excluding capital gains", value: a(assessableExCapital + ncmi + excluded), emphasis: true },
  );

  const withheldRows: KvRow[] = [
    { label: "Fund payments", value: a(f.fundPayment) },
    ...withholdingTotals(calc).map((p) => ({ label: p.label, value: a(p.amount) })),
    { label: "Total withheld", value: a(calc.withheld), emphasis: true },
    { label: "Remitted to the ATO", value: calc.recon.remitted === null ? "Not yet remitted" : a(calc.recon.remitted) },
  ];

  const { income, expenses } = profitAndLoss(data, fund);

  const unattributed = calc.components.filter((c) => c.attributed).reduce((sum, c) => sum + c.unallocated, 0);
  const liabilities: DocBlock[] = [{ kind: "heading", text: "Trustee liabilities", level: 2 }];
  if (calc.unallocatedUnits > 0 && unattributed > 0) {
    liabilities.push(
      { kind: "kv", rows: [{ label: "Determined trust components not reflected in member components", value: a(unattributed) }] },
      {
        kind: "paragraph",
        text: `${integer(calc.unallocatedUnits)} units are missing from the register, so part of the trust components isn't attributed to any member. The trustee may be liable to tax on it unless the register is corrected.`,
      },
    );
  } else {
    liabilities.push({ kind: "paragraph", text: "None identified — every determined trust component is attributed to a member." });
  }

  const unders: DocBlock[] = [{ kind: "heading", text: "Unders and overs", level: 2 }];
  const differing = tb.components.filter((c) => !c.agrees);
  if (fund.status !== "Signed off") {
    unders.push({ kind: "paragraph", text: "Worked out once the distribution is signed off." });
  } else if (differing.length === 0) {
    unders.push({ kind: "paragraph", text: "None — the trial balance agrees to the attributed components." });
  } else {
    unders.push({
      kind: "table",
      columns: [
        { key: "component", label: "Component" },
        { key: "trialBalance", label: "Trial balance", align: "right" },
        { key: "attributed", label: "Attributed", align: "right" },
        { key: "difference", label: "Difference", align: "right" },
      ],
      rows: differing.map((c) => ({
        component: c.label,
        trialBalance: a(c.trialBalance),
        attributed: a(c.distribution),
        difference: a(c.trialBalance - c.distribution),
      })),
    });
  }

  return {
    fileName: `${slug(fund.name)}-amit-return-working-papers.pdf`,
    title: "AMIT tax return and schedule — working papers",
    subtitle: fund.name,
    blocks: [
      { kind: "paragraph", text: fund.periodLabel, tone: "muted" },
      { kind: "paragraph", text: "Lodged electronically with the ATO through Standard Business Reporting", tone: "muted" },
      { kind: "kv", title: "Trust components — assessable income other than capital gains", rows: incomeRows },
      { kind: "paragraph", text: "NCMI is reported at its own label and forms part of total assessable income.", tone: "muted" },
      {
        kind: "kv",
        title: "Trust components — capital gains",
        rows: [
          { label: "TARP capital gains — discount method (gross)", value: a(discount + concession) },
          { label: "Less: CGT discount", value: a(-concession) },
          { label: "TARP capital gains — other method", value: a(otherGain) },
          { label: "Net capital gain", value: a(discount + otherGain), emphasis: true },
        ],
      },
      { kind: "paragraph", text: "No exempt income, non-assessable non-exempt income or tax offsets are recorded for this fund.", tone: "muted" },
      { kind: "kv", title: "Withholding obligations", rows: withheldRows },
      {
        kind: "kv",
        title: "Key financial information",
        rows: [
          { label: "Total income per accounts", value: a(income) },
          { label: "Total expenses per accounts", value: a(expenses) },
          { label: "Net profit per accounts", value: a(income - expenses), emphasis: true },
          { label: "Distributions to unitholders", value: a(calc.cash) },
        ],
      },
      ...liabilities,
      ...unders,
    ],
  };
}

export function returnView(data: AppData, fundIn: Fund, calc: FundCalc, ctx: Ctx): ReturnView {
  const fund = asAuFund(fundIn);
  const tb = tbView(data, fund, ctx.now);
  const items = readiness(data, fund, calc, tb);
  return {
    title: "Tax return lodgment",
    ready: items.every((i) => i.done),
    items,
    referenceLabel: "ATO receipt reference",
    lodgmentKind: "return",
    lodgment: lodgmentOf(data, fund, "return"),
    dueLabel: `AMMA due ${dateLabel(facts(calc).ammaDue)}`,
    papers: workingPapers(data, fund, calc, tb),
  };
}
