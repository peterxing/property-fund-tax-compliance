import { addDays, addYears, diffDays, isISODate, maxDate, minDate, parseISO, toISO, type ISODate } from "../dates.ts";
import { assertCents, mulBps, mulRatio, type Bps, type Cents } from "../money.ts";
import { ENGINE_DISCLAIMER_AU, type Effective, type RuleEntry, requireEffective } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";
import type { AuIncomeYear } from "./types.ts";

const RETRIEVED: ISODate = "2026-10-10";
const FULL_RATE_BPS = 10_000;

export type AuCapitalWorksBuildingType =
  | "RESIDENTIAL"
  | "COMMERCIAL"
  | "INDUSTRIAL"
  | "SHORT_TERM_TRAVELLER_ACCOMMODATION"
  | "STRUCTURAL_IMPROVEMENT"
  | "BUILD_TO_RENT";

export const AU_CAPITAL_WORKS_BUILDING_TYPES: readonly { id: AuCapitalWorksBuildingType; label: string; description: string }[] = [
  { id: "RESIDENTIAL", label: "Residential rental building", description: "Ordinary income-producing residential premises taxed at the Division 43 building rate when the commencement-date rules are met." },
  { id: "COMMERCIAL", label: "Commercial / other non-residential building", description: "Office, retail and similar income-producing buildings that qualify for the general 2.5% Division 43 rate." },
  { id: "INDUSTRIAL", label: "Industrial building", description: "Buildings used wholly or mainly for industrial activities, or closely-related worker / supervisor facilities, which can access the 4% band." },
  { id: "SHORT_TERM_TRAVELLER_ACCOMMODATION", label: "Traveller accommodation building", description: "Hotels, motels, guest houses and qualifying apartment buildings used wholly for short-term traveller accommodation." },
  { id: "STRUCTURAL_IMPROVEMENT", label: "Structural improvement", description: "Division 43 structural improvements such as sealed car parks, retaining walls, fences and similar works begun after 26 February 1992." },
  { id: "BUILD_TO_RENT", label: "Build-to-rent development", description: "Eligible active build-to-rent development area that can access the 4% accelerated rate once the opt-in requirements are met." },
] as const;

export interface CapitalWorksAssetInput {
  id: string;
  label: string;
  buildingType: AuCapitalWorksBuildingType;
  constructionStartDate: ISODate;
  constructionCompleteDate: ISODate;
  firstIncomeUseDate?: ISODate;
  acquisitionDate?: ISODate;
  disposalDate?: ISODate;
  constructionExpenditure: Cents;
  priorDivision43Claims?: Cents;
  taxableUseBps?: Bps;
  buildToRentActiveFromDate?: ISODate;
  buildToRentActiveToDate?: ISODate;
  notes?: readonly string[];
}

export interface CapitalWorksDeductionInput {
  incomeYear: AuIncomeYear;
  asset: CapitalWorksAssetInput;
}

export interface CapitalWorksYearLine {
  incomeYear: AuIncomeYear;
  assetId: string;
  assetLabel: string;
  rateBps: Bps;
  daysClaimed: number;
  daysInIncomeYear: number;
  openingUndeductedConstructionExpenditure: Cents;
  deduction: Cents;
  closingUndeductedConstructionExpenditure: Cents;
  periodEndDate: ISODate;
  claimStartDate: ISODate;
  note?: string;
}

export interface CapitalWorksDeductionResult {
  line: CapitalWorksYearLine;
  computationLines: readonly ComputationLine[];
  findings: Finding[];
  notes: string[];
}

export interface CapitalWorksScheduleInput {
  fromIncomeYear: AuIncomeYear;
  toIncomeYear: AuIncomeYear;
  assets: readonly CapitalWorksAssetInput[];
}

export interface CapitalWorksYearSummary {
  incomeYear: AuIncomeYear;
  totalDeduction: Cents;
  lines: readonly CapitalWorksYearLine[];
  computationLines: readonly ComputationLine[];
}

export interface CapitalWorksScheduleResult {
  summaries: readonly CapitalWorksYearSummary[];
  assetLines: readonly CapitalWorksYearLine[];
  findings: Finding[];
  notes: string[];
}

interface RateRule {
  rateBps: Bps;
  deductionYears: number;
  note: string;
}

