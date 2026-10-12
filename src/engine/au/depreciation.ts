import { addDays, diffDays, maxDate, minDate, parseISO, toISO, type ISODate } from "../dates.ts";
import { assertCents, mulRatio, type Cents } from "../money.ts";
import { ENGINE_DISCLAIMER_AU, type Effective, type RuleEntry, requireEffective } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";
import type { AuIncomeYear } from "./types.ts";

const RETRIEVED: ISODate = "2026-10-10";
const FULL_USE = 10_000;

export type AuDepreciationMethod = "DIMINISHING_VALUE" | "PRIME_COST";
export type AuResidentialEntityType =
  | "INDIVIDUAL"
  | "COMPANY"
  | "SUPER_FUND_NON_SMSF"
  | "SMSF"
  | "PUBLIC_UNIT_TRUST"
  | "MANAGED_INVESTMENT_TRUST"
  | "UNIT_TRUST_ALL_ELIGIBLE_MEMBERS"
  | "PARTNERSHIP_ALL_ELIGIBLE_MEMBERS"
  | "OTHER";
export type AuPoolMethod = "NONE" | "LOW_VALUE_POOL" | "SMALL_BUSINESS_POOL";

export interface AuDepreciableAssetClass {
  id: string;
  label: string;
  description: string;
  defaultAppliesFrom: ISODate;
  defaultEffectiveLifeYears: number | undefined;
}

