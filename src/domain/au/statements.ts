// The AMIT member annual statement (AMMA) for one unitholder. The reference captures do not show a statement, so the layout is ours;
// the ATO field labels and the cost base arithmetic come from the engine.
import type { AuCharacterMap } from "../../engine/au/amit.ts";
import { buildAmmaStatement, computeAmitCostBaseNetAmount } from "../../engine/au/amit.ts";
import type { AuMemberClass } from "../../engine/au/members.ts";
import type { AppData, AuFund, AuHolderStatus, Cents, DocBlock, DocModel, Fund, FundCalc, HolderLine } from "../types.ts";
import { dateLabel, integer, ratePct, slug } from "../format.ts";
import { aud, asAuFund, isAuHolder, nz } from "./util.ts";
import { facts } from "./returns.ts";

// The member class is carried through the statement unchanged and never affects an amount; the register only records residency.
const MEMBER_CLASS: Record<AuHolderStatus, AuMemberClass> = {
  resident: "RESIDENT_COMPANY",
  "foreign-eoi": "FOREIGN_COMPANY_EOI",
  "foreign-non-eoi": "FOREIGN_COMPANY_NON_EOI",
};

const cellOf = (line: HolderLine, key: string): Cents => line.lines.find((l) => l.key === key)?.amount ?? 0;

function statementFor(fund: AuFund, line: HolderLine) {
  const cell = (key: string): Cents => cellOf(line, key);
  const gainDiscountable = cell("discountGainTarp") + cell("cgtConcessionTarp");
  const attributedComponents: AuCharacterMap = {
    OTHER_AU_INCOME: cell("ausOtherIncome"),
    RENT: cell("ncmi") + cell("excludedNcmi") + cell("cleanBuilding"),
    INTEREST: cell("interest"),
    FOREIGN_INCOME: cell("foreignIncome"),
    CAPITAL_GAIN_DISCOUNTABLE: gainDiscountable,
    CAPITAL_GAIN_OTHER: cell("otherGainTarp"),
    NON_ASSESSABLE_TAX_DEFERRED: cell("taxDeferred"),
  };
  const assessable = (attributedComponents.OTHER_AU_INCOME ?? 0) + (attributedComponents.RENT ?? 0) + (attributedComponents.INTEREST ?? 0) +
    (attributedComponents.FOREIGN_INCOME ?? 0) + gainDiscountable + cell("otherGainTarp");
  const fundPayment = cell("ausOtherIncome") + cell("ncmi") + cell("excludedNcmi") + cell("cleanBuilding") + gainDiscountable + cell("otherGainTarp");
  const interestWithheld = line.lines.find((l) => l.key === "interest")?.withheld ?? 0;
  const costBaseNetAmount = computeAmitCostBaseNetAmount({ assessableAttributed: assessable, naneAttributed: 0, taxOffsets: 0, cashPaymentsOrEntitlements: line.cash });
  const statement = buildAmmaStatement({
    incomeYearEnd: fund.periodEnd,
    memberId: line.holder.holder,
    member: { memberClass: MEMBER_CLASS[isAuHolder(line.holder) ? line.holder.auStatus : "resident"], countryOfResidence: line.holder.country },
    attributedComponents,
    cashDistribution: line.cash,
    taxOffsets: 0,
    managedInvestmentTrustFundPayments: fundPayment,
    amountsWithheldFromManagedInvestmentTrustFundPayments: line.withheld - interestWithheld,
    costBaseNetAmount,
  });
  return { statement, costBaseNetAmount, assessable, interestWithheld };
}