const DIV43_RATE_RULES: Readonly<Record<AuCapitalWorksBuildingType, readonly Effective<RateRule>[]>> = {
  RESIDENTIAL: [
    { from: "1985-07-18", value: { rateBps: 250, deductionYears: 40, note: "Residential income-producing buildings begun after 17 July 1985 generally qualify for 2.5% over 40 years." } },
  ],
  COMMERCIAL: [
    { from: "1979-08-22", value: { rateBps: 250, deductionYears: 40, note: "Ordinary qualifying income-producing buildings use the general 2.5% Division 43 rate." } },
  ],
  INDUSTRIAL: [
    { from: "1979-08-22", to: "1984-08-21", value: { rateBps: 250, deductionYears: 40, note: "Pre-27 February 1992 industrial buildings outside the 21 August 1984 to 15 September 1987 accelerated band use the 2.5% rate." } },
    { from: "1984-08-22", to: "1987-09-15", value: { rateBps: 400, deductionYears: 25, note: "Pre-27 February 1992 capital works begun after 21 August 1984 and before 16 September 1987 can use the 4% rate." } },
    { from: "1987-09-16", to: "1992-02-26", value: { rateBps: 250, deductionYears: 40, note: "Pre-27 February 1992 industrial buildings begun after 15 September 1987 revert to the 2.5% rate unless another 4% rule applies." } },
    { from: "1992-02-27", value: { rateBps: 400, deductionYears: 25, note: "Industrial buildings in the 4% manner use the accelerated 4% rate." } },
  ],
  SHORT_TERM_TRAVELLER_ACCOMMODATION: [
    { from: "1979-08-22", to: "1984-08-21", value: { rateBps: 250, deductionYears: 40, note: "Pre-27 February 1992 traveller-accommodation buildings outside the 21 August 1984 to 15 September 1987 accelerated band use the 2.5% rate." } },
    { from: "1984-08-22", to: "1987-09-15", value: { rateBps: 400, deductionYears: 25, note: "Pre-27 February 1992 qualifying traveller-accommodation buildings begun after 21 August 1984 and before 16 September 1987 can use 4%." } },
    { from: "1987-09-16", to: "1992-02-26", value: { rateBps: 250, deductionYears: 40, note: "Pre-27 February 1992 traveller-accommodation buildings begun after 15 September 1987 revert to the 2.5% rate unless another 4% rule applies." } },
    { from: "1992-02-27", value: { rateBps: 400, deductionYears: 25, note: "Hotels, motels, guest houses and qualifying apartment buildings in the 4% manner use 4%." } },
  ],
  STRUCTURAL_IMPROVEMENT: [
    { from: "1992-02-27", value: { rateBps: 250, deductionYears: 40, note: "Structural improvements begun after 26 February 1992 generally use the 2.5% rate." } },
  ],
  BUILD_TO_RENT: [
    { from: "2023-05-10", value: { rateBps: 400, deductionYears: 25, note: "Eligible active build-to-rent development areas for capital works begun after 9 May 2023 can claim 4% once the regime applies from 1 January 2025." } },
  ],
};

function incomeYearStart(incomeYear: AuIncomeYear): ISODate {
  return toISO(incomeYear - 1, 7, 1);
}

function incomeYearEnd(incomeYear: AuIncomeYear): ISODate {
  return toISO(incomeYear, 6, 30);
}

function daysInInclusiveRange(start: ISODate, end: ISODate): number {
  return diffDays(start, addDays(end, 1));
}

function overlapInclusive(startA: ISODate, endA: ISODate, startB: ISODate, endB: ISODate): number {
  const start = maxDate(startA, startB);
  const end = minDate(endA, endB);
  return start > end ? 0 : daysInInclusiveRange(start, end);
}

