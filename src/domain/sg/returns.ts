// Tax returns workspace for a Singapore fund: the Form UT readiness checklist, lodgment record and working papers.
import { reitFormUtDueDate } from "../../engine/reitTax.ts";
import { dateLabel, money, pct, ratePct, slug } from "../format.ts";
import type { AppData, Ctx, DocBlock, DocModel, Fund, FundCalc, ReadinessItem, ReturnView, SgFund, TbView } from "../types.ts";
import { sgTbCalc, sgTbView, UNMAPPED_LABEL } from "./tb.ts";
import type { SgTbCalc } from "./tb.ts";
import { paymentDateOf, rangeLabel, requireSgFund, sgNoticeFor } from "./util.ts";
import { trusteePosition } from "./withholding.ts";

const m0 = (cents: number) => money(cents, "SGD", 0);

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function readinessItems(fund: SgFund, calc: FundCalc, tbv: TbView): ReadinessItem[] {
  const unmapped = tbv.rows.filter((r) => r.categoryLabel === UNMAPPED_LABEL).length;
  const differing = tbv.components.filter((c) => !c.agrees).length;
  const tbOk = tbv.balanced && tbv.allMapped && tbv.matchesDistribution;
  let tbDetail = "Every component agrees";
  if (!tbv.allMapped) tbDetail = `${unmapped} ${plural(unmapped, "account needs", "accounts need")} a tax category`;
  else if (!tbv.balanced) tbDetail = `Trial balance is out of balance by ${money(Math.abs(tbv.totalDebitsLessCredits), "SGD")}`;
  else if (!tbv.matchesDistribution) tbDetail = `${differing} ${plural(differing, "component differs", "components differ")} from the distribution`;

  const { recon } = calc;
  let whtDone = recon.status === "reconciled";
  let whtDetail = "Remitted amount matches";
  if (recon.status === "not-remitted") {
    // Nothing deducted means nothing to remit.
    whtDone = recon.computed === 0;
    whtDetail = whtDone ? "No withholding to remit" : "Not yet remitted";
  } else if (recon.status !== "reconciled") whtDetail = "Remitted amount differs from computed";

  const signedOff = fund.status === "Signed off";
  const exceptions = calc.checks.filter((c) => c.severity === "exception");
  return [
    { id: "signed-off", label: "Distribution signed off", detail: signedOff ? "Components and withholding are locked" : `Status: ${fund.status}`, done: signedOff },
    { id: "no-exceptions", label: "No open exceptions", detail: exceptions.length === 0 ? "All checks clear" : exceptions.map((c) => c.title).join("; "), done: exceptions.length === 0 },
    { id: "tb-agrees", label: "Trial balance agrees to the distribution", detail: tbOk ? "Every component agrees" : tbDetail, done: tbOk },
    { id: "wht", label: "Withholding remitted and reconciled", detail: whtDetail, done: whtDone },
  ];
}

interface RateGroup {
  label: string;
  rate: number;
  amount: number;
}

function withholdingGroups(calc: FundCalc): RateGroup[] {
  const groups = new Map<string, RateGroup>();
  for (const h of calc.holders) {
    const rate = h.lines[0]?.rate ?? 0;
    for (const part of h.withholdingParts) {
      const g = groups.get(part.label);
      if (g) g.amount += part.amount;
      else groups.set(part.label, { label: part.label, rate, amount: part.amount });
    }
  }
  return [...groups.values()].sort((a, b) => a.rate - b.rate);
}

