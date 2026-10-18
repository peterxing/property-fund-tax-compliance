// OWNER: Governance agent (F8: versions, manual adjustments, prior-year view). Fictional demo records for the nine seeded funds (integer cents). Must pass ./schema.ts.
import type { AppData, AuditEntry, Ctx, Fund } from "../types.ts";
import { buildCalcVersion } from "./versions.ts";
import type { CalcVersion, CalcVersionTrigger, ManualAdjustment } from "./types.ts";

export const SEED_VERSIONS: readonly CalcVersion[] = [];
export const SEED_MANUAL_ADJUSTMENTS: readonly ManualAdjustment[] = [];

function localDateTime(value: string): Date {
  const [date = "", time = ""] = value.split("T");
  const [year = "0", month = "1", day = "1"] = date.split("-");
  const [hour = "0", minute = "0", second = "0"] = time.split(":");
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

function audit(data: AppData, fund: Fund, action: string): AuditEntry | null {
  return data.audit
    .filter((entry) => entry.fundId === fund.id && entry.action === action)
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1) ?? null;
}

function appendSeedVersion(data: AppData, fund: Fund, entry: AuditEntry, trigger: CalcVersionTrigger, label: string): AppData {
  const ctx: Ctx = {
    now: localDateTime(entry.at),
    user: { id: `seed-${entry.actor}`, name: entry.actor, title: "Seed actor", organisation: "Seed", role: "finance", funds: "all" },
  };
  return { ...data, versions: [...data.versions, buildCalcVersion(data, fund, ctx, trigger, label, null)] };
}

export function buildSeedVersions(base: AppData): CalcVersion[] {
  let data: AppData = { ...base, versions: [] };
  for (const fund of data.funds) {
    if (fund.status !== "In review" && fund.status !== "Signed off") continue;
    const submitted = audit(data, fund, "Submitted for review");
    if (submitted) data = appendSeedVersion(data, fund, submitted, "submit", "Submitted for review");
    if (fund.status === "Signed off") {
      const signed = audit(data, fund, "Signed off");
      if (signed) data = appendSeedVersion(data, fund, signed, "sign-off", "Signed off");
    }
  }
  return data.versions;
}
