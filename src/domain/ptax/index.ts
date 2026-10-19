// OWNER: Property taxes & duties agent (F2). Public selectors and view models for this feature (pure; no React, DOM or node: imports).
import { computeLandTax } from "../../engine/au/landTax.ts";
import type { ComputeLandTaxResult } from "../../engine/au/landTax.ts";
import { AU_STATE_TAX_CATALOGUE } from "../../engine/au/stateCatalogue.ts";
import { AU_STATES, type AuState } from "../../engine/au/types.ts";
import { computeTransferDuty } from "../../engine/au/transferDuty.ts";
import { computeAcquisitionDuties, computeSsd, stampDutyDeadline } from "../../engine/stampDuty.ts";
import { computePropertyTax, PROPERTY_TAX_USAGES } from "../../engine/propertyTax.ts";
import { addDays, toISO, yearOf } from "../../engine/dates.ts";
import { dateLabel, money, slug } from "../format.ts";
import type { AppData, Cents, CsvModel, DocModel, Fund, FundId, Property } from "../types.ts";
import type { AnnualTaxRow, DutiesView, DutyRow, PropertyTaxProfile, PropertyTaxView, PtaxKpis, PtaxNotice } from "./types.ts";
export type * from "./types.ts";

type Modelled<T> = { ok: true; value: T } | { ok: false; reason: string; ruleIds?: string[] };

const TAX_WORKSPACE = "/property-taxes";
/** The annual table's second tax column: AU holds foreign/absentee surcharges and WA's MRIT; SG holds the (negative) property tax rebate. */
export const surchargeColumnLabel = (market: Fund["market"]): string => (market === "AU" ? "Surcharge or MRIT" : "Rebate");

export const AU_LAND_TAX_ASSUMPTION =
  "Australian land tax profiles treat listed property funds as trust owners by default. Victoria applies the trust scale while Trust surcharge applies is Yes; NSW special-trust no-threshold treatment is available by changing Owner kind to Special trust; Queensland uses the company/trust scale. South Australia uses its trust rates while Trust surcharge applies is Yes; the seeded listed funds have it set to No because RevenueSA assesses listed and widely held public unit trust schemes at the general rates. Western Australia has one scale for every owner, plus the Metropolitan Region Improvement Tax for properties marked as in the Perth metropolitan region; omitted saved flags default to metropolitan. Review fixed/unit-trust notifications before relying on the result.";

function annualPeriod(fund: Fund, year: number): string {
  return fund.market === "AU" ? `land-tax-${year}` : `property-tax-${year}`;
}

function dutyPeriod(profile: PropertyTaxProfile): string {
  return `duty-${profile.purchaseDate}`;
}

function paid(profile: PropertyTaxProfile, kind: "annual-tax" | "duty", period: string): boolean {
  return profile.payments.some((payment) => payment.kind === kind && payment.period === period);
}

function paymentsFor(profile: PropertyTaxProfile, kind: "annual-tax" | "duty", period: string) {
  return profile.payments.filter((payment) => payment.kind === kind && payment.period === period);
}

function noticeFor(profile: PropertyTaxProfile, period: string): PtaxNotice | null {
  return profile.notices?.find((notice) => notice.period === period) ?? null;
}

function varianceLabel(variance: number, currency: Fund["currency"]): string {
  if (variance === 0) return "matches modelled";
  return `${money(Math.abs(variance), currency)} ${variance > 0 ? "above" : "below"} modelled`;
}

function assessmentFields(fund: Fund, period: string, modelledTotal: number, estimatedDueDate: string | null, profile: PropertyTaxProfile | null): Pick<AnnualTaxRow, "period" | "dueDate" | "dueLabel" | "dueEstimated" | "notice" | "assessedAmount" | "assessedVariance" | "assessedLabel"> {
  const notice = profile ? noticeFor(profile, period) : null;
  const dueDate = notice?.dueDate ?? estimatedDueDate;
  const dueEstimated = notice === null && estimatedDueDate !== null;
  const assessedVariance = notice ? notice.assessedAmount - modelledTotal : null;
  return {
    period,
    dueDate,
    dueLabel: dueDate ? `${dateLabel(dueDate)}${dueEstimated ? " (estimated)" : ""}` : "Not calculated",
    dueEstimated,
    notice,
    assessedAmount: notice?.assessedAmount ?? null,
    assessedVariance,
    assessedLabel: notice ? `Assessed ${money(notice.assessedAmount, fund.currency)}; ${varianceLabel(assessedVariance ?? 0, fund.currency)}` : "No assessment notice recorded",
  };
}

