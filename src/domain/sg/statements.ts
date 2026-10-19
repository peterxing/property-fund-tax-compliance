// Unitholder distribution statement for a Singapore fund, assembled on the engine's statement builder.
import { buildUnitholderStatement } from "../../engine/distribution.ts";
import type { UnitholderAllocation } from "../../engine/distribution.ts";
import { dateLabel, integer, money, moneyParen, slug } from "../format.ts";
import type { AppData, DocBlock, DocModel, Fund, FundCalc } from "../types.ts";
import { paymentDateOf, rangeLabel, requireSgFund, sgClassOf, sgNoticeFor } from "./util.ts";
import { ENGINE_MAPPING, holderTreatment } from "./withholding.ts";

const m2 = (cents: number) => money(cents, "SGD", 2);

export function sgStatementDoc(data: AppData, fundIn: Fund, calc: FundCalc, holderId: string): DocModel {
  const fund = requireSgFund(fundIn);
  const line = calc.holders.find((h) => h.holder.id === holderId);
  if (!line) {
    return {
      fileName: `${slug(fund.name)}-unitholder-statement.pdf`,
      title: "Unitholder distribution statement",
      subtitle: fund.name,
      blocks: [{ kind: "paragraph", text: "This unitholder is not on the unit register for this fund." }],
    };
  }

  const paymentDate = paymentDateOf(fund, sgNoticeFor(data, fund.id));
  const sgClass = sgClassOf(line.holder);
  const t = holderTreatment(sgClass, paymentDate, "sgFundSection" in line.holder ? line.holder.sgFundSection : undefined);
  const mapping = ENGINE_MAPPING[sgClass];
  const amount = (key: string) => line.lines.find((l) => l.key === key)?.amount ?? 0;
  const allocation: UnitholderAllocation = {
    holderRef: line.holder.id,
    maskedId: line.holder.id,
    unitsHeld: line.holder.units,
    investorClass: mapping.investorClass,
    residency: mapping.residency,
    declarationStatus: mapping.declarationStatus,
    grossDistribution: line.cash,
    transparentTaxableDistribution: amount("taxableDistributed"),
    trusteeTaxedDistribution: 0,
    taxExemptDistribution: amount("taxExemptDistribution"),
    capitalDistribution: amount("capitalDistribution"),
    withholdingRateBps: t.rateBps,
    taxDeducted: line.withheld,
    netCashPaid: line.net,
    taxTreatmentRemark: t.remark,
  };
  const statement = buildUnitholderStatement(allocation, paymentDate);

  const labels = ["Taxable income distribution", "Distribution out of trustee-taxed income", "Tax-exempt income distribution", "Capital distribution"];
  const treatments = [t.rateSummary, "Taxed at the trustee", "Not taxable", "Not taxable · reduces cost base"];
  // The taxable line is always shown; the others only when the holder received something under them.
  const rows = statement.breakdown
    .map((b, i) => ({ distribution: labels[i] ?? b.component, amount: m2(b.amount), treatment: treatments[i] ?? "", keep: i === 0 || b.amount !== 0 }))
    .filter((r) => r.keep)
    .map(({ keep: _keep, ...cells }) => cells);

  const payment: DocBlock = {
    kind: "kv",
    title: "Payment",
    rows: [
      { label: "Gross distribution", value: m2(statement.grossDistribution) },
      ...(statement.taxDeducted > 0
        ? [{ label: t.partLabel ?? "Tax deducted", value: moneyParen(-statement.taxDeducted, "SGD", 2) }]
        : []),
      { label: "Net cash paid", value: m2(statement.netCashPaid), emphasis: true },
    ],
  };

  const blocks: DocBlock[] = [
    {
      kind: "table",
      title: "Distribution by type",
      columns: [
        { key: "distribution", label: "Distribution" },
        { key: "amount", label: "Amount", align: "right" },
        { key: "treatment", label: "Tax treatment" },
      ],
      rows,
      totalRow: { distribution: "Total distribution", amount: m2(statement.grossDistribution), treatment: "" },
    },
    payment,
    ...statement.notes.map((text): DocBlock => ({ kind: "paragraph", text, tone: "muted" })),
  ];

  return {
    fileName: `${slug(fund.name)}-unitholder-statement-${slug(line.holder.holder)}.pdf`,
    title: "Unitholder distribution statement",
    subtitle: fund.name,
    meta: [
      { label: "Unitholder", value: line.holder.holder },
      { label: "Country", value: line.holder.country },
      { label: "Tax status", value: line.statusLabel },
      { label: "Units held", value: integer(statement.unitsHeld) },
      { label: "Distribution period", value: rangeLabel(fund.periodStart, fund.periodEnd) },
      { label: "Payment date", value: dateLabel(statement.distributionDate) },
      { label: "Year of assessment", value: `YA${fund.assessmentYear}` },
    ],
    blocks,
  };
}
