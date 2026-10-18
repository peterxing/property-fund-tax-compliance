import { dateLabel, money, ratePct } from "../../../domain/format.ts";
import type { CsvModel, Currency } from "../../../domain/types.ts";
import type { ComputationLine, Finding } from "../../../engine/types.ts";
import { computeTransferDuty, computeLandholderDuty, RULES as AU_TRANSFER_RULES } from "../../../engine/au/transferDuty.ts";
import { computeLandTax, RULES as AU_LAND_TAX_RULES } from "../../../engine/au/landTax.ts";
import { computeCgt, computeForeignResidentCgtWithholding, RULES as AU_CGT_RULES } from "../../../engine/au/cgt.ts";
import { computeMitWithholding, RULES as AU_MIT_RULES } from "../../../engine/au/mitWithholding.ts";
import { computeDepreciationSchedule, RULES as AU_DEPRECIATION_RULES } from "../../../engine/au/depreciation.ts";
import { computeCapitalWorksSchedule, RULES as AU_CAPITAL_WORKS_RULES } from "../../../engine/au/capitalWorks.ts";
import { computeAuCompanyTax, RULES as AU_COMPANY_TAX_RULES } from "../../../engine/au/companyTax.ts";
import { computeBorrowingExpenseSchedule, RULES as AU_BORROWING_RULES } from "../../../engine/au/borrowingCosts.ts";
import { computeAcquisitionDuties, computeSsd, computeLeaseDuty, RULES as SG_STAMP_RULES } from "../../../engine/stampDuty.ts";
import { computePropertyTax, RULES as SG_PROPERTY_TAX_RULES } from "../../../engine/propertyTax.ts";
import { computeWithholdingTax, RULES as SG_WHT_RULES } from "../../../engine/withholdingTax.ts";
import { computeCit, RULES as SG_CIT_RULES } from "../../../engine/cit.ts";
import { assessGstRegistration, computeGstLateFilingPenalty, computeGstLatePaymentPenalty, RULES as SG_GST_RULES } from "../../../engine/gst.ts";
import { assessBadgesOfTrade, BADGES_OF_TRADE_FACTORS, RULES as SG_BADGES_RULES } from "../../../engine/badgesOfTrade.ts";
import { computeCapitalAllowances, RULES as SG_CA_RULES } from "../../../engine/capitalAllowances.ts";

export type CalculatorMarket = "AU" | "SG";
export type CalculatorId =
  | "au-transfer-duty"
  | "au-land-tax"
  | "au-cgt"
  | "au-frcgw"
  | "au-mit-withholding"
  | "au-div40"
  | "au-div43"
  | "au-company-tax"
  | "au-borrowing-costs"
  | "sg-stamp-duty"
  | "sg-property-tax"
  | "sg-withholding-tax"
  | "sg-cit"
  | "sg-gst"
  | "sg-badges"
  | "sg-capital-allowances";

export type FieldKind = "money" | "number" | "text" | "date" | "select" | "checkbox";
export type FieldValue = string | number | boolean;
export type CalculatorValues = Record<string, FieldValue>;

