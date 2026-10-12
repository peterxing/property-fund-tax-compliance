import { allocate, max0 } from "./money.ts";
import type { Cents } from "./money.ts";
import { financialYearEnd, yearOfAssessment, type ISODate } from "./dates.ts";
import { ENGINE_DISCLAIMER } from "./rules.ts";
import type { ComputationLine, EntityKind, Finding } from "./types.ts";

const RETRIEVED: ISODate = "2026-10-09";
const DOLLAR = 100;
const LOW_VALUE_ASSET_LIMIT: Cents = 500_000;
const LOW_VALUE_ASSET_ANNUAL_CAP: Cents = 3_000_000;
const SECTION_14N_CAP_PER_WINDOW: Cents = 30_000_000;

export type CapitalAllowanceRegime =
  | "S19_WORKING_LIFE"
  | "S19A_3Y"
  | "S19A_2Y"
  | "S19A_1Y_SPECIFIC"
  | "S19A_1Y_LOW_VALUE"
  | "S19B_5Y"
  | "S19B_10Y"
  | "S19B_15Y"
  | "IBA"
  | "LIA";

export interface CapitalAssetRecord {
  id: string;
  label: string;
  regime: CapitalAllowanceRegime;
  cost: Cents;
  acquisitionDate: ISODate;
  disposalDate?: ISODate;
  disposalProceeds?: Cents;
  claimStartYa?: number;
  deferYas?: readonly number[];
  prescribedWorkingLifeYears?: number;
  electedWorkingLifeYears?: 6 | 12 | 16;
  claimInitialAllowance?: boolean;
  liaCompletionDate?: ISODate;
  liaGprMetByYa?: Readonly<Record<number, boolean>>;
}

export type RrClaimMode = "THREE_YEAR" | "ONE_YEAR";

export interface RenovationAllowanceRecord {
  id: string;
  label: string;
  cost: Cents;
  incurredDate: ISODate;
  claimMode?: RrClaimMode;
  relatesToStructuralWorks?: boolean;
  designerOrProfessionalFees?: Cents;
  designerFeesRelateToStructuralWorks?: boolean;
  toEmployeeResidence?: boolean;
}

export interface CapitalAllowanceComputationInput {
  fromYa: number;
  toYa: number;
  financialYearEndMonth: number;
  financialYearEndDay: number;
  assets: readonly CapitalAssetRecord[];
  renovationExpenditures?: readonly RenovationAllowanceRecord[];
  entityKind?: EntityKind;
  principalActivity?: string;
  s14nRollingWindowStartYa?: number;
}

export interface AssetAllowanceLine {
  assetId: string;
  assetLabel: string;
  regime: CapitalAllowanceRegime | "S14N";
  ya: number;
  openingTaxWrittenDownValue: Cents;
  allowanceClaimed: Cents;
  balancingAllowance: Cents;
  balancingCharge: Cents;
  closingTaxWrittenDownValue: Cents;
  note?: string;
}

export interface CapitalAllowanceYaSummary {
  ya: number;
  capitalAllowances: Cents;
  section19bAllowances: Cents;
  industrialBuildingAllowance: Cents;
  liaAllowance: Cents;
  section14nDeduction: Cents;
  balancingAllowance: Cents;
  balancingCharge: Cents;
  totalDeductions: Cents;
  totalAdditions: Cents;
  lines: ComputationLine[];
}

export interface CapitalAllowanceComputationResult {
  yaSummaries: readonly CapitalAllowanceYaSummary[];
  assetLines: readonly AssetAllowanceLine[];
  findings: Finding[];
  notes: string[];
}

export interface CapitalAllowanceRegimeOption {
  id: string;
  label: string;
  description: string;
}

export interface CapitalAssetClassOption {
  id: string;
  label: string;
  defaultRegime: string;
}

