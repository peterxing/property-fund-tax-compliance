import { dateLabel, money, pct } from "../../../domain/format.ts";
import type { Cents, Currency } from "../../../domain/types.ts";
import type { AnnualTaxRow, DutyRow, PropertyTaxProfile } from "../../../domain/ptax/types.ts";

export type PtaxTab = "annual" | "duties" | "profiles";

export const PTAX_TABS: readonly { id: PtaxTab; label: string }[] = [
  { id: "annual", label: "Annual taxes" },
  { id: "duties", label: "Duties on acquisition" },
  { id: "profiles", label: "Profiles" },
];

export function ptaxTabFromParam(value: string): PtaxTab {
  return PTAX_TABS.some((tab) => tab.id === value) ? (value as PtaxTab) : "annual";
}

export function amountText(amount: Cents, currency: Currency): string {
  return amount === 0 ? "Nil" : money(amount, currency);
}

export function rowAmountText(status: AnnualTaxRow["status"] | DutyRow["status"], amount: Cents, currency: Currency): string {
  return status === "modelled" ? amountText(amount, currency) : "Not modelled";
}

export function valueText(value: Cents | null, currency: Currency): string {
  return value === null ? "Not set" : money(value, currency);
}

export function basisText(row: Pick<AnnualTaxRow | DutyRow, "basis" | "ruleIds">): string {
  return row.ruleIds.length > 0 ? `${row.basis} (${row.ruleIds.join(", ")})` : row.basis;
}

export function statusText(status: AnnualTaxRow["status"] | DutyRow["status"]): string {
  if (status === "modelled") return "Modelled";
  if (status === "missing-data") return "Needs data";
  return "Not modelled";
}

export function statusTone(status: AnnualTaxRow["status"] | DutyRow["status"]): "good" | "warn" | "bad" {
  if (status === "modelled") return "good";
  if (status === "missing-data") return "bad";
  return "warn";
}

export function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function bpsPct(value: number | null): string {
  return value === null ? "Not set" : pct(value / 100, 2);
}

export function profileSummary(profile: PropertyTaxProfile, currency: Currency): string {
  if (profile.auState) return `${profile.auState} · land value ${valueText(profile.auLandValue, currency)} · ${profile.auOwnerKind ?? "owner not set"}`;
  return `${profile.sgUsage ?? "usage not set"} · annual value ${valueText(profile.sgAnnualValue, currency)}`;
}

export function deadlineText(date: string | null, fallback: string): string {
  return date ? dateLabel(date) : fallback;
}
