import type { RuleConfidence, RuleRegisterRow } from "../../../domain/portfolio/index.ts";
import { fundCalc, tbView } from "../../../domain/index.ts";
import { GOVERNANCE } from "../../../domain/permissions.ts";
import { money, pct, slug } from "../../../domain/format.ts";
import type { AppData, AuExpenseAllocation, CsvModel, Ctx, Fund } from "../../../domain/types.ts";
import type { PropertyTaxProfile } from "../../../domain/ptax/types.ts";

/** Where each calculation is documented for reviewers (docs/rules in the public repository). */
export const REVIEWER_DOCS_URL = "https://github.com/peterxing/property-fund-tax-compliance/blob/main/docs/rules/README.md";

export const CONFIDENCE_LABEL: Record<RuleConfidence, string> = {
  VERIFIED: "Verified",
  VERIFIED_SECONDARY: "Verified secondary",
  ASSUMPTION: "Assumption",
};

export const CONFIDENCE_TONE: Record<RuleConfidence, "good" | "info" | "warn"> = {
  VERIFIED: "good",
  VERIFIED_SECONDARY: "info",
  ASSUMPTION: "warn",
};

export function effectiveLabel(row: RuleRegisterRow): string {
  const from = row.effectiveFrom || "start not stated";
  const to = row.effectiveTo || "current";
  return `${from} to ${to}`;
}

export function ruleParam(row: RuleRegisterRow): string {
  return row.registryKey;
}

export interface FundSettingsRow {
  fundId: string;
  fund: string;
  market: string;
  status: string;
  governance: string;
  distributionPolicy: string;
  expenseAllocation: string;
  unmappedAccounts: number;
  manualAdjustments: number;
  withholding: string;
  landTaxTrustTreatment: string;
  links: {
    distribution: string;
    trialBalance: string;
    withholding: string;
    propertyTaxes: string;
    access: string;
  };
}

export interface FundSettingsView {
  rows: FundSettingsRow[];
  csv: CsvModel;
}

const OWNER_KIND_LABEL: Record<string, string> = {
  INDIVIDUAL: "Individual",
  COMPANY: "Company",
  TRUST: "Trust",
  SPECIAL_TRUST: "Special trust",
};

function expenseAllocationLabel(allocation: AuExpenseAllocation | undefined): string {
  const policy = allocation ?? { method: "pro-rata" };
  if (policy.method === "pro-rata") return "Pro-rata by gross rent";
  if (policy.method === "other-income") return "All deductions against Australian income — other";
  return `Custom · other ${pct(policy.sharesBps.other / 100, 2)}; NCMI ${pct(policy.sharesBps.ncmi / 100, 2)}; transitional ${pct(policy.sharesBps.transitional / 100, 2)}; clean building ${pct(policy.sharesBps.clean / 100, 2)}`;
}

function payoutPolicy(fund: Fund): string {
  if (fund.market === "AU") return `Cash distribution ${money(fund.inputs.cashDistribution, fund.currency)}`;
  if (fund.inputs.taxableSpecifiedIncome === 0) return `Taxable payout ${money(fund.inputs.taxableDistributed, fund.currency)}`;
  return `Taxable payout ${pct((fund.inputs.taxableDistributed / fund.inputs.taxableSpecifiedIncome) * 100, 1)} (${money(fund.inputs.taxableDistributed, fund.currency)})`;
}

function withholdingText(data: AppData, fund: Fund, ctx: Ctx): string {
  const recon = fundCalc(data, fund.id, ctx.now).recon;
  const remitted = recon.remitted === null ? "not remitted" : money(recon.remitted, fund.currency);
  const computed = money(recon.computed, fund.currency);
  const variance = recon.variance === null || recon.variance === 0 ? "" : ` · variance ${money(recon.variance, fund.currency)}`;
  return `${remitted} remitted vs ${computed} computed${variance}`;
}

function ownerSummary(profile: PropertyTaxProfile): string | null {
  if (!profile.auState || !profile.auOwnerKind) return null;
  const owner = OWNER_KIND_LABEL[profile.auOwnerKind] ?? profile.auOwnerKind;
  const trust = profile.auOwnerKind === "TRUST" || profile.auOwnerKind === "SPECIAL_TRUST";
  const surcharge = trust ? (profile.auTrustSurchargeApplies ? "trust rates apply" : "general rates") : null;
  const foreign = profile.auOwnerForeign ? "foreign owner" : null;
  const absentee = profile.auOwnerAbsentee ? "absentee" : null;
  return [profile.auState, owner, surcharge, foreign, absentee].filter(Boolean).join(" · ");
}

function landTaxTrustTreatment(data: AppData, fund: Fund): string {
  if (fund.market !== "AU") return "Not applicable";
  const summaries = [...new Set(data.propertyProfiles.filter((profile) => profile.fundId === fund.id).map(ownerSummary).filter((text): text is string => Boolean(text)))];
  if (summaries.length === 0) return "Not set";
  return summaries.join("; ");
}

function route(path: string, fundId: string): string {
  const join = path.includes("?") ? "&" : "?";
  return `#${path}${join}fund=${encodeURIComponent(fundId)}`;
}

export function fundSettingsView(data: AppData, funds: readonly Fund[], ctx: Ctx): FundSettingsView {
  const rows: FundSettingsRow[] = funds.map((fund) => {
    const tb = tbView(data, fund.id, ctx.now);
    return {
      fundId: fund.id,
      fund: fund.name,
      market: fund.market === "AU" ? "Australia" : "Singapore",
      status: fund.status,
      governance: GOVERNANCE[fund.governance].label,
      distributionPolicy: payoutPolicy(fund),
      expenseAllocation: fund.market === "AU" ? expenseAllocationLabel(fund.expenseAllocation) : "Not applicable",
      unmappedAccounts: tb.rows.filter((row) => row.category === "unmapped").length,
      manualAdjustments: data.manualAdjustments.filter((adjustment) => adjustment.fundId === fund.id).length,
      withholding: withholdingText(data, fund, ctx),
      landTaxTrustTreatment: landTaxTrustTreatment(data, fund),
      links: {
        distribution: route("/", fund.id),
        trialBalance: route("/trial-balance", fund.id),
        withholding: route("/?tab=withholding", fund.id),
        propertyTaxes: route("/property-taxes?tab=profiles", fund.id),
        access: "#/access",
      },
    };
  });
  return {
    rows,
    csv: {
      fileName: `fund-settings-${slug(ctx.user.id)}.csv`,
      columns: ["Fund", "Market", "Workflow status", "Governance", "Distribution or payout", "Expense allocation", "Unmapped accounts", "Manual adjustments", "Withholding", "Land tax trust treatment"],
      rows: rows.map((row) => [row.fund, row.market, row.status, row.governance, row.distributionPolicy, row.expenseAllocation, row.unmappedAccounts, row.manualAdjustments, row.withholding, row.landTaxTrustTreatment]),
    },
  };
}