export const CAPITAL_ALLOWANCE_REGIMES: readonly CapitalAllowanceRegimeOption[] = [
  { id: "S19_WORKING_LIFE", label: "Section 19 working-life write-off", description: "Initial allowance plus annual allowance over the elected or prescribed 6 / 12 / 16 year working life." },
  { id: "S19A_3Y", label: "Section 19A 3-year write-off", description: "Straight-line write-off over 3 YAs for qualifying plant and machinery." },
  { id: "S19A_2Y", label: "Section 19A 2-year accelerated write-off", description: "Accelerated write-off for qualifying YAs (2021, 2022 and 2024 under the current IRAS page)." },
  { id: "S19A_1Y_SPECIFIC", label: "Section 19A 1-year specific write-off", description: "One-year write-off for assets that IRAS specifically allows to be written off in one year." },
  { id: "S19A_1Y_LOW_VALUE", label: "Low-value asset one-year write-off", description: "One-year write-off for qualifying low-value assets costing not more than S$5,000 each, subject to the S$30,000 per-YA cap." },
  { id: "S19B_5Y", label: "Section 19B over 5 years", description: "Writing-down allowance over 5 years for qualifying intellectual property rights." },
  { id: "S19B_10Y", label: "Section 19B over 10 years", description: "Writing-down allowance over 10 years for qualifying intellectual property rights." },
  { id: "S19B_15Y", label: "Section 19B over 15 years", description: "Writing-down allowance over 15 years for qualifying intellectual property rights." },
  { id: "IBA", label: "Industrial Building Allowance", description: "Transitional IBA claims for qualifying industrial / special hotel buildings." },
  { id: "LIA", label: "Land Intensification Allowance", description: "Initial and annual allowances for approved land-intensification projects." },
  { id: "S14N_3Y", label: "Section 14N renovation / refurbishment (3-year)", description: "Qualifying renovation and refurbishment deduction over 3 consecutive YAs." },
  { id: "S14N_1Y", label: "Section 14N renovation / refurbishment (1-year)", description: "Qualifying section 14N claim using the one-year option where IRAS currently allows it." },
] as const;

export const CAPITAL_ASSET_CLASSES: readonly CapitalAssetClassOption[] = [
  { id: "P_AND_M_GENERAL", label: "Plant & machinery in buildings", defaultRegime: "S19A_3Y" },
  { id: "LIFTS_ESCALATORS_HVAC", label: "Lifts, escalators and HVAC", defaultRegime: "S19A_3Y" },
  { id: "FURNITURE_FITTINGS", label: "Furniture & fittings", defaultRegime: "S19A_3Y" },
  { id: "IT_EQUIPMENT", label: "IT equipment and software tools", defaultRegime: "S19A_1Y_SPECIFIC" },
  { id: "LOW_VALUE_ASSET", label: "Low-value asset (≤ S$5,000)", defaultRegime: "S19A_1Y_LOW_VALUE" },
  { id: "QUALIFYING_IPR", label: "Qualifying intellectual property right", defaultRegime: "S19B_5Y" },
  { id: "QUALIFYING_INDUSTRIAL_OR_SPECIAL_HOTEL_BUILDING", label: "Qualifying industrial / special hotel building (IBA)", defaultRegime: "IBA" },
  { id: "LAND_INTENSIFICATION_PROJECT", label: "Approved land-intensification project", defaultRegime: "LIA" },
  { id: "RENOVATION_REFURBISHMENT", label: "Renovation & refurbishment", defaultRegime: "S14N_3Y" },
] as const;

interface AssetContext {
  acquisitionYa: number;
  disposalYa?: number;
  claimStartYa: number;
  deferYas: ReadonlySet<number>;
}

function roundWholeDollarsToCents(amount: Cents): Cents {
  return Math.round(amount / DOLLAR) * DOLLAR;
}

function centsToWholeDollars(amount: Cents): number {
  return Math.round(roundWholeDollarsToCents(amount) / DOLLAR);
}

function wholeDollarAllocations(total: Cents, weights: readonly number[]): Cents[] {
  return allocate(centsToWholeDollars(total), weights).map((dollars) => dollars * DOLLAR);
}

function deriveYaForDate(date: ISODate, fyeMonth: number, fyeDay: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const fyeInYear = `${String(y).padStart(4, "0")}-${String(fyeMonth).padStart(2, "0")}-${String(fyeDay).padStart(2, "0")}`;
  return yearOfAssessment(date <= fyeInYear ? financialYearEnd(y, fyeMonth, fyeDay) : financialYearEnd(y + 1, fyeMonth, fyeDay));
}

