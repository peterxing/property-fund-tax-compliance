// The one place the Investor reporting workspace reaches past the domain facade. AuInvestorView.vsYear leaves out what the unpublished
// notices estimate for each row, which the reference app shows in a "Draft notices" column, so it is recomputed here with the domain's
// own comparison. If the view model gains a `drafts` field, delete this file and read the amounts from vsYear instead.
import { compareNotices, noticeItems } from "../../../domain/au/notices.ts";
import type { AppData, AuFund, Cents } from "../../../domain/types.ts";

/** Draft notice amounts by row label ("Fund payment — other", ..., "Total fund payment"). Every amount is 0 when the fund has no draft. */
export function draftNoticeAmounts(data: AppData, fund: AuFund): Map<string, Cents> {
  const comparison = compareNotices(fund, noticeItems(data, fund));
  return new Map([...comparison.rows, comparison.fundPayment].map((row) => [row.label, row.drafts]));
}