function validateAsset(asset: CapitalWorksAssetInput): void {
  if (!isISODate(asset.constructionStartDate) || !isISODate(asset.constructionCompleteDate)) {
    throw new RangeError(`Asset ${asset.id} has an invalid construction date.`);
  }
  if (asset.firstIncomeUseDate && !isISODate(asset.firstIncomeUseDate)) throw new RangeError(`Asset ${asset.id} firstIncomeUseDate must be an ISO date.`);
  if (asset.acquisitionDate && !isISODate(asset.acquisitionDate)) throw new RangeError(`Asset ${asset.id} acquisitionDate must be an ISO date.`);
  if (asset.disposalDate && !isISODate(asset.disposalDate)) throw new RangeError(`Asset ${asset.id} disposalDate must be an ISO date.`);
  if (asset.buildToRentActiveFromDate && !isISODate(asset.buildToRentActiveFromDate)) throw new RangeError(`Asset ${asset.id} buildToRentActiveFromDate must be an ISO date.`);
  if (asset.buildToRentActiveToDate && !isISODate(asset.buildToRentActiveToDate)) throw new RangeError(`Asset ${asset.id} buildToRentActiveToDate must be an ISO date.`);
  if (asset.constructionCompleteDate < asset.constructionStartDate) throw new RangeError(`Asset ${asset.id} constructionCompleteDate cannot be before constructionStartDate.`);
  if (asset.acquisitionDate && asset.acquisitionDate < asset.constructionStartDate) throw new RangeError(`Asset ${asset.id} acquisitionDate cannot be before constructionStartDate.`);
  if (asset.disposalDate && asset.acquisitionDate && asset.disposalDate < asset.acquisitionDate) throw new RangeError(`Asset ${asset.id} disposalDate cannot be before acquisitionDate.`);
  if (asset.buildingType === "BUILD_TO_RENT" && !asset.buildToRentActiveFromDate) throw new RangeError(`Asset ${asset.id} requires buildToRentActiveFromDate for the build-to-rent 4% rate.`);
  if (asset.constructionExpenditure < 0) throw new RangeError(`Asset ${asset.id} constructionExpenditure cannot be negative.`);
  if ((asset.priorDivision43Claims ?? 0) < 0) throw new RangeError(`Asset ${asset.id} priorDivision43Claims cannot be negative.`);
  if ((asset.priorDivision43Claims ?? 0) > asset.constructionExpenditure) throw new RangeError(`Asset ${asset.id} priorDivision43Claims cannot exceed constructionExpenditure.`);
  const taxableUseBps = asset.taxableUseBps ?? FULL_RATE_BPS;
  if (!Number.isInteger(taxableUseBps) || taxableUseBps < 0 || taxableUseBps > FULL_RATE_BPS) throw new RangeError(`Asset ${asset.id} taxableUseBps must be between 0 and 10,000.`);
}

function determineRate(asset: CapitalWorksAssetInput): RateRule {
  return requireEffective(DIV43_RATE_RULES[asset.buildingType], asset.constructionStartDate, `Division 43 rate for ${asset.buildingType}`);
}

function claimStartDate(asset: CapitalWorksAssetInput): ISODate {
  const startCandidates = [asset.constructionCompleteDate, asset.firstIncomeUseDate ?? asset.constructionCompleteDate, asset.acquisitionDate ?? asset.constructionCompleteDate];
  if (asset.buildingType === "BUILD_TO_RENT") startCandidates.push(maxDate("2025-01-01", asset.buildToRentActiveFromDate ?? "2025-01-01"));
  return startCandidates.reduce((latest, value) => (value > latest ? value : latest));
}

function deductionPeriodEndDate(startDate: ISODate, years: number): ISODate {
  return addDays(addYears(startDate, years), -1);
}

function daysClaimableForYear(asset: CapitalWorksAssetInput, incomeYear: AuIncomeYear, startDate: ISODate, endDate: ISODate): number {
  const yearStart = incomeYearStart(incomeYear);
  const yearEnd = incomeYearEnd(incomeYear);
  let effectiveStart = yearStart;
  let effectiveEnd = yearEnd;
  effectiveStart = maxDate(effectiveStart, startDate);
  effectiveEnd = minDate(effectiveEnd, endDate);
  if (asset.acquisitionDate) effectiveStart = maxDate(effectiveStart, asset.acquisitionDate);
  if (asset.disposalDate) effectiveEnd = minDate(effectiveEnd, asset.disposalDate);
  if (asset.buildingType === "BUILD_TO_RENT") {
    effectiveStart = maxDate(effectiveStart, asset.buildToRentActiveFromDate ?? effectiveStart);
    if (asset.buildToRentActiveToDate) effectiveEnd = minDate(effectiveEnd, asset.buildToRentActiveToDate);
  }
  return effectiveStart > effectiveEnd ? 0 : daysInInclusiveRange(effectiveStart, effectiveEnd);
}