function buildContext(asset: CapitalAssetRecord, fyeMonth: number, fyeDay: number): AssetContext {
  const acquisitionYa = deriveYaForDate(asset.acquisitionDate, fyeMonth, fyeDay);
  const disposalYa = asset.disposalDate ? deriveYaForDate(asset.disposalDate, fyeMonth, fyeDay) : undefined;
  return {
    acquisitionYa,
    disposalYa,
    claimStartYa: asset.claimStartYa ?? acquisitionYa,
    deferYas: new Set(asset.deferYas ?? []),
  };
}

function getWorkingLifeYears(asset: CapitalAssetRecord): 6 | 12 | 16 {
  if (asset.electedWorkingLifeYears) return asset.electedWorkingLifeYears;
  const prescribed = asset.prescribedWorkingLifeYears ?? 12;
  if (prescribed <= 6) return 6;
  if (prescribed <= 12) return 12;
  return 16;
}

function isOneYearRrAllowed(ya: number): boolean {
  return ya === 2021 || ya === 2022 || ya === 2024 || ya >= 2025;
}

function rrWindowStartYa(input: CapitalAllowanceComputationInput, incurredYa: number): number {
  if (incurredYa >= 2025) return 2025 + Math.floor((incurredYa - 2025) / 3) * 3;
  return input.s14nRollingWindowStartYa ?? Math.max(2022, incurredYa);
}

function rrWindowCap(input: CapitalAllowanceComputationInput, incurredYa: number, capUsage: Map<number, Cents>): Cents {
  const start = rrWindowStartYa(input, incurredYa);
  const used = capUsage.get(start) ?? 0;
  return Math.max(0, SECTION_14N_CAP_PER_WINDOW - used);
}

function applyAssetLine(acc: Map<number, AssetAllowanceLine[]>, line: AssetAllowanceLine): void {
  const existing = acc.get(line.ya) ?? [];
  existing.push(line);
  acc.set(line.ya, existing);
}