export const AU_DEPRECIABLE_ASSET_CLASSES: readonly AuDepreciableAssetClass[] = [
  { id: "LIFTS_ELECTRIC", label: "Lifts - electric", description: "Electric lifts treated as Division 40 machinery; the current ATO rental-property machinery table shows a 30-year effective life for assets acquired from 1 January 2003.", defaultAppliesFrom: "2003-01-01", defaultEffectiveLifeYears: 30 },
  { id: "LIFTS_HYDRAULIC", label: "Lifts - hydraulic", description: "Hydraulic lifts treated as Division 40 machinery; the current ATO rental-property machinery table shows a 30-year effective life for assets acquired from 1 January 2003.", defaultAppliesFrom: "2003-01-01", defaultEffectiveLifeYears: 30 },
  { id: "ESCALATORS", label: "Escalators", description: "Escalator machinery and moving parts with a 20-year effective life in the current ATO machinery table for assets acquired from 1 January 2003.", defaultAppliesFrom: "2003-01-01", defaultEffectiveLifeYears: 20 },
  { id: "HVAC_PACKAGED_UNIT", label: "HVAC packaged unit", description: "Packaged air-conditioning units with a 15-year effective life in the ATO rental-property air-conditioning table for assets acquired from 1 July 2003.", defaultAppliesFrom: "2003-07-01", defaultEffectiveLifeYears: 15 },
  { id: "HVAC_MINI_SPLIT", label: "HVAC mini split system", description: "Mini split systems up to 20kW with a 10-year effective life in the ATO rental-property air-conditioning table for assets acquired from 1 July 2003.", defaultAppliesFrom: "2003-07-01", defaultEffectiveLifeYears: 10 },
  { id: "FIRE_INDICATOR_PANEL", label: "Fire indicator panel", description: "Fire indicator panels in a fire detection and alarm system; the loaded 12-year default is the current ATO table entry for assets acquired from 1 July 2019.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: 12 },
  { id: "SMOKE_ALARM", label: "Smoke or heat alarm", description: "Standalone heat and smoke alarms; the loaded 6-year default is the current ATO table entry for assets acquired from 1 July 2019.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: 6 },
  { id: "SECURITY_SYSTEM_CONTROLS", label: "Security system controls", description: "Security-system code pads and control panels with a 5-year effective life in the ATO rental-property table for assets acquired from 1 July 2004.", defaultAppliesFrom: "2004-07-01", defaultEffectiveLifeYears: 5 },
  { id: "CARPET", label: "Carpet", description: "Removable carpet floor covering with an 8-year effective life for assets acquired from 1 July 2019.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: 8 },
  { id: "BLINDS_INTERNAL", label: "Internal blinds", description: "Internal window blinds with a 10-year effective life in the ATO rental-property table for assets acquired from 1 July 2019.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: 10 },
  { id: "HOT_WATER_SYSTEM", label: "Hot-water system", description: "Electric and gas hot-water systems (excluding piping) with a 12-year effective life in the current ATO table for assets acquired from 1 July 2019.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: 12 },
  { id: "INTERCOM_SYSTEM", label: "Intercom system", description: "Intercom system assets with a 10-year effective life in the current ATO table for assets acquired from 1 July 2019.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: 10 },
  { id: "HOME_AUTOMATION", label: "Home automation control asset", description: "Home automation control assets with a 10-year effective life from 1 July 2019 in the ATO rental-property table.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: 10 },
  { id: "FURNITURE_FREESTANDING", label: "Freestanding furniture", description: "Freestanding furniture with a 13 and one-third year effective life in the ATO rental-property table for assets acquired from 1 July 2019.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: 40 / 3 },
  { id: "TELECOMMUNICATIONS_PABX", label: "PABX / communications system", description: "Computerised PABX assets with a 7-year effective life from 1 July 2019 in the ATO rental-property table.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: 7 },
  { id: "IT_EQUIPMENT_OTHER", label: "Other IT / electronic equipment", description: "No default ATO effective life is set here; supply a reviewed effective life from the Commissioner's table or your own estimate.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: undefined },
  { id: "OTHER_PLANT", label: "Other plant and equipment", description: "Use where the asset is Division 40 plant but no verified default effective life has been loaded into this catalogue.", defaultAppliesFrom: "2019-07-01", defaultEffectiveLifeYears: undefined },
] as const;

export const AU_RESIDENTIAL_ENTITY_TYPES: readonly { id: AuResidentialEntityType; label: string; description: string }[] = [
  { id: "INDIVIDUAL", label: "Individual", description: "Natural person, including one holding rental property directly." },
  { id: "COMPANY", label: "Corporate tax entity", description: "Corporate tax entity exempt from the second-hand residential Division 40 restriction." },
  { id: "SUPER_FUND_NON_SMSF", label: "APRA super fund", description: "Superannuation plan that is not an SMSF; exempt from the second-hand residential restriction." },
  { id: "SMSF", label: "SMSF", description: "Self-managed superannuation fund; not one of the section 40-27 exempt entities." },
  { id: "PUBLIC_UNIT_TRUST", label: "Public unit trust", description: "Public unit trust within section 102P ITAA 1936; exempt from the second-hand residential restriction." },
  { id: "MANAGED_INVESTMENT_TRUST", label: "Managed investment trust", description: "MIT exempt from the second-hand residential restriction." },
  { id: "UNIT_TRUST_ALL_ELIGIBLE_MEMBERS", label: "Unit trust with only eligible members", description: "Unit trust where every member is one of the listed exempt entity types." },
  { id: "PARTNERSHIP_ALL_ELIGIBLE_MEMBERS", label: "Partnership with only eligible members", description: "Partnership where every member is one of the listed exempt entity types." },
  { id: "OTHER", label: "Other entity", description: "Any non-exempt entity type." },
] as const;

export interface DepreciatingAssetInput {
  id: string;
  label: string;
  assetClassId: string;
  cost: Cents;
  startDate: ISODate;
  method: AuDepreciationMethod;
  effectiveLifeYears?: number;
  taxableUseBps?: number;
  terminationDate?: ISODate;
  terminationValue?: Cents;
  poolMethod?: AuPoolMethod;
  residentialAccommodationUse?: boolean;
  carryingOnBusinessOfLetting?: boolean;
  secondHand?: boolean;
  purchasedBeforeBudgetNight2017?: boolean;
  installedInRentalBefore2017_07_01?: boolean;
  entityTypeForResidentialRestriction?: AuResidentialEntityType;
}

export interface DepreciationComputationInput {
  incomeYear: AuIncomeYear;
  asset: DepreciatingAssetInput;
}

export interface DepreciationLine {
  incomeYear: AuIncomeYear;
  assetId: string;
  assetLabel: string;
  method: AuDepreciationMethod | AuPoolMethod;
  openingAdjustableValue: Cents;
  declineInValue: Cents;
  deductionAllowed: Cents;
  balancingAdjustmentIncome: Cents;
  balancingAdjustmentDeduction: Cents;
  closingAdjustableValue: Cents;
  daysHeld: number;
  note?: string;
}

export interface DepreciationComputationResult {
  line: DepreciationLine;
  computationLines: readonly ComputationLine[];
  findings: Finding[];
  notes: string[];
}

export interface DepreciationScheduleInput {
  fromIncomeYear: AuIncomeYear;
  toIncomeYear: AuIncomeYear;
  assets: readonly DepreciatingAssetInput[];
  smallBusinessInstantAssetWriteOff?: {
    aggregatedTurnoverLessThan10m: boolean;
    optedIntoSimplifiedDepreciation: boolean;
  };
}

export interface DepreciationYearSummary {
  incomeYear: AuIncomeYear;
  totalDeclineInValueDeduction: Cents;
  totalBalancingAdjustmentIncome: Cents;
  totalBalancingAdjustmentDeduction: Cents;
  lines: readonly DepreciationLine[];
  computationLines: readonly ComputationLine[];
}

export interface DepreciationScheduleResult {
  summaries: readonly DepreciationYearSummary[];
  assetLines: readonly DepreciationLine[];
  findings: Finding[];
  notes: string[];
}

const INSTANT_ASSET_WRITE_OFF: readonly Effective<{ threshold: Cents; aggregatedTurnoverUnder: Cents }>[] = [
  { from: "2016-07-01", to: "2019-01-28", value: { threshold: 2_000_000, aggregatedTurnoverUnder: 1_000_000_000 } },
  { from: "2019-01-29", to: "2019-04-02", value: { threshold: 2_500_000, aggregatedTurnoverUnder: 1_000_000_000 } },
  { from: "2019-04-03", to: "2020-03-11", value: { threshold: 3_000_000, aggregatedTurnoverUnder: 5_000_000_000 } },
  { from: "2020-03-12", to: "2021-06-30", value: { threshold: 15_000_000, aggregatedTurnoverUnder: 50_000_000_000 } },
  { from: "2023-07-01", value: { threshold: 2_000_000, aggregatedTurnoverUnder: 1_000_000_000 } },
];

function incomeYearStart(incomeYear: AuIncomeYear): ISODate {
  return toISO(incomeYear - 1, 7, 1);
}

function incomeYearEnd(incomeYear: AuIncomeYear): ISODate {
  return toISO(incomeYear, 6, 30);
}

function daysInIncomeYear(incomeYear: AuIncomeYear): number {
  return diffDays(incomeYearStart(incomeYear), addDays(incomeYearEnd(incomeYear), 1));
}

function incomeYearForDate(date: ISODate): AuIncomeYear {
  const { y, m } = parseISO(date);
  return m >= 7 ? y + 1 : y;
}

function overlapDays(startA: ISODate, endA: ISODate, startB: ISODate, endB: ISODate): number {
  const start = maxDate(startA, startB);
  const end = minDate(endA, endB);
  return start > end ? 0 : diffDays(start, addDays(end, 1));
}

function validateAsset(asset: DepreciatingAssetInput): void {
  if (asset.cost < 0) throw new RangeError(`Asset ${asset.id} cost cannot be negative.`);
  if (asset.terminationValue !== undefined && asset.terminationValue < 0) throw new RangeError(`Asset ${asset.id} terminationValue cannot be negative.`);
  if ((asset.taxableUseBps ?? FULL_USE) < 0 || (asset.taxableUseBps ?? FULL_USE) > FULL_USE) throw new RangeError(`Asset ${asset.id} taxableUseBps must be between 0 and 10,000.`);
  if (asset.effectiveLifeYears !== undefined && asset.effectiveLifeYears <= 0) throw new RangeError(`Asset ${asset.id} effectiveLifeYears must be positive.`);
  if (asset.terminationDate && asset.terminationDate < asset.startDate) throw new RangeError(`Asset ${asset.id} terminationDate cannot be before startDate.`);
}

function defaultEffectiveLifeYears(asset: DepreciatingAssetInput): number | undefined {
  return AU_DEPRECIABLE_ASSET_CLASSES.find((row) => row.id === asset.assetClassId)?.defaultEffectiveLifeYears;
}

function assetClassDefinition(asset: DepreciatingAssetInput): AuDepreciableAssetClass | undefined {
  return AU_DEPRECIABLE_ASSET_CLASSES.find((row) => row.id === asset.assetClassId);
}

function effectiveLifeYears(asset: DepreciatingAssetInput): number {
  const years = asset.effectiveLifeYears ?? defaultEffectiveLifeYears(asset);
  if (years === undefined) throw new RangeError(`Asset ${asset.id} requires an effectiveLifeYears input because no verified default exists for class ${asset.assetClassId}.`);
  return years;
}

function diminishingRateNumerator(asset: DepreciatingAssetInput): number {
  return asset.startDate < "2006-05-10" ? 150 : 200;
}

function isExemptResidentialEntity(entityType: AuResidentialEntityType | undefined): boolean {
  return entityType === "COMPANY" || entityType === "SUPER_FUND_NON_SMSF" || entityType === "PUBLIC_UNIT_TRUST" || entityType === "MANAGED_INVESTMENT_TRUST" || entityType === "UNIT_TRUST_ALL_ELIGIBLE_MEMBERS" || entityType === "PARTNERSHIP_ALL_ELIGIBLE_MEMBERS";
}

function residentialRestrictionApplies(asset: DepreciatingAssetInput): boolean {
  if (!asset.residentialAccommodationUse || asset.carryingOnBusinessOfLetting) return false;
  if (!asset.secondHand) return false;
  if (isExemptResidentialEntity(asset.entityTypeForResidentialRestriction)) return false;
  if (asset.purchasedBeforeBudgetNight2017) return false;
  return true;
}

function rawDecline(asset: DepreciatingAssetInput, incomeYear: AuIncomeYear, openingAdjustableValue: Cents): { decline: Cents; daysHeld: number } {
  const yStart = incomeYearStart(incomeYear);
  const yEnd = incomeYearEnd(incomeYear);
  const heldDays = overlapDays(asset.startDate, asset.terminationDate ?? yEnd, yStart, yEnd);
  if (heldDays <= 0 || openingAdjustableValue <= 0) return { decline: 0, daysHeld: 0 };
  const life = effectiveLifeYears(asset);
  if (asset.method === "DIMINISHING_VALUE") {
    const effectiveLifeScaled = Math.round(life * 100);
    const decline = mulRatio(mulRatio(openingAdjustableValue, heldDays, 365), diminishingRateNumerator(asset), effectiveLifeScaled);
    return { decline: Math.min(openingAdjustableValue, decline), daysHeld: heldDays };
  }
  const decline = mulRatio(mulRatio(assertCents(asset.cost), heldDays, 365), 1_000, Math.round(life * 1_000));
  return { decline: Math.min(openingAdjustableValue, decline), daysHeld: heldDays };
}

function adjustableValueBeforeYear(asset: DepreciatingAssetInput, targetYear: AuIncomeYear): Cents {
  let adjustable = assertCents(asset.cost);
  for (let year = incomeYearForDate(asset.startDate); year < targetYear; year += 1) {
    const result = rawDecline(asset, year, adjustable);
    adjustable = Math.max(0, adjustable - result.decline);
    if (asset.terminationDate && incomeYearForDate(asset.terminationDate) === year) break;
  }
  return adjustable;
}

function computeGeneralAssetForYear(input: DepreciationComputationInput): DepreciationComputationResult {
  validateAsset(input.asset);
  const findings: Finding[] = [];
  const assetClass = assetClassDefinition(input.asset);
  if (input.asset.effectiveLifeYears === undefined && assetClass?.defaultEffectiveLifeYears !== undefined && input.asset.startDate < assetClass.defaultAppliesFrom) {
    findings.push({
      id: "AU.DIV40.DEFAULT_LIFE.DATE_REVIEW",
      severity: "WARNING",
      message: `Asset ${input.asset.label} is using a catalogue default effective life that only applies to assets acquired from ${assetClass.defaultAppliesFrom}; enter the effective life for this asset explicitly.`,
      subject: input.asset.id,
      data: { assetClassId: input.asset.assetClassId, defaultAppliesFrom: assetClass.defaultAppliesFrom },
    });
  }
  const openingAdjustableValue = adjustableValueBeforeYear(input.asset, input.incomeYear);
  const { decline, daysHeld } = rawDecline(input.asset, input.incomeYear, openingAdjustableValue);
  const restricted = residentialRestrictionApplies(input.asset);
  const deductionAllowed = restricted ? 0 : mulRatio(decline, input.asset.taxableUseBps ?? FULL_USE, FULL_USE);
  const closingAdjustableValueBeforeTermination = Math.max(0, openingAdjustableValue - decline);
  let balancingAdjustmentIncome = 0;
  let balancingAdjustmentDeduction = 0;
  let closingAdjustableValue = closingAdjustableValueBeforeTermination;
  if (input.asset.terminationDate && incomeYearForDate(input.asset.terminationDate) === input.incomeYear) {
    const terminationValue = input.asset.terminationValue ?? 0;
    const difference = terminationValue - closingAdjustableValueBeforeTermination;
    if (!restricted) {
      if (difference > 0) balancingAdjustmentIncome = mulRatio(difference, input.asset.taxableUseBps ?? FULL_USE, FULL_USE);
      else balancingAdjustmentDeduction = mulRatio(-difference, input.asset.taxableUseBps ?? FULL_USE, FULL_USE);
    } else {
      findings.push({ id: "AU.DIV40.SECOND_HAND_RESIDENTIAL.BALANCING", severity: "INFO", message: `Asset ${input.asset.label} has a balancing adjustment event, but the Division 40 deduction has been denied by section 40-27. Review any CGT consequences separately.`, subject: input.asset.id });
    }
    closingAdjustableValue = 0;
  }
  if (restricted) {
    findings.push({ id: "AU.DIV40.SECOND_HAND_RESIDENTIAL.RESTRICTED", severity: "WARNING", message: `Asset ${input.asset.label} is a second-hand depreciating asset used to provide residential accommodation and section 40-27 denies the Division 40 deduction for this income year.`, subject: input.asset.id });
  }
  const line: DepreciationLine = {
    incomeYear: input.incomeYear,
    assetId: input.asset.id,
    assetLabel: input.asset.label,
    method: input.asset.method,
    openingAdjustableValue,
    declineInValue: decline,
    deductionAllowed,
    balancingAdjustmentIncome,
    balancingAdjustmentDeduction,
    closingAdjustableValue,
    daysHeld,
    note: restricted ? "s40-27 restriction applied" : undefined,
  };
  return {
    line,
    computationLines: [
      { code: `AU.DIV40.${input.asset.id}.${input.incomeYear}.OPENING`, label: `${input.asset.label} opening adjustable value`, amount: openingAdjustableValue, kind: "AMOUNT", source: "RULE", ref: "Div 40 ITAA 1997" },
      { code: `AU.DIV40.${input.asset.id}.${input.incomeYear}.DECLINE`, label: `${input.asset.label} decline in value`, amount: decline, kind: "AMOUNT", source: "RULE", ref: input.asset.method === "DIMINISHING_VALUE" ? "s40-70 ITAA 1997" : "s40-75 ITAA 1997", note: `${daysHeld} day(s) held; denominator fixed at 365 even in leap years.` },
      { code: `AU.DIV40.${input.asset.id}.${input.incomeYear}.DEDUCTION`, label: `${input.asset.label} Division 40 deduction`, amount: deductionAllowed, kind: "AMOUNT", source: "SCHEDULE", ref: restricted ? "s40-27 ITAA 1997" : "s40-25 ITAA 1997" },
    ],
    findings,
    notes: [
      ENGINE_DISCLAIMER_AU,
      "Division 40 formulas use actual days held in the numerator, but a fixed 365-day denominator even in leap years, matching sections 40-70 and 40-75 and the ATO guide.",
      "Balancing adjustments compare termination value with adjustable value at the balancing-adjustment event. This module returns cents rather than the ATO's whole-dollar tax-return labels.",
    ],
  };
}

function smallBusinessWriteOffApplies(input: DepreciationScheduleInput, asset: DepreciatingAssetInput): boolean {
  if (!input.smallBusinessInstantAssetWriteOff?.aggregatedTurnoverLessThan10m || !input.smallBusinessInstantAssetWriteOff.optedIntoSimplifiedDepreciation) return false;
  const rules = requireEffective(INSTANT_ASSET_WRITE_OFF, asset.startDate, "instant asset write-off threshold");
  return asset.cost < rules.threshold;
}

export function computeDepreciation(input: DepreciationComputationInput): DepreciationComputationResult {
  if (input.asset.poolMethod === "LOW_VALUE_POOL" || input.asset.poolMethod === "SMALL_BUSINESS_POOL") {
    throw new RangeError("Pool assets must be calculated through computeDepreciationSchedule so the pooled balance can be tracked across years.");
  }
  return computeGeneralAssetForYear(input);
}

export function computeDepreciationSchedule(input: DepreciationScheduleInput): DepreciationScheduleResult {
  if (input.toIncomeYear < input.fromIncomeYear) throw new RangeError("toIncomeYear must be greater than or equal to fromIncomeYear.");
  const findings: Finding[] = [];
  const assetLines: DepreciationLine[] = [];
  const summaries: DepreciationYearSummary[] = [];
  let lowValuePoolBalance = 0;
  let smallBusinessPoolBalance = 0;

  for (let year = input.fromIncomeYear; year <= input.toIncomeYear; year += 1) {
    const lines: DepreciationLine[] = [];
    const computationLines: ComputationLine[] = [];
    let totalDeclineInValueDeduction = 0;
    let totalBalancingAdjustmentIncome = 0;
    let totalBalancingAdjustmentDeduction = 0;
    let lowValueAdditions = 0;
    let lowValueTerminations = 0;
    let smallBusinessAdditions = 0;
    let smallBusinessTerminations = 0;

    for (const asset of input.assets) {
      validateAsset(asset);
      if (asset.poolMethod === "LOW_VALUE_POOL") {
        const assetYear = incomeYearForDate(asset.startDate);
        if (assetYear === year && asset.cost < 100_000) lowValueAdditions += mulRatio(asset.cost, asset.taxableUseBps ?? FULL_USE, FULL_USE);
        if (asset.terminationDate && incomeYearForDate(asset.terminationDate) === year) lowValueTerminations += mulRatio(asset.terminationValue ?? 0, asset.taxableUseBps ?? FULL_USE, FULL_USE);
        continue;
      }
      if (asset.poolMethod === "SMALL_BUSINESS_POOL") {
        if (smallBusinessWriteOffApplies(input, asset)) {
          if (incomeYearForDate(asset.startDate) === year) {
            const line: DepreciationLine = {
              incomeYear: year,
              assetId: asset.id,
              assetLabel: asset.label,
              method: "SMALL_BUSINESS_POOL",
              openingAdjustableValue: asset.cost,
              declineInValue: asset.cost,
              deductionAllowed: mulRatio(asset.cost, asset.taxableUseBps ?? FULL_USE, FULL_USE),
              balancingAdjustmentIncome: 0,
              balancingAdjustmentDeduction: 0,
              closingAdjustableValue: 0,
              daysHeld: overlapDays(asset.startDate, asset.terminationDate ?? incomeYearEnd(year), incomeYearStart(year), incomeYearEnd(year)),
              note: "Instant asset write-off via simplified depreciation rules",
            };
            lines.push(line);
            assetLines.push(line);
            totalDeclineInValueDeduction += line.deductionAllowed;
            computationLines.push({ code: `AU.DIV40.${asset.id}.${year}.IAWO`, label: `${asset.label} instant asset write-off`, amount: line.deductionAllowed, kind: "AMOUNT", source: "SCHEDULE", ref: "Subdivision 328-D ITAA 1997" });
          }
          continue;
        }
        if (incomeYearForDate(asset.startDate) === year) smallBusinessAdditions += mulRatio(asset.cost, asset.taxableUseBps ?? FULL_USE, FULL_USE);
        if (asset.terminationDate && incomeYearForDate(asset.terminationDate) === year) smallBusinessTerminations += mulRatio(asset.terminationValue ?? 0, asset.taxableUseBps ?? FULL_USE, FULL_USE);
        continue;
      }
      const result = computeGeneralAssetForYear({ incomeYear: year, asset });
      findings.push(...result.findings);
      if (result.line.daysHeld > 0 || result.line.balancingAdjustmentIncome !== 0 || result.line.balancingAdjustmentDeduction !== 0) {
        lines.push(result.line);
        assetLines.push(result.line);
        computationLines.push(...result.computationLines);
        totalDeclineInValueDeduction += result.line.deductionAllowed;
        totalBalancingAdjustmentIncome += result.line.balancingAdjustmentIncome;
        totalBalancingAdjustmentDeduction += result.line.balancingAdjustmentDeduction;
      }
    }

    if (lowValuePoolBalance > 0 || lowValueAdditions > 0 || lowValueTerminations > 0) {
      const deduction = mulRatio(lowValuePoolBalance, 3750, 10000) + mulRatio(lowValueAdditions, 1875, 10000);
      const balanceBeforeTerminations = Math.max(0, lowValuePoolBalance + lowValueAdditions - deduction);
      const excessIncome = Math.max(0, lowValueTerminations - balanceBeforeTerminations);
      const closingBalance = Math.max(0, balanceBeforeTerminations - lowValueTerminations);
      const line: DepreciationLine = {
        incomeYear: year,
        assetId: "LOW_VALUE_POOL",
        assetLabel: "Low-value pool",
        method: "LOW_VALUE_POOL",
        openingAdjustableValue: lowValuePoolBalance,
        declineInValue: deduction,
        deductionAllowed: deduction,
        balancingAdjustmentIncome: excessIncome,
        balancingAdjustmentDeduction: 0,
        closingAdjustableValue: closingBalance,
        daysHeld: daysInIncomeYear(year),
      };
      lines.push(line);
      assetLines.push(line);
      totalDeclineInValueDeduction += deduction;
      totalBalancingAdjustmentIncome += excessIncome;
      computationLines.push({ code: `AU.DIV40.POOL.LOW_VALUE.${year}`, label: `Low-value pool deduction (${year})`, amount: deduction, kind: "AMOUNT", source: "SCHEDULE", ref: "Subdivision 40-E ITAA 1997" });
      lowValuePoolBalance = closingBalance;
    }

    if (smallBusinessPoolBalance > 0 || smallBusinessAdditions > 0 || smallBusinessTerminations > 0) {
      const opening = Math.max(0, smallBusinessPoolBalance + smallBusinessAdditions - smallBusinessTerminations);
      const threshold = requireEffective(INSTANT_ASSET_WRITE_OFF, incomeYearStart(year), "instant asset write-off threshold");
      let deduction = opening < threshold.threshold ? opening : mulRatio(smallBusinessPoolBalance, 3000, 10000) + mulRatio(smallBusinessAdditions, 1500, 10000);
      if (deduction > opening) deduction = opening;
      const closing = Math.max(0, opening - deduction);
      const line: DepreciationLine = {
        incomeYear: year,
        assetId: "SMALL_BUSINESS_POOL",
        assetLabel: "Small business pool",
        method: "SMALL_BUSINESS_POOL",
        openingAdjustableValue: smallBusinessPoolBalance,
        declineInValue: deduction,
        deductionAllowed: deduction,
        balancingAdjustmentIncome: 0,
        balancingAdjustmentDeduction: 0,
        closingAdjustableValue: closing,
        daysHeld: daysInIncomeYear(year),
        note: opening < threshold.threshold ? "Pool balance immediately deductible because it is below the instant asset write-off limit after adjustments." : undefined,
      };
      lines.push(line);
      assetLines.push(line);
      totalDeclineInValueDeduction += deduction;
      computationLines.push({ code: `AU.DIV40.POOL.SMALL_BUSINESS.${year}`, label: `Small business pool deduction (${year})`, amount: deduction, kind: "AMOUNT", source: "SCHEDULE", ref: "Subdivision 328-D ITAA 1997" });
      smallBusinessPoolBalance = closing;
    }

    summaries.push({ incomeYear: year, totalDeclineInValueDeduction, totalBalancingAdjustmentIncome, totalBalancingAdjustmentDeduction, lines, computationLines });
  }

  return {
    summaries,
    assetLines,
    findings,
    notes: [
      ENGINE_DISCLAIMER_AU,
      "Division 40 deductions are calculated in cents even though tax returns ultimately round many labels to whole dollars. Review any return-label rounding separately.",
      "The low-value pool uses 18.75% for current-year low-cost additions and 37.5% for the opening pool balance, matching the ATO guide. The small business pool is included for completeness but most property funds will not satisfy the aggregated-turnover test.",
    ],
  };
}

export const RULES: readonly RuleEntry[] = [
  {
    id: "au-div40.general-formulas.2001-plus",
    domain: "AU_CAPITAL_ALLOWANCES",
    title: "Division 40 decline in value formulas and balancing adjustments",
    summary: "Division 40 lets the holder deduct decline in value using the diminishing value or prime cost method. The numerator uses actual days held, but sections 40-70 and 40-75 keep the denominator at 365; a balancing adjustment compares termination value with adjustable value on disposal.",
    effectiveFrom: "2001-07-01",
    sources: [
      { title: "ATO legal database | ITAA 1997 section 40-25", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/40-25", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO legal database | ITAA 1997 section 40-70", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/40-70", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO legal database | ITAA 1997 section 40-75", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/40-75", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Depreciating assets guide 2025 - Working out decline in value", url: "https://www.ato.gov.au/forms-and-instructions/depreciating-assets-guide-2025/depreciating-assets-effective-life-cost-and-decline-in-value/working-out-decline-in-value", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Depreciating assets guide 2025 - What happens if you no longer hold or use a depreciating asset", url: "https://www.ato.gov.au/forms-and-instructions/depreciating-assets-guide-2025/what-happens-if-you-no-longer-hold-or-use-a-depreciating-asset", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "Federal Register of Legislation | Income Tax Assessment Act 1997", url: "https://www.legislation.gov.au/C2004A05138/latest/text", retrieved: RETRIEVED, publisher: "Federal Register of Legislation" },
    ],
    confidence: "VERIFIED",
    notes: "The module models the standard Division 40 formulas and ordinary balancing adjustments only; it does not attempt the specialised intangible-asset or rollover variants.",
  },
  {
    id: "au-div40.pools-and-small-business.2026",
    domain: "AU_CAPITAL_ALLOWANCES",
    title: "Low-value pools and the small-business instant asset write-off",
    summary: "Low-value pools use 18.75% for current-year low-cost additions and 37.5% for the opening pool balance. As at 10 October 2026, the instant asset write-off page still shows a $20,000 per-asset threshold from 1 July 2023 for entities with aggregated turnover below $10 million that use simplified depreciation rules.",
    effectiveFrom: "2023-07-01",
    sources: [
      { title: "ATO | Depreciating assets guide 2024 - Low-value pools", url: "https://www.ato.gov.au/forms-and-instructions/depreciating-assets-guide-2024/low-value-pools", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Instant asset write-off", url: "https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/depreciation-and-capital-expenses-and-allowances/simpler-depreciation-for-small-business/instant-asset-write-off", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | $20,000 instant asset write-off for 2025-26", url: "https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom/20000-instant-asset-write-off-for-2025-26", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Small business pool calculations", url: "https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/depreciation-and-capital-expenses-and-allowances/simpler-depreciation-for-small-business/small-business-pool-calculations", retrieved: RETRIEVED, publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes: "The instant asset write-off remains targeted at small businesses using simplified depreciation. The engine does not assume ordinary property funds qualify.",
  },
  {
    id: "au-div40.second-hand-residential.2017-plus",
    domain: "AU_CAPITAL_ALLOWANCES",
    title: "Second-hand depreciating assets in residential accommodation",
    summary: "Section 40-27 denies decline-in-value deductions for many second-hand assets used to provide residential accommodation unless an exception applies, but the exempt entity list includes corporate tax entities, non-SMSF super funds, public unit trusts, MITs and wholly-eligible unit trusts or partnerships.",
    effectiveFrom: "2017-07-01",
    sources: [
      { title: "ATO legal database | ITAA 1997 section 40-27", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/40-27", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Second-hand depreciating assets", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties/rental-expenses/depreciating-assets-in-rental-properties/second-hand-depreciating-assets", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Rental properties 2026 - Descriptions and examples of rental property items", url: "https://www.ato.gov.au/forms-and-instructions/rental-properties-2026/residential-rental-property-assets/descriptions-and-examples-of-rental-property-items", retrieved: RETRIEVED, publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes: "The module models the main section 40-27 exceptions but leaves unusual 'new residential premises' fact patterns for manual review.",
  },
  {
    id: "au-div40.property-asset-lives.2026",
    domain: "AU_CAPITAL_ALLOWANCES",
    title: "Verified effective lives loaded into the property asset catalogue",
    summary: "The asset catalogue only assigns defaults where the ATO rental-property tables or air-conditioning / machinery tables state an effective life for assets acquired on or after the stated column date. Assets without a verified table entry leave defaultEffectiveLifeYears undefined so the caller must supply a reviewed life.",
    effectiveFrom: "2019-07-01",
    sources: [
      { title: "ATO | Rental properties 2026 - Residential rental property items", url: "https://www.ato.gov.au/forms-and-instructions/rental-properties-2026/residential-rental-property-assets/residential-rental-property-items", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Rental properties 2026 - Common rental property items", url: "https://www.ato.gov.au/forms-and-instructions/rental-properties-2026/residential-rental-property-assets/common-rental-property-items", retrieved: RETRIEVED, publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes: "The loaded defaults are intentionally conservative and only apply from the stated acquisition date for each asset class. If the asset predates that column, the calculator warns and the user should enter an explicit effective life. If the current Commissioner's table says 'own estimate' or the asset is not listed, the engine requires user input.",
  },
] as const;