function annualDeductionFor(asset: CapitalWorksAssetInput, incomeYear: AuIncomeYear, rate: RateRule, startDate: ISODate, endDate: ISODate): CapitalWorksYearLine {
  const yearStart = incomeYearStart(incomeYear);
  const yearEnd = incomeYearEnd(incomeYear);
  const incomeYearDays = daysInInclusiveRange(yearStart, yearEnd);
  const daysClaimed = daysClaimableForYear(asset, incomeYear, startDate, endDate);
  const yearsBefore = Math.max(0, incomeYear - 1 - parseISO(startDate).y + (startDate >= `${incomeYear - 1}-07-01` ? 0 : 0));
  const priorClaims = asset.priorDivision43Claims ?? 0;
  let openingUndeducted = asset.constructionExpenditure - priorClaims;
  for (let year = yearOfIncome(startDate); year < incomeYear; year += 1) {
    const priorDays = daysClaimableForYear(asset, year, startDate, endDate);
    if (priorDays <= 0 || openingUndeducted <= 0) continue;
    const raw = mulRatio(mulBps(asset.constructionExpenditure, rate.rateBps), priorDays, daysInInclusiveRange(incomeYearStart(year), incomeYearEnd(year)));
    const allowed = mulBps(raw, asset.taxableUseBps ?? FULL_RATE_BPS);
    openingUndeducted = Math.max(0, openingUndeducted - Math.min(openingUndeducted, allowed));
  }
  const rawCurrent = mulRatio(mulBps(asset.constructionExpenditure, rate.rateBps), daysClaimed, incomeYearDays);
  const allowedCurrent = mulBps(rawCurrent, asset.taxableUseBps ?? FULL_RATE_BPS);
  const deduction = Math.min(openingUndeducted, allowedCurrent);
  return {
    incomeYear,
    assetId: asset.id,
    assetLabel: asset.label,
    rateBps: rate.rateBps,
    daysClaimed,
    daysInIncomeYear: incomeYearDays,
    openingUndeductedConstructionExpenditure: openingUndeducted,
    deduction,
    closingUndeductedConstructionExpenditure: openingUndeducted - deduction,
    periodEndDate: endDate,
    claimStartDate: startDate,
    note: rate.note,
  };
}

function yearOfIncome(date: ISODate): AuIncomeYear {
  const { y, m } = parseISO(date);
  return m >= 7 ? y + 1 : y;
}

export function computeCapitalWorksDeduction(input: CapitalWorksDeductionInput): CapitalWorksDeductionResult {
  validateAsset(input.asset);
  const findings: Finding[] = [];
  const rate = determineRate(input.asset);
  const startDate = claimStartDate(input.asset);
  const endDate = deductionPeriodEndDate(startDate, rate.deductionYears);
  if (input.asset.buildingType === "BUILD_TO_RENT" && input.asset.constructionStartDate < "2023-05-10") {
    findings.push({ id: "AU.DIV43.BTR.START_DATE", severity: "ERROR", message: `Asset ${input.asset.label} does not qualify for the build-to-rent 4% rate because construction began before 10 May 2023.`, subject: input.asset.id });
  }
  if (input.asset.buildingType === "RESIDENTIAL" && input.asset.constructionStartDate < "1985-07-18") {
    findings.push({ id: "AU.DIV43.RESIDENTIAL.START_DATE", severity: "ERROR", message: `Asset ${input.asset.label} does not qualify as an ordinary residential Division 43 building because construction began before 18 July 1985.`, subject: input.asset.id });
  }
  const line = annualDeductionFor(input.asset, input.incomeYear, rate, startDate, endDate);
  const computationLines: readonly ComputationLine[] = [
    { code: `AU.DIV43.${input.asset.id}.${input.incomeYear}.OPENING`, label: `${input.asset.label} opening undeducted construction expenditure`, amount: line.openingUndeductedConstructionExpenditure, kind: "AMOUNT", source: "RULE", ref: "Div 43 ITAA 1997" },
    { code: `AU.DIV43.${input.asset.id}.${input.incomeYear}.RATE`, label: `${input.asset.label} Division 43 rate`, amount: line.rateBps, kind: "PERCENT", source: "RULE", ref: "s43-25, s43-145 ITAA 1997", note: `${line.daysClaimed} qualifying day(s) over ${line.daysInIncomeYear}.` },
    { code: `AU.DIV43.${input.asset.id}.${input.incomeYear}.DEDUCTION`, label: `${input.asset.label} capital works deduction`, amount: line.deduction, kind: "AMOUNT", source: "SCHEDULE", ref: "s43-10, s43-25, s43-210 or s43-215 ITAA 1997" },
  ];
  const notes = [
    ENGINE_DISCLAIMER_AU,
    "Division 43 annual deductions are apportioned by actual qualifying days in the income year over the actual number of days in that income year, matching ATO guidance for the first and last claim years.",
    "No balancing adjustment is made on sale. Division 43 deductions claimed (including deductions inherited from a prior owner) reduce the CGT cost base under section 110-45.",
  ];
  return { line, computationLines, findings, notes };
}

