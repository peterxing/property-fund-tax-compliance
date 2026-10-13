// Fictional demonstration data mirrored from the reference app for comparability (money in integer cents, units as whole units).
import type { FundId, SgLedgerSeed, UnitCostBaseSeed } from "../types.ts";

/** Unit price in currency units; opening cost base per holder in cents. */
export const UNIT_COST_BASE: Record<FundId, UnitCostBaseSeed> = {
  harbourline: {
    unitPrice: 0.72,
    priceBasis: "market price",
    opening: { "h-hl-1": 61057620300, "h-hl-2": 8238749800, "h-hl-3": 16172360600, "h-hl-4": 8950740500, "h-hl-5": 1123753500 },
  },
  southbank: {
    unitPrice: 0.82,
    priceBasis: "NAV per unit",
    opening: { "h-sb-1": 15821787700, "h-sb-2": 9089112100, "h-sb-3": 14867992000, "h-sb-4": 12343238600 },
  },
  wattle: {
    unitPrice: 0.726,
    priceBasis: "market price",
    opening: { "h-wt-1": 103446821200, "h-wt-2": 14856724300, "h-wt-3": 16201777500, "h-wt-4": 8070319400 },
  },
  kurrajong: {
    unitPrice: 0.764,
    priceBasis: "market price",
    opening: { "h-kj-1": 40995445400, "h-kj-2": 5887643800, "h-kj-3": 11557226600, "h-kj-4": 6396452500, "h-kj-5": 3432682600 },
  },
  coastline: {
    unitPrice: 0.962,
    priceBasis: "NAV per unit",
    opening: { "h-cl-1": 17304663800, "h-cl-2": 4970488500, "h-cl-3": 4878442500, "h-cl-4": 1350009200 },
  },
  "telok-ayer": {
    unitPrice: 0.853,
    priceBasis: "market price",
    opening: { "h-ta-1": 135866153900, "h-ta-2": 73172596200, "h-ta-3": 38302692300, "h-ta-4": 47697692300, "h-ta-5": 35050576900 },
  },
  loyang: {
    unitPrice: 1.723,
    priceBasis: "market price",
    opening: { "h-ly-1": 162750350000, "h-ly-2": 100173087800, "h-ly-3": 104872566000, "h-ly-4": 65298012800, "h-ly-5": 23992072900 },
  },
  meranti: {
    unitPrice: 1.408,
    priceBasis: "market price",
    opening: { "h-mr-1": 63089022000, "h-mr-2": 36242629600, "h-mr-3": 59285783000, "h-mr-4": 29531031600, "h-mr-5": 21700833800 },
  },
  kallang: {
    unitPrice: 0.78,
    priceBasis: "market price",
    opening: { "h-kr-1": 124745181600, "h-kr-2": 42997275400, "h-kr-3": 28134019700, "h-kr-4": 35034817000, "h-kr-5": 12872641100 },
  },
};

/** SG distribution tracking schedule opening balances (Form UT), in cents. */
export const SG_LEDGER: Record<FundId, SgLedgerSeed> = {
  "telok-ayer": { exempt: 120677000, capital: 988421500, afterTax: 0 },
  loyang: { exempt: 0, capital: 216648000, afterTax: 41836600 },
  meranti: { exempt: 65539000, capital: 0, afterTax: 0 },
  kallang: { exempt: 0, capital: 341260600, afterTax: 0 },
};