function projectSchedule(input: CapitalAllowanceComputationInput): { byYa: Map<number, AssetAllowanceLine[]>; findings: Finding[] } {
  const byYa = new Map<number, AssetAllowanceLine[]>();
  const findings: Finding[] = [];
  const lowValueAssetUsage = new Map<number, Cents>();

  for (const asset of input.assets) {
    if (asset.cost < 0) throw new RangeError(`Asset ${asset.id} cost cannot be negative.`);
    const ctx = buildContext(asset, input.financialYearEndMonth, input.financialYearEndDay);
    const disposalYa = ctx.disposalYa;
    const stopYa = Math.max(input.toYa, disposalYa ?? input.toYa) + 20;
    let twdv = roundWholeDollarsToCents(asset.cost);

    const pushLine = (ya: number, opening: Cents, claim: Cents, ba: Cents, bc: Cents, closing: Cents, note?: string) => {
      if (ya < input.fromYa || ya > input.toYa) return;
      applyAssetLine(byYa, {
        assetId: asset.id,
        assetLabel: asset.label,
        regime: asset.regime,
        ya,
        openingTaxWrittenDownValue: opening,
        allowanceClaimed: claim,
        balancingAllowance: ba,
        balancingCharge: bc,
        closingTaxWrittenDownValue: closing,
        note,
      });
    };

    if (asset.regime === "S19A_2Y") {
      if (![2021, 2022, 2024].includes(ctx.acquisitionYa)) {
        findings.push({ id: "CA.S19A2.INVALID_YA", severity: "WARNING", message: `Asset ${asset.label} is tagged as 2-year accelerated capital allowance but acquisition YA ${ctx.acquisitionYa} is outside YA 2021, 2022 or 2024.`, subject: asset.id });
      }
      const schedule = wholeDollarAllocations(asset.cost, [75, 25]);
      for (let i = 0; i < schedule.length; i += 1) {
        const ya = ctx.acquisitionYa + i;
        const opening = twdv;
        const claim = ya < ctx.claimStartYa || (disposalYa !== undefined && ya >= disposalYa) ? 0 : schedule[i] ?? 0;
        twdv = max0(twdv - claim);
        pushLine(ya, opening, claim, 0, 0, twdv);
      }
      if (disposalYa !== undefined) {
        const opening = twdv;
        const proceeds = roundWholeDollarsToCents(asset.disposalProceeds ?? 0);
        const bcCap = max0(roundWholeDollarsToCents(asset.cost) - twdv);
        const bc = proceeds > twdv ? Math.min(proceeds - twdv, bcCap) : 0;
        const ba = proceeds < twdv ? twdv - proceeds : 0;
        twdv = 0;
        pushLine(disposalYa, opening, 0, ba, bc, 0, "Balancing adjustment on disposal");
      }
      continue;
    }

    if (asset.regime === "S19A_1Y_LOW_VALUE") {
      const opening = twdv;
      let claim = 0;
      const claimYa = ctx.claimStartYa;
      const roundedCost = roundWholeDollarsToCents(asset.cost);
      if (claimYa >= input.fromYa && claimYa <= input.toYa) {
        if (roundedCost > LOW_VALUE_ASSET_LIMIT) {
          findings.push({ id: "CA.LOW_VALUE_ASSET.LIMIT", severity: "WARNING", message: `Asset ${asset.label} exceeds the S$5,000 per-asset low-value asset limit and was not claimed under the 1-year low-value asset regime.`, subject: asset.id });
        } else if (disposalYa !== undefined && claimYa >= disposalYa) {
          claim = 0;
        } else {
          const used = lowValueAssetUsage.get(claimYa) ?? 0;
          const remainingCap = Math.max(0, LOW_VALUE_ASSET_ANNUAL_CAP - used);
          claim = Math.min(roundedCost, remainingCap);
          lowValueAssetUsage.set(claimYa, used + claim);
          if (claim < roundedCost) {
            findings.push({ id: "CA.LOW_VALUE_ASSET.CAP", severity: "WARNING", message: `The S$30,000 per-YA low-value asset cap limited the claim for ${asset.label}.`, subject: asset.id, data: { claimYa, claim, roundedCost, remainingCap } });
          }
        }
      }
      twdv = max0(twdv - claim);
      pushLine(claimYa, opening, claim, 0, 0, twdv, claim < roundedCost ? "Low-value asset claim capped or disallowed; review whether a different capital-allowance regime should be used." : undefined);
      if (disposalYa !== undefined) {
        const disposalOpening = twdv;
        const proceeds = roundWholeDollarsToCents(asset.disposalProceeds ?? 0);
        const bcCap = max0(roundWholeDollarsToCents(asset.cost) - twdv);
        const bc = proceeds > twdv ? Math.min(proceeds - twdv, bcCap) : 0;
        const ba = proceeds < twdv ? twdv - proceeds : 0;
        twdv = 0;
        pushLine(disposalYa, disposalOpening, 0, ba, bc, 0, "Balancing adjustment on disposal");
      }
      continue;
    }

    if (asset.regime === "S19A_3Y" || asset.regime === "S19A_1Y_SPECIFIC") {
      const claimCount = asset.regime === "S19A_3Y" ? 3 : 1;
      const weights = asset.regime === "S19A_3Y" ? [1, 1, 1] : [1];
      const schedule = wholeDollarAllocations(asset.cost, weights);
      let claimedYears = 0;
      for (let ya = ctx.claimStartYa; ya <= stopYa && claimedYears < claimCount; ya += 1) {
        const opening = twdv;
        let claim = 0;
        if (disposalYa !== undefined && ya >= disposalYa) {
          claim = 0;
        } else if (!ctx.deferYas.has(ya)) {
          claim = schedule[claimedYears] ?? 0;
          claimedYears += 1;
        }
        twdv = max0(twdv - claim);
        pushLine(ya, opening, claim, 0, 0, twdv);
      }
      if (disposalYa !== undefined) {
        const opening = twdv;
        const proceeds = roundWholeDollarsToCents(asset.disposalProceeds ?? 0);
        const bcCap = max0(roundWholeDollarsToCents(asset.cost) - twdv);
        const bc = proceeds > twdv ? Math.min(proceeds - twdv, bcCap) : 0;
        const ba = proceeds < twdv ? twdv - proceeds : 0;
        twdv = 0;
        pushLine(disposalYa, opening, 0, ba, bc, 0, "Balancing adjustment on disposal");
      }
      continue;
    }

    if (asset.regime === "S19_WORKING_LIFE") {
      const life = getWorkingLifeYears(asset);
      const claimIa = asset.claimInitialAllowance !== false;
      const ia = claimIa ? wholeDollarAllocations(asset.cost, [20])[0] ?? 0 : 0;
      const aaPool = claimIa ? max0(roundWholeDollarsToCents(asset.cost) - ia) : roundWholeDollarsToCents(asset.cost);
      const aaSchedule = wholeDollarAllocations(aaPool, Array.from({ length: life }, () => 1));
      let aaIndex = 0;
      for (let ya = ctx.acquisitionYa; ya <= stopYa && aaIndex < aaSchedule.length; ya += 1) {
        const opening = twdv;
        let claim = 0;
        if (disposalYa !== undefined && ya >= disposalYa) {
          claim = 0;
        } else {
          if (ya === ctx.acquisitionYa) claim += ia;
          if (ya >= ctx.claimStartYa && !ctx.deferYas.has(ya)) {
            claim += aaSchedule[aaIndex] ?? 0;
            aaIndex += 1;
          }
        }
        twdv = max0(twdv - claim);
        pushLine(ya, opening, claim, 0, 0, twdv, claimIa ? undefined : "Initial allowance not claimed; annual allowances spread over full cost.");
      }
      if (disposalYa !== undefined) {
        const opening = twdv;
        const proceeds = roundWholeDollarsToCents(asset.disposalProceeds ?? 0);
        const bcCap = max0(roundWholeDollarsToCents(asset.cost) - twdv);
        const bc = proceeds > twdv ? Math.min(proceeds - twdv, bcCap) : 0;
        const ba = proceeds < twdv ? twdv - proceeds : 0;
        pushLine(disposalYa, opening, 0, ba, bc, 0, "Balancing adjustment on disposal");
      }
      continue;
    }

    if (asset.regime === "S19B_5Y" || asset.regime === "S19B_10Y" || asset.regime === "S19B_15Y") {
      const years = Number(asset.regime.slice(5, 7));
      if (ctx.acquisitionYa > 2028) {
        findings.push({ id: "CA.S19B.EXPIRED", severity: "WARNING", message: `Asset ${asset.label} is tagged as an s19B IPR acquisition even though the IRAS page currently extends ordinary s19B claims only to acquisitions on or before the last day of the basis period for YA 2028.`, subject: asset.id });
      }
      const schedule = wholeDollarAllocations(asset.cost, Array.from({ length: years }, () => 1));
      let index = 0;
      for (let ya = ctx.claimStartYa; ya <= stopYa && index < schedule.length; ya += 1) {
        const opening = twdv;
        let claim = 0;
        if (disposalYa !== undefined && ya >= disposalYa) {
          claim = 0;
        } else if (!ctx.deferYas.has(ya)) {
          claim = schedule[index] ?? 0;
          index += 1;
        }
        twdv = max0(twdv - claim);
        pushLine(ya, opening, claim, 0, 0, twdv);
      }
      if (disposalYa !== undefined) {
        const opening = twdv;
        const proceeds = roundWholeDollarsToCents(asset.disposalProceeds ?? 0);
        const bcCap = max0(roundWholeDollarsToCents(asset.cost) - twdv);
        const bc = proceeds > twdv ? Math.min(proceeds - twdv, bcCap) : 0;
        pushLine(disposalYa, opening, 0, 0, bc, max0(twdv - proceeds), "No balancing allowance is given for s19B disposals under the current IRAS page when proceeds do not exceed TWDV.");
      }
      continue;
    }

    if (asset.regime === "IBA") {
      const ia = wholeDollarAllocations(asset.cost, [25])[0] ?? 0;
      const aaPerYear = wholeDollarAllocations(max0(roundWholeDollarsToCents(asset.cost) - ia), Array.from({ length: 25 }, () => 1));
      let aaIndex = 0;
      for (let ya = ctx.acquisitionYa; ya <= stopYa && aaIndex < aaPerYear.length; ya += 1) {
        const opening = twdv;
        let claim = 0;
        if (disposalYa !== undefined && ya >= disposalYa) {
          claim = 0;
        } else {
          if (ya === ctx.acquisitionYa) claim += ia;
          claim += aaPerYear[aaIndex] ?? 0;
          aaIndex += 1;
        }
        twdv = max0(twdv - claim);
        pushLine(ya, opening, claim, 0, 0, twdv);
      }
      if (disposalYa !== undefined) {
        const opening = twdv;
        const proceeds = roundWholeDollarsToCents(asset.disposalProceeds ?? 0);
        const bcCap = max0(roundWholeDollarsToCents(asset.cost) - twdv);
        const bc = proceeds > twdv ? Math.min(proceeds - twdv, bcCap) : 0;
        const ba = proceeds < twdv ? twdv - proceeds : 0;
        pushLine(disposalYa, opening, 0, ba, bc, 0, "IBA balancing adjustment modelled using the same residue-vs-proceeds method as the general capital allowance schedule.");
      }
      continue;
    }

    if (asset.regime === "LIA") {
      if (!asset.liaCompletionDate) {
        findings.push({ id: "CA.LIA.MISSING_COMPLETION", severity: "WARNING", message: `Asset ${asset.label} is tagged as LIA but has no completion date.`, subject: asset.id });
        continue;
      }
      const completionYa = deriveYaForDate(asset.liaCompletionDate, input.financialYearEndMonth, input.financialYearEndDay);
      const ia = wholeDollarAllocations(asset.cost, [25])[0] ?? 0;
      const aaSchedule = wholeDollarAllocations(max0(roundWholeDollarsToCents(asset.cost) - ia), Array.from({ length: 15 }, () => 1));
      let aaIndex = 0;
      for (let ya = ctx.acquisitionYa; ya <= stopYa && (ya === ctx.acquisitionYa || aaIndex < aaSchedule.length); ya += 1) {
        const opening = twdv;
        let claim = 0;
        if (ya === ctx.acquisitionYa) claim += ia;
        if (ya >= completionYa && (asset.liaGprMetByYa?.[ya] ?? true) && (disposalYa === undefined || ya < disposalYa) && aaIndex < aaSchedule.length) {
          claim += aaSchedule[aaIndex] ?? 0;
          aaIndex += 1;
        }
        twdv = max0(twdv - claim);
        pushLine(ya, opening, claim, 0, 0, twdv);
      }
      if (disposalYa !== undefined) {
        pushLine(disposalYa, twdv, 0, 0, 0, 0, "No balancing adjustment is made for LIA on sale or transfer under the current IRAS page.");
      }
    }
  }

  const rrCapUsage = new Map<number, Cents>();
  const isInvestmentHoldingCompany = input.entityKind === "PROPERTY_FUND" || /investment\s+holding/i.test(input.principalActivity ?? "");
  for (const record of input.renovationExpenditures ?? []) {
    const incurredYa = deriveYaForDate(record.incurredDate, input.financialYearEndMonth, input.financialYearEndDay);
    if (record.cost < 0) throw new RangeError(`Renovation expenditure ${record.id} cannot be negative.`);
    if (isInvestmentHoldingCompany) {
      findings.push({ id: "CA.S14N.INVESTMENT_HOLDING", severity: "WARNING", message: `Section 14N deduction is not available to investment holding companies; ${record.label} was ignored.`, subject: record.id });
      continue;
    }
    if (record.relatesToStructuralWorks || record.toEmployeeResidence) {
      findings.push({ id: "CA.S14N.NON_QUALIFYING", severity: "WARNING", message: `R&R item ${record.label} appears non-qualifying for section 14N and was ignored.`, subject: record.id });
      continue;
    }
    let qualifyingCost = roundWholeDollarsToCents(record.cost);
    if ((record.designerOrProfessionalFees ?? 0) > 0 && (incurredYa < 2025 || record.designerFeesRelateToStructuralWorks !== false)) {
      qualifyingCost = max0(qualifyingCost - roundWholeDollarsToCents(record.designerOrProfessionalFees ?? 0));
    }
    const capStart = rrWindowStartYa(input, incurredYa);
    const allowedUnderCap = Math.min(qualifyingCost, rrWindowCap(input, incurredYa, rrCapUsage));
    rrCapUsage.set(capStart, (rrCapUsage.get(capStart) ?? 0) + allowedUnderCap);
    if (allowedUnderCap < qualifyingCost) {
      findings.push({ id: "CA.S14N.CAP", severity: "WARNING", message: `R&R item ${record.label} exceeded the section 14N cap for its 3-year period; only the capped amount was scheduled.`, subject: record.id });
    }
    const oneYear = (record.claimMode ?? (incurredYa >= 2025 ? "ONE_YEAR" : "THREE_YEAR")) === "ONE_YEAR";
    if (oneYear && !isOneYearRrAllowed(incurredYa)) {
      findings.push({ id: "CA.S14N.ONE_YEAR_NOT_ALLOWED", severity: "WARNING", message: `A 1-year section 14N deduction is not available for YA ${incurredYa}; ${record.label} was spread over 3 years instead.`, subject: record.id });
    }
    const mode: RrClaimMode = oneYear && isOneYearRrAllowed(incurredYa) ? "ONE_YEAR" : "THREE_YEAR";
    const pieces = mode === "ONE_YEAR" ? [allowedUnderCap] : wholeDollarAllocations(allowedUnderCap, [1, 1, 1]);
    let twdv = allowedUnderCap;
    for (let i = 0; i < pieces.length; i += 1) {
      const ya = incurredYa + i;
      const opening = twdv;
      const claim = pieces[i] ?? 0;
      twdv = max0(twdv - claim);
      if (ya < input.fromYa || ya > input.toYa) continue;
      applyAssetLine(byYa, {
        assetId: record.id,
        assetLabel: record.label,
        regime: "S14N",
        ya,
        openingTaxWrittenDownValue: opening,
        allowanceClaimed: claim,
        balancingAllowance: 0,
        balancingCharge: 0,
        closingTaxWrittenDownValue: twdv,
        note: mode === "ONE_YEAR" ? "Section 14N one-year write-off" : "Section 14N over 3 consecutive YAs",
      });
    }
  }

  return { byYa, findings };
}

