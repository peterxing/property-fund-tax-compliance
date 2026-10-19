// OWNER: Assets & allowances agent (F3). Pure reducers for asset actions.
import { AU_CAPITAL_WORKS_BUILDING_TYPES, type AuCapitalWorksBuildingType } from "../../engine/au/capitalWorks.ts";
import { AU_DEPRECIABLE_ASSET_CLASSES, computeDepreciation } from "../../engine/au/depreciation.ts";
import { CAPITAL_ALLOWANCE_REGIMES, CAPITAL_ASSET_CLASSES, type CapitalAllowanceRegime, type RrClaimMode } from "../../engine/capitalAllowances.ts";
import type { Action, ActionResult, AppData, Ctx, Fund } from "../types.ts";
import { can } from "../permissions.ts";
import { appendAudit } from "../core/audit.ts";
import { nextSequenceId } from "../core/ids.ts";
import { MAX_IMPORT_ROWS, MAX_NAME, MAX_STRING, isAmount, isISODate, isSafeInt } from "../core/validate.ts";
import { assetRegisterView } from "./index.ts";
import { fixedAsset } from "./schema.ts";
import type { AssetAction, FixedAsset, FixedAssetDraft } from "./types.ts";

export function isAssetAction(action: Action): action is AssetAction {
  return action.type.startsWith("asset-");
}

function fundOf(data: AppData, fundId: string): Fund | null {
  return data.funds.find((f) => f.id === fundId) ?? null;
}

function guardEdit(data: AppData, fundId: string, ctx: Ctx): { ok: true; fund: Fund } | { ok: false; reason: string } {
  const fund = fundOf(data, fundId);
  if (!fund) return { ok: false, reason: "Unknown fund." };
  if (!can(ctx.user, "edit", fund, fund.governance)) return { ok: false, reason: "View only for your role." };
  if (fund.status === "Signed off") return { ok: false, reason: "Signed off — reopen to edit." };
  if (fund.status === "In review") return { ok: false, reason: "In review — return to preparer to edit." };
  return { ok: true, fund };
}

const AU_ASSET_CLASSES = new Set(AU_DEPRECIABLE_ASSET_CLASSES.map((row) => row.id));
const DIV43_BUILDING_TYPES = new Set(AU_CAPITAL_WORKS_BUILDING_TYPES.map((row) => row.id));
const SG_ASSET_CLASSES = new Set(CAPITAL_ASSET_CLASSES.map((row) => row.id));
const SG_REGIMES = new Set(CAPITAL_ALLOWANCE_REGIMES.map((row) => row.id).filter((id) => !String(id).startsWith("S14N_")));
const RR_CLAIM_MODES = new Set(["THREE_YEAR", "ONE_YEAR"]);

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function textField(value: unknown, name: string, max = MAX_NAME): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof value !== "string" || value.trim() === "") return fail(`${name} is required.`);
  if (value.length > max) return fail(`${name} must be ${max} characters or fewer.`);
  return { ok: true, value };
}

function dateField(value: unknown, name: string): { ok: true; value: string } | { ok: false; reason: string } {
  return isISODate(value) ? { ok: true, value } : fail(`${name} must be a valid YYYY-MM-DD date.`);
}

function amountField(value: unknown, name: string): { ok: true; value: number } | { ok: false; reason: string } {
  return isAmount(value) ? { ok: true, value } : fail(`${name} must be a whole amount of zero or more cents.`);
}

function optionalAmount(value: unknown, name: string): { ok: true; value?: number } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true };
  const parsed = amountField(value, name);
  return parsed.ok ? { ok: true, value: parsed.value } : parsed;
}

function optionalDate(value: unknown, name: string): { ok: true; value?: string } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true };
  const parsed = dateField(value, name);
  return parsed.ok ? { ok: true, value: parsed.value } : parsed;
}

function optionalBps(value: unknown): { ok: true; value?: number } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true };
  return isSafeInt(value) && value >= 0 && value <= 10_000 ? { ok: true, value } : fail("Taxable use must be between 0 and 10,000 basis points.");
}

