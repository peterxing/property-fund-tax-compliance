// Fictional demonstration data mirrored from the reference app for comparability (money in integer cents, units as whole units).
import type { Fund } from "../types.ts";

export const FUNDS: Fund[] = [
  {
    id: "harbourline", name: "Harbourline Office Trust", market: "AU", regime: "AMIT", currency: "AUD", sector: "Office", listed: true,
    periodLabel: "Income year ended 30 Jun 2026", periodStart: "2025-07-01", periodEnd: "2026-06-30",
    unitsOnIssue: 1412680000, status: "Signed off", whtRemitted: 250448636, governance: "agent-signs-off",
    inputs: { cashDistribution: 9244600000, ausOtherIncome: 4831840000, ncmi: 0, excludedNcmi: 0, cleanBuilding: 620530000, interest: 118490000, discountGainTarp: 391200000, otherGainTarp: 0, foreignIncome: 0 },
  },
  {
    id: "southbank", name: "Southbank Industrial Partners Fund", market: "AU", regime: "AMIT", currency: "AUD", sector: "Logistics", listed: false,
    periodLabel: "Income year ended 30 Jun 2026", periodStart: "2025-07-01", periodEnd: "2026-06-30",
    unitsOnIssue: 684215000, status: "In review", whtRemitted: 241009925, governance: "agent-lodges",
    inputs: { cashDistribution: 4721200000, ausOtherIncome: 3186625000, ncmi: 0, excludedNcmi: 0, cleanBuilding: 0, interest: 40261000, discountGainTarp: 988000000, otherGainTarp: 0, foreignIncome: 0 },
  },
  {
    id: "wattle", name: "Wattle Retail Property Trust", market: "AU", regime: "AMIT", currency: "AUD", sector: "Retail", listed: true,
    periodLabel: "Income year ended 30 Jun 2026", periodStart: "2025-07-01", periodEnd: "2026-06-30",
    unitsOnIssue: 2105330000, status: "Signed off", whtRemitted: 274264560, governance: "no-agent",
    inputs: { cashDistribution: 12968800000, ausOtherIncome: 8821470000, ncmi: 0, excludedNcmi: 0, cleanBuilding: 0, interest: 294180000, discountGainTarp: 1140650000, otherGainTarp: 128800000, foreignIncome: 0 },
  },
  {
    id: "kurrajong", name: "Kurrajong Stapled Property Trust", market: "AU", regime: "AMIT", currency: "AUD", sector: "Diversified, stapled", listed: true,
    periodLabel: "Income year ended 30 Jun 2026", periodStart: "2025-07-01", periodEnd: "2026-06-30",
    unitsOnIssue: 951400000, status: "In review", whtRemitted: 209240269, governance: "agent-lodges",
    inputs: { cashDistribution: 5803600000, ausOtherIncome: 3024410000, ncmi: 961580000, excludedNcmi: 0, cleanBuilding: 0, interest: 51790000, discountGainTarp: 0, otherGainTarp: 0, foreignIncome: 0 },
  },
  {
    id: "coastline", name: "Coastline Healthcare Property Fund", market: "AU", regime: "AMIT", currency: "AUD", sector: "Healthcare", listed: false,
    periodLabel: "Income year ended 30 Sep 2026", periodStart: "2025-10-01", periodEnd: "2026-09-30",
    unitsOnIssue: 318940000, status: "Preparing", whtRemitted: null, governance: "no-agent",
    inputs: { cashDistribution: 2104800000, ausOtherIncome: 1697045000, ncmi: 0, excludedNcmi: 0, cleanBuilding: 0, interest: 21230000, discountGainTarp: 0, otherGainTarp: 0, foreignIncome: 110480000 },
  },
  {
    id: "telok-ayer", name: "Telok Ayer Commercial REIT", market: "SG", regime: "S-REIT", currency: "SGD", sector: "Office & retail", listed: true,
    periodLabel: "Distribution period 1 Jul – 30 Sep 2026", periodStart: "2026-07-01", periodEnd: "2026-09-30", assessmentYear: 2027,
    unitsOnIssue: 4236180000, status: "Preparing", whtRemitted: null, governance: "agent-signs-off",
    inputs: { taxableSpecifiedIncome: 5841260000, taxableDistributed: 5841260000, taxExemptDistribution: 311840000, capitalDistribution: 190580000 },
  },
  {
    id: "loyang", name: "Loyang Logistics REIT", market: "SG", regime: "S-REIT", currency: "SGD", sector: "Logistics", listed: true,
    periodLabel: "Distribution period 1 Jan – 30 Jun 2026", periodStart: "2026-01-01", periodEnd: "2026-06-30", assessmentYear: 2027,
    unitsOnIssue: 2871050000, status: "Signed off", whtRemitted: 279264400, governance: "no-agent",
    inputs: { taxableSpecifiedIncome: 7124090000, taxableDistributed: 6981610000, taxExemptDistribution: 0, capitalDistribution: 430200000 },
  },
  {
    id: "meranti", name: "Meranti Digital Infrastructure REIT", market: "SG", regime: "S-REIT", currency: "SGD", sector: "Data centres", listed: true,
    periodLabel: "Distribution period 1 Jul – 30 Sep 2026", periodStart: "2026-07-01", periodEnd: "2026-09-30", assessmentYear: 2027,
    unitsOnIssue: 1588920000, status: "In review", whtRemitted: null, governance: "agent-lodges",
    inputs: { taxableSpecifiedIncome: 2766430000, taxableDistributed: 2683440000, taxExemptDistribution: 144270000, capitalDistribution: 0 },
  },
  {
    id: "kallang", name: "Kallang Riverside Retail REIT", market: "SG", regime: "S-REIT", currency: "SGD", sector: "Retail", listed: true,
    periodLabel: "Distribution period 1 Jul – 30 Sep 2026", periodStart: "2026-07-01", periodEnd: "2026-09-30", assessmentYear: 2027,
    unitsOnIssue: 3402760000, status: "Preparing", whtRemitted: null, governance: "no-agent",
    inputs: { taxableSpecifiedIncome: 4190650000, taxableDistributed: 3562050000, taxExemptDistribution: 0, capitalDistribution: 0 },
  },
];