export function computeCapitalAllowances(input: CapitalAllowanceComputationInput): CapitalAllowanceComputationResult {
  if (input.toYa < input.fromYa) throw new RangeError("toYa must be greater than or equal to fromYa.");
  const { byYa, findings } = projectSchedule(input);
  const yaSummaries: CapitalAllowanceYaSummary[] = [];
  for (let ya = input.fromYa; ya <= input.toYa; ya += 1) {
    const lines = byYa.get(ya) ?? [];
    let capitalAllowances = 0;
    let section19bAllowances = 0;
    let industrialBuildingAllowance = 0;
    let liaAllowance = 0;
    let section14nDeduction = 0;
    let balancingAllowance = 0;
    let balancingCharge = 0;
    for (const line of lines) {
      if (line.regime === "S14N") section14nDeduction += line.allowanceClaimed;
      else if (line.regime === "IBA") industrialBuildingAllowance += line.allowanceClaimed;
      else if (line.regime === "LIA") liaAllowance += line.allowanceClaimed;
      else if (String(line.regime).startsWith("S19B")) section19bAllowances += line.allowanceClaimed;
      else capitalAllowances += line.allowanceClaimed;
      balancingAllowance += line.balancingAllowance;
      balancingCharge += line.balancingCharge;
    }
    const scheduleLines: ComputationLine[] = [
      { code: `CA.${ya}.ALLOWANCES`, label: `Capital allowances (${ya})`, amount: capitalAllowances + section19bAllowances + industrialBuildingAllowance + liaAllowance, kind: "AMOUNT", source: "SCHEDULE" },
      { code: `CA.${ya}.S14N`, label: `Section 14N deduction (${ya})`, amount: section14nDeduction, kind: "AMOUNT", source: "SCHEDULE" },
      { code: `CA.${ya}.BALANCING_ALLOWANCE`, label: `Balancing allowance (${ya})`, amount: balancingAllowance, kind: "AMOUNT", source: "SCHEDULE" },
      { code: `CA.${ya}.BALANCING_CHARGE`, label: `Balancing charge (${ya})`, amount: balancingCharge, kind: "AMOUNT", source: "SCHEDULE" },
    ];
    yaSummaries.push({
      ya,
      capitalAllowances,
      section19bAllowances,
      industrialBuildingAllowance,
      liaAllowance,
      section14nDeduction,
      balancingAllowance,
      balancingCharge,
      totalDeductions: capitalAllowances + section19bAllowances + industrialBuildingAllowance + liaAllowance + section14nDeduction + balancingAllowance,
      totalAdditions: balancingCharge,
      lines: scheduleLines,
    });
  }
  return {
    yaSummaries,
    assetLines: Array.from(byYa.values()).flat().sort((a, b) => a.ya - b.ya || a.assetLabel.localeCompare(b.assetLabel)),
    findings,
    notes: [
      ENGINE_DISCLAIMER,
      "Hire-purchase mechanics, section 24 elections for transferees, and EIS-enhanced section 19B claims are not modelled in detail; pass reviewed totals instead when those features matter.",
      "IBA balancing adjustments are modelled using the same residue-vs-proceeds pattern as the general capital-allowance disposal rules because the current IRAS webpage summarises qualifying expenditure and rates but not a worked disposal formula.",
    ],
  };
}

