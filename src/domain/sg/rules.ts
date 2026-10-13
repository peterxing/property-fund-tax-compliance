// The rules table for a Singapore fund. Rates, the 90% threshold and every date are read back from the engine's REIT rules, so the
// wording can't drift from the arithmetic.
import { RULES, reitFormUtDueDate } from "../../engine/reitTax.ts";
import { dateLabel, pct, ratePct } from "../format.ts";
import type { Fund, ISODate, RulesTable } from "../types.ts";
import { dayMonthLabel, requireSgFund } from "./util.ts";
import { concessionWindow, holderTreatment, noticeRateText, transparencyThresholdPct, trusteePosition } from "./withholding.ts";

export function sgRules(fundIn: Fund): RulesTable {
  const fund = requireSgFund(fundIn);
  const date = fund.periodEnd;
  const rate = (c: "individual" | "qualifying" | "nrni" | "nr-fund" | "other", at: ISODate = date) => holderTreatment(c, at);
  const nrni = concessionWindow("nrni");
  const nrFund = concessionWindow("nr-fund");
  const nrFund13oa = concessionWindow("nr-fund", "13OA");
  // The concession rows describe the concession itself, so they are read inside its window whatever the fund's period end is.
  const concessionRate = (c: "nrni" | "nr-fund", window: typeof nrni) => ratePct(rate(c, window?.to ?? date).rate);
  const thresholdPct = transparencyThresholdPct();
  const trusteeRate = trusteePosition(date, 100_000_000, 100_000_000).rate;
  const transparencyRuleId = RULES.find((r) => r.domain === "REIT_TAX")?.id ?? "REIT_TAX";

  return {
    title: "Rules applied to S-REITs, per the IRAS e-Tax Guide on REITs (12th edition, 4 Dec 2025).",
    rows: [
      {
        item: "Individuals (not through a partnership, trade or business)",
        treatment: noticeRateText(rate("individual")),
        basis: "ITA 1947 s13(1)(zh)",
      },
      {
        item: "Qualifying unitholders (Singapore companies, branches, bodies of persons, international organisations, REIT ETFs)",
        treatment: noticeRateText(rate("qualifying")),
        basis: "ITA 1947 s45G does not apply",
      },
      {
        item: "Qualifying non-resident non-individuals",
        treatment: nrni ? `${concessionRate("nrni", nrni)} final, distributions to ${dateLabel(nrni.to)}` : `${concessionRate("nrni", nrni)} final`,
        basis: "ITA 1947 s45G(1)(a)",
      },
      {
        item: "Qualifying non-resident funds",
        treatment: nrFund
          ? `${concessionRate("nr-fund", nrFund)} final, ${dateLabel(nrFund.from)} – ${dateLabel(nrFund.to)}`
          : `${concessionRate("nr-fund", nrFund)} final`,
        basis: `ITA 1947 s45G; s13D, s13U, s13V${nrFund13oa ? ` (s13OA from ${dateLabel(nrFund13oa.from)})` : ""}`,
      },
      {
        item: "Other unitholders",
        treatment: `${ratePct(rate("other").rate)} (prevailing corporate rate), not final`,
        basis: "ITA 1947 s45G(1)(b)",
      },
      {
        item: "Tax transparency condition",
        treatment: `At least ${pct(thresholdPct, 0)} of taxable specified income distributed in the year`,
        basis: "ITA 1947 s43(2A); IRAS e-Tax Guide ¶5.3",
      },
      {
        item: "Undistributed specified income",
        treatment: `Taxed at the trustee at ${ratePct(trusteeRate)}`,
        basis: "IRAS e-Tax Guide ¶6.1",
      },
      {
        item: "Failing the 90% distribution condition",
        treatment: `If the ${pct(thresholdPct, 0)} same-year distribution condition is not met, tax transparency does not apply and the full taxable specified income is taxed at the trustee (IRAS e-Tax Guide paras 5.3, 18.5; ITA s43(2)); distributions out of income already taxed at the trustee are not taxed again (para 8.4), so no s45G withholding applies to them. This demo shows the reference app's simpler figures (trustee tax on retained income only, withholding on the whole distribution); see the worst-case figure on the Checks tab.`,
        basis: `ITA 1947 s43(2); IRAS e-Tax Guide ¶5.3, ¶8.4, ¶18.5 (worded for the COVID-19 extended period); engine rule ${transparencyRuleId} (finding REIT.TRANSPARENCY.FAIL)`,
      },
      {
        item: "Tax-exempt income and capital gains distributions",
        treatment: "Not taxable to unitholders",
        basis: "ITA 1947 s35(15)",
      },
      {
        item: "Return of capital",
        treatment:
          "Unit holders should reduce their cost of units by the amount of return of capital. For traders, the reduced cost is used for trading gains; if the return of capital exceeds the cost, the excess is taxable as trading income and the proceeds of all later sales of the remaining units are fully taxable.",
        basis: "ITA 1947 s35(15C); IRAS e-Tax Guide ¶8.8",
      },
      {
        item: "Withholding tax on distributions",
        treatment: "Filed and paid by the 15th of the second month after the date of payment",
        basis: "ITA 1947 s45, s45G",
      },
      {
        item: "Unitholder declarations",
        treatment: "Form A (unitholders) or Form B (depository agents) before each distribution; without one, tax is deducted",
        basis: "IRAS e-Tax Guide ¶12–13 (¶12.2(b))",
      },
      {
        item: "Declaration cut-off and tax notice timing",
        treatment:
          "The record date and the declaration cut-off are set by the manager, not by IRAS (the dates in this demo are sample data). IRAS requires Form A, or Form B from depository agents, before every distribution; it sets no number of days after the record date for the declarations and no date for the tax notice. Announcing the notice before the record date is market practice.",
        basis: "IRAS e-Tax Guide ¶13.1 (Form A prior to every distribution); the Guide sets no cut-off date and no notice date",
      },
      {
        item: "Form UT",
        treatment: `Filed with audited accounts and tax computation by ${dayMonthLabel(reitFormUtDueDate(fund.assessmentYear))}`,
        basis: "IRAS e-Tax Guide ¶16.1",
      },
    ],
  };
}