function ruleTitle(id: string): string {
  if (id.startsWith("nsw.land-tax.general")) return "NSW land tax thresholds and rates";
  if (id.startsWith("nsw.land-tax.special-trust")) return "NSW special-trust land tax";
  if (id.startsWith("nsw.land-tax.surcharge")) return "NSW surcharge land tax for foreign owners";
  if (id.startsWith("vic.land-tax.trust")) return "Victoria trust surcharge land tax scale";
  if (id.startsWith("vic.land-tax.general")) return "Victoria land tax current rates";
  if (id.startsWith("vic.land-tax.absentee")) return "Victoria absentee owner surcharge";
  if (id.startsWith("qld.land-tax.company-trust")) return "Queensland company and trust land tax";
  if (id.startsWith("qld.land-tax.individual")) return "Queensland individual land tax";
  if (id.startsWith("qld.land-tax.foreign-entity")) return "Queensland foreign company/trust surcharge";
  if (id.startsWith("wa.land-tax.general")) return "Western Australia land tax scale";
  if (id.startsWith("wa.land-tax.mrit")) return "WA Metropolitan Region Improvement Tax";
  if (id.startsWith("sa.land-tax.general")) return "South Australia land tax general rates";
  if (id.startsWith("sa.land-tax.trust")) return "South Australia land tax trust rates";
  if (id.startsWith("tas.land-tax.general")) return "Tasmania land tax general rates";
  if (id.startsWith("tas.land-tax.foreign")) return "Tasmania foreign investor land tax surcharge";
  if (id.startsWith("act.land-tax.residential")) return "ACT residential land tax";
  if (id.startsWith("act.land-tax.foreign")) return "ACT foreign ownership surcharge for land tax";
  if (id.startsWith("nt.land-tax.nil")) return "Northern Territory: no annual land tax";
  if (id.startsWith("property-tax.other")) return "10% rule for non-residential property and vacant land";
  if (id.startsWith("property-tax.noor")) return "Non-owner-occupier residential property tax rates";
  if (id.startsWith("property-tax.ootr")) return "Owner-occupier residential property tax rates";
  if (id.startsWith("nsw.transfer")) return "NSW transfer-duty schedule";
  if (id.startsWith("nsw.premium")) return "NSW residential premium-duty formula";
  if (id.startsWith("nsw.surcharge")) return "NSW surcharge purchaser duty";
  if (id.startsWith("vic.transfer")) return "Victoria investor transfer-duty schedule";
  if (id.startsWith("vic.surcharge")) return "Victoria foreign purchaser additional duty";
  if (id.startsWith("qld.transfer")) return "Queensland transfer-duty rates";
  if (id.startsWith("qld.surcharge")) return "Queensland additional foreign acquirer duty";
  if (id.startsWith("wa.transfer")) return "Western Australia transfer duty general rate";
  if (id.startsWith("wa.surcharge")) return "Western Australia foreign transfer duty";
  if (id.startsWith("wa.landholder")) return "Western Australia landholder duty";
  if (id.startsWith("sa.transfer")) return "South Australia conveyance duty rates";
  if (id.startsWith("sa.qualifying-land.phaseout")) return "South Australia qualifying-land duty phase-out";
  if (id.startsWith("sa.qualifying-land")) return "South Australia: no duty on qualifying land";
  if (id.startsWith("sa.surcharge")) return "South Australia foreign ownership surcharge";
  if (id.startsWith("sa.landholder")) return "South Australia landholder duty";
  if (id.startsWith("tas.transfer")) return "Tasmania property transfer duty rates";
  if (id.startsWith("tas.surcharge")) return "Tasmania foreign investor duty surcharge";
  if (id.startsWith("act.transfer.residential")) return "ACT non-commercial conveyance duty rates";
  if (id.startsWith("act.transfer.commercial")) return "ACT commercial conveyance duty phase-out";
  if (id.startsWith("nt.transfer")) return "Northern Territory stamp duty on land";
  if (id.startsWith("bsd.")) return "Buyer's Stamp Duty (BSD)";
  if (id.startsWith("absd.")) return "Additional Buyer's Stamp Duty (ABSD)";
  if (id.startsWith("ssd.")) return "Seller's Stamp Duty (SSD)";
  return id;
}

function titleFor(ids: readonly string[], fallback: string): string {
  const titles = Array.from(new Set(ids.map(ruleTitle)));
  return titles.length > 0 ? titles.join("; ") : fallback;
}

