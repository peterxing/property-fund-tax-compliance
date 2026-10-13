// Investor reporting: fund payment notices, how they compare with the year, and the annual investment income report (AIIR).
import type { AiirLine, AppData, AuFund, AuInvestorView, Cents, CsvModel, Ctx, Fund, FundCalc, HolderLine, ISODate, ReadinessItem } from "../types.ts";
import { mitAiirDueDate } from "../../engine/au/mitWithholding.ts";
import { parseISO } from "../../engine/dates.ts";
import { integer, slug } from "../format.ts";
import { can } from "../permissions.ts";
import { COMPONENT_DEFS } from "./components.ts";
import type { NoticeItem } from "./notices.ts";
import { compareNotices, noticeDoc, noticeItems } from "./notices.ts";
import { auRates } from "./rates.ts";
import { facts, lodgmentOf } from "./returns.ts";
import { aud, asAuFund, dollars, nz } from "./util.ts";

const ATTRIBUTED_KEYS: ReadonlySet<string> = new Set(COMPONENT_DEFS.filter((d) => d.attributed).map((d) => d.key));
const FUND_PAYMENT_KEYS = ["ausOtherIncome", "ncmi", "excludedNcmi", "cleanBuilding", "otherGainTarp"] as const;

/** Statutory AIIR due date: 31 October after a 30 June year. "" when the year end is a substituted accounting period (confirm with the ATO). */
export function aiirDueDate(periodEnd: ISODate): ISODate {
  const { y, m, d } = parseISO(periodEnd);
  return m === 6 && d === 30 ? `${y}-10-31` : "";
}

/** The cell a holder was allocated for one tax character. */
const amountOf = (line: HolderLine, key: string): Cents => line.lines.find((l) => l.key === key)?.amount ?? 0;

const fundPaymentOf = (line: HolderLine): Cents =>
  FUND_PAYMENT_KEYS.reduce((sum, k) => sum + amountOf(line, k), 0) + amountOf(line, "discountGainTarp") + amountOf(line, "cgtConcessionTarp");

export function aiirLines(calc: FundCalc): AiirLine[] {
  return calc.holders.map((line) => {
    const attributed = line.lines.filter((l) => ATTRIBUTED_KEYS.has(l.key)).reduce((sum, l) => sum + l.amount, 0);
    const holder = line.holder;
    return {
      holderId: holder.id,
      holder: holder.holder,
      country: holder.country,
      statusLabel: line.statusLabel,
      units: holder.units,
      attributed,
      cash: line.cash,
      // Positive when cash exceeds the attributed amount net of the AMIT CGT gross-up amount (an excess, which decreases the cost base).
      costBaseNet: nz(line.cash - attributed - amountOf(line, "cgtConcessionTarp")),
      withheld: line.withheld,
    };
  });
}

function aiirCsv(fund: AuFund, calc: FundCalc, lines: readonly AiirLine[]): CsvModel {
  return {
    fileName: `${slug(fund.name)}-aiir-investor-lines.csv`,
    columns: [
      "Investor",
      "Country",
      "Tax status",
      "Units",
      ...COMPONENT_DEFS.map((d) => d.label),
      "Attributed",
      "Cash distribution",
      "AMIT cost base net amount",
      "Fund payment",
      "Withheld",
    ],
    rows: calc.holders.map((line, i) => {
      const l = lines[i];
      return [
        l.holder,
        l.country,
        l.statusLabel,
        l.units,
        ...COMPONENT_DEFS.map((d) => dollars(amountOf(line, d.key))),
        dollars(l.attributed),
        dollars(l.cash),
        dollars(l.costBaseNet),
        dollars(fundPaymentOf(line)),
        dollars(l.withheld),
      ];
    }),
  };
}

function aiirReadiness(fund: AuFund, calc: FundCalc, lines: readonly AiirLine[]): ReadinessItem[] {
  const f = facts(calc);
  const reported = lines.reduce((sum, l) => sum + l.attributed, 0);
  const gap = f.attributed - reported;
  const registerOk = calc.unallocatedUnits === 0 && calc.registerUnits === fund.unitsOnIssue;
  return [
    {
      id: "signed-off",
      label: "Distribution signed off",
      done: fund.status === "Signed off",
      detail: fund.status === "Signed off" ? "The AIIR mirrors the locked AMMA statements" : `Status: ${fund.status}`,
    },
    {
      id: "register",
      label: "Every unit on the register",
      done: registerOk,
      detail: registerOk ? `${integer(calc.registerUnits)} units reported` : `Register holds ${integer(calc.registerUnits)} of ${integer(fund.unitsOnIssue)} units`,
    },
    {
      id: "totals",
      label: "Investor totals agree to the trust components",
      done: gap === 0,
      detail: gap === 0 ? `${aud(f.attributed, 0)} attributed` : `${aud(Math.abs(gap), 0)} of attributed amounts isn't reported against an investor`,
    },
  ];
}

function pickNotice(items: readonly NoticeItem[], selectedNoticeId?: string | null): NoticeItem | null {
  if (items.length === 0) return null;
  const chosen = selectedNoticeId ? items.find((i) => i.notice.id === selectedNoticeId) : undefined;
  return chosen ?? items.find((i) => !i.published) ?? items[items.length - 1];
}

const WITHHOLDING_NOTE = "Amounts withheld from fund payments that aren't in the AIIR by its due date go in a second AIIR by this date.";

export function investorView(data: AppData, fundIn: Fund, calc: FundCalc, ctx: Ctx, selectedNoticeId?: string | null): AuInvestorView {
  const fund = asAuFund(fundIn);
  const items = noticeItems(data, fund);
  const selected = pickNotice(items, selectedNoticeId);
  const comparison = compareNotices(fund, items);

  const lines = aiirLines(calc);
  const readiness = aiirReadiness(fund, calc, lines);
  const aiirDue = aiirDueDate(fund.periodEnd);

  return {
    market: "AU",
    notices: items.map((i) => ({
      id: i.notice.id,
      label: i.notice.label,
      paymentDate: i.notice.paymentDate,
      cash: i.notice.cash,
      publishedOn: i.notice.publishedOn,
      locked: i.published,
      isCurrentYearDraft: !i.published,
    })),
    selectedNoticeId: selected?.notice.id ?? null,
    noticeDoc: selected ? noticeDoc(fund, selected, auRates(fund.periodEnd)) : null,
    vsYear: [...comparison.rows, comparison.fundPayment].map((r) => ({ label: r.label, published: r.published, year: r.year, difference: r.difference })),
    canPublishSelected: selected !== null && !selected.published && can(ctx.user, "publish", fund, fund.governance),
    aiir: {
      ready: readiness.every((r) => r.done),
      items: readiness,
      aiirDue,
      withholdingReportDue: mitAiirDueDate(fund.periodEnd),
      note: aiirDue === "" ? `AIIR due date: confirm with the ATO — substituted accounting period. ${WITHHOLDING_NOTE}` : WITHHOLDING_NOTE,
      lodgment: lodgmentOf(data, fund, "aiir"),
      lines,
      totals: {
        units: lines.reduce((sum, l) => sum + l.units, 0),
        attributed: lines.reduce((sum, l) => sum + l.attributed, 0),
        cash: lines.reduce((sum, l) => sum + l.cash, 0),
        costBaseNet: lines.reduce((sum, l) => sum + l.costBaseNet, 0),
        withheld: lines.reduce((sum, l) => sum + l.withheld, 0),
      },
      csv: aiirCsv(fund, calc, lines),
    },
  };
}
