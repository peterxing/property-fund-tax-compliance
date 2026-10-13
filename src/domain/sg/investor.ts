// Investor reporting workspace for a Singapore fund: the distribution tax notice and the s45G withholding filing.
import { reitWithholdingDueDate } from "../../engine/reitTax.ts";
import { dateLabel, perUnit, centsPerUnit, money, ratePct, slug, toISODate } from "../format.ts";
import { can } from "../permissions.ts";
import type { AppData, CsvModel, Ctx, DocModel, Fund, FundCalc, SgFund, SgInvestorView, SgNotice } from "../types.ts";
import { paymentDateOf, rangeLabel, requireSgFund, sgClassOf, sgNoticeFor, longDateLabel, toMajor } from "./util.ts";
import { concessionWindow, holderTreatment, noticeRateText, noticeTreatmentText } from "./withholding.ts";

const m2 = (cents: number) => money(cents, "SGD", 2);

/** The dates shown on the notice; a fund with no notice record falls back to the end of its period. */
function noticeDates(fund: SgFund, notice: SgNotice | null) {
  return {
    recordDate: notice?.recordDate ?? fund.periodEnd,
    declarationDeadline: notice?.declarationDeadline ?? fund.periodEnd,
    paymentDate: paymentDateOf(fund, notice),
    publishedOn: notice?.publishedOn ?? null,
  };
}

function noticeDoc(fund: SgFund, calc: FundCalc, notice: SgNotice | null): DocModel {
  const { recordDate, declarationDeadline, paymentDate, publishedOn } = noticeDates(fund, notice);
  const treatment: Record<string, string> = {
    taxableDistributed: noticeTreatmentText(paymentDate),
    taxExemptDistribution: "Not taxable",
    capitalDistribution: "Not taxable · reduces the cost of units for traders",
  };
  const byClass = (c: "individual" | "qualifying" | "nrni" | "other") => noticeRateText(holderTreatment(c, paymentDate));
  const qualifyingRate = holderTreatment("nrni", paymentDate).rate;
  const window = concessionWindow("nrni");

  const blocks: DocModel["blocks"] = [];
  if (publishedOn === null) blocks.push({ kind: "paragraph", text: "DRAFT", tone: "note" });
  blocks.push(
    {
      kind: "table",
      title: "Distribution by type",
      columns: [
        { key: "distribution", label: "Distribution" },
        { key: "centsPerUnit", label: "Cents per unit", align: "right" },
        { key: "amount", label: "Amount", align: "right" },
        { key: "treatment", label: "Tax treatment" },
      ],
      rows: calc.components.map((c) => ({
        distribution: c.label,
        centsPerUnit: perUnit(c.centsPerUnit, 6),
        amount: m2(c.amount),
        treatment: treatment[c.key] ?? "",
      })),
      totalRow: {
        distribution: "Total distribution",
        centsPerUnit: perUnit(centsPerUnit(calc.characterTotal, fund.unitsOnIssue), 6),
        amount: m2(calc.characterTotal),
        treatment: "",
      },
    },
    {
      kind: "table",
      title: "Tax deducted from the taxable income distribution",
      columns: [
        { key: "unitholder", label: "Unitholder" },
        { key: "treatment", label: "Taxable income distribution" },
      ],
      rows: [
        { unitholder: "Individuals, unless received through a partnership or a trade or business", treatment: byClass("individual") },
        { unitholder: "Qualifying unitholders, such as Singapore companies, with a declaration", treatment: byClass("qualifying") },
        { unitholder: "Qualifying non-resident non-individuals and funds, with a declaration", treatment: byClass("nrni") },
        { unitholder: "Other unitholders, or no declaration", treatment: byClass("other") },
      ],
    },
    {
      kind: "paragraph",
      text: `IRAS requires unitholders other than individuals to submit Form A, and depository agents Form B, before every distribution (IRAS e-Tax Guide para 13.1). The declaration cut-off set by the manager is ${dateLabel(declarationDeadline)}: submit by then to be paid gross or at ${ratePct(qualifyingRate)}. Without a declaration, tax is deducted at ${ratePct(holderTreatment("other", paymentDate).rate)}.`,
    },
    { kind: "paragraph", text: "Tax-exempt income and capital distributions are not taxable (ITA s35(15)).", tone: "muted" },
  );
  if (window) blocks.push({ kind: "paragraph", text: `The ${ratePct(qualifyingRate)} rate applies to distributions made up to ${longDateLabel(window.to)}.`, tone: "muted" });

  return {
    fileName: `${slug(fund.name)}-distribution-tax-notice.pdf`,
    title: "Distribution tax notice",
    subtitle: fund.name,
    meta: [
      { label: "Distribution period", value: rangeLabel(fund.periodStart, fund.periodEnd) },
      { label: "Record date", value: dateLabel(recordDate) },
      { label: "Declaration cut-off set by the manager", value: dateLabel(declarationDeadline) },
      { label: "Payment date", value: dateLabel(paymentDate) },
      { label: "Year of assessment", value: `YA${fund.assessmentYear}` },
    ],
    blocks,
  };
}