function fundOf(data: AppData, fundId: FundId): Fund {
  const fund = data.funds.find((candidate) => candidate.id === fundId);
  if (!fund) throw new Error(`Fund not found: ${fundId}`);
  return fund;
}

function propertiesOf(data: AppData, fundId: FundId): Property[] {
  return data.properties.filter((property) => property.fundId === fundId);
}

function profileFor(data: AppData, propertyId: string): PropertyTaxProfile | undefined {
  return data.propertyProfiles.find((profile) => profile.propertyId === propertyId);
}

function stateLabel(state: string | null): string {
  return AU_STATES.find((entry) => entry.id === state)?.label ?? state ?? "State not set";
}

function usageLabel(usage: string | null): string {
  return PROPERTY_TAX_USAGES.find((entry) => entry.id === usage)?.label ?? usage ?? "Usage not set";
}

function coverage(state: AuState, kind: "landTaxCoverage" | "transferDutyCoverage"): string {
  return AU_STATE_TAX_CATALOGUE.find((entry) => entry.state === state)?.[kind] ?? "NOT_MODELLED";
}

function currentPropertyTaxYear(fund: Fund, now: Date): number {
  if (fund.market === "SG") return now.getFullYear();
  return yearOf(fund.periodEnd);
}

function tryCalc<T>(fn: () => T): Modelled<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Not modelled" };
  }
}

function landTaxGroups(data: AppData, fund: Fund, assessmentYear: number): Map<string, ComputeLandTaxResult> {
  const groups = new Map<string, Array<{ property: Property; profile: PropertyTaxProfile }>>();
  for (const property of propertiesOf(data, fund.id)) {
    const profile = profileFor(data, property.id);
    if (!profile?.auState || profile.auLandValue === null || profile.auOwnerKind === null) continue;
    const key = `${profile.auState}|${profile.auOwnerKind}|${profile.auOwnerForeign}|${profile.auOwnerAbsentee}|${profile.auTrustSurchargeApplies}`;
    groups.set(key, [...(groups.get(key) ?? []), { property, profile }]);
  }
  const results = new Map<string, ComputeLandTaxResult>();
  for (const entries of groups.values()) {
    const first = entries[0]!;
    if (coverage(first.profile.auState!, "landTaxCoverage") === "NOT_MODELLED") continue;
    const computed = tryCalc(() =>
      computeLandTax({
        state: first.profile.auState!,
        assessmentYear,
        holdings: entries.map(({ property, profile }) => ({
          id: property.id,
          taxableLandValue: profile.auLandValue ?? 0,
          residential: profile.auResidential,
          residentialShareBps: profile.auResidentialShareBps ?? undefined,
          metropolitanRegion: profile.auState === "WA" ? profile.auMetropolitanRegion ?? true : undefined,
        })),
        owner: {
          kind: first.profile.auOwnerKind!,
          foreign: first.profile.auOwnerForeign,
          absentee: first.profile.auOwnerAbsentee,
          trustSurchargeApplies: first.profile.auTrustSurchargeApplies,
        },
      }),
    );
    if (!computed.ok) continue;
    for (const property of computed.value.properties) results.set(property.id, computed.value);
  }
  return results;
}

