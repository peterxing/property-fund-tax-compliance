// Fictional demonstration data mirrored from the reference app for comparability (money in integer cents, units as whole units).
import type { FundId, Market, TaxAdjustmentDef, TaxAdjustments } from "../types.ts";

export const TAX_ADJUSTMENTS: Record<FundId, TaxAdjustments> = {
  harbourline: { div40: 185549600, div43: 371970300, tarpDiscountGross: 782400000, tarpOther: 0 },
  southbank: { div40: 95156500, div43: 190759700, tarpDiscountGross: 1976000000, tarpOther: 0 },
  wattle: { div40: 285211500, div43: 571761900, tarpDiscountGross: 2281300000, tarpOther: 128800000 },
  kurrajong: { div40: 127250600, div43: 255098600, tarpDiscountGross: 0, tarpOther: 0 },
  coastline: { div40: 52197900, div43: 104640900, tarpDiscountGross: 0, tarpOther: 0 },
  "telok-ayer": { capitalAllowances: 162597200 },
  loyang: { capitalAllowances: 188328700 },
  meranti: { capitalAllowances: 79113800 },
  kallang: { capitalAllowances: 122306700 },
};

export const ADJUSTMENT_DEFS: Record<Market, TaxAdjustmentDef[]> = {
  AU: [
    { key: "div40", label: "Tax depreciation — Div 40", help: "Plant and equipment, per the fixed asset register" },
    { key: "div43", label: "Capital works — Div 43", help: "Building construction costs written off this year" },
    { key: "tarpDiscountGross", label: "TARP capital gain — discount method", help: "Gross gain on property held 12 months or more; the 50% discount is applied" },
    { key: "tarpOther", label: "TARP capital gain — other method", help: "Gain on property held under 12 months" },
  ],
  SG: [
    { key: "capitalAllowances", label: "Capital allowances", help: "Plant and machinery, replacing accounting depreciation" },
  ],
};