export function statementDoc(_data: AppData, fundIn: Fund, calc: FundCalc, holderId: string): DocModel {
  const fund = asAuFund(fundIn);
  const line = calc.holders.find((h) => h.holder.id === holderId);
  if (!line) {
    return {
      fileName: `${slug(fund.name)}-amma-${slug(holderId)}.pdf`,
      title: "AMIT member annual statement",
      subtitle: fund.name,
      blocks: [{ kind: "paragraph", text: "This holder is not on the register for the fund, so there is no statement to show.", tone: "note" }],
    };
  }

  const { statement, costBaseNetAmount, assessable, interestWithheld } = statementFor(fund, line);
  const a = (cents: Cents): string => aud(nz(cents), 2);
  const labels = statement.presentation.atoFieldLabels;
  const official = statement.officialFields;
  const f = facts(calc);
  const concession = cellOf(line, "cgtConcessionTarp");

  const components = line.lines.filter((l) => l.amount !== 0);
  const blocks: DocBlock[] = [
    {
      kind: "table",
      title: "Your share of the trust components",
      columns: [
        { key: "component", label: "Tax character" },
        { key: "amount", label: "Amount", align: "right" },
        { key: "rate", label: "Withholding", align: "right" },
        { key: "withheld", label: "Withheld", align: "right" },
      ],
      rows: components.map((l) => ({ component: l.label, amount: a(l.amount), rate: l.rate > 0 ? ratePct(l.rate) : "—", withheld: l.withheld > 0 ? a(l.withheld) : "—" })),
      totalRow: { component: "Total", amount: a(components.reduce((s, l) => s + l.amount, 0)), rate: "", withheld: a(line.withheld) },
    },
    {
      kind: "kv",
      title: "Cost base",
      rows: [
        { label: "Attributed amounts (assessable)", value: a(assessable) },
        { label: "Cash distribution received", value: a(line.cash) },
        costBaseNetAmount.excessDecrease > 0
          ? { label: "AMIT cost base net amount — excess (decreases the cost base)", value: a(costBaseNetAmount.excessDecrease), emphasis: true }
          : costBaseNetAmount.shortfallIncrease > 0
            ? { label: "AMIT cost base net amount — shortfall (increases the cost base)", value: a(costBaseNetAmount.shortfallIncrease), emphasis: true }
            : { label: "AMIT cost base net amount — nil", value: a(0), emphasis: true },
      ],
    },
    {
      kind: "kv",
      title: "Amounts for your tax return",
      rows: [
        { label: labels["officialFields.managedInvestmentTrustFundPayments"] ?? "Managed investment trust fund payments", value: a(official.managedInvestmentTrustFundPayments) },
        { label: labels["officialFields.amountsWithheldFromManagedInvestmentTrustFundPayments"] ?? "Amounts withheld from MIT fund payments", value: a(official.amountsWithheldFromManagedInvestmentTrustFundPayments) },
        { label: labels["officialFields.paragraph2761052abAmounts"] ?? "Para 276-105(2)(a) and (b) amounts", value: a(official.paragraph2761052abAmounts) },
        { label: labels["officialFields.paragraph2761052cAmounts"] ?? "Para 276-105(2)(c) amounts", value: a(official.paragraph2761052cAmounts) },
        { label: labels["officialFields.shareOfCreditForTaxFileNumberAmountsWithheld"] ?? "Share of credit for tax file number amounts withheld", value: a(official.shareOfCreditForTaxFileNumberAmountsWithheld) },
        { label: labels["officialFields.shareOfCreditForForeignResidentWithholdingAmounts"] ?? "Share of credit for foreign resident withholding amounts", value: a(official.shareOfCreditForForeignResidentWithholdingAmounts) },
        { label: labels["officialFields.shareOfFrankingCreditFromFrankedDistributions"] ?? "Share of franking credit from franked distributions", value: a(official.shareOfFrankingCreditFromFrankedDistributions) },
      ],
    },
  ];
  if (interestWithheld > 0) {
    blocks.push({ kind: "paragraph", text: `Interest withholding of ${a(interestWithheld)} is separate from the fund payment withholding above.`, tone: "muted" });
  }

  return {
    fileName: `${slug(fund.name)}-amma-${slug(line.holder.holder)}.pdf`,
    title: "AMIT member annual statement",
    subtitle: fund.name,
    meta: [
      { label: "Member", value: line.holder.holder },
      { label: "Country", value: line.holder.country },
      { label: "Tax status", value: line.statusLabel },
      { label: "Units held", value: integer(line.holder.units) },
      { label: "Income year ended", value: dateLabel(fund.periodEnd) },
      { label: "Statement due", value: dateLabel(f.ammaDue) },
    ],
    blocks,
    footnotes: concession > 0 ? [...statement.notes, `The AIIR reports attributed amounts after taking out the AMIT CGT gross-up amount of ${a(concession)}, which is part of the assessable amount above.`] : statement.notes,
  };
}