function auAnnualRows(data: AppData, fund: Fund, year: number): AnnualTaxRow[] {
  const grouped = landTaxGroups(data, fund, year);
  return propertiesOf(data, fund.id).map((property) => {
    const profile = profileFor(data, property.id);
    const state = profile?.auState ?? null;
    if (!profile || profile.auLandValue === null || !state || profile.auOwnerKind === null) {
      const period = annualPeriod(fund, year);
      return {
        propertyId: property.id,
        propertyName: property.name,
        location: property.location,
        stateOrUsage: stateLabel(state),
        value: profile?.auLandValue ?? null,
        valueLabel: "Taxable land value missing",
        basis: "Profile needs taxable land value, state and owner kind.",
        basisTitle: "Profile incomplete",
        tax: 0,
        surcharge: 0,
        total: 0,
        ...assessmentFields(fund, period, 0, null, profile ?? null),
        paid: false,
        payments: [],
        status: "missing-data",
        notes: ["Enter taxable land value and owner settings before using this result."],
        ruleIds: [],
      };
    }
    if (coverage(state, "landTaxCoverage") === "NOT_MODELLED") {
      const period = annualPeriod(fund, year);
      return {
        propertyId: property.id,
        propertyName: property.name,
        location: property.location,
        stateOrUsage: stateLabel(state),
        value: profile.auLandValue,
        valueLabel: money(profile.auLandValue, fund.currency),
        basis: `${stateLabel(state)} land tax is not modelled in this app yet; work it out separately.`,
        basisTitle: "State not modelled",
        tax: 0,
        surcharge: 0,
        total: 0,
        ...assessmentFields(fund, period, 0, null, profile),
        dueLabel: noticeFor(profile, period) ? dateLabel(noticeFor(profile, period)!.dueDate) : `Assessment year ${year}; payment date not modelled`,
        paid: false,
        payments: [],
        status: "not-modelled",
        notes: ["No number is shown because the engine has no verified schedule for this state."],
        ruleIds: [],
      };
    }
    const result = grouped.get(property.id);
    const allocation = result?.properties.find((entry) => entry.id === property.id);
    if (!result || !allocation) {
      const period = annualPeriod(fund, year);
      return {
        propertyId: property.id,
        propertyName: property.name,
        location: property.location,
        stateOrUsage: stateLabel(state),
        value: profile.auLandValue,
        valueLabel: money(profile.auLandValue, fund.currency),
        basis: `${stateLabel(state)} land tax could not be computed from the supplied profile.`,
        basisTitle: "Land tax not modelled for this profile",
        tax: 0,
        surcharge: 0,
        total: 0,
        ...assessmentFields(fund, period, 0, null, profile),
        dueLabel: noticeFor(profile, period) ? dateLabel(noticeFor(profile, period)!.dueDate) : `Assessment year ${year}; payment date not modelled`,
        paid: false,
        payments: [],
        status: "not-modelled",
        notes: ["Review profile fields against the engine-supported cases."],
        ruleIds: [],
      };
    }
    const period = annualPeriod(fund, result.assessmentYear);
    const estimatedDueDate = `${result.assessmentYear}-09-30`;
    const ruleIds = result.ruleVersion.split("+");
    const mritBasis = state === "WA" ? (profile.auMetropolitanRegion === false ? " No MRIT: outside the metropolitan region." : " Includes MRIT: Perth metropolitan region.") : "";
    const assessment = assessmentFields(fund, period, allocation.totalTax, estimatedDueDate, profile);
    const varianceNote = assessment.assessedVariance !== null && Math.abs(assessment.assessedVariance) > 100 ? [`Assessed differs from modelled by ${money(Math.abs(assessment.assessedVariance), fund.currency)}.`] : [];
    return {
      propertyId: property.id,
      propertyName: property.name,
      location: property.location,
      stateOrUsage: stateLabel(state),
      value: profile.auLandValue,
      valueLabel: money(profile.auLandValue, fund.currency),
      basis: `Owner-level liability apportioned by taxable land value.${mritBasis}`,
      basisTitle: titleFor(ruleIds, "Land tax"),
      tax: allocation.apportionedGeneralTax,
      surcharge: allocation.apportionedSurchargeTax,
      total: allocation.totalTax,
      ...assessment,
      paid: paid(profile, "annual-tax", period),
      payments: paymentsFor(profile, "annual-tax", period),
      status: "modelled",
      notes: [...varianceNote, ...result.notes, AU_LAND_TAX_ASSUMPTION],
      ruleIds,
    };
  });
}

