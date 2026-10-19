import type { FixedAssetDraft } from "../../../domain/assets/index.ts";
import type { CsvModel, Currency, Fund, Property } from "../../../domain/types.ts";
import { money, slug } from "../../../domain/format.ts";
import { MAX_IMPORT_ROWS, MAX_NAME } from "../../../domain/core/validate.ts";
import { AU_DEPRECIABLE_ASSET_CLASSES } from "../../../engine/au/depreciation.ts";
import { CAPITAL_ALLOWANCE_REGIMES, CAPITAL_ASSET_CLASSES, type CapitalAllowanceRegime } from "../../../engine/capitalAllowances.ts";

export function registerStatus(comparisons: readonly { agrees: boolean; difference: number }[], currency: Currency): { tone: "good" | "warn"; text: string } {
  const difference = comparisons.reduce((sum, row) => sum + Math.abs(row.difference), 0);
  return difference === 0 ? { tone: "good", text: "Register agrees with the trial balance" } : { tone: "warn", text: `Register differs by ${money(difference, currency, 2)}` };
}

export function defaultAssetDraft(fund: Fund, properties: readonly Property[]): FixedAssetDraft {
  const propertyId = properties.find((p) => p.fundId === fund.id)?.id ?? null;
  if (fund.market === "AU") {
    return {
      kind: "AU_DIV40",
      propertyId,
      description: "New plant asset",
      cost: 0,
      startDate: fund.periodStart,
      assetClassId: "OTHER_PLANT",
      method: "PRIME_COST",
      effectiveLifeYears: 10,
    };
  }
  return {
    kind: "SG_PLANT",
    propertyId,
    description: "New plant asset",
    cost: 0,
    startDate: fund.periodStart,
    assetClassId: "P_AND_M_GENERAL",
    regime: "S19A_3Y",
  };
}

export function csvTemplate(fund: Fund): CsvModel {
  return {
    fileName: `${slug(fund.name)}-asset-import-template.csv`,
    columns: ["kind", "propertyId", "description", "cost", "startDate", "assetClassId", "methodOrRegime", "effectiveLifeYears"],
    rows: [
      fund.market === "AU"
        ? ["AU_DIV40", "", "Example low-cost HVAC controller", 950, fund.periodStart, "HVAC_PACKAGED_UNIT", "LOW_VALUE_POOL", 15]
        : ["SG_PLANT", "", "Example lift works", 125000, fund.periodStart, "LIFTS_ESCALATORS_HVAC", "S19A_3Y", ""],
    ],
  };
}

export interface ImportPreview {
  assets: FixedAssetDraft[];
  errors: string[];
}

const AU_ASSET_CLASSES = new Set(AU_DEPRECIABLE_ASSET_CLASSES.map((row) => row.id));
const SG_ASSET_CLASSES = new Set(CAPITAL_ASSET_CLASSES.map((row) => row.id));
const SG_REGIMES = new Set(CAPITAL_ALLOWANCE_REGIMES.map((row) => row.id).filter((id) => !String(id).startsWith("S14N_")));

