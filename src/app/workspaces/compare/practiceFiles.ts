export const PRACTICE_FILES: Record<string, { label: string; text: string }> = {
  harbourline: {
    label: "Harbourline practice file",
    text: `Reference,Description,Amount
Distribution component extract,,
component.ausOtherIncome,Australian income — other,"A$48,318,400.00"
component.cleanBuilding,Clean building MIT income,"A$6,205,300.50"
component.interest,Australian interest,"A$1,197,400.00"
component.discountGainTarp,Discounted capital gains — TARP,"(A$3,912,000.00)"
,AMIT CGT gross up TARP,"A$3,912,000.00"
legacy.reserve,Legacy platform rounding reserve,A$123.00
`,
  },
  loyang: {
    label: "Loyang practice file",
    text: `Ref,Line item,Value
Other system distribution export,,
component.taxableDistributed,Taxable income distribution,"S$69,816,100.00"
component.capitalDistribution,Return of capital distribution,"S$4,302,000.40"
,Tax exempt income dist,S$125.00
legacy.afterTax,After-tax income pool,"S$418,366.00"
`,
  },
};