function sgAnnualRows(data: AppData, fund: Fund, year: number): AnnualTaxRow[] {
  return propertiesOf(data, fund.id).map((property) => {
    const profile = profileFor(data, property.id);
    if (!profile || profile.sgAnnualValue === null || profile.sgUsage === null) {
      const period = annualPeriod(fund, year);
      return {
        propertyId: property.id,
        propertyName: property.name,
        location: property.location,
        stateOrUsage: "Usage not set",
        value: null,
        valueLabel: "Annual value missing",
        basis: "Profile needs annual value and usage.",
        basisTitle: "Profile incomplete",
        tax: 0,
        surcharge: 0,
        total: 0,
        ...assessmentFields(fund, period, 0, null, profile ?? null),
        paid: false,
        payments: [],
        status: "missing-data",
        notes: ["Enter annual value and usage before using this result."],
        ruleIds: [],
      };
    }
    const usage = profile.sgOwnerOccupied && profile.sgUsage === "NON_OWNER_OCCUPIED_RESIDENTIAL" ? "OWNER_OCCUPIED_RESIDENTIAL" : profile.sgUsage;
    const result = computePropertyTax({
      year,
      notice: { kind: "ANNUAL_BILL", noticeDate: toISO(year, 1, 1) },
      segments: [{ id: property.id, from: toISO(year, 1, 1), to: toISO(year, 12, 31), annualValue: profile.sgAnnualValue, usage, residentialType: usage === "OWNER_OCCUPIED_RESIDENTIAL" ? "PRIVATE" : undefined }],
    });
    const period = annualPeriod(fund, year);
    const estimatedDueDate = result.deadlines.paymentDueDate ?? null;
    const ruleIds = result.ruleVersion.split("+");
    const assessment = assessmentFields(fund, period, result.netTax, estimatedDueDate, profile);
    const varianceNote = assessment.assessedVariance !== null && Math.abs(assessment.assessedVariance) > 100 ? [`Assessed differs from modelled by ${money(Math.abs(assessment.assessedVariance), fund.currency)}.`] : [];
    return {
      propertyId: property.id,
      propertyName: property.name,
      location: property.location,
      stateOrUsage: usageLabel(profile.sgUsage),
      value: profile.sgAnnualValue,
      valueLabel: money(profile.sgAnnualValue, fund.currency),
      basis: "Computed from annual value and property use.",
      basisTitle: titleFor(ruleIds, "Property tax rates"),
      tax: result.grossTax,
      surcharge: -result.rebate,
      total: result.netTax,
      ...assessment,
      dueLabel: assessment.dueLabel === "Not calculated" ? "No payment date" : assessment.dueLabel,
      paid: paid(profile, "annual-tax", period),
      payments: paymentsFor(profile, "annual-tax", period),
      status: "modelled",
      notes: [...varianceNote, ...result.notes],
      ruleIds,
    };
  });
}

function annualCsv(fund: Fund, rows: AnnualTaxRow[]): CsvModel {
  return {
    fileName: `${slug(fund.name)}-property-tax.csv`,
    columns: ["Property", "Location", fund.market === "AU" ? "State" : "Usage", "Tax base", "Basis", "Tax", surchargeColumnLabel(fund.market), "Total", "Assessed", "Due", "Status"],
    rows: rows.map((row) => [row.propertyName, row.location, row.stateOrUsage, row.value === null ? "" : row.value / 100, row.status === "modelled" ? `${row.basisTitle} (${row.ruleIds.join("; ")})` : row.basis, row.status === "modelled" ? row.tax / 100 : "Not modelled", row.status === "modelled" ? row.surcharge / 100 : "Not modelled", row.status === "modelled" ? row.total / 100 : "Not modelled", row.assessedAmount === null ? "" : row.assessedAmount / 100, row.dueLabel, row.paid ? "Paid" : row.status]),
  };
}

function annualDoc(fund: Fund, rows: AnnualTaxRow[], totals: PropertyTaxView["totals"]): DocModel {
  return {
    fileName: `${slug(fund.name)}-property-tax-summary.pdf`,
    title: "Property tax summary",
    subtitle: fund.name,
    meta: [{ label: "Period", value: fund.periodLabel }],
    blocks: [
      { kind: "paragraph", text: "Demonstration working paper. Rates and thresholds come from the cited rules; states that are not modelled are shown without guessed amounts.", tone: "note" },
      {
        kind: "table",
        title: "Annual property taxes",
        columns: [
          { key: "property", label: "Property" },
          { key: "basis", label: "Basis" },
          { key: "tax", label: "Tax", align: "right" },
          { key: "surcharge", label: surchargeColumnLabel(fund.market), align: "right" },
          { key: "total", label: "Total", align: "right" },
          { key: "assessed", label: "Assessed", align: "right" },
        ],
        rows: rows.map((row) => ({ property: row.propertyName, basis: row.status === "modelled" ? row.basisTitle : row.basis, tax: row.status === "modelled" ? money(row.tax, fund.currency) : "Not modelled", surcharge: row.status === "modelled" ? money(row.surcharge, fund.currency) : "Not modelled", total: row.status === "modelled" ? money(row.total, fund.currency) : "Not modelled", assessed: row.assessedAmount === null ? "No notice" : money(row.assessedAmount, fund.currency) })),
        totalRow: { property: "Total", basis: "", tax: money(totals.tax, fund.currency), surcharge: money(totals.surcharge, fund.currency), total: money(totals.total, fund.currency), assessed: "" },
      },
    ],
    footnotes: Array.from(new Set(rows.flatMap((row) => row.notes))).slice(0, 8),
  };
}