function s45gView(fund: SgFund, calc: FundCalc, notice: SgNotice | null, now: Date): SgInvestorView["s45g"] {
  const paymentDate = paymentDateOf(fund, notice);
  const fileAndPayBy = reitWithholdingDueDate(paymentDate);
  const rows = calc.holders
    .filter((h) => h.withheld >= 1)
    .map((h) => {
      const t = holderTreatment(sgClassOf(h.holder), paymentDate);
      return {
        holder: h.holder.holder,
        country: h.holder.country,
        classLabel: h.statusLabel,
        rateLabel: t.s45gRateLabel,
        rate: ratePct(t.rate),
        final: t.final,
        taxable: h.lines[0]?.amount ?? 0,
        deducted: h.withheld,
      };
    });
  const totals = { taxable: rows.reduce((a, r) => a + r.taxable, 0), deducted: rows.reduce((a, r) => a + r.deducted, 0) };
  const csv: CsvModel = {
    fileName: `${slug(fund.name)}-withholding-tax.csv`,
    columns: ["Unitholder", "Country", "Class", "Rate", "Final tax", "Taxable distribution", "Tax deducted", "Date of payment", "Due date"],
    rows: rows.map((r) => [r.holder, r.country, r.classLabel, r.rate, r.final ? "Yes" : "No", toMajor(r.taxable), toMajor(r.deducted), paymentDate, fileAndPayBy]),
  };
  return {
    paymentDate,
    fileAndPayBy,
    overdue: calc.withheld >= 1 && fund.whtRemitted === null && toISODate(now) > fileAndPayBy,
    deducted: calc.withheld,
    paid: fund.whtRemitted,
    status: calc.recon.status,
    rows: rows.map(({ holder, country, classLabel, rateLabel, taxable, deducted }) => ({ holder, country, classLabel, rateLabel, taxable, deducted })),
    totals,
    csv,
    emptyMessage: rows.length === 0 ? "No tax deducted from this distribution" : null,
  };
}

/** The Singapore notice is one per distribution, so `selectedNoticeId` has no effect. */
export function sgInvestorView(data: AppData, fundIn: Fund, calc: FundCalc, ctx: Ctx, _selectedNoticeId?: string | null): SgInvestorView {
  const fund = requireSgFund(fundIn);
  const notice = sgNoticeFor(data, fund.id);
  const dates = noticeDates(fund, notice);
  const published = dates.publishedOn !== null;
  return {
    market: "SG",
    notice: {
      published,
      publishedOn: dates.publishedOn,
      recordDate: dates.recordDate,
      declarationDeadline: dates.declarationDeadline,
      paymentDate: dates.paymentDate,
      assessmentYear: fund.assessmentYear,
      doc: noticeDoc(fund, calc, notice),
      canPublish: notice !== null && !published && can(ctx.user, "publish", fund, fund.governance),
    },
    s45g: s45gView(fund, calc, notice, ctx.now),
  };
}