export interface CalculatorField {
  key: string;
  label: string;
  kind: FieldKind;
  defaultValue: FieldValue;
  currency?: Currency;
  options?: readonly { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

export interface ResultLine {
  label: string;
  value: string;
  note?: string;
}

export interface CalculatorResult {
  ok: true;
  summary: string;
  headlineLabel: string;
  headlineValue: string;
  lines: ResultLine[];
  schedule?: ResultLine[];
  findings: Finding[];
  notes: string[];
  ruleIds?: string[];
}

export type CalculatorOutput = CalculatorResult | { ok: false; message: string };

export interface BasisRule {
  id: string;
  title: string;
  summary?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  sources: readonly { title?: string; url: string; retrieved?: string; publisher?: string }[];
}

export interface CalculatorDefinition {
  id: CalculatorId;
  market: CalculatorMarket;
  name: string;
  purpose: string;
  fields: readonly CalculatorField[];
  rules: readonly BasisRule[];
  compute(values: CalculatorValues): CalculatorOutput;
}

const AUD: Currency = "AUD";
const SGD: Currency = "SGD";
const MAX_CALCULATOR_AMOUNT = Number.MAX_SAFE_INTEGER;
const auStates = ["NSW", "VIC", "QLD"].map((s) => ({ value: s, label: s }));
const bool = (v: FieldValue): boolean => v === true;
const str = (values: CalculatorValues, key: string): string => String(values[key] ?? "");
const num = (values: CalculatorValues, key: string): number => Number(values[key] ?? 0);
const cents = (values: CalculatorValues, key: string): number => num(values, key);
const bpsFromPct = (values: CalculatorValues, key: string): number => Math.round(num(values, key) * 100);

function line(label: string, value: string, note?: string): ResultLine {
  return { label, value, note };
}

function formatLine(source: ComputationLine, currency: Currency): ResultLine {
  const value = source.kind === "PERCENT" ? ratePct(source.amount / 10_000) : money(source.amount, currency, 0);
  return line(source.label, value, source.ref ?? source.note);
}

function asResult(
  summary: string,
  lines: ResultLine[],
  findings: Finding[] = [],
  notes: string[] = [],
  schedule?: ResultLine[],
  options: { headlineLabel?: string; headlineValue?: string; ruleIds?: readonly string[] } = {},
): CalculatorResult {
  return {
    ok: true,
    summary,
    headlineLabel: options.headlineLabel ?? (lines[lines.length - 1]?.label ?? "Result"),
    headlineValue: options.headlineValue ?? (lines[lines.length - 1]?.value ?? summary),
    lines,
    findings,
    notes,
    schedule,
    ruleIds: options.ruleIds ? [...options.ruleIds] : undefined,
  };
}

function safe(run: () => CalculatorResult): CalculatorOutput {
  try {
    return run();
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function fieldValue(values: CalculatorValues, field: CalculatorField): FieldValue {
  return values[field.key] ?? field.defaultValue;
}

function invalidInput(definition: CalculatorDefinition, values: CalculatorValues): string | null {
  for (const field of definition.fields) {
    const value = fieldValue(values, field);
    if (field.kind === "money" || field.kind === "number") {
      if (value === "" || value === null || value === undefined) return `${field.label} is required.`;
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n) > MAX_CALCULATOR_AMOUNT || !Number.isSafeInteger(Math.round(n))) return `${field.label} is outside the allowed range.`;
      if (field.kind === "money" && !Number.isInteger(n)) return `${field.label} must be an amount in whole cents.`;
      if (n < (field.min ?? -Infinity) || n > (field.max ?? Infinity)) return `${field.label} is outside the allowed range.`;
    }
    if ((field.kind === "money" || field.kind === "number") && (!Number.isFinite(Number(value)) || Number(value) < (field.min ?? -Infinity) || Number(value) > (field.max ?? Infinity))) {
      return `${field.label} is outside the allowed range.`;
    }
    if (field.kind === "date" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) {
      return `${field.label} must be a valid date.`;
    }
    if (field.kind === "select" && field.options && !field.options.some((option) => option.value === value)) {
      return `${field.label} is not a valid option.`;
    }
  }
  return null;
}

function withInputValidation(definition: CalculatorDefinition): CalculatorDefinition {
  return {
    ...definition,
    compute(values) {
      const invalid = invalidInput(definition, values);
      return invalid ? { ok: false, message: invalid } : definition.compute(values);
    },
  };
}

function matchingRuleIds(ruleVersion: string | undefined, fallback?: string): string[] {
  const versions = (ruleVersion ?? "")
    .split("+")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (versions.length === 0) return fallback ? [fallback] : [];
  return versions;
}

function transferDutyRuleIds(ruleVersion: string | undefined): string[] {
  return matchingRuleIds(ruleVersion).map((id) => {
    if (id.startsWith("nsw.transfer.2026") || id.startsWith("nsw.premium.2026")) return "au-transfer-duty.nsw.general.2026-07-01";
    if (id.startsWith("nsw.transfer.") || id.startsWith("nsw.premium.")) return "au-transfer-duty.nsw.historical.2022-07-01";
    if (id.startsWith("nsw.surcharge.")) return "au-transfer-duty.nsw.surcharge.2025-01-01";
    if (id.startsWith("nsw.landholder.")) return "au-transfer-duty.nsw.landholder.2024-02-01";
    if (id === "vic.transfer.2021-07-01") return "au-transfer-duty.vic.general.2021-07-01";
    if (id.startsWith("vic.transfer.")) return "au-transfer-duty.vic.general.pre2021";
    if (id.startsWith("vic.surcharge.")) return "au-transfer-duty.vic.fpad.2019-07-01";
    if (id.startsWith("vic.landholder.")) return "au-transfer-duty.vic.landholder.current";
    if (id.startsWith("qld.transfer.")) return "au-transfer-duty.qld.general.current";
    if (id.startsWith("qld.surcharge.")) return "au-transfer-duty.qld.afad.2016-10-01";
    if (id.startsWith("qld.landholder.")) return "au-transfer-duty.qld.landholder.current";
    return id;
  });
}

function landTaxRuleIds(ruleVersion: string | undefined): string[] {
  return matchingRuleIds(ruleVersion).map((id) => {
    if (id.startsWith("nsw.land-tax.general.")) return "au-land-tax.nsw.general.2024-01-01";
    if (id.startsWith("nsw.land-tax.special-trust.")) return "au-land-tax.nsw.special-trust.current";
    if (id.startsWith("nsw.land-tax.surcharge.")) return "au-land-tax.nsw.surcharge.2025-01-01";
    if (id === "vic.land-tax.general.2024-01-01") return "au-land-tax.vic.general.2024-01-01";
    if (id.startsWith("vic.land-tax.general.")) return "au-land-tax.vic.general.2022-01-01";
    if (id.startsWith("vic.land-tax.trust.") || id.startsWith("vic.land-tax.absentee.")) return "au-land-tax.vic.trust.current";
    if (id.startsWith("qld.land-tax.")) return "au-land-tax.qld.current";
    return id;
  });
}

function stampDutyRuleIds(ruleVersion: string | undefined): string[] {
  return matchingRuleIds(ruleVersion).map((id) => {
    if (id.startsWith("bsd.")) return id === "bsd.2023-02-15" ? "stamp-duty.bsd.2023-02-15" : "stamp-duty.bsd.2018-2023";
    if (id.startsWith("absd.")) return "stamp-duty.absd.2023-04-27";
    if (id.startsWith("ssd.residential.")) return "stamp-duty.ssd.residential.2025-07-04";
    if (id === "ssd.industrial.2013-01-12") return "stamp-duty.ssd.industrial.2013-01-12";
    return id;
  });
}

function withholdingTaxRuleIds(ruleVersion: string | undefined): string[] {
  return matchingRuleIds(ruleVersion).map((id) => id === "withholding-tax.current" ? "withholding-tax.rates.current" : id);
}

function badgesRuleIds(ruleVersion: string | undefined): string[] {
  return matchingRuleIds(ruleVersion).map((id) => id === "badges-of-trade.heuristic.2026-10-09" ? "badges-of-trade.scoring.assumption" : id);
}

export function rulesForResult(definition: CalculatorDefinition, result: CalculatorOutput): readonly BasisRule[] {
  if (!result.ok || !result.ruleIds || result.ruleIds.length === 0) return definition.rules;
  const ids = new Set(result.ruleIds.map((id) => id.toLowerCase()));
  const matched = definition.rules.filter((rule) => ids.has(rule.id.toLowerCase()));
  return matched.length > 0 ? matched : definition.rules;
}

export function defaultValues(definition: CalculatorDefinition): CalculatorValues {
  return Object.fromEntries(definition.fields.map((field) => [field.key, field.defaultValue]));
}

export function calculatorById(id: string | undefined): CalculatorDefinition {
  return CALCULATORS.find((calculator) => calculator.id === id) ?? CALCULATORS[0]!;
}

export function calculatorHash(id: CalculatorId): string {
  return `#/calculators?calc=${encodeURIComponent(id)}`;
}

export function calculatorCsv(definition: CalculatorDefinition, result: CalculatorResult): CsvModel {
  return {
    fileName: `${definition.id}-result.csv`,
    columns: ["Section", "Label", "Value", "Note"],
    rows: [
      ["Summary", definition.name, result.summary, ""],
      ...result.lines.map((row) => ["Result", row.label, row.value, row.note ?? ""]),
      ...(result.schedule ?? []).map((row) => ["Schedule", row.label, row.value, row.note ?? ""]),
      ...result.findings.map((finding) => ["Finding", finding.id, finding.severity, finding.message]),
    ],
  };
}

const commonFields = {
  state: { key: "state", label: "State", kind: "select", defaultValue: "NSW", options: auStates } satisfies CalculatorField,
  contractDate: { key: "contractDate", label: "Contract date", kind: "date", defaultValue: "2026-08-15" } satisfies CalculatorField,
};

const DEFINITIONS: readonly CalculatorDefinition[] = [
  {
    id: "au-transfer-duty",
    market: "AU",
    name: "Transfer duty and landholder duty",
    purpose: "Estimate AU transfer duty, foreign purchaser surcharge or landholder duty at each state's rates.",
    rules: AU_TRANSFER_RULES,
    fields: [
      { key: "mode", label: "Mode", kind: "select", defaultValue: "transfer", options: [{ value: "transfer", label: "Transfer duty" }, { value: "landholder", label: "Landholder duty" }] },
      commonFields.state,
      commonFields.contractDate,
      { key: "value", label: "Dutiable / landholdings value", kind: "money", currency: AUD, defaultValue: 12_500_000_00, min: 0 },
      { key: "propertyKind", label: "Property kind", kind: "select", defaultValue: "RESIDENTIAL", options: [{ value: "RESIDENTIAL", label: "Residential" }, { value: "NON_RESIDENTIAL", label: "Non-residential" }, { value: "MIXED", label: "Mixed-use" }] },
      { key: "residentialSharePct", label: "Residential share (%)", kind: "number", defaultValue: 100, min: 0, max: 100 },
      { key: "foreign", label: "Foreign purchaser / acquirer", kind: "checkbox", defaultValue: false },
      { key: "acquiredInterestPct", label: "Acquired interest for landholder duty (%)", kind: "number", defaultValue: 55, min: 0, max: 100 },
    ],
    compute: (values) => safe(() => {
      if (str(values, "mode") === "landholder") {
        const result = computeLandholderDuty({
          state: str(values, "state") as "NSW" | "VIC" | "QLD",
          acquisitionDate: str(values, "contractDate"),
          landholderKind: "PRIVATE_UNIT_TRUST",
          landholdingsValue: cents(values, "value"),
          acquiredInterestBps: bpsFromPct(values, "acquiredInterestPct"),
          residentialLandValue: Math.round((cents(values, "value") * bpsFromPct(values, "residentialSharePct")) / 10_000),
          foreignAcquirer: bool(values.foreign),
        });
        return asResult(`${result.relevantAcquisition ? "Relevant acquisition" : "Not a relevant acquisition"}; total duty ${money(result.totalDuty, AUD, 0)}.`, [
          line("Dutiable value", money(result.dutiableValue, AUD, 0)),
          line("Base duty", money(result.baseDuty, AUD, 0)),
          line("Foreign surcharge duty", money(result.foreignSurchargeDuty, AUD, 0)),
          line("Total duty", money(result.totalDuty, AUD, 0)),
        ], result.findings, result.notes, result.lines.map((item) => formatLine(item, AUD)), { headlineLabel: "Total landholder duty", headlineValue: money(result.totalDuty, AUD, 0), ruleIds: transferDutyRuleIds(result.ruleVersion) });
      }
      const result = computeTransferDuty({
        state: str(values, "state") as "NSW" | "VIC" | "QLD",
        contractDate: str(values, "contractDate"),
        dutiableValue: cents(values, "value"),
        propertyKind: str(values, "propertyKind") as "RESIDENTIAL" | "NON_RESIDENTIAL" | "MIXED",
        residentialShareBps: bpsFromPct(values, "residentialSharePct"),
        purchaser: { kind: "TRUST", foreignPerson: bool(values.foreign) },
      });
      return asResult(`Total transfer duty ${money(result.totalDuty, AUD, 0)}.`, [
        line("Dutiable value", money(result.dutiableValue, AUD, 0)),
        line("Residential dutiable value", money(result.residentialDutiableValue, AUD, 0)),
        line("Base duty", money(result.baseDuty, AUD, 0)),
        line("Foreign surcharge duty", money(result.foreignSurchargeDuty, AUD, 0)),
        line("Total duty", money(result.totalDuty, AUD, 0)),
      ], result.findings, result.notes, result.lines.map((item) => formatLine(item, AUD)), { headlineLabel: "Total transfer duty", headlineValue: money(result.totalDuty, AUD, 0), ruleIds: transferDutyRuleIds(result.ruleVersion) });
    }),
  },
  {
    id: "au-land-tax",
    market: "AU",
    name: "Land tax",
    purpose: "Calculate state land tax and foreign or trust surcharges for one landholding.",
    rules: AU_LAND_TAX_RULES,
    fields: [
      commonFields.state,
      { key: "assessmentYear", label: "Assessment year", kind: "number", defaultValue: 2026, min: 2022, step: 1 },
      { key: "landValue", label: "Taxable land value", kind: "money", currency: AUD, defaultValue: 8_000_000_00, min: 0 },
      { key: "ownerKind", label: "Owner kind", kind: "select", defaultValue: "TRUST", options: [{ value: "INDIVIDUAL", label: "Individual" }, { value: "COMPANY", label: "Company" }, { value: "TRUST", label: "Trust" }, { value: "SPECIAL_TRUST", label: "Special trust" }] },
      { key: "foreign", label: "Foreign / absentee owner", kind: "checkbox", defaultValue: false },
    ],
    compute: (values) => safe(() => {
      const result = computeLandTax({
        state: str(values, "state") as "NSW" | "VIC" | "QLD",
        assessmentYear: num(values, "assessmentYear"),
        holdings: [{ id: "property", taxableLandValue: cents(values, "landValue"), residential: true }],
        owner: { kind: str(values, "ownerKind") as "INDIVIDUAL" | "COMPANY" | "TRUST" | "SPECIAL_TRUST", foreign: bool(values.foreign), absentee: bool(values.foreign) },
      });
      return asResult(`Total land tax ${money(result.totalTax, AUD, 0)} for ${result.assessmentYear}.`, [
        line("Taxable land value", money(result.totalTaxableLandValue, AUD, 0)),
        line("General land tax", money(result.generalTax, AUD, 0)),
        line("Surcharge tax", money(result.surchargeTax, AUD, 0)),
        line("Total tax", money(result.totalTax, AUD, 0)),
      ], result.findings, result.notes, result.lines.map((item) => formatLine(item, AUD)), { headlineLabel: "Total land tax", headlineValue: money(result.totalTax, AUD, 0), ruleIds: landTaxRuleIds(result.ruleVersion) });
    }),
  },
  {
    id: "au-cgt",
    market: "AU",
    name: "CGT on property disposal",
    purpose: "Work out cost base, losses, discount and net capital gain for a property sale.",
    rules: AU_CGT_RULES,
    fields: [
      { key: "entityType", label: "Entity type", kind: "select", defaultValue: "TRUST", options: [{ value: "INDIVIDUAL", label: "Individual" }, { value: "TRUST", label: "Trust" }, { value: "COMPANY", label: "Company" }, { value: "COMPLYING_SUPER_FUND", label: "Complying super fund" }] },
      { key: "acquisitionDate", label: "Acquisition date", kind: "date", defaultValue: "2019-06-30" },
      { key: "disposalDate", label: "Disposal contract date", kind: "date", defaultValue: "2026-08-15" },
      { key: "proceeds", label: "Capital proceeds", kind: "money", currency: AUD, defaultValue: 15_000_000_00, min: 0 },
      { key: "acquisitionPrice", label: "Acquisition price", kind: "money", currency: AUD, defaultValue: 10_000_000_00, min: 0 },
      { key: "costs", label: "Incidental costs", kind: "money", currency: AUD, defaultValue: 350_000_00, min: 0 },
      { key: "capitalWorks", label: "Capital works deductions claimed", kind: "money", currency: AUD, defaultValue: 500_000_00, min: 0 },
      { key: "losses", label: "Current-year capital losses", kind: "money", currency: AUD, defaultValue: 250_000_00, min: 0 },
    ],
    compute: (values) => safe(() => {
      const result = computeCgt({
        label: "Property",
        entityType: str(values, "entityType") as "INDIVIDUAL" | "TRUST" | "COMPANY" | "COMPLYING_SUPER_FUND",
        acquisitionDate: str(values, "acquisitionDate"),
        disposalContractDate: str(values, "disposalDate"),
        capitalProceeds: cents(values, "proceeds"),
        acquisitionPrice: cents(values, "acquisitionPrice"),
        incidentalAcquisitionCosts: [{ amount: cents(values, "costs"), date: str(values, "acquisitionDate") }],
        capitalWorksDeductionsClaimed: cents(values, "capitalWorks"),
        currentYearCapitalLosses: cents(values, "losses"),
      });
      return asResult(`Net capital gain ${money(result.netCapitalGain, AUD, 0)} using ${result.methodUsed.toLowerCase()} method.`, [
        line("Cost base", money(result.costBase, AUD, 0)),
        line("Gross capital gain", money(result.grossCapitalGain, AUD, 0)),
        line("Losses applied", money(result.currentYearCapitalLossesApplied + result.priorYearCapitalLossesApplied, AUD, 0)),
        line("Discount", money(result.discountAmount, AUD, 0), ratePct(result.discountPercentageBps / 10_000)),
        line("Net capital gain", money(result.netCapitalGain, AUD, 0)),
      ], result.findings, result.notes, result.computationLines.map((item) => formatLine(item, AUD)), { headlineLabel: "Net capital gain", headlineValue: money(result.netCapitalGain, AUD, 0), ruleIds: ["au-cgt.cost-base-and-discount"] });
    }),
  },
  {
    id: "au-frcgw",
    market: "AU",
    name: "Foreign resident CGT withholding",
    purpose: "Check whether purchaser withholding applies and calculate the amount payable at settlement.",
    rules: AU_CGT_RULES,
    fields: [
      commonFields.contractDate,
      { key: "settlementDate", label: "Settlement date", kind: "date", defaultValue: "2026-09-15" },
      { key: "assetValue", label: "Asset value", kind: "money", currency: AUD, defaultValue: 8_000_000_00, min: 0 },
      { key: "scenario", label: "Scenario", kind: "select", defaultValue: "DIRECT_REAL_PROPERTY", options: [{ value: "DIRECT_REAL_PROPERTY", label: "Direct real property" }, { value: "INDIRECT_REAL_PROPERTY_INTEREST", label: "Indirect property interest" }, { value: "OPTION_OR_RIGHT", label: "Option or right" }] },
      { key: "clearance", label: "Clearance certificate / valid declaration held", kind: "checkbox", defaultValue: false },
      { key: "variationPct", label: "Variation rate (%)", kind: "number", defaultValue: 15, min: 0, max: 100 },
    ],
    compute: (values) => safe(() => {
      const direct = str(values, "scenario") === "DIRECT_REAL_PROPERTY";
      const result = computeForeignResidentCgtWithholding({
        contractDate: str(values, "contractDate"),
        settlementDate: str(values, "settlementDate"),
        scenario: str(values, "scenario") as "DIRECT_REAL_PROPERTY" | "INDIRECT_REAL_PROPERTY_INTEREST" | "OPTION_OR_RIGHT",
        assetValue: cents(values, "assetValue"),
        hasClearanceCertificate: direct && bool(values.clearance),
        validVendorDeclaration: !direct && bool(values.clearance),
        variationRateBps: bpsFromPct(values, "variationPct"),
      });
      return asResult(`${result.applies ? "Withholding applies" : "Withholding does not apply"}; amount ${money(result.amountToWithhold, AUD, 0)}.`, [
        line("Threshold", money(result.threshold, AUD, 0)),
        line("Rate", ratePct(result.withholdingRateBps / 10_000)),
        line("Amount to withhold", money(result.amountToWithhold, AUD, 0)),
        line("Due date", result.dueDate, result.paymentTiming),
      ], result.findings, result.notes, result.computationLines.map((item) => formatLine(item, AUD)), { headlineLabel: "Amount to withhold", headlineValue: money(result.amountToWithhold, AUD, 0), ruleIds: ["au-frcgw.2016-plus"] });
    }),
  },
  {
    id: "au-mit-withholding",
    market: "AU",
    name: "MIT withholding on fund payment",
    purpose: "Apply MIT withholding rates to EOI, non-EOI, clean building and NCMI buckets.",
    rules: AU_MIT_RULES,
    fields: [
      { key: "paymentDate", label: "Payment date", kind: "date", defaultValue: "2026-08-31" },
      { key: "paymentAmount", label: "Cash payment", kind: "money", currency: AUD, defaultValue: 1_000_000_00, min: 0 },
      { key: "ordinary", label: "Ordinary fund payment", kind: "money", currency: AUD, defaultValue: 700_000_00, min: 0 },
      { key: "cleanBuilding", label: "Clean building MIT income", kind: "money", currency: AUD, defaultValue: 100_000_00, min: 0 },
      { key: "ncmi", label: "NCMI fund payment", kind: "money", currency: AUD, defaultValue: 200_000_00, min: 0 },
      { key: "memberClass", label: "Member class", kind: "select", defaultValue: "FOREIGN_COMPANY_EOI", options: [{ value: "FOREIGN_COMPANY_EOI", label: "Foreign company - EOI" }, { value: "FOREIGN_COMPANY_NON_EOI", label: "Foreign company - non-EOI" }, { value: "RESIDENT_COMPANY", label: "Resident company" }] },
    ],
    compute: (values) => safe(() => {
      const result = computeMitWithholding({
        paymentDate: str(values, "paymentDate"),
        incomeYearEnd: "2026-06-30",
        trustRegime: "AMIT",
        withholdingMit: true,
        member: { memberClass: str(values, "memberClass") as "FOREIGN_COMPANY_EOI" | "FOREIGN_COMPANY_NON_EOI" | "RESIDENT_COMPANY", countryOfResidence: "SG" },
        paymentAmount: cents(values, "paymentAmount"),
        fundPaymentBreakdown: { ordinaryFundPayment: cents(values, "ordinary"), cleanBuildingFundPayment: cents(values, "cleanBuilding"), ncmiFundPayment: cents(values, "ncmi") },
      });
      return asResult(`Withholding ${money(result.withholdingAmount, AUD, 0)} at ${ratePct(result.rateBps / 10_000)}.`, [
        line("Total fund payment", money(result.totalFundPayment, AUD, 0)),
        line("Withholding amount", money(result.withholdingAmount, AUD, 0)),
        line("Final tax", result.finalTax ? "Yes" : "No"),
        line("Requires notice", result.requiresNotice ? "Yes" : "No"),
      ], result.findings, result.notes, result.working.map((item) => formatLine(item, AUD)), { headlineLabel: "MIT withholding", headlineValue: money(result.withholdingAmount, AUD, 0), ruleIds: ["au-mit.fund-payment-definition-and-notice.2016-plus"] });
    }),
  },
  {
    id: "au-div40",
    market: "AU",
    name: "Division 40 depreciation",
    purpose: "Create a decline-in-value schedule for depreciating plant and equipment.",
    rules: AU_DEPRECIATION_RULES,
    fields: [
      { key: "fromYear", label: "From income year", kind: "number", defaultValue: 2026, min: 2000, step: 1 },
      { key: "toYear", label: "To income year", kind: "number", defaultValue: 2028, min: 2000, step: 1 },
      { key: "cost", label: "Asset cost", kind: "money", currency: AUD, defaultValue: 1_200_000_00, min: 0 },
      { key: "startDate", label: "Start date", kind: "date", defaultValue: "2025-07-01" },
      { key: "method", label: "Method", kind: "select", defaultValue: "DIMINISHING_VALUE", options: [{ value: "DIMINISHING_VALUE", label: "Diminishing value" }, { value: "PRIME_COST", label: "Prime cost" }] },
      { key: "life", label: "Effective life (years)", kind: "number", defaultValue: 10, min: 0.1 },
      { key: "taxableUsePct", label: "Taxable use (%)", kind: "number", defaultValue: 100, min: 0, max: 100 },
    ],
    compute: (values) => safe(() => {
      const result = computeDepreciationSchedule({
        fromIncomeYear: num(values, "fromYear"),
        toIncomeYear: num(values, "toYear"),
        assets: [{ id: "asset", label: "Asset", assetClassId: "OTHER_PLANT", cost: cents(values, "cost"), startDate: str(values, "startDate"), method: str(values, "method") as "DIMINISHING_VALUE" | "PRIME_COST", effectiveLifeYears: num(values, "life"), taxableUseBps: bpsFromPct(values, "taxableUsePct") }],
      });
      const schedule = result.summaries.map((row) => line(String(row.incomeYear), money(row.totalDeclineInValueDeduction, AUD, 0), `${row.lines.length} asset line(s)`));
      return asResult(`Total deductions shown ${money(result.summaries.reduce((sum, row) => sum + row.totalDeclineInValueDeduction, 0), AUD, 0)}.`, schedule, result.findings, result.notes, result.assetLines.map((row) => line(`${row.incomeYear} ${row.assetLabel}`, money(row.deductionAllowed, AUD, 0), `Closing adjustable value ${money(row.closingAdjustableValue, AUD, 0)}`)), { headlineLabel: "Total deductions shown", headlineValue: money(result.summaries.reduce((sum, row) => sum + row.totalDeclineInValueDeduction, 0), AUD, 0), ruleIds: ["au-div40.general-formulas.2001-plus"] });
    }),
  },
  {
    id: "au-div43",
    market: "AU",
    name: "Division 43 capital works",
    purpose: "Create a capital works deduction schedule for buildings and structural improvements.",
    rules: AU_CAPITAL_WORKS_RULES,
    fields: [
      { key: "fromYear", label: "From income year", kind: "number", defaultValue: 2026, min: 1980, step: 1 },
      { key: "toYear", label: "To income year", kind: "number", defaultValue: 2028, min: 1980, step: 1 },
      { key: "cost", label: "Construction expenditure", kind: "money", currency: AUD, defaultValue: 20_000_000_00, min: 0 },
      { key: "startDate", label: "Construction start date", kind: "date", defaultValue: "2024-07-01" },
      { key: "completeDate", label: "Construction complete date", kind: "date", defaultValue: "2025-07-01" },
      { key: "buildingType", label: "Building type", kind: "select", defaultValue: "COMMERCIAL", options: [{ value: "COMMERCIAL", label: "Commercial" }, { value: "RESIDENTIAL", label: "Residential" }, { value: "INDUSTRIAL", label: "Industrial" }, { value: "STRUCTURAL_IMPROVEMENT", label: "Structural improvement" }] },
    ],
    compute: (values) => safe(() => {
      const result = computeCapitalWorksSchedule({
        fromIncomeYear: num(values, "fromYear"),
        toIncomeYear: num(values, "toYear"),
        assets: [{ id: "building", label: "Building", buildingType: str(values, "buildingType") as "COMMERCIAL" | "RESIDENTIAL" | "INDUSTRIAL" | "STRUCTURAL_IMPROVEMENT", constructionStartDate: str(values, "startDate"), constructionCompleteDate: str(values, "completeDate"), constructionExpenditure: cents(values, "cost") }],
      });
      return asResult(`Total capital works deductions ${money(result.summaries.reduce((sum, row) => sum + row.totalDeduction, 0), AUD, 0)}.`, result.summaries.map((row) => line(String(row.incomeYear), money(row.totalDeduction, AUD, 0))), result.findings, result.notes, result.assetLines.map((row) => line(`${row.incomeYear} ${row.assetLabel}`, money(row.deduction, AUD, 0), `${row.daysClaimed} days at ${ratePct(row.rateBps / 10_000)}`)), { headlineLabel: "Total capital works deductions", headlineValue: money(result.summaries.reduce((sum, row) => sum + row.totalDeduction, 0), AUD, 0), ruleIds: ["au-div43.general-rates.1979-plus"] });
    }),
  },
  {
    id: "au-company-tax",
    market: "AU",
    name: "Company tax",
    purpose: "Apply the base rate entity test, tax losses and the AU company tax rate.",
    rules: AU_COMPANY_TAX_RULES,
    fields: [
      { key: "incomeYear", label: "Income year", kind: "number", defaultValue: 2026, min: 2018, step: 1 },
      { key: "rentIncome", label: "Rent income", kind: "money", currency: AUD, defaultValue: 4_000_000_00, min: 0 },
      { key: "expenses", label: "Deductible expenses", kind: "money", currency: AUD, defaultValue: 1_000_000_00, min: 0 },
      { key: "aggregatedTurnover", label: "Aggregated turnover", kind: "money", currency: AUD, defaultValue: 30_000_000_00, min: 0 },
      { key: "passiveIncome", label: "Additional passive income", kind: "money", currency: AUD, defaultValue: 0, min: 0 },
      { key: "losses", label: "Prior-year tax losses", kind: "money", currency: AUD, defaultValue: 250_000_00, min: 0 },
    ],
    compute: (values) => safe(() => {
      const result = computeAuCompanyTax({
        incomeYear: num(values, "incomeYear"),
        regime: "COMPANY",
        lines: [
          { accountCode: "4000", accountName: "Rent income", debit: 0, credit: cents(values, "rentIncome"), category: "REV_RENT_BASE" },
          { accountCode: "6000", accountName: "Operating expenses", debit: cents(values, "expenses"), credit: 0, category: "EXP_OTHER_DEDUCTIBLE" },
        ],
        aggregatedTurnover: cents(values, "aggregatedTurnover"),
        additionalPassiveIncomeAmount: cents(values, "passiveIncome"),
        priorYearTaxLossesBroughtForward: cents(values, "losses"),
      });
      return asResult(`Tax payable ${money(result.summary.taxPayable, AUD, 0)} at ${ratePct(result.summary.rateBps / 10_000)}.`, [
        line("Accounting profit", money(result.summary.accountingProfit, AUD, 0)),
        line("Taxable income before losses", money(result.summary.taxableIncomeBeforeLosses, AUD, 0)),
        line("Losses applied", money(result.summary.taxLossesApplied, AUD, 0)),
        line("Taxable income", money(result.summary.taxableIncome, AUD, 0)),
        line("Base rate entity", result.summary.baseRateEntity ? "Yes" : "No", `Passive income ${ratePct(result.summary.passiveIncomeBps / 10_000)}`),
      ], [...result.findings], [...result.notes], result.lines.map((item) => formatLine(item, AUD)), { headlineLabel: "Tax payable", headlineValue: money(result.summary.taxPayable, AUD, 0), ruleIds: ["au-company-tax.rate-and-bre.2017-07-01"] });
    }),
  },
  {
    id: "au-borrowing-costs",
    market: "AU",
    name: "Borrowing costs",
    purpose: "Spread deductible borrowing costs over the shorter of 5 years and the loan period.",
    rules: AU_BORROWING_RULES,
    fields: [
      { key: "amount", label: "Borrowing costs", kind: "money", currency: AUD, defaultValue: 250_000_00, min: 0 },
      { key: "incurredDate", label: "Incurred date", kind: "date", defaultValue: "2025-07-01" },
      { key: "loanEndDate", label: "Loan end date", kind: "date", defaultValue: "2030-06-30" },
      { key: "taxableUsePct", label: "Taxable use (%)", kind: "number", defaultValue: 100, min: 0, max: 100 },
    ],
    compute: (values) => safe(() => {
      const result = computeBorrowingExpenseSchedule({ amount: cents(values, "amount"), incurredDate: str(values, "incurredDate"), loanEndDate: str(values, "loanEndDate"), taxableUseBps: bpsFromPct(values, "taxableUsePct") });
      return asResult(`Total scheduled deduction ${money(result.lines.reduce((sum, row) => sum + row.deduction, 0), AUD, 0)}.`, result.lines.map((row) => line(String(row.incomeYear), money(row.deduction, AUD, 0), `${row.relevantDays} relevant days`)), result.findings, result.notes, result.computationLines.map((item) => formatLine(item, AUD)), { headlineLabel: "Total scheduled deduction", headlineValue: money(result.lines.reduce((sum, row) => sum + row.deduction, 0), AUD, 0), ruleIds: ["au-borrowing-expenses.25-25"] });
    }),
  },
  {
    id: "sg-stamp-duty",
    market: "SG",
    name: "BSD, ABSD, SSD and lease duty",
    purpose: "Compute Singapore acquisition duties, seller's stamp duty or lease duty.",
    rules: SG_STAMP_RULES,
    fields: [
      { key: "mode", label: "Mode", kind: "select", defaultValue: "acquisition", options: [{ value: "acquisition", label: "BSD + ABSD" }, { value: "ssd", label: "SSD" }, { value: "lease", label: "Lease duty" }] },
      { key: "purchaseDate", label: "Purchase / lease date", kind: "date", defaultValue: "2026-08-15" },
      { key: "value", label: "Price or value", kind: "money", currency: SGD, defaultValue: 12_000_000_00, min: 0 },
      { key: "propertyKind", label: "Property kind", kind: "select", defaultValue: "RESIDENTIAL", options: [{ value: "RESIDENTIAL", label: "Residential" }, { value: "NON_RESIDENTIAL", label: "Non-residential" }] },
      { key: "buyerKind", label: "ABSD buyer kind", kind: "select", defaultValue: "ENTITY", options: [{ value: "SC", label: "Singapore citizen" }, { value: "SPR", label: "PR" }, { value: "FOREIGNER", label: "Foreigner" }, { value: "ENTITY", label: "Entity / S-REIT trustee" }] },
      { key: "disposalDate", label: "Disposal / lease end date", kind: "date", defaultValue: "2027-08-14" },
      { key: "monthlyRent", label: "Monthly rent for lease duty", kind: "money", currency: SGD, defaultValue: 100_000_00, min: 0 },
    ],
    compute: (values) => safe(() => {
      if (str(values, "mode") === "ssd") {
        const result = computeSsd({ acquisitionDate: str(values, "purchaseDate"), disposalDate: str(values, "disposalDate"), sellingPrice: cents(values, "value"), marketValue: cents(values, "value"), propertyKind: str(values, "propertyKind") === "RESIDENTIAL" ? "RESIDENTIAL" : "INDUSTRIAL" });
        return asResult(`SSD ${money(result.duty, SGD, 0)} (${result.holdingPeriodBand}).`, [line("Dutiable value", money(result.dutiableValue, SGD, 0)), line("Rate", ratePct(result.rateBps / 10_000)), line("SSD", money(result.duty, SGD, 0))], result.findings, result.notes, result.bands.map((band) => line(band.label, money(band.duty, SGD, 0), ratePct(band.rateBps / 10_000))), { headlineLabel: "SSD", headlineValue: money(result.duty, SGD, 0), ruleIds: stampDutyRuleIds(result.ruleVersion) });
      }
      if (str(values, "mode") === "lease") {
        const result = computeLeaseDuty({ leaseDate: str(values, "purchaseDate"), leaseStartDate: str(values, "purchaseDate"), leaseEndDate: str(values, "disposalDate"), rentSteps: [{ from: str(values, "purchaseDate"), to: str(values, "disposalDate"), rent: cents(values, "monthlyRent"), frequency: "MONTHLY" }] });
        return asResult(`Lease duty ${money(result.duty, SGD, 0)}.`, [line("Total rent", money(result.totalRent, SGD, 0)), line("Average annual rent", money(result.averageAnnualRent, SGD, 0)), line("Duty", money(result.duty, SGD, 0))], result.findings, result.notes, result.bands.map((band) => line(band.label, money(band.duty, SGD, 0), ratePct(band.rateBps / 10_000))), { headlineLabel: "Lease duty", headlineValue: money(result.duty, SGD, 0), ruleIds: ["stamp-duty.lease.current"] });
      }
      const result = computeAcquisitionDuties({ purchaseDate: str(values, "purchaseDate"), purchasePrice: cents(values, "value"), marketValue: cents(values, "value"), propertyKind: str(values, "propertyKind") as "RESIDENTIAL" | "NON_RESIDENTIAL", absd: { buyers: [{ kind: str(values, "buyerKind") as "SC" | "SPR" | "FOREIGNER" | "ENTITY" }] } });
      return asResult(`Total upfront duty ${money(result.totalUpfrontDuty, SGD, 0)}; net duty ${money(result.totalNetDuty, SGD, 0)}.`, [line("BSD", money(result.bsd.duty, SGD, 0)), line("ABSD", result.absd ? money(result.absd.duty, SGD, 0) : "Not modelled"), line("Refundable duty", money(result.totalRefundableDuty, SGD, 0)), line("Net duty", money(result.totalNetDuty, SGD, 0))], result.findings, result.notes, [...result.bsd.bands, ...(result.absd?.bands ?? [])].map((band) => line(`${band.component}: ${band.label}`, money(band.duty, SGD, 0), ratePct(band.rateBps / 10_000))), { headlineLabel: "Net duty", headlineValue: money(result.totalNetDuty, SGD, 0), ruleIds: [...stampDutyRuleIds(result.bsd.ruleVersion), ...(result.absd ? stampDutyRuleIds(result.absd.ruleVersion) : [])] });
    }),
  },
  {
    id: "sg-property-tax",
    market: "SG",
    name: "Property tax",
    purpose: "Calculate Singapore property tax from annual value, use and part-year ownership.",
    rules: SG_PROPERTY_TAX_RULES,
    fields: [
      { key: "year", label: "Year", kind: "number", defaultValue: 2026, min: 2015, step: 1 },
      { key: "annualValue", label: "Annual value", kind: "money", currency: SGD, defaultValue: 240_000_00, min: 0 },
      { key: "usage", label: "Usage", kind: "select", defaultValue: "NON_RESIDENTIAL_OR_VACANT", options: [{ value: "OWNER_OCCUPIED_RESIDENTIAL", label: "Owner-occupied residential" }, { value: "NON_OWNER_OCCUPIED_RESIDENTIAL", label: "Non-owner-occupied residential" }, { value: "NON_RESIDENTIAL_OR_VACANT", label: "Non-residential / vacant" }] },
      { key: "ownerSharePct", label: "Owner share (%)", kind: "number", defaultValue: 100, min: 0, max: 100 },
    ],
    compute: (values) => safe(() => {
      const year = num(values, "year");
      const result = computePropertyTax({ year, segments: [{ id: "property", from: `${year}-01-01`, to: `${year}-12-31`, annualValue: cents(values, "annualValue"), usage: str(values, "usage") as "OWNER_OCCUPIED_RESIDENTIAL" | "NON_OWNER_OCCUPIED_RESIDENTIAL" | "NON_RESIDENTIAL_OR_VACANT", residentialType: "PRIVATE", ownerShareBps: bpsFromPct(values, "ownerSharePct") }], notice: { kind: "ANNUAL_BILL", noticeDate: `${year}-01-01` } });
      return asResult(`Net property tax ${money(result.netTax, SGD, 0)}.`, [line("Gross tax", money(result.grossTax, SGD, 0)), line("Rebate", money(result.rebate, SGD, 0)), line("Net tax", money(result.netTax, SGD, 0)), line("Payment due", result.deadlines.paymentDueDate ? dateLabel(result.deadlines.paymentDueDate) : "Not modelled")], result.findings, result.notes, result.segments.flatMap((segment) => segment.bands.map((band) => line(band.label, money(band.proratedTax, SGD, 0), ratePct(band.rateBps / 10_000)))), { headlineLabel: "Net property tax", headlineValue: money(result.netTax, SGD, 0), ruleIds: matchingRuleIds(result.ruleVersion) });
    }),
  },
  {
    id: "sg-withholding-tax",
    market: "SG",
    name: "Withholding tax on non-resident payments",
    purpose: "Compute Section 45 withholding, due date and late-payment penalty.",
    rules: SG_WHT_RULES,
    fields: [
      { key: "paymentDate", label: "Payment date", kind: "date", defaultValue: "2026-08-15" },
      { key: "grossPayment", label: "Gross payment", kind: "money", currency: SGD, defaultValue: 1_000_000_00, min: 0 },
      { key: "paymentType", label: "Payment type", kind: "select", defaultValue: "INTEREST", options: [{ value: "INTEREST", label: "Interest" }, { value: "ROYALTY", label: "Royalty" }, { value: "DIRECTOR_FEES", label: "Director fees" }, { value: "TECHNICAL_SERVICE_FEES", label: "Technical service fees" }, { value: "RENT_MOVABLE_PROPERTY", label: "Rent of movable property" }] },
      { key: "serviceInSingapore", label: "Service performed in Singapore", kind: "checkbox", defaultValue: true },
      { key: "treatyRatePct", label: "Treaty rate (%)", kind: "number", defaultValue: 15, min: 0, max: 100 },
      { key: "remittedDate", label: "Remitted date", kind: "date", defaultValue: "2026-11-20" },
    ],
    compute: (values) => safe(() => {
      const result = computeWithholdingTax({ paymentDate: str(values, "paymentDate"), grossPayment: cents(values, "grossPayment"), paymentType: str(values, "paymentType") as "INTEREST", servicePerformedInSingapore: bool(values.serviceInSingapore), treatyRateBps: bpsFromPct(values, "treatyRatePct"), remittedDate: str(values, "remittedDate") });
      return asResult(`Withholding tax ${money(result.tax, SGD, 0)} due ${dateLabel(result.dueDate)}.`, [line("Gross payment", money(result.grossPayment, SGD, 0)), line("Effective rate", ratePct(result.effectiveRateBps / 10_000)), line("Tax", money(result.tax, SGD, 0)), line("Net payment if withheld from gross", money(result.netPaymentIfTaxWithheldFromGross, SGD, 0)), line("Late penalty", result.latePenalty ? money(result.latePenalty.totalPenalty, SGD, 0) : "None")], result.findings, result.notes, result.breakdown.map((row) => line(row.label, money(row.tax, SGD, 0), ratePct(row.rateBps / 10_000))), { headlineLabel: "Withholding tax", headlineValue: money(result.tax, SGD, 0), ruleIds: withholdingTaxRuleIds(`${result.ruleVersion}+withholding-tax.deadline.current${result.latePenalty ? "+withholding-tax.penalty.current" : ""}`) });
    }),
  },
  {
    id: "sg-cit",
    market: "SG",
    name: "Corporate income tax",
    purpose: "Apply Singapore CIT rate, partial or start-up exemption, rebate and set-offs.",
    rules: SG_CIT_RULES,
    fields: [
      { key: "ya", label: "Year of Assessment", kind: "number", defaultValue: 2026, min: 2022, step: 1 },
      { key: "income", label: "Normal chargeable income", kind: "money", currency: SGD, defaultValue: 500_000_00, min: 0 },
      { key: "startUp", label: "Use start-up exemption", kind: "checkbox", defaultValue: false },
      { key: "active", label: "Active company with local employee", kind: "checkbox", defaultValue: true },
      { key: "setOffs", label: "Tax set-offs", kind: "money", currency: SGD, defaultValue: 0, min: 0 },
    ],
    compute: (values) => safe(() => {
      const result = computeCit({ ya: num(values, "ya"), normalChargeableIncome: cents(values, "income"), startUpExemption: bool(values.startUp), isActiveCompany: bool(values.active), localEmployeeCount: bool(values.active) ? 1 : 0, taxSetOffs: cents(values, "setOffs") });
      return asResult(`Tax payable ${money(result.taxPayable, SGD, 0)} after ${result.exemptionScheme.label}.`, [line("Headline rate", ratePct(result.headlineRateBps / 10_000)), line("Exemption", money(result.exemptionAmount, SGD, 0)), line("Chargeable income after exemption", money(result.chargeableIncomeAfterExemption, SGD, 0)), line("Tax before rebate", money(result.taxBeforeRebate, SGD, 0)), line("Rebate", money(result.rebate, SGD, 0)), line("Tax payable", money(result.taxPayable, SGD, 0))], result.findings, result.notes, result.lines.map((item) => formatLine(item, SGD)), { headlineLabel: "Tax payable", headlineValue: money(result.taxPayable, SGD, 0), ruleIds: ["cit.rate-and-exemptions.2022-plus", "cit.rebates.2024-2026"] });
    }),
  },
  {
    id: "sg-gst",
    market: "SG",
    name: "GST registration and late penalties",
    purpose: "Test GST registration threshold and compute late filing or payment penalties.",
    rules: SG_GST_RULES,
    fields: [
      { key: "assessmentDate", label: "Assessment date", kind: "date", defaultValue: "2026-08-15" },
      { key: "retrospectiveTurnover", label: "Retrospective annual taxable turnover", kind: "money", currency: SGD, defaultValue: 1_200_000_00, min: 0 },
      { key: "forecastTurnover", label: "Forecast taxable turnover next 12 months", kind: "money", currency: SGD, defaultValue: 800_000_00, min: 0 },
      { key: "dueDate", label: "GST return / payment due date", kind: "date", defaultValue: "2026-07-31" },
      { key: "filedDate", label: "Filed date", kind: "date", defaultValue: "2026-10-15" },
      { key: "unpaidTax", label: "Unpaid tax", kind: "money", currency: SGD, defaultValue: 100_000_00, min: 0 },
      { key: "paidDate", label: "Paid date", kind: "date", defaultValue: "2026-12-16" },
    ],
    compute: (values) => safe(() => {
      const assessment = assessGstRegistration({ assessmentDate: str(values, "assessmentDate"), retrospectiveAnnualTaxableTurnover: cents(values, "retrospectiveTurnover"), forecastTaxableTurnoverNext12Months: cents(values, "forecastTurnover"), forecastDate: str(values, "assessmentDate") });
      const filingPenalty = computeGstLateFilingPenalty({ dueDate: str(values, "dueDate"), filedDate: str(values, "filedDate") });
      const paymentPenalty = computeGstLatePaymentPenalty({ unpaidTax: cents(values, "unpaidTax"), dueDate: str(values, "dueDate"), paidDate: str(values, "paidDate") });
      return asResult(`${assessment.registrationRequired ? "GST registration required" : "GST registration not required"}; penalties ${money(filingPenalty + paymentPenalty, SGD, 0)}.`, [line("Registration basis", assessment.basis ?? "None"), line("Threshold", money(assessment.thresholdAmount, SGD, 0)), line("Application due", assessment.applicationDueDate ? dateLabel(assessment.applicationDueDate) : "Not applicable"), line("Effective registration", assessment.effectiveRegistrationDate ? dateLabel(assessment.effectiveRegistrationDate) : "Not applicable"), line("Late filing penalty", money(filingPenalty, SGD, 0)), line("Late payment penalty", money(paymentPenalty, SGD, 0))], assessment.findings, [], undefined, { headlineLabel: "Penalties", headlineValue: money(filingPenalty + paymentPenalty, SGD, 0), ruleIds: ["gst.registration-and-penalties.2022-plus"] });
    }),
  },
  {
    id: "sg-badges",
    market: "SG",
    name: "Badges of trade",
    purpose: "Questionnaire for whether a property disposal looks capital or revenue in nature.",
    rules: SG_BADGES_RULES,
    fields: BADGES_OF_TRADE_FACTORS.map((factor, index) => ({ key: factor.key, label: factor.label, kind: "select" as const, defaultValue: index < 3 ? "CAPITAL" : "NEUTRAL", options: factor.options.map((option) => ({ value: option.lean, label: option.label })), hint: factor.question })),
    compute: (values) => safe(() => {
      const factors = Object.fromEntries(BADGES_OF_TRADE_FACTORS.map((factor) => [factor.key, { lean: str(values, factor.key) as "STRONGLY_CAPITAL" | "CAPITAL" | "NEUTRAL" | "TRADING" | "STRONGLY_TRADING" }]));
      const result = assessBadgesOfTrade({ factors });
      return asResult(`${result.outcome.replaceAll("_", " ").toLowerCase()} with score ${result.totalScore}.`, [line("Outcome", result.outcome.replaceAll("_", " ")), line("Total score", String(result.totalScore)), ...result.reasons.map((reason, index) => line(`Reason ${index + 1}`, reason))], result.findings, result.notes, result.contributions.map((item) => line(item.factor, String(item.score), item.reason)), { headlineLabel: "Outcome", headlineValue: result.outcome.replaceAll("_", " "), ruleIds: badgesRuleIds(result.ruleVersion) });
    }),
  },
  {
    id: "sg-capital-allowances",
    market: "SG",
    name: "Capital allowances",
    purpose: "Project Singapore capital allowance and balancing adjustment schedules.",
    rules: SG_CA_RULES,
    fields: [
      { key: "fromYa", label: "From YA", kind: "number", defaultValue: 2026, min: 2000, step: 1 },
      { key: "toYa", label: "To YA", kind: "number", defaultValue: 2028, min: 2000, step: 1 },
      { key: "cost", label: "Asset cost", kind: "money", currency: SGD, defaultValue: 900_000_00, min: 0 },
      { key: "acquisitionDate", label: "Acquisition date", kind: "date", defaultValue: "2025-07-01" },
      { key: "regime", label: "Regime", kind: "select", defaultValue: "S19A_3Y", options: [{ value: "S19A_3Y", label: "S19A 3-year" }, { value: "S19A_1Y_SPECIFIC", label: "S19A one-year specific" }, { value: "S19A_1Y_LOW_VALUE", label: "Low-value asset" }, { value: "S19_WORKING_LIFE", label: "Section 19 working life" }] },
      { key: "disposalDate", label: "Disposal date", kind: "date", defaultValue: "2028-06-30" },
      { key: "proceeds", label: "Disposal proceeds", kind: "money", currency: SGD, defaultValue: 100_000_00, min: 0 },
    ],
    compute: (values) => safe(() => {
      const result = computeCapitalAllowances({ fromYa: num(values, "fromYa"), toYa: num(values, "toYa"), financialYearEndMonth: 6, financialYearEndDay: 30, assets: [{ id: "asset", label: "Asset", regime: str(values, "regime") as "S19A_3Y", cost: cents(values, "cost"), acquisitionDate: str(values, "acquisitionDate"), disposalDate: str(values, "disposalDate"), disposalProceeds: cents(values, "proceeds") }] });
      return asResult(`Total deductions ${money(result.yaSummaries.reduce((sum, row) => sum + row.totalDeductions, 0), SGD, 0)}.`, result.yaSummaries.map((row) => line(String(row.ya), money(row.totalDeductions, SGD, 0), `Additions ${money(row.totalAdditions, SGD, 0)}`)), result.findings, result.notes, result.assetLines.map((row) => line(`${row.ya} ${row.assetLabel}`, money(row.allowanceClaimed + row.balancingAllowance - row.balancingCharge, SGD, 0), row.note)), { headlineLabel: "Total deductions", headlineValue: money(result.yaSummaries.reduce((sum, row) => sum + row.totalDeductions, 0), SGD, 0), ruleIds: ["capital-allowances.s19-s19a.2022-plus"] });
    }),
  },
];

export const CALCULATORS: readonly CalculatorDefinition[] = DEFINITIONS.map(withInputValidation);