export function propertyTaxView(data: AppData, fundId: FundId, ctx: { now: Date }): PropertyTaxView {
  const fund = fundOf(data, fundId);
  const year = currentPropertyTaxYear(fund, ctx.now);
  const rows = fund.market === "AU" ? auAnnualRows(data, fund, year) : sgAnnualRows(data, fund, year);
  const modelled = rows.filter((row) => row.status === "modelled");
  const totals = {
    tax: modelled.reduce((sum, row) => sum + row.tax, 0),
    surcharge: modelled.reduce((sum, row) => sum + row.surcharge, 0),
    total: modelled.reduce((sum, row) => sum + row.total, 0),
  };
  const kpis: PtaxKpis = { annualTax: totals.total, dutyPaid: 0, needsData: rows.filter((row) => row.status !== "modelled").length, dutyModelled: 0, dutyTotal: 0, dutyNotModelled: 0 };
  return { fundId, market: fund.market, title: fund.market === "AU" ? "Annual land tax" : "Annual property tax", rows, totals, kpis, csv: annualCsv(fund, rows), doc: annualDoc(fund, rows, totals) };
}

function auDutyRow(fund: Fund, property: Property, profile: PropertyTaxProfile): DutyRow {
  if (!profile.auState || !profile.auPropertyKind || !profile.auPurchaserKind) {
    return missingDutyRow(property, profile, "Profile needs state, property kind and purchaser kind.");
  }
  if (coverage(profile.auState, "transferDutyCoverage") === "NOT_MODELLED") {
    return notModelledDutyRow(property, profile, `${stateLabel(profile.auState)} transfer duty is not modelled in this app yet; work it out separately.`);
  }
  const result = tryCalc(() =>
    computeTransferDuty({
      state: profile.auState!,
      contractDate: profile.purchaseDate,
      dutiableValue: profile.purchasePrice,
      propertyKind: profile.auPropertyKind!,
      residentialShareBps: profile.auResidentialShareBps ?? undefined,
      purchaser: { kind: profile.auPurchaserKind!, foreignPerson: profile.auForeignPurchaser, trustWithForeignBeneficiaries: profile.auForeignPurchaser },
    }),
  );
  if (!result.ok) return notModelledDutyRow(property, profile, readableDutyReason(result.reason, profile.auState, profile.purchaseDate));
  return {
    propertyId: property.id,
    propertyName: property.name,
    location: property.location,
    purchaseDate: profile.purchaseDate,
    purchasePrice: profile.purchasePrice,
    basis: "Computed on the dutiable value for an investor/commercial trust purchaser.",
    basisTitle: titleFor(result.value.ruleVersion.split("+"), "Transfer duty"),
    baseDuty: result.value.baseDuty,
    surchargeDuty: result.value.foreignSurchargeDuty,
    ssdDuty: 0,
    totalDuty: result.value.totalDuty,
    deadline: null,
    deadlineLabel: "Payment deadline not modelled",
    paid: paid(profile, "duty", dutyPeriod(profile)),
    payments: paymentsFor(profile, "duty", dutyPeriod(profile)),
    status: "modelled",
    notes: [...result.value.notes, ...result.value.findings.map((finding) => finding.message)],
    ruleIds: result.value.ruleVersion.split("+"),
  };
}

/** The engine's "no rate table for this date" error, in words for the page: the rates in force at the contract date are not in the app. */
function readableDutyReason(reason: string, state: AuState, contractDate: string): string {
  if (!/^No rule data for /.test(reason)) return reason;
  return `${stateLabel(state)} transfer duty rates for a contract dated ${dateLabel(contractDate)} are not in the app (only later contracts are modelled); work it out separately.`;
}

function missingDutyRow(property: Property, profile: PropertyTaxProfile, reason: string): DutyRow {
  return {
    propertyId: property.id,
    propertyName: property.name,
    location: property.location,
    purchaseDate: profile.purchaseDate,
    purchasePrice: profile.purchasePrice,
    basis: reason,
    basisTitle: "Not modelled",
    baseDuty: 0,
    surchargeDuty: 0,
    ssdDuty: 0,
    totalDuty: 0,
    deadline: null,
    deadlineLabel: "Not calculated",
    paid: false,
    payments: [],
    status: "missing-data",
    notes: [reason],
    ruleIds: [],
  };
}

function notModelledDutyRow(property: Property, profile: PropertyTaxProfile, reason: string): DutyRow {
  return { ...missingDutyRow(property, profile, reason), status: "not-modelled", deadlineLabel: "Not modelled" };
}

