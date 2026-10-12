import { addDays, addYears, diffDays, parseISO, type ISODate } from "../dates.ts";
import { mulBps, mulRatio, type Bps, type Cents } from "../money.ts";
import { ENGINE_DISCLAIMER_AU, type RuleEntry } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";

const RETRIEVED: ISODate = "2026-10-10";
const MAY_8_2012 = "2012-05-08";
const SEPT_21_1999 = "1999-09-21";

export type AuCgtEntityType = "INDIVIDUAL" | "TRUST" | "COMPANY" | "COMPLYING_SUPER_FUND";
export type AuResidencyStatus = "AU_RESIDENT" | "FOREIGN_RESIDENT" | "TEMPORARY_RESIDENT";
export type AuWithholdingScenario = "DIRECT_REAL_PROPERTY" | "INDIRECT_REAL_PROPERTY_INTEREST" | "OPTION_OR_RIGHT";

export const AU_CGT_ENTITY_TYPES = [
  { id: "INDIVIDUAL", label: "Individual", description: "50% CGT discount if eligible." },
  { id: "TRUST", label: "Trust", description: "50% CGT discount if eligible; discount component stays streamable." },
  { id: "COMPANY", label: "Company", description: "No general CGT discount." },
  { id: "COMPLYING_SUPER_FUND", label: "Complying super fund", description: "33 1/3% discount if eligible." },
] as const satisfies readonly { id: AuCgtEntityType; label: string; description: string }[];

export const AU_FRCGW_SCENARIOS = [
  { id: "DIRECT_REAL_PROPERTY", label: "Direct real property", description: "Direct taxable Australian real property." },
  { id: "INDIRECT_REAL_PROPERTY_INTEREST", label: "Indirect real property interest", description: "Relevant indirect Australian real property interest." },
  { id: "OPTION_OR_RIGHT", label: "Option or right", description: "Relevant option or right over taxable Australian real property." },
] as const satisfies readonly { id: AuWithholdingScenario; label: string; description: string }[];

interface CgtCostItem { amount: Cents; date: ISODate; }
interface ResidencyPeriod { from: ISODate; to: ISODate; status: AuResidencyStatus; }

export interface ComputeCgtInput {
  label: string;
  entityType: AuCgtEntityType;
  acquisitionDate: ISODate;
  disposalContractDate: ISODate;
  capitalProceeds: Cents;
  acquisitionPrice: Cents;
  incidentalAcquisitionCosts?: readonly CgtCostItem[];
  incidentalDisposalCosts?: readonly CgtCostItem[];
  nonCapitalOwningCosts?: readonly CgtCostItem[];
  capitalImprovements?: readonly CgtCostItem[];
  titlePreservationCosts?: readonly CgtCostItem[];
  capitalWorksDeductionsClaimed?: Cents;
  otherDeductedAmountsReducingCostBase?: Cents;
  currentYearCapitalLosses?: Cents;
  priorYearCapitalLossesByYear?: Readonly<Record<number, Cents>>;
  chooseIndexation?: boolean;
  residencyPeriods?: readonly ResidencyPeriod[];
}

export interface ComputeCgtResult {
  methodUsed: "DISCOUNT" | "INDEXATION" | "OTHER";
  costBase: Cents;
  reducedCostBase: Cents;
  indexedCostBase?: Cents;
  grossCapitalGain: Cents;
  capitalLoss: Cents;
  currentYearCapitalLossesApplied: Cents;
  priorYearCapitalLossesApplied: Cents;
  discountPercentageBps: Bps;
  discountAmount: Cents;
  netCapitalGain: Cents;
  grossDiscountableGain: Cents;
  trustDiscountComponent: Cents;
  computationLines: readonly ComputationLine[];
  findings: Finding[];
  notes: string[];
}

export interface ComputeForeignResidentCgtWithholdingInput {
  contractDate: ISODate;
  settlementDate: ISODate;
  scenario: AuWithholdingScenario;
  assetValue: Cents;
  hasClearanceCertificate?: boolean;
  variationRateBps?: Bps;
  validVendorDeclaration?: boolean;
  listedOnApprovedStockExchange?: boolean;
  anotherWithholdingApplies?: boolean;
  securitiesLendingArrangement?: boolean;
  externalAdministrationOrBankruptcy?: boolean;
}

