// The Rules tab: what the AMIT module applies, with the rates read from the engine and the statutory source of each rule.
import type { Fund, RuleRow, RulesTable } from "../types.ts";
import { auIncomeYearLabel } from "../../engine/au/dates.ts";
import { yearOf } from "../../engine/dates.ts";
import { ratePct } from "../format.ts";
import { auRates, buildToRentRates } from "./rates.ts";
import { asAuFund } from "./util.ts";

const MIT_WHT = "Income Tax (Managed Investment Trust Withholding Tax) Act 2008 s4";
// The engine rule that carries the build-to-rent rate (engine/au/members.ts); it cites the ATO's build to rent page.
const BTR_ENGINE_RULE = "au-members.mit-foreign-member-withholding.2008-plus";

export function rules(fundIn: Fund): RulesTable {
  const fund = asAuFund(fundIn);
  const r = auRates(fund.periodEnd);
  const p = (bps: number): string => ratePct(bps / 10_000);
  const year = auIncomeYearLabel(yearOf(fund.periodEnd)).replace("-", "–");
  const btr = buildToRentRates(fund.periodEnd);
  const buildToRent: RuleRow[] = btr
    ? [
        {
          item: "Build-to-rent MIT fund payment — EOI country",
          treatment: `${p(btr.eoi)} on eligible build-to-rent fund payments from 1 January 2025 (${p(btr.nonEoi)} outside EOI countries)`,
          basis: `ATO, Build to rent development tax incentives; engine rule ${BTR_ENGINE_RULE}`,
        },
      ]
    : [];

  return {
    title: `Rules applied to Australian AMITs for the ${year} income year.`,
    rows: [
      { item: "Fund payment — address in an information exchange (EOI) country", treatment: `${p(r.ordinary.eoi)} final withholding`, basis: MIT_WHT },
      { item: "Clean building MIT fund payment — EOI country", treatment: p(r.clean.eoi), basis: MIT_WHT },
      ...buildToRent,
      { item: "Non-concessional MIT income (NCMI)", treatment: p(r.ncmi.eoi), basis: MIT_WHT },
      {
        item: "Cross-staple rent excluded from NCMI under the transitional rules (pre-27 March 2018 arrangements)",
        treatment: `${p(r.excluded.eoi)} for EOI countries; for a facility already in use, the relief applies to amounts derived before 1 July 2026 (non-economic infrastructure) or before 1 July 2034 (economic infrastructure)`,
        basis: `LCR 2020/2 para 251; TAA 1953 Sch 1 s12-440; ${MIT_WHT}`,
      },
      { item: "Fund payment — address outside EOI countries", treatment: p(r.ordinary.nonEoi), basis: MIT_WHT },
      { item: "Discounted TARP capital gains in the fund payment", treatment: "Grossed up (doubled)", basis: "TAA 1953 Sch 1 s12A-110" },
      { item: "Interest paid to foreign residents", treatment: `${p(r.interest.eoi)} withholding`, basis: "ITAA 1936 s128B" },
      {
        item: "AMIT cost base net amount",
        treatment: "Cash less attributed amounts and AMIT CGT gross-up amount; excess decreases, shortfall increases cost base",
        basis: "ITAA 1997 Subdiv 104-E (CGT event E10)",
      },
      { item: "AMMA statements", treatment: "Within 3 months after the end of the income year", basis: "ITAA 1997 Div 276" },
      { item: "Fund payment notice", treatment: "Given, or published on the fund's website, at or before each payment", basis: "TAA 1953 Sch 1 Subdiv 12-H and 12A-B" },
      { item: "Annual investment income report (AIIR)", treatment: "By 31 October after the financial year", basis: "TAA 1953 Sch 1 Div 393" },
      {
        item: "Annual report of amounts withheld from fund payments",
        treatment: "Within 6 months and 14 days after the income year (14 January for a 30 June year)",
        basis: "TAA 1953 Sch 1 s16-153(4) and (4A)",
      },
    ],
  };
}