function sgDutyRow(property: Property, profile: PropertyTaxProfile): DutyRow {
  if (!profile.sgStampPropertyKind) return missingDutyRow(property, profile, "Profile needs a Singapore stamp duty property kind.");
  const duties = computeAcquisitionDuties({
    purchaseDate: profile.purchaseDate,
    purchasePrice: profile.purchasePrice,
    marketValue: profile.purchasePrice,
    propertyKind: profile.sgStampPropertyKind,
    absd: profile.sgAbsdBuyerKind
      ? { buyers: [{ kind: profile.sgAbsdBuyerKind, residentialPropertyCountBeforePurchase: profile.sgResidentialPropertyCountBeforePurchase ?? undefined }] }
      : undefined,
    execution: { executionDate: profile.purchaseDate, executedInSingapore: profile.sgExecutedInSingapore },
  });
  let ssdDuty = 0;
  let ssdRule = "";
  if (profile.disposalDate && profile.disposalPrice && (profile.sgStampPropertyKind === "RESIDENTIAL" || profile.sgStampPropertyKind === "NON_RESIDENTIAL")) {
    const ssd = tryCalc(() =>
      computeSsd({
        acquisitionDate: profile.purchaseDate,
        disposalDate: profile.disposalDate!,
        sellingPrice: profile.disposalPrice!,
        marketValue: profile.disposalPrice!,
        propertyKind: profile.sgStampPropertyKind === "RESIDENTIAL" ? "RESIDENTIAL" : "INDUSTRIAL",
      }),
    );
    if (ssd.ok) {
      ssdDuty = ssd.value.duty;
      ssdRule = ssd.value.ruleVersion;
    }
  }
  const ruleIds = [duties.bsd.ruleVersion, duties.absd?.ruleVersion, ssdRule].filter(Boolean) as string[];
  const period = dutyPeriod(profile);
  return {
    propertyId: property.id,
    propertyName: property.name,
    location: property.location,
    purchaseDate: profile.purchaseDate,
    purchasePrice: profile.purchasePrice,
    basis: "BSD is computed on the higher of consideration and market value; ABSD applies only where the profile selects a buyer kind.",
    basisTitle: titleFor(ruleIds, "Singapore acquisition duties"),
    baseDuty: duties.bsd.duty,
    surchargeDuty: duties.absd?.netDuty ?? 0,
    ssdDuty,
    totalDuty: duties.totalNetDuty + ssdDuty,
    deadline: duties.paymentDeadline?.dueDate ?? null,
    deadlineLabel: duties.paymentDeadline ? dateLabel(duties.paymentDeadline.dueDate) : "No stamping deadline",
    paid: paid(profile, "duty", period),
    payments: paymentsFor(profile, "duty", period),
    status: "modelled",
    notes: [...duties.notes, ...duties.findings.map((finding) => finding.message)],
    ruleIds,
  };
}

function dutyRows(data: AppData, fund: Fund): DutyRow[] {
  return propertiesOf(data, fund.id).map((property) => {
    const profile = profileFor(data, property.id);
    if (!profile) return missingDutyRow(property, { purchaseDate: property.acquired, purchasePrice: property.cost } as PropertyTaxProfile, "Profile missing.");
    return fund.market === "AU" ? auDutyRow(fund, property, profile) : sgDutyRow(property, profile);
  });
}

function dutiesCsv(fund: Fund, rows: DutyRow[]): CsvModel {
  return {
    fileName: `${slug(fund.name)}-acquisition-duties.csv`,
    columns: ["Property", "Location", "Purchase date", "Price", "Basis", "Duty", "Surcharge / ABSD", "SSD", "Total", "Deadline", "Status"],
    rows: rows.map((row) => [row.propertyName, row.location, row.purchaseDate, row.purchasePrice / 100, row.status === "modelled" ? `${row.basisTitle} (${row.ruleIds.join("; ")})` : row.basis, row.status === "modelled" ? row.baseDuty / 100 : "Not modelled", row.status === "modelled" ? row.surchargeDuty / 100 : "Not modelled", row.status === "modelled" ? row.ssdDuty / 100 : "Not modelled", row.status === "modelled" ? row.totalDuty / 100 : "Not modelled", row.deadlineLabel, row.paid ? "Paid" : row.status]),
  };
}