function positiveNumber(value: unknown, name: string): { ok: true; value?: number } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true };
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100 ? { ok: true, value } : fail(`${name} must be a positive number no more than 100.`);
}

function enumField<T extends string>(value: unknown, allowed: ReadonlySet<string>, name: string): { ok: true; value: T } | { ok: false; reason: string } {
  return typeof value === "string" && allowed.has(value) ? { ok: true, value: value as T } : fail(`${name} is not recognised.`);
}

function propertyIdField(data: AppData, fundId: string, value: unknown): { ok: true; value: string | null } | { ok: false; reason: string } {
  if (value === null || value === "" || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string" || value.length > MAX_NAME) return fail("Property must belong to the same fund as the asset.");
  return data.properties.some((p) => p.id === value && p.fundId === fundId) ? { ok: true, value } : fail("Property must belong to the same fund as the asset.");
}

function baseRecord(data: AppData, fund: Fund, id: string, draft: FixedAssetDraft): { ok: true; value: Omit<FixedAsset, "kind"> } | { ok: false; reason: string } {
  const propertyId = propertyIdField(data, fund.id, (draft as { propertyId?: unknown }).propertyId);
  if (!propertyId.ok) return propertyId;
  const description = textField((draft as { description?: unknown }).description, "Description");
  if (!description.ok) return description;
  const cost = amountField((draft as { cost?: unknown }).cost, "Cost");
  if (!cost.ok) return cost;
  const startDate = dateField((draft as { startDate?: unknown }).startDate, "Start date");
  if (!startDate.ok) return startDate;
  const disposalDate = optionalDate((draft as { disposalDate?: unknown }).disposalDate, "Disposal date");
  if (!disposalDate.ok) return disposalDate;
  if (disposalDate.value && disposalDate.value < startDate.value) return fail("Disposal date cannot be before the asset start date.");
  const disposalProceeds = optionalAmount((draft as { disposalProceeds?: unknown }).disposalProceeds, "Disposal proceeds");
  if (!disposalProceeds.ok) return disposalProceeds;
  const rawNotes = (draft as { notes?: unknown }).notes;
  if (rawNotes !== undefined && (typeof rawNotes !== "string" || rawNotes.length > MAX_STRING)) return fail("Notes are too long.");
  return {
    ok: true,
    value: {
      id,
      fundId: fund.id,
      propertyId: propertyId.value,
      description: description.value,
      cost: cost.value,
      startDate: startDate.value,
      ...(disposalDate.value ? { disposalDate: disposalDate.value } : {}),
      ...(disposalProceeds.value !== undefined ? { disposalProceeds: disposalProceeds.value } : {}),
      ...(rawNotes !== undefined ? { notes: rawNotes } : {}),
    } as Omit<FixedAsset, "kind">,
  };
}

function cleanAsset(data: AppData, fund: Fund, id: string, draft: FixedAssetDraft): { ok: true; asset: FixedAsset } | { ok: false; reason: string } {
  const base = baseRecord(data, fund, id, draft);
  if (!base.ok) return base;
  let asset: FixedAsset;
  if (draft.kind === "AU_DIV40" && fund.market === "AU") {
    const assetClass = enumField((draft as { assetClassId?: unknown }).assetClassId, AU_ASSET_CLASSES, "Division 40 asset class");
    if (!assetClass.ok) return assetClass;
    const method = enumField<"DIMINISHING_VALUE" | "PRIME_COST">((draft as { method?: unknown }).method, new Set(["DIMINISHING_VALUE", "PRIME_COST"]), "Depreciation method");
    if (!method.ok) return method;
    const life = positiveNumber((draft as { effectiveLifeYears?: unknown }).effectiveLifeYears, "Effective life");
    if (!life.ok) return life;
    const taxableUseBps = optionalBps((draft as { taxableUseBps?: unknown }).taxableUseBps);
    if (!taxableUseBps.ok) return taxableUseBps;
    const poolMethodValue = (draft as { poolMethod?: unknown }).poolMethod;
    if (poolMethodValue !== undefined && poolMethodValue !== "LOW_VALUE_POOL") return fail("Pool method is not recognised.");
    if (poolMethodValue === "LOW_VALUE_POOL") {
      const testAsset = { id, label: base.value.description, assetClassId: assetClass.value, cost: base.value.cost, startDate: base.value.startDate, method: method.value, ...(life.value !== undefined ? { effectiveLifeYears: life.value } : {}), ...(taxableUseBps.value !== undefined ? { taxableUseBps: taxableUseBps.value } : {}) };
      let opening = base.value.cost;
      try {
        opening = computeDepreciation({ incomeYear: Number(fund.periodEnd.slice(0, 4)), asset: testAsset }).line.openingAdjustableValue;
      } catch (error) {
        return fail(error instanceof Error ? error.message : "Low-value pool eligibility could not be checked.");
      }
      if (base.value.cost >= 100_000 && opening >= 100_000) return fail("Low-value pool assets must be low-cost assets under A$1,000, or low-value assets with opening adjustable value under A$1,000 for this income year.");
    }
    asset = { ...base.value, kind: "AU_DIV40", assetClassId: assetClass.value, method: method.value, ...(life.value !== undefined ? { effectiveLifeYears: life.value } : {}), ...(taxableUseBps.value !== undefined ? { taxableUseBps: taxableUseBps.value } : {}), ...(poolMethodValue === "LOW_VALUE_POOL" ? { poolMethod: "LOW_VALUE_POOL" } : {}) };
  } else if (draft.kind === "AU_DIV43" && fund.market === "AU") {
    const buildingType = enumField<AuCapitalWorksBuildingType>((draft as { buildingType?: unknown }).buildingType, DIV43_BUILDING_TYPES, "Building type");
    if (!buildingType.ok) return buildingType;
    const constructionStartDate = dateField((draft as { constructionStartDate?: unknown }).constructionStartDate, "Construction start date");
    if (!constructionStartDate.ok) return constructionStartDate;
    const constructionCompleteDate = dateField((draft as { constructionCompleteDate?: unknown }).constructionCompleteDate, "Construction complete date");
    if (!constructionCompleteDate.ok) return constructionCompleteDate;
    if (constructionCompleteDate.value < constructionStartDate.value) return fail("Construction complete date cannot be before construction start date.");
    const firstIncomeUseDate = dateField((draft as { firstIncomeUseDate?: unknown }).firstIncomeUseDate, "First income use date");
    if (!firstIncomeUseDate.ok) return firstIncomeUseDate;
    const constructionExpenditure = amountField((draft as { constructionExpenditure?: unknown }).constructionExpenditure, "Construction expenditure");
    if (!constructionExpenditure.ok) return constructionExpenditure;
    const priorDivision43Claims = optionalAmount((draft as { priorDivision43Claims?: unknown }).priorDivision43Claims, "Prior Division 43 claims");
    if (!priorDivision43Claims.ok) return priorDivision43Claims;
    if ((priorDivision43Claims.value ?? 0) > constructionExpenditure.value) return fail("Prior Division 43 claims cannot exceed construction expenditure.");
    const taxableUseBps = optionalBps((draft as { taxableUseBps?: unknown }).taxableUseBps);
    if (!taxableUseBps.ok) return taxableUseBps;
    asset = { ...base.value, kind: "AU_DIV43", buildingType: buildingType.value, constructionStartDate: constructionStartDate.value, constructionCompleteDate: constructionCompleteDate.value, firstIncomeUseDate: firstIncomeUseDate.value, constructionExpenditure: constructionExpenditure.value, ...(priorDivision43Claims.value !== undefined ? { priorDivision43Claims: priorDivision43Claims.value } : {}), ...(taxableUseBps.value !== undefined ? { taxableUseBps: taxableUseBps.value } : {}) };
  } else if (draft.kind === "AU_BORROWING" && fund.market === "AU") {
    const loanEndDate = dateField((draft as { loanEndDate?: unknown }).loanEndDate, "Loan end date");
    if (!loanEndDate.ok) return loanEndDate;
    if (loanEndDate.value < base.value.startDate) return fail("Loan end date cannot be before the asset start date.");
    const taxableUseBps = optionalBps((draft as { taxableUseBps?: unknown }).taxableUseBps);
    if (!taxableUseBps.ok) return taxableUseBps;
    asset = { ...base.value, kind: "AU_BORROWING", loanEndDate: loanEndDate.value, ...(taxableUseBps.value !== undefined ? { taxableUseBps: taxableUseBps.value } : {}) };
  } else if (draft.kind === "SG_PLANT" && fund.market === "SG") {
    const assetClass = enumField((draft as { assetClassId?: unknown }).assetClassId, SG_ASSET_CLASSES, "Singapore asset class");
    if (!assetClass.ok) return assetClass;
    const regime = enumField<CapitalAllowanceRegime>((draft as { regime?: unknown }).regime, SG_REGIMES, "Capital allowance regime");
    if (!regime.ok) return regime;
    const claimStartYaValue = (draft as { claimStartYa?: unknown }).claimStartYa;
    if (claimStartYaValue !== undefined && (!isSafeInt(claimStartYaValue) || claimStartYaValue < 2000 || claimStartYaValue > 2200)) return fail("Claim start YA must be between 2000 and 2200.");
    const prescribedLifeValue = (draft as { prescribedWorkingLifeYears?: unknown }).prescribedWorkingLifeYears;
    if (prescribedLifeValue !== undefined && (!isSafeInt(prescribedLifeValue) || prescribedLifeValue <= 0 || prescribedLifeValue > 100)) return fail("Prescribed working life must be a whole number from 1 to 100.");
    const electedLifeValue = (draft as { electedWorkingLifeYears?: unknown }).electedWorkingLifeYears;
    if (electedLifeValue !== undefined && electedLifeValue !== 6 && electedLifeValue !== 12 && electedLifeValue !== 16) return fail("Elected working life must be 6, 12 or 16 years.");
    const claimInitialAllowanceValue = (draft as { claimInitialAllowance?: unknown }).claimInitialAllowance;
    if (claimInitialAllowanceValue !== undefined && typeof claimInitialAllowanceValue !== "boolean") return fail("Claim initial allowance must be true or false.");
    asset = { ...base.value, kind: "SG_PLANT", assetClassId: assetClass.value, regime: regime.value, ...(claimStartYaValue !== undefined ? { claimStartYa: claimStartYaValue } : {}), ...(prescribedLifeValue !== undefined ? { prescribedWorkingLifeYears: prescribedLifeValue } : {}), ...(electedLifeValue !== undefined ? { electedWorkingLifeYears: electedLifeValue } : {}), ...(claimInitialAllowanceValue !== undefined ? { claimInitialAllowance: claimInitialAllowanceValue } : {}) };
  } else if (draft.kind === "SG_RR" && fund.market === "SG") {
    const claimModeValue = (draft as { claimMode?: unknown }).claimMode;
    if (claimModeValue !== undefined) {
      const mode = enumField<RrClaimMode>(claimModeValue, RR_CLAIM_MODES, "Section 14N claim mode");
      if (!mode.ok) return mode;
      asset = { ...base.value, kind: "SG_RR", claimMode: mode.value };
    } else {
      asset = { ...base.value, kind: "SG_RR" };
    }
  } else {
    return fail(fund.market === "AU" ? "Australian funds can only hold Division 40, Division 43 or borrowing-cost records." : "Singapore funds can only hold capital allowance or section 14N R&R records.");
  }
  try {
    fixedAsset(asset, "asset");
  } catch (error) {
    return fail(error instanceof Error ? `Asset record is invalid: ${error.message}` : "Asset record is invalid.");
  }
  return { ok: true, asset };
}

function audit(data: AppData, ctx: Ctx, fundId: string, detail: string) {
  return appendAudit(data, ctx, [{ fundId, action: "Asset register updated", detail }]);
}

export function applyAssetAction(data: AppData, action: AssetAction, ctx: Ctx): ActionResult {
  const guarded = guardEdit(data, action.fundId, ctx);
  if (!guarded.ok) return guarded;
  const { fund } = guarded;

  if (action.type === "asset-apply-to-trial-balance") {
    const view = assetRegisterView(data, fund.id, ctx);
    const nextAdjustments = { ...(data.taxAdjustments[fund.id] ?? {}) };
    for (const row of view.comparisons) nextAdjustments[row.key] = row.register;
    return {
      ok: true,
      data: {
        ...data,
        taxAdjustments: { ...data.taxAdjustments, [fund.id]: nextAdjustments },
        audit: audit(data, ctx, fund.id, "Tax adjustments updated from the asset register."),
      },
    };
  }

  if (action.type === "asset-add") {
    const cleaned = cleanAsset(data, fund, nextSequenceId("asset", data.assets.map((a) => a.id)), action.asset);
    if (!cleaned.ok) return cleaned;
    const asset = cleaned.asset;
    return { ok: true, data: { ...data, assets: [...data.assets, asset], audit: audit(data, ctx, fund.id, `Added ${asset.description}.`) } };
  }

  if (action.type === "asset-import") {
    if (action.assets.length > MAX_IMPORT_ROWS) return { ok: false, reason: `Import is limited to ${MAX_IMPORT_ROWS} assets.` };
    let ids = data.assets.map((a) => a.id);
    const imported: FixedAsset[] = [];
    for (let index = 0; index < action.assets.length; index += 1) {
      const draft = action.assets[index]!;
      const id = nextSequenceId("asset", ids);
      const cleaned = cleanAsset(data, fund, id, draft);
      if (!cleaned.ok) return { ok: false, reason: `Row ${index + 1}: ${cleaned.reason}` };
      ids.push(id);
      imported.push(cleaned.asset);
    }
    return {
      ok: true,
      data: {
        ...data,
        assets: [...data.assets.filter((a) => a.fundId !== fund.id), ...imported],
        audit: audit(data, ctx, fund.id, `Imported ${imported.length} asset${imported.length === 1 ? "" : "s"}.`),
      },
    };
  }

  const existing = data.assets.find((a) => a.id === action.assetId && a.fundId === fund.id);
  if (!existing) return { ok: false, reason: "Asset not found." };

  if (action.type === "asset-update") {
    const cleaned = cleanAsset(data, fund, existing.id, action.asset);
    if (!cleaned.ok) return cleaned;
    const next = cleaned.asset;
    return { ok: true, data: { ...data, assets: data.assets.map((a) => (a.id === existing.id ? next : a)), audit: audit(data, ctx, fund.id, `Updated ${next.description}.`) } };
  }

  if (action.type === "asset-dispose") {
    if (!isISODate(action.disposalDate)) return { ok: false, reason: "Disposal date must be a valid YYYY-MM-DD date." };
    if (!isAmount(action.disposalProceeds)) return { ok: false, reason: "Disposal proceeds must be a whole amount of zero or more cents." };
    if (action.disposalDate < existing.startDate) return { ok: false, reason: "Disposal date cannot be before the asset start date." };
    const next = { ...existing, disposalDate: action.disposalDate, disposalProceeds: action.disposalProceeds } as FixedAsset;
    try {
      fixedAsset(next, "asset");
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? `Asset record is invalid: ${error.message}` : "Asset record is invalid." };
    }
    return { ok: true, data: { ...data, assets: data.assets.map((a) => (a.id === existing.id ? next : a)), audit: audit(data, ctx, fund.id, `Disposed ${existing.description}.`) } };
  }

  if (action.type === "asset-delete") {
    return { ok: true, data: { ...data, assets: data.assets.filter((a) => a.id !== existing.id), audit: audit(data, ctx, fund.id, `Deleted ${existing.description}.`) } };
  }

  return { ok: false, reason: "Unsupported asset action." };
}