export interface ComputeForeignResidentCgtWithholdingResult {
  applies: boolean;
  withholdingRateBps: Bps;
  threshold: Cents;
  amountToWithhold: Cents;
  dueDate: ISODate;
  paymentTiming: string;
  computationLines: readonly ComputationLine[];
  findings: Finding[];
  notes: string[];
}

const CPI: Readonly<Record<string, number>> = {
  "1985-Q3": 39.7, "1985-Q4": 40.5, "1986-Q1": 41.4, "1986-Q2": 42.1, "1986-Q3": 43.2, "1986-Q4": 44.4,
  "1987-Q1": 45.3, "1987-Q2": 46.0, "1987-Q3": 46.8, "1987-Q4": 47.6, "1988-Q1": 48.4, "1988-Q2": 49.3,
  "1988-Q3": 50.2, "1988-Q4": 51.2, "1989-Q1": 51.7, "1989-Q2": 53.0, "1989-Q3": 54.2, "1989-Q4": 55.2,
  "1990-Q1": 56.2, "1990-Q2": 57.1, "1990-Q3": 57.5, "1990-Q4": 59.0, "1991-Q1": 58.9, "1991-Q2": 59.0,
  "1991-Q3": 59.3, "1991-Q4": 59.9, "1992-Q1": 59.9, "1992-Q2": 59.7, "1992-Q3": 59.8, "1992-Q4": 60.1,
  "1993-Q1": 60.6, "1993-Q2": 60.8, "1993-Q3": 61.1, "1993-Q4": 61.2, "1994-Q1": 61.5, "1994-Q2": 61.9,
  "1994-Q3": 62.3, "1994-Q4": 62.8, "1995-Q1": 63.8, "1995-Q2": 64.7, "1995-Q3": 65.5, "1995-Q4": 66.0,
  "1996-Q1": 66.2, "1996-Q2": 66.7, "1996-Q3": 66.9, "1996-Q4": 67.0, "1997-Q1": 67.1, "1997-Q2": 66.9,
  "1997-Q3": 66.6, "1997-Q4": 66.8, "1998-Q1": 67.0, "1998-Q2": 67.4, "1998-Q3": 67.5, "1998-Q4": 67.8,
  "1999-Q1": 67.8, "1999-Q2": 68.1, "1999-Q3": 68.7,
};

const WITHHOLDING_RULES = [
  { from: "2016-07-01", to: "2017-06-30", threshold: 200_000_000, rateBps: 1000 },
  { from: "2017-07-01", to: "2024-12-31", threshold: 75_000_000, rateBps: 1250 },
  { from: "2025-01-01", threshold: 0, rateBps: 1500 },
] as const satisfies readonly { from: ISODate; to?: ISODate; threshold: Cents; rateBps: Bps }[];
function quarterKey(date: ISODate): string {
  const { y, m } = parseISO(date);
  const quarter = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
  return `${y}-Q${quarter}`;
}

function roundFactorThousandths(numerator: number, denominator: number): number {
  return Math.floor((numerator * 1000) / denominator + 0.5);
}

function sumItems(items: readonly CgtCostItem[] | undefined): Cents {
  return (items ?? []).reduce((sum, item) => sum + item.amount, 0);
}

function indexedAmount(item: CgtCostItem): Cents {
  const cpi = CPI[quarterKey(item.date)];
  if (cpi === undefined) throw new RangeError(`No CPI data loaded for ${item.date}.`);
  return mulRatio(item.amount, roundFactorThousandths(68.7, cpi), 1000);
}

function indexedCostBase(input: ComputeCgtInput): Cents {
  const items: CgtCostItem[] = [
    { amount: input.acquisitionPrice, date: input.acquisitionDate },
    ...(input.incidentalAcquisitionCosts ?? []),
    ...(input.incidentalDisposalCosts ?? []),
    ...(input.capitalImprovements ?? []),
    ...(input.titlePreservationCosts ?? []),
  ];
  const indexed = items.reduce((sum, item) => sum + indexedAmount(item), 0);
  return Math.max(0, indexed - (input.capitalWorksDeductionsClaimed ?? 0) - (input.otherDeductedAmountsReducingCostBase ?? 0));
}