function workingPapers(data: AppData, fund: SgFund, calc: FundCalc, tb: SgTbCalc, tbv: TbView): DocModel {
  const notice = sgNoticeFor(data, fund.id);
  const { taxableSpecifiedIncome: income, taxableDistributed: distributed, taxExemptDistribution: exempt, capitalDistribution: capital } = fund.inputs;
  const position = trusteePosition(paymentDateOf(fund, notice), income, distributed);
  const formUtDue = reitFormUtDueDate(fund.assessmentYear);
  const ledger = data.sgLedger[fund.id] ?? { exempt: 0, capital: 0, afterTax: 0 };
  const ratio = position.payoutRatio;
  const ya = fund.assessmentYear;

  const b2t = tbv.bookToTax;
  const computation = [...b2t.rows.map((r) => ({ label: r.label, value: m0(r.amount) })), { label: b2t.resultLabel, value: m0(b2t.result), emphasis: true }];

  const afterTaxMoved = position.retained - position.trusteeTax;
  const schedule: Array<[string, number, number, number, number]> = [
    ["Tax transparency income", 0, income, -distributed, -position.retained],
    ["Income taxed at the trustee (after tax)", ledger.afterTax, 0, 0, afterTaxMoved],
    ["Tax-exempt income", ledger.exempt, Math.max(0, tb.exempt), -exempt, 0],
    ["Capital", ledger.capital, Math.max(0, tb.gain), -capital, 0],
  ];

  const groups = withholdingGroups(calc);
  const blocks: DocBlock[] = [
    { kind: "paragraph", text: fund.periodLabel },
    { kind: "paragraph", text: `File with audited accounts and the tax computation by ${dateLabel(formUtDue)}` },
    { kind: "kv", title: `Tax computation — ${rangeLabel(fund.periodStart, fund.periodEnd)}`, rows: computation },
    { kind: "paragraph", text: "Figures are for this distribution period; Form UT reports the full year.", tone: "muted" },
    {
      kind: "kv",
      title: "Tax transparency",
      rows: [
        { label: "Taxable specified income", value: m0(income) },
        { label: "Distributed to unitholders", value: m0(distributed) },
        { label: "Taxable payout", value: ratio === null ? "—" : pct(ratio * 100, 1) },
        { label: "Undistributed specified income", value: m0(position.retained) },
      ],
    },
  ];
  if (ratio !== null && !position.passes) {
    blocks.push({ kind: "paragraph", text: `Below the ${pct(position.thresholdPct, 0)} condition for tax transparency if it isn't made up over the rest of the year.`, tone: "note" });
  }
  blocks.push(
    {
      kind: "kv",
      title: "Tax payable by the trustee",
      rows: [
        { label: "Undistributed specified income", value: m0(position.retained) },
        { label: `Tax at ${ratePct(position.rate)}`, value: m0(position.trusteeTax) },
      ],
    },
    { kind: "paragraph", text: "Income taxed at the trustee can be distributed later without further tax.", tone: "muted" },
    {
      kind: "kv",
      title: "Withholding tax on distributions (s45G)",
      rows: [
        ...groups.map((g) => ({ label: g.label, value: m0(g.amount) })),
        { label: "Total tax deducted", value: m0(calc.withheld), emphasis: true },
        { label: "Paid to IRAS", value: fund.whtRemitted === null ? "Not yet paid" : m0(fund.whtRemitted) },
      ],
    },
    {
      kind: "kv",
      title: "Key financial information",
      rows: [
        { label: "Total income per accounts", value: m0(tb.totalIncome) },
        { label: "Total expenses per accounts", value: m0(tb.totalExpenses) },
        { label: "Net profit per accounts", value: m0(tb.netProfit) },
        { label: "Distributions to unitholders", value: m0(tb.distributions) },
      ],
    },
    {
      kind: "table",
      title: "Distributions tracking schedule",
      columns: [
        { key: "type", label: "Type" },
        { key: "opening", label: "Opening", align: "right" },
        { key: "derived", label: "Derived", align: "right" },
        { key: "distributed", label: "Distributed", align: "right" },
        { key: "transferred", label: "Transferred", align: "right" },
        { key: "closing", label: "Closing", align: "right" },
      ],
      rows: schedule.map(([type, opening, derived, out, moved]) => ({
        type,
        opening: m0(opening),
        derived: m0(derived),
        distributed: m0(out),
        transferred: m0(moved),
        closing: m0(opening + derived + out + moved),
      })),
    },
    {
      kind: "paragraph",
      text: `Filed with the tax computation to track each type of income available for distribution. Undistributed specified income moves to income taxed at the trustee, net of ${ratePct(position.rate)} tax.`,
      tone: "muted",
    },
  );

  return {
    fileName: `${slug(fund.name)}-form-ut-ya${ya}-working-papers.pdf`,
    title: `Form UT YA${ya} — working papers`,
    subtitle: fund.name,
    blocks,
  };
}

export function sgReturnView(data: AppData, fundIn: Fund, calc: FundCalc, ctx: Ctx): ReturnView {
  const fund = requireSgFund(fundIn);
  const tb = sgTbCalc(data, fund);
  const tbv = sgTbView(data, fund, ctx.now);
  const items = readinessItems(fund, calc, tbv);
  return {
    title: "Form UT filing",
    ready: items.every((i) => i.done),
    items,
    referenceLabel: "IRAS acknowledgement reference",
    lodgmentKind: "form-ut",
    lodgment: data.lodgments.find((l) => l.fundId === fund.id && l.kind === "form-ut") ?? null,
    dueLabel: `Form UT YA${fund.assessmentYear} · due ${dateLabel(reitFormUtDueDate(fund.assessmentYear))}`,
    papers: workingPapers(data, fund, calc, tb, tbv),
  };
}