function dutiesDoc(fund: Fund, rows: DutyRow[], totals: DutiesView["totals"]): DocModel {
  return {
    fileName: `${slug(fund.name)}-acquisition-duties.pdf`,
    title: "Duties on acquisition",
    subtitle: fund.name,
    blocks: [
      {
        kind: "table",
        title: "Acquisition duties",
        columns: [
          { key: "property", label: "Property" },
          { key: "date", label: "Date" },
          { key: "basis", label: "Basis" },
          { key: "duty", label: "Duty", align: "right" },
          { key: "surcharge", label: "Surcharge / ABSD", align: "right" },
          { key: "ssd", label: "SSD", align: "right" },
          { key: "total", label: "Total", align: "right" },
        ],
        rows: rows.map((row) => ({ property: row.propertyName, date: dateLabel(row.purchaseDate), basis: row.status === "modelled" ? row.basisTitle : row.basis, duty: row.status === "modelled" ? money(row.baseDuty, fund.currency) : "Not modelled", surcharge: row.status === "modelled" ? money(row.surchargeDuty, fund.currency) : "Not modelled", ssd: row.status === "modelled" ? money(row.ssdDuty, fund.currency) : "Not modelled", total: row.status === "modelled" ? money(row.totalDuty, fund.currency) : "Not modelled" })),
        totalRow: { property: "Total", date: "", basis: "", duty: money(totals.baseDuty, fund.currency), surcharge: money(totals.surchargeDuty, fund.currency), ssd: money(totals.ssdDuty, fund.currency), total: money(totals.totalDuty, fund.currency) },
      },
    ],
    footnotes: Array.from(new Set(rows.flatMap((row) => row.notes))).slice(0, 8),
  };
}

export function dutiesView(data: AppData, fundId: FundId, _ctx: { now: Date }): DutiesView {
  const fund = fundOf(data, fundId);
  const rows = dutyRows(data, fund);
  const modelled = rows.filter((row) => row.status === "modelled");
  const totals = {
    baseDuty: modelled.reduce((sum, row) => sum + row.baseDuty, 0),
    surchargeDuty: modelled.reduce((sum, row) => sum + row.surchargeDuty, 0),
    ssdDuty: modelled.reduce((sum, row) => sum + row.ssdDuty, 0),
    totalDuty: modelled.reduce((sum, row) => sum + row.totalDuty, 0),
  };
  return { fundId, market: fund.market, title: "Duties on acquisition", rows, totals, csv: dutiesCsv(fund, rows), doc: dutiesDoc(fund, rows, totals) };
}

export function propertyTaxKpis(data: AppData, fundId: FundId, ctx: { now: Date }): PtaxKpis {
  const annual = propertyTaxView(data, fundId, ctx);
  const duties = dutiesView(data, fundId, ctx);
  return {
    annualTax: annual.totals.total,
    dutyPaid: duties.totals.totalDuty,
    needsData: annual.rows.filter((row) => row.status !== "modelled").length + duties.rows.filter((row) => row.status !== "modelled").length,
    dutyModelled: duties.rows.filter((row) => row.status === "modelled").length,
    dutyTotal: duties.rows.length,
    dutyNotModelled: duties.rows.filter((row) => row.status !== "modelled").length,
  };
}

export function profileRows(data: AppData, fundId: FundId): Array<{ property: Property; profile: PropertyTaxProfile | null }> {
  return propertiesOf(data, fundId).map((property) => ({ property, profile: profileFor(data, property.id) ?? null }));
}

export function futureDutyDeadlineRows(data: AppData, fund: Fund, now: Date): Array<{ date: string; obligation: string }> {
  if (fund.market !== "SG") return [];
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return propertiesOf(data, fund.id)
    .map((property) => {
      const profile = profileFor(data, property.id);
      if (!profile?.sgExecutedInSingapore) return null;
      const dueDate = stampDutyDeadline({ executionDate: profile.purchaseDate, executedInSingapore: true }).dueDate;
      return dueDate >= today && !paid(profile, "duty", dutyPeriod(profile)) ? { date: dueDate, obligation: `Stamp duty — ${property.name}` } : null;
    })
    .filter((row): row is { date: string; obligation: string } => row !== null);
}

export function missedDutyDeadlineRows(data: AppData, fund: Fund, now: Date): Array<{ property: Property; dueDate: string }> {
  if (fund.market !== "SG") return [];
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return propertiesOf(data, fund.id)
    .map((property) => {
      const profile = profileFor(data, property.id);
      if (!profile?.sgExecutedInSingapore) return null;
      const dueDate = addDays(profile.purchaseDate, 14);
      return dueDate < today && !paid(profile, "duty", dutyPeriod(profile)) ? { property, dueDate } : null;
    })
    .filter((row): row is { property: Property; dueDate: string } => row !== null);
}

export { TAX_WORKSPACE };