function qualifiesForDiscount(acquisitionDate: ISODate, disposalContractDate: ISODate): boolean {
  return disposalContractDate > addYears(acquisitionDate, 1);
}

function baseDiscountBps(entityType: AuCgtEntityType): Bps {
  if (entityType === "INDIVIDUAL" || entityType === "TRUST") return 5000;
  if (entityType === "COMPLYING_SUPER_FUND") return 3333;
  return 0;
}

function currentAndPriorLosses(input: ComputeCgtInput): { current: Cents; prior: Cents } {
  const current = input.currentYearCapitalLosses ?? 0;
  const prior = Object.entries(input.priorYearCapitalLossesByYear ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .reduce((sum, [, amount]) => sum + amount, 0);
  return { current, prior };
}

function discountPercentageForIndividual(input: ComputeCgtInput): Bps {
  if (input.entityType !== "INDIVIDUAL") return baseDiscountBps(input.entityType);
  const base = baseDiscountBps(input.entityType);
  if (!input.residencyPeriods || input.residencyPeriods.length === 0 || input.disposalContractDate <= MAY_8_2012) return base;
  const testingStart = input.acquisitionDate <= MAY_8_2012 ? addDays(MAY_8_2012, 1) : input.acquisitionDate;
  const totalDays = diffDays(testingStart, addDays(input.disposalContractDate, 1));
  if (totalDays <= 0) return base;
  let eligibleDays = 0;
  for (const period of input.residencyPeriods) {
    if (period.status !== "AU_RESIDENT") continue;
    const start = period.from > testingStart ? period.from : testingStart;
    const end = period.to < input.disposalContractDate ? period.to : input.disposalContractDate;
    if (start <= end) eligibleDays += diffDays(start, addDays(end, 1));
  }
  return Math.floor((base * eligibleDays) / totalDays);
}

export function computeCgt(input: ComputeCgtInput): ComputeCgtResult {
  if (input.capitalProceeds < 0 || input.acquisitionPrice < 0) throw new RangeError("capitalProceeds and acquisitionPrice must be non-negative.");
  if (input.disposalContractDate < input.acquisitionDate) throw new RangeError("disposalContractDate cannot be before acquisitionDate.");
  const costBase = Math.max(0,
    input.acquisitionPrice +
    sumItems(input.incidentalAcquisitionCosts) +
    sumItems(input.incidentalDisposalCosts) +
    sumItems(input.nonCapitalOwningCosts) +
    sumItems(input.capitalImprovements) +
    sumItems(input.titlePreservationCosts) -
    (input.capitalWorksDeductionsClaimed ?? 0) -
    (input.otherDeductedAmountsReducingCostBase ?? 0),
  );
  const reducedCostBase = Math.max(0,
    input.acquisitionPrice +
    sumItems(input.incidentalAcquisitionCosts) +
    sumItems(input.incidentalDisposalCosts) +
    sumItems(input.capitalImprovements) +
    sumItems(input.titlePreservationCosts) -
    (input.capitalWorksDeductionsClaimed ?? 0) -
    (input.otherDeductedAmountsReducingCostBase ?? 0),
  );
  const ordinaryGain = Math.max(0, input.capitalProceeds - costBase);
  const capitalLoss = Math.max(0, reducedCostBase - input.capitalProceeds);
  const eligibleDiscount = ordinaryGain > 0 && baseDiscountBps(input.entityType) > 0 && qualifiesForDiscount(input.acquisitionDate, input.disposalContractDate);
  const indexationAvailable = ordinaryGain > 0 && input.acquisitionDate < SEPT_21_1999 && qualifiesForDiscount(input.acquisitionDate, input.disposalContractDate);
  const indexedBase = indexationAvailable ? indexedCostBase(input) : undefined;
  const indexedGain = indexedBase === undefined ? 0 : Math.max(0, input.capitalProceeds - indexedBase);
  const findings: Finding[] = [];
  let methodUsed: "DISCOUNT" | "INDEXATION" | "OTHER" = "OTHER";
  let grossCapitalGain = ordinaryGain;
  if (capitalLoss === 0) {
    if (input.entityType === "COMPANY" && indexedBase !== undefined) {
      methodUsed = "INDEXATION";
      grossCapitalGain = indexedGain;
    } else if (input.chooseIndexation && indexedBase !== undefined && input.entityType !== "COMPANY") {
      methodUsed = "INDEXATION";
      grossCapitalGain = indexedGain;
    } else if (eligibleDiscount) {
      methodUsed = "DISCOUNT";
      if (indexedBase !== undefined) {
        findings.push({
          id: "AU.CGT.INDEXATION_ALTERNATIVE",
          severity: "INFO",
          message: `Indexation would produce a capital gain of ${indexedGain} cents instead of ${ordinaryGain} cents before losses and discount.`,
          subject: input.label,
          data: { indexedGain, discountMethodGain: ordinaryGain },
        });
      }
    } else {
      methodUsed = "OTHER";
    }
  }
  const losses = currentAndPriorLosses(input);
  const currentYearCapitalLossesApplied = Math.min(grossCapitalGain, losses.current);
  const afterCurrent = grossCapitalGain - currentYearCapitalLossesApplied;
  const priorYearCapitalLossesApplied = Math.min(afterCurrent, losses.prior);
  const afterLosses = afterCurrent - priorYearCapitalLossesApplied;
  const discountPercentageBps = methodUsed === "DISCOUNT" ? discountPercentageForIndividual(input) : 0;
  const discountAmount = methodUsed === "DISCOUNT"
    ? input.entityType === "COMPLYING_SUPER_FUND"
      ? mulRatio(afterLosses, 1, 3)
      : mulBps(afterLosses, discountPercentageBps)
    : 0;
  const netCapitalGain = methodUsed === "DISCOUNT" ? afterLosses - discountAmount : afterLosses;
  if (input.entityType === "TRUST" && input.residencyPeriods) {
    findings.push({ id: "AU.CGT.TRUST.FOREIGN_BENEFICIARY_REVIEW", severity: "INFO", message: "Trust beneficiary level foreign-resident discount apportionment is left to the downstream distribution module.", subject: input.label });
  }
  return {
    methodUsed,
    costBase,
    reducedCostBase,
    indexedCostBase: indexedBase,
    grossCapitalGain,
    capitalLoss,
    currentYearCapitalLossesApplied,
    priorYearCapitalLossesApplied,
    discountPercentageBps,
    discountAmount,
    netCapitalGain,
    grossDiscountableGain: methodUsed === "DISCOUNT" ? afterLosses : 0,
    trustDiscountComponent: input.entityType === "TRUST" && methodUsed === "DISCOUNT" ? discountAmount : 0,
    computationLines: [
      { code: "AU.CGT.PROCEEDS", label: `${input.label} capital proceeds`, amount: input.capitalProceeds, kind: "AMOUNT", source: "RULE", ref: "CGT event A1 - contract date" },
      { code: "AU.CGT.COST_BASE", label: `${input.label} cost base`, amount: costBase, kind: "AMOUNT", source: "RULE", ref: "Div 110 ITAA 1997" },
      { code: "AU.CGT.GROSS_GAIN", label: `${input.label} gross capital gain`, amount: grossCapitalGain, kind: "AMOUNT", source: "SCHEDULE", ref: methodUsed },
      { code: "AU.CGT.NET_GAIN", label: `${input.label} net capital gain`, amount: netCapitalGain, kind: "AMOUNT", source: "SCHEDULE", ref: "Div 102 / Div 115 ITAA 1997" },
    ],
    findings,
    notes: [
      ENGINE_DISCLAIMER_AU,
      "The CGT event on sale is timed by the contract date, not settlement. The 12-month rule excludes both the acquisition day and the disposal day, matching the ATO CGT guide.",
      "Current-year and prior-year capital losses are applied before any CGT discount. Prior-year losses are consumed in year order, but this single-asset calculation simply offsets the provided balance against the asset's gain.",
      "Indexation factors are calculated to 3 decimal places using the ATO Appendix 2 CPI table and then applied in cents. The reduced cost base excludes third-element ownership costs, matching the ATO cost-base guidance.",
    ],
  };
}

export function computeForeignResidentCgtWithholding(input: ComputeForeignResidentCgtWithholdingInput): ComputeForeignResidentCgtWithholdingResult {
  const rule = WITHHOLDING_RULES.find((row) => {
    const to = "to" in row ? row.to : undefined;
    return input.contractDate >= row.from && (to === undefined || input.contractDate <= to);
  });
  if (!rule) throw new RangeError(`No FRCGW rule loaded for contract date ${input.contractDate}.`);
  const findings: Finding[] = [];
  const outOfScope = input.listedOnApprovedStockExchange || input.anotherWithholdingApplies || input.securitiesLendingArrangement || input.externalAdministrationOrBankruptcy;
  const certificateSatisfied = input.scenario === "DIRECT_REAL_PROPERTY" && !!input.hasClearanceCertificate;
  const declarationSatisfied = input.scenario !== "DIRECT_REAL_PROPERTY" && !!input.validVendorDeclaration;
  const certificateOrDeclaration = certificateSatisfied || declarationSatisfied;
  const thresholdPassed = input.assetValue >= rule.threshold;
  const applies = !outOfScope && !certificateOrDeclaration && thresholdPassed;
  const withholdingRateBps = applies ? (input.variationRateBps ?? rule.rateBps) : 0;
  const amountToWithhold = applies ? mulBps(input.assetValue, withholdingRateBps) : 0;
  if (input.variationRateBps !== undefined && input.variationRateBps >= rule.rateBps) {
    findings.push({ id: "AU.FRCGW.VARIATION_RATE_REVIEW", severity: "WARNING", message: "variationRateBps is not below the statutory FRCGW rate; confirm the variation notice really changes the purchaser's obligation.", subject: input.contractDate });
  }
  return {
    applies,
    withholdingRateBps,
    threshold: rule.threshold,
    amountToWithhold,
    dueDate: input.settlementDate,
    paymentTiming: "Purchaser pays the withheld amount to the ATO at or before settlement after lodging the purchaser payment notification.",
    computationLines: [
      { code: "AU.FRCGW.RATE", label: "FRCGW rate", amount: withholdingRateBps, kind: "PERCENT", source: "RULE", ref: "Subdivision 14-D Sch 1 TAA 1953" },
      { code: "AU.FRCGW.AMOUNT", label: "Amount to withhold", amount: amountToWithhold, kind: "AMOUNT", source: "SCHEDULE", ref: "Purchaser withholding at settlement" },
    ],
    findings,
    notes: [
      ENGINE_DISCLAIMER_AU,
      "From 1 January 2025 the rate is 15% and the threshold is effectively nil. From 1 July 2017 to 31 December 2024 the threshold was $750,000 at 12.5%, and from 1 July 2016 to 30 June 2017 it was $2 million at 10%.",
      "Australian-resident vendors need a clearance certificate for direct real property. Vendor declarations are instead relevant to non-direct real property transactions and other scope questions.",
    ],
  };
}
export const RULES: readonly RuleEntry[] = [
  {
    id: "au-cgt.cost-base-and-discount",
    domain: "AU_CGT",
    title: "CGT cost base, discount and indexation methods",
    summary: "The cost base comprises five elements, but deductible amounts are excluded and Division 43 deductions reduce the cost base. The CGT discount is generally 50% for individuals and trusts and 33 1/3% for complying super funds if the asset was acquired at least 12 months before the CGT event; indexation remains available for pre-21 September 1999 acquisitions.",
    effectiveFrom: "1999-09-21",
    sources: [
      { title: "ATO | Cost base of an asset", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/calculating-your-cgt/cost-base-of-asset", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | CGT when selling your rental property", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/property-and-capital-gains-tax/cgt-when-selling-your-rental-property", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO legal database | ITAA 1997 section 110-45", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/110-45", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO legal database | ITAA 1997 section 115-25", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/115-25", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Capital gains tax guide 2021 - The discount method", url: "https://www.ato.gov.au/forms-and-instructions/capital-gains-tax-guide-2021/whats-new/how-to-work-out-your-capital-gain-or-capital-loss/the-discount-method", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Capital gains tax guide 2021 - The indexation method", url: "https://www.ato.gov.au/forms-and-instructions/capital-gains-tax-guide-2021/whats-new/how-to-work-out-your-capital-gain-or-capital-loss/the-indexation-method", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Capital gains tax guide 2021 - Appendix 2 CPI", url: "https://www.ato.gov.au/forms-and-instructions/capital-gains-tax-guide-2021/appendixes/appendix-2-consumer-price-index-cpi", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "Federal Register of Legislation | Income Tax Assessment Act 1997", url: "https://www.legislation.gov.au/C2004A05138/latest/text", retrieved: RETRIEVED, publisher: "Federal Register of Legislation" },
    ],
    confidence: "VERIFIED",
    notes: "The engine focuses on straightforward CGT event A1 style disposals of real property or units. It does not attempt the full catalogue of rollover and special-event rules.",
  },
  {
    id: "au-cgt.loss-order-and-foreign-residents",
    domain: "AU_CGT",
    title: "Loss ordering and foreign / temporary resident discount restrictions",
    summary: "Current-year and prior-year capital losses are used before any discount. For individuals, the foreign / temporary resident rules apportion the discount by reference to eligible Australian-resident days after 8 May 2012; foreign residents disregard gains on non-taxable-Australian-property assets altogether.",
    effectiveFrom: "2012-05-09",
    sources: [
      { title: "ATO | Capital gains tax guide 2021 - Step 6 current-year capital losses", url: "https://www.ato.gov.au/forms-and-instructions/capital-gains-tax-guide-2021/part-b-completing-the-capital-gains-section-of-your-tax-return/step-6-applying-current-year-capital-losses", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Capital gains tax guide 2021 - Step 7 prior-year capital losses", url: "https://www.ato.gov.au/forms-and-instructions/capital-gains-tax-guide-2021/part-b-completing-the-capital-gains-section-of-your-tax-return/step-7-applying-net-capital-losses-from-earlier-years", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO legal database | ITAA 1997 section 115-105", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/115-105", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO legal database | ITAA 1997 section 115-115", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/115-115", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO legal database | ITAA 1997 section 855-10", url: "https://www.ato.gov.au/law/view/document?docid=PAC/19970038/855-10", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Foreign residents, temporary residents and changing residency", url: "https://www.ato.gov.au/forms-and-instructions/capital-gains-tax-guide-2021/whats-new/does-capital-gains-tax-apply-to-you/foreign-residents-temporary-residents-and-changing-residency", retrieved: RETRIEVED, publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes: "Trust beneficiary level apportionment under sections 115-110 / 115-120 is left to the downstream distribution module; this module keeps the trust's gross discountable gain and discount component separately identifiable.",
  },
  {
    id: "au-frcgw.2016-plus",
    domain: "AU_CGT",
    title: "Foreign resident capital gains withholding",
    summary: "FRCGW applies to direct real property, relevant indirect Australian real property interests and relevant options or rights unless an exclusion, clearance certificate, vendor declaration or variation applies. The statutory rates changed from 10% over a $2 million threshold (from 1 July 2016) to 12.5% over a $750,000 threshold (from 1 July 2017) and then to 15% for all property values from 1 January 2025.",
    effectiveFrom: "2016-07-01",
    sources: [
      { title: "ATO | Foreign resident capital gains withholding overview", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/foreign-residents-and-capital-gains-tax/foreign-resident-capital-gains-withholding/foreign-resident-capital-gains-withholding-overview", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Paying the foreign resident capital gains withholding", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/foreign-residents-and-capital-gains-tax/foreign-resident-capital-gains-withholding/paying-the-foreign-resident-capital-gains-withholding", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Australian residents and clearance certificates", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/foreign-residents-and-capital-gains-tax/foreign-resident-capital-gains-withholding/australian-residents-and-clearance-certificates", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Vendor declarations", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/foreign-residents-and-capital-gains-tax/foreign-resident-capital-gains-withholding/vendor-declarations", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "ATO | Foreign residents capital gains withholding variations", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/foreign-residents-and-capital-gains-tax/foreign-resident-capital-gains-withholding/foreign-residents-capital-gains-withholding-variations", retrieved: RETRIEVED, publisher: "ATO" },
      { title: "Federal Register of Legislation | Taxation Administration Act 1953", url: "https://www.legislation.gov.au/C2004A04014/latest/text", retrieved: RETRIEVED, publisher: "Federal Register of Legislation" },
    ],
    confidence: "VERIFIED",
    notes: "The calculator gives the purchaser's withholding amount and settlement timing. It does not lodge the purchaser payment notification or allocate multi-vendor credits between related entities.",
  },
] as const;