function cents(value: string): number | null {
  const clean = value.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

function isoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function positiveYears(value: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const years = Number(value);
  return Number.isFinite(years) && years > 0 && years <= 100 ? years : null;
}

function validateDescription(value: string, row: number, errors: string[]): string | null {
  const description = value.trim();
  if (description === "") {
    errors.push(`Row ${row}: description is required.`);
    return null;
  }
  if (description.length > MAX_NAME) {
    errors.push(`Row ${row}: description must be ${MAX_NAME} characters or fewer.`);
    return null;
  }
  return description;
}

function validateProperty(value: string, row: number, fund: Fund, properties: readonly Property[] | undefined, errors: string[]): string | null {
  if (value === "") return null;
  if (!properties) return value;
  if (!properties.some((property) => property.id === value && property.fundId === fund.id)) {
    errors.push(`Row ${row}: propertyId must belong to ${fund.name}.`);
    return null;
  }
  return value;
}

export function parseAssetCsv(text: string, fund: Fund, properties?: readonly Property[]): ImportPreview {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length <= 1) return { assets: [], errors: ["Paste a header row and at least one asset row."] };
  if (lines.length - 1 > MAX_IMPORT_ROWS) return { assets: [], errors: [`Import is limited to ${MAX_IMPORT_ROWS} asset rows.`] };
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const headerMap = new Map<string, number>();
  header.forEach((name, index) => {
    if (name && !headerMap.has(name)) headerMap.set(name, index);
  });
  const errors: string[] = [];
  const assets: FixedAssetDraft[] = [];
  lines.slice(1).forEach((line, rowIndex) => {
    const row = rowIndex + 2;
    const cols = line.split(",").map((c) => c.trim());
    const get = (name: string) => cols[headerMap.get(name.toLowerCase()) ?? -1] ?? "";
    const kind = get("kind");
    const cost = cents(get("cost"));
    const startDate = get("startDate") || fund.periodStart;
    if (cost === null || cost < 0) {
      errors.push(`Row ${row}: cost must be a positive amount.`);
      return;
    }
    if (!isoDate(startDate)) {
      errors.push(`Row ${row}: startDate must be a valid YYYY-MM-DD date.`);
      return;
    }
    const description = validateDescription(get("description") || `Imported asset ${rowIndex + 1}`, row, errors);
    const propertyId = validateProperty(get("propertyId"), row, fund, properties, errors);
    if (description === null) return;
    if (get("propertyId") && propertyId === null) return;
    if (fund.market === "AU" && kind === "AU_DIV40") {
      const assetClassId = get("assetClassId") || "OTHER_PLANT";
      if (!AU_ASSET_CLASSES.has(assetClassId)) {
        errors.push(`Row ${row}: assetClassId is not a recognised Division 40 class.`);
        return;
      }
      const methodOrRegime = get("methodOrRegime") || "PRIME_COST";
      if (methodOrRegime !== "DIMINISHING_VALUE" && methodOrRegime !== "PRIME_COST" && methodOrRegime !== "LOW_VALUE_POOL") {
        errors.push(`Row ${row}: methodOrRegime must be PRIME_COST, DIMINISHING_VALUE or LOW_VALUE_POOL.`);
        return;
      }
      const effectiveLifeYears = positiveYears(get("effectiveLifeYears") || "10");
      if (effectiveLifeYears === null) {
        errors.push(`Row ${row}: effectiveLifeYears must be positive.`);
        return;
      }
      assets.push({ kind, propertyId, description, cost, startDate, assetClassId, method: methodOrRegime === "DIMINISHING_VALUE" ? "DIMINISHING_VALUE" : "PRIME_COST", effectiveLifeYears, ...(methodOrRegime === "LOW_VALUE_POOL" ? { poolMethod: "LOW_VALUE_POOL" } : {}) });
    } else if (fund.market === "SG" && kind === "SG_PLANT") {
      const assetClassId = get("assetClassId") || "P_AND_M_GENERAL";
      if (!SG_ASSET_CLASSES.has(assetClassId)) {
        errors.push(`Row ${row}: assetClassId is not a recognised Singapore asset class.`);
        return;
      }
      const regime = get("methodOrRegime") || "S19A_3Y";
      if (!SG_REGIMES.has(regime)) {
        errors.push(`Row ${row}: methodOrRegime is not a recognised capital allowance regime.`);
        return;
      }
      assets.push({ kind, propertyId, description, cost, startDate, assetClassId, regime: regime as CapitalAllowanceRegime });
    } else if (fund.market === "SG" && kind === "SG_RR") {
      const mode = get("methodOrRegime") || "THREE_YEAR";
      if (mode !== "THREE_YEAR" && mode !== "ONE_YEAR") {
        errors.push(`Row ${row}: methodOrRegime must be THREE_YEAR or ONE_YEAR for section 14N R&R.`);
        return;
      }
      assets.push({ kind, propertyId, description, cost, startDate, claimMode: mode });
    } else {
      errors.push(`Row ${row}: kind is not valid for this fund.`);
      return;
    }
  });
  return { assets, errors };
}