export function computeCapitalWorksSchedule(input: CapitalWorksScheduleInput): CapitalWorksScheduleResult {
  if (!Number.isInteger(input.fromIncomeYear) || !Number.isInteger(input.toIncomeYear) || input.toIncomeYear < input.fromIncomeYear) {
    throw new RangeError("toIncomeYear must be greater than or equal to fromIncomeYear.");
  }
  const findings: Finding[] = [];
  const assetLines: CapitalWorksYearLine[] = [];
  const summaries: CapitalWorksYearSummary[] = [];
  for (let year = input.fromIncomeYear; year <= input.toIncomeYear; year += 1) {
    const lines: CapitalWorksYearLine[] = [];
    const computationLines: ComputationLine[] = [];
    let totalDeduction = 0;
    for (const asset of input.assets) {
      const result = computeCapitalWorksDeduction({ incomeYear: year, asset });
      findings.push(...result.findings);
      if (result.line.deduction !== 0 || result.line.daysClaimed !== 0) {
        lines.push(result.line);
        assetLines.push(result.line);
        totalDeduction += result.line.deduction;
        computationLines.push(...result.computationLines);
      }
    }
    summaries.push({ incomeYear: year, totalDeduction, lines, computationLines });
  }
  return {
    summaries,
    assetLines,
    findings,
    notes: [
      ENGINE_DISCLAIMER_AU,
      "Construction expenditure must exclude land, demolition, site-preparation, landscaping and Division 40 plant. Use reviewed quantity-surveyor amounts where actual construction records are incomplete.",
      "A purchaser inherits only the seller's remaining Division 43 amount. Inputs therefore need the original construction expenditure, commencement / completion dates and prior Division 43 claims, not merely the acquisition price.",
    ],
  };
}

export const RULES: readonly RuleEntry[] = [
  {
    id: "au-div43.general-rates.1979-plus",
    domain: "AU_CAPITAL_ALLOWANCES",
    title: "Division 43 capital works deductions - general and 4% bands",
    summary: "Division 43 covers buildings begun after 21 August 1979 and structural improvements begun after 26 February 1992. The core rate is 2.5% over 40 years, with 4% over 25 years for the pre-16 September 1987 band and modern industrial / traveller-accommodation 4% uses.",
    effectiveFrom: "1979-08-22",
    sources: [
      { title: "ATO legal database | ITAA 1997 section 43-20", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/43-20", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO legal database | ITAA 1997 section 43-25", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/43-25", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO legal database | ITAA 1997 section 43-145", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/43-145", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Company tax return 2024 instructions - Appendix 3 capital works deductions", url: "https://www.ato.gov.au/forms-and-instructions/company-tax-return-2024-instructions/appendixes-for-the-company-tax-return/appendix-3-capital-works-deductions", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "Federal Register of Legislation | Income Tax Assessment Act 1997", url: "https://www.legislation.gov.au/C2004A05138/latest/text", retrieved: RETRIEVED, publisher: "Federal Register of Legislation" },
    ],
    confidence: "VERIFIED",
    notes: "The engine models the core commencement-date / use tests and day apportionment. Complex quasi-ownership, R&D and destruction claims need reviewed overrides.",
  },
  {
    id: "au-div43.cost-base.2000-plus",
    domain: "AU_CAPITAL_ALLOWANCES",
    title: "Division 43 deductions reduce CGT cost base",
    summary: "Division 43 deductions do not trigger an ordinary sale balancing adjustment, but deductions claimed or claimable reduce the CGT cost base, including capital works expenditure incurred by a prior owner that the current owner can deduct.",
    effectiveFrom: "2000-07-01",
    sources: [
      { title: "ATO legal database | ITAA 1997 section 110-45", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/110-45", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Cost base of an asset", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/calculating-your-cgt/cost-base-of-asset", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | CGT when selling your rental property", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/property-and-capital-gains-tax/cgt-when-selling-your-rental-property", retrieved: RETRIEVED, publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes: "Section 110-45(4) captures deductions for another entity's capital expenditure that the current owner can deduct under Division 43.",
  },
  {
    id: "au-div43.build-to-rent.2025-plus",
    domain: "AU_CAPITAL_ALLOWANCES",
    title: "Build-to-rent Division 43 accelerated rate",
    summary: "Eligible active build-to-rent development areas can claim 4% capital works deductions once the development is active and notified, provided construction began after 9 May 2023 and the federal BTR conditions are met.",
    effectiveFrom: "2025-01-01",
    sources: [
      { title: "ATO legal database | ITAA 1997 section 43-145", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/43-145", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Build-to-rent development tax incentives", url: "https://www.ato.gov.au/businesses-and-organisations/assets-and-property/build-to-rent-development-tax-incentives", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "Federal Register of Legislation | Income Tax Assessment Act 1997", url: "https://www.legislation.gov.au/C2004A05138/latest/text", retrieved: RETRIEVED, publisher: "Federal Register of Legislation" },
    ],
    confidence: "VERIFIED",
    notes: "The engine requires the user to supply the active BTR commencement date and assumes the project otherwise satisfies the single-owner, affordable-dwelling and 15-year compliance conditions.",
  },
] as const;
