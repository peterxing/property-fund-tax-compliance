// OWNER: Assets & allowances agent (F3). Fictional demo register for the nine seeded funds (integer cents).
import type { FixedAsset } from "./types.ts";

const AU_TARGETS = {
  harbourline: { div40: 185549600, div43: 371970300, properties: ["harbourline-harbourline-tower", "harbourline-riverside-place", "harbourline-collins-quarter"] },
  southbank: { div40: 95156500, div43: 190759700, properties: ["southbank-dandenong-south-estate", "southbank-port-botany-distribution-centre", "southbank-eastern-creek-logistics-hub"] },
  wattle: { div40: 285211500, div43: 571761900, properties: ["wattle-wattle-grove-shopping-centre", "wattle-lakeside-marketplace", "wattle-coral-coast-central", "wattle-banksia-plaza"] },
  kurrajong: { div40: 127250600, div43: 255098600, properties: ["kurrajong-kurrajong-business-park", "kurrajong-ironbark-data-hall", "kurrajong-fremantle-wharf-offices"] },
  coastline: { div40: 52197900, div43: 104640900, properties: ["coastline-coastline-private-hospital", "coastline-bayside-medical-centre", "coastline-northern-beaches-day-surgery"] },
} as const;

const SG_TARGETS = {
  "telok-ayer": { ca: 162597200, properties: ["telok-ayer-telok-ayer-tower", "telok-ayer-cecil-exchange", "telok-ayer-bugis-gateway-mall"], start: "2026-08-15" },
  loyang: { ca: 188328700, properties: ["loyang-loyang-logistics-hub", "loyang-tuas-cold-chain-centre", "loyang-changi-north-distribution-centre", "loyang-senoko-industrial-park"], start: "2026-03-01" },
  meranti: { ca: 79113800, properties: ["meranti-meranti-dc1", "meranti-meranti-dc2"], start: "2026-08-15" },
  kallang: { ca: 122306700, properties: ["kallang-kallang-riverside-mall", "kallang-jurong-junction", "kallang-punggol-waterway-point"], start: "2026-08-15" },
} as const;

function split(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  let used = 0;
  return weights.map((weight, index) => {
    const value = index === weights.length - 1 ? total - used : Math.round((total * weight) / sum);
    used += value;
    return value;
  });
}

function splitWholeDollars(total: number, weights: readonly number[]): number[] {
  const dollars = split(Math.round(total / 100), weights);
  return dollars.map((value) => value * 100);
}

const DIV40_CLASSES = ["HVAC_PACKAGED_UNIT", "LIFTS_ELECTRIC", "CARPET", "SECURITY_SYSTEM_CONTROLS", "FIRE_INDICATOR_PANEL"] as const;
const DIV40_LABELS = ["HVAC plant replacement", "Lift motor controllers", "Common-area carpet", "Security access controls", "Fire panel upgrade"] as const;
const DIV43_LABELS = ["Base building structure", "Facade and roof works", "Lobby refurbishment", "Car park resurfacing", "Amenities upgrade"] as const;
const SG_LABELS = ["Escalator and lift works", "Air-conditioning plant", "Retail fit-out plant", "Building management system", "Digital access hardware"] as const;

function auAssets(fundId: keyof typeof AU_TARGETS): FixedAsset[] {
  const target = AU_TARGETS[fundId];
  const div40 = split(target.div40, [28, 24, 19, 16, 13]).map((cost, i): FixedAsset => ({
    id: `${fundId}-div40-${i + 1}`,
    fundId,
    propertyId: target.properties[i % target.properties.length],
    kind: "AU_DIV40",
    description: DIV40_LABELS[i],
    cost,
    startDate: "2025-07-01",
    assetClassId: DIV40_CLASSES[i],
    method: "PRIME_COST",
    effectiveLifeYears: 1,
    notes: "Seeded to reconcile the Division 40 trial-balance adjustment.",
  }));
  const div43 = split(target.div43, [36, 25, 18, 13, 8]).map((deduction, i): FixedAsset => ({
    id: `${fundId}-div43-${i + 1}`,
    fundId,
    propertyId: target.properties[i % target.properties.length],
    kind: "AU_DIV43",
    description: DIV43_LABELS[i],
    cost: deduction * 40,
    startDate: "2025-07-01",
    buildingType: "COMMERCIAL",
    constructionStartDate: "2024-07-01",
    constructionCompleteDate: "2025-06-30",
    firstIncomeUseDate: "2025-07-01",
    constructionExpenditure: deduction * 40,
    notes: "2.5% Division 43 seed item reconciled to the trial-balance adjustment.",
  }));
  return [...div40, ...div43];
}

function sgAssets(fundId: keyof typeof SG_TARGETS): FixedAsset[] {
  const target = SG_TARGETS[fundId];
  return splitWholeDollars(target.ca, [31, 24, 18, 15, 12]).map((cost, i): FixedAsset => ({
    id: `${fundId}-ca-${i + 1}`,
    fundId,
    propertyId: target.properties[i % target.properties.length],
    kind: "SG_PLANT",
    description: SG_LABELS[i],
    cost,
    startDate: target.start,
    assetClassId: i === 4 ? "IT_EQUIPMENT" : "LIFTS_ESCALATORS_HVAC",
    regime: "S19A_1Y_SPECIFIC",
    notes: "One-year section 19A seed item reconciled to the capital-allowance adjustment.",
  }));
}

export const SEED_ASSETS: readonly FixedAsset[] = [
  ...auAssets("harbourline"),
  ...auAssets("southbank"),
  ...auAssets("wattle"),
  ...auAssets("kurrajong"),
  ...auAssets("coastline"),
  ...sgAssets("telok-ayer"),
  ...sgAssets("loyang"),
  ...sgAssets("meranti"),
  ...sgAssets("kallang"),
];