export const RULES = [
  {
    id: "capital-allowances.s19-s19a.2022-plus",
    domain: "CAPITAL_ALLOWANCES",
    title: "Sections 19 and 19A capital allowances",
    summary: "IRAS allows qualifying fixed assets to be written off over 1 year, 2 years (for YAs 2021, 2022 and 2024), 3 years, or the prescribed/elected working life, with balancing adjustments on disposal.",
    effectiveFrom: "2022-01-01",
    sources: [
      {
        title: "IRAS | Capital Allowances",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/claiming-allowances/capital-allowances",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
    ],
    confidence: "VERIFIED",
    notes: "The module focuses on cash acquisitions and straight-line schedules; caller-supplied reviewed totals are preferable for complex hire-purchase or transfer cases.",
  },
  {
    id: "capital-allowances.s14n.2022-plus",
    domain: "CAPITAL_ALLOWANCES",
    title: "Section 14N renovation and refurbishment deduction",
    summary: "Qualifying R&R expenditure is deductible over 3 consecutive YAs, with 1-year options for YAs 2021, 2022, 2024 and from YA 2025 onwards. The expenditure cap is S$300,000 per relevant 3-year period.",
    effectiveFrom: "2022-01-01",
    sources: [
      {
        title: "IRAS | Tax Treatment of Business Expenses (M-R)",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/business-expenses/tax-treatment-of-business-expenses-(m-r)",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
    ],
    confidence: "VERIFIED",
    notes: "IRAS now describes the renovation deduction under section 14N rather than section 14Q. The legacy section 14Q label still appears in an IRAS 'common mistakes' PDF filename.",
  },
  {
    id: "capital-allowances.iba-lia-s19b.2022-plus",
    domain: "CAPITAL_ALLOWANCES",
    title: "IBA, LIA and section 19B",
    summary: "IBA is phased out except for transitional cases. LIA remains available for approved projects, and section 19B writing-down allowances continue for qualifying IPR acquisitions up to the last day of the basis period for YA 2028.",
    effectiveFrom: "2022-01-01",
    sources: [
      {
        title: "IRAS | Industrial Building Allowance (IBA)",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/claiming-allowances/industrial-building-allowance-(iba)",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
      {
        title: "IRAS | Land Intensification Allowance (LIA)",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/claiming-allowances/land-intensification-allowance-(lia)",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
      {
        title: "IRAS | Writing-Down Allowances for Intellectual Property Rights (IPRs)",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/claiming-allowances/writing-down-allowances-for-intellectual-property-rights-(iprs)",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
    ],
    confidence: "VERIFIED",
    notes: "The module models only the core mechanical rules and not approval workflows or EIS cash-conversion elections.",
  },
] as const;
