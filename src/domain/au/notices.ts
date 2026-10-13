// Fund payment notices: what each notice notified, how the published ones compare with the year's components, and the notice document.
import type { AppData, AuFund, AuNotice, Cents, DocModel } from "../types.ts";
import type { AuNotified } from "../core/notices.ts";
import { auFundPayment, auNoticeAmounts, auYearComponents } from "../core/notices.ts";
import { dateLabel, slug } from "../format.ts";
import { noticeRateText } from "./components.ts";
import type { AuRates } from "./rates.ts";
import { aud, noticesOf } from "./util.ts";

export type NoticeLineKey = keyof AuNotified;

export interface NoticeLineDef {
  key: NoticeLineKey;
  label: string;
  fundPayment: boolean;
}

export const NOTICE_LINES: readonly NoticeLineDef[] = [
  { key: "other", label: "Fund payment — other", fundPayment: true },
  { key: "ncmi", label: "Fund payment — NCMI", fundPayment: true },
  { key: "excludedNcmi", label: "Fund payment — excluded from NCMI (transitional)", fundPayment: true },
  { key: "clean", label: "Fund payment — clean building MIT income", fundPayment: true },
  { key: "interest", label: "Interest", fundPayment: false },
];

export interface NoticeItem {
  notice: AuNotice;
  amounts: AuNotified;
  published: boolean;
}

/** Every notice of the fund, oldest first, with the components it notified (an unpublished notice is estimated as the balance of the year). */
export function noticeItems(data: AppData, fund: AuFund): NoticeItem[] {
  return noticesOf(data, fund.id).map((notice) => ({
    notice,
    amounts: auNoticeAmounts(fund, data.auNotices, notice),
    published: notice.publishedOn !== null,
  }));
}

const zero = (): AuNotified => ({ other: 0, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 0 });

function sumOf(items: readonly NoticeItem[], published: boolean): AuNotified {
  const out = zero();
  for (const item of items) {
    if (item.published !== published) continue;
    for (const line of NOTICE_LINES) out[line.key] += item.amounts[line.key];
  }
  return out;
}

export interface NoticeComparisonLine {
  key: NoticeLineKey | "fundPayment";
  label: string;
  published: Cents;
  drafts: Cents;
  year: Cents;
  /** year - published */
  difference: Cents;
}

export interface NoticeComparison {
  lines: NoticeLineDef[];
  rows: NoticeComparisonLine[];
  allPublished: boolean;
  /** The "Total fund payment" row: every line except interest. */
  fundPayment: NoticeComparisonLine;
}

/** Published notices against the year's components, line by line. */
export function compareNotices(fund: AuFund, items: readonly NoticeItem[]): NoticeComparison {
  const year = auYearComponents(fund);
  const published = sumOf(items, true);
  const drafts = sumOf(items, false);
  const rows: NoticeComparisonLine[] = NOTICE_LINES.map((line) => ({
    key: line.key,
    label: line.label,
    published: published[line.key],
    drafts: drafts[line.key],
    year: year[line.key],
    difference: year[line.key] - published[line.key],
  }));
  const fundPayment: NoticeComparisonLine = {
    key: "fundPayment",
    label: "Total fund payment",
    published: auFundPayment(published),
    drafts: auFundPayment(drafts),
    year: auFundPayment(year),
    difference: auFundPayment(year) - auFundPayment(published),
  };
  return { lines: [...NOTICE_LINES], rows, allPublished: items.every((i) => i.published), fundPayment };
}

// ------------------------------------------------------------------------------------------------ the notice document
const cpu6 = (amount: Cents, units: number): string => (units > 0 ? (amount / units).toFixed(6) : (0).toFixed(6));

const GIVEN_FOR =
  "Given for non-resident withholding on fund payments (Subdivisions 12-H and 12A-B of Schedule 1 to the Taxation Administration Act 1953) and on interest (Subdivisions 12-F and 12A-A). Don't use it to complete an Australian income tax return.";

export function noticeDoc(fund: AuFund, item: NoticeItem, rates: AuRates): DocModel {
  const { notice, amounts } = item;
  const units = fund.unitsOnIssue;
  const row = (label: string, withholding: string, amount: Cents): Record<string, string> => ({
    component: label,
    withholding,
    centsPerUnit: cpu6(amount, units),
    amount: aud(amount, 2),
  });
  const rows: Array<Record<string, string>> = [];
  for (const line of NOTICE_LINES) {
    if (!line.fundPayment) continue;
    rows.push(row(line.label, noticeRateText(line.key, rates), amounts[line.key]));
  }
  rows.push(row("Total fund payment", "", auFundPayment(amounts)));
  rows.push(row("Interest", noticeRateText("interest", rates), amounts.interest));

  const blocks: DocModel["blocks"] = [
    { kind: "paragraph", text: "Attribution managed investment trust · withholding MIT", tone: "muted" },
    {
      kind: "table",
      title: "Components of the payment for non-resident withholding",
      columns: [
        { key: "component", label: "Component" },
        { key: "withholding", label: "Withholding" },
        { key: "centsPerUnit", label: "Cents per unit", align: "right" },
        { key: "amount", label: "Amount", align: "right" },
      ],
      rows,
      totalRow: row("Cash distribution paid", "", notice.cash),
    },
    { kind: "paragraph", text: GIVEN_FOR, tone: "muted" },
    { kind: "paragraph", text: `Includes a fund payment from a clean building MIT: ${amounts.clean > 0 ? "Yes" : "No"}.` },
  ];
  if (fund.inputs.discountGainTarp > 0) {
    blocks.push({
      kind: "paragraph",
      text: "Discounted capital gains on taxable Australian property are grossed up (doubled) in the fund payment, so it can exceed the cash paid.",
      tone: "note",
    });
  }
  blocks.push({ kind: "paragraph", text: "Full-year amounts are in the AMIT member annual statement.", tone: "muted" });

  return {
    fileName: `${slug(fund.name)}-fund-payment-notice-${slug(notice.label)}.pdf`,
    title: item.published ? "Fund payment notice" : "Fund payment notice (draft)",
    subtitle: fund.name,
    meta: [
      { label: "Distribution", value: notice.label },
      { label: "Record date", value: dateLabel(notice.recordDate) },
      { label: "Payment date", value: dateLabel(notice.paymentDate) },
      { label: "Income year", value: `Year ended ${dateLabel(fund.periodEnd)}` },
    ],
    blocks,
  };
}
