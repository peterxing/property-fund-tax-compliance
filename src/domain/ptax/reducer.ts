// OWNER: Property taxes & duties agent (F2). Pure reducers for this feature's actions. Same rules as src/domain/actions.ts: never mutate data, check
// permissions with permissions.can(...) and fund access, refuse edits outside "Preparing" where the workflow locks them, audit every success
// (core/audit.ts appendAudit), and return { ok: false, reason } with a user-readable reason instead of throwing.
import type { Action, ActionResult, AppData, Ctx, Fund, Property } from "../types.ts";
import { can, userHasFund } from "../permissions.ts";
import { appendAudit } from "../core/audit.ts";
import { MAX_NAME, isAmount, isISODate, isSafeInt } from "../core/validate.ts";
import { money } from "../format.ts";
import type { PropertyTaxProfile, PtaxAction, PtaxPayment, PtaxProfilePatch } from "./types.ts";
import { defaultPropertyTaxProfile } from "./seed.ts";
import { nextSequenceId } from "../core/ids.ts";
import { propertyProfile as propertyProfileSchema } from "./schema.ts";
import { AU_STATES } from "../../engine/au/types.ts";
import { AU_LAND_TAX_OWNER_KINDS } from "../../engine/au/landTax.ts";
import { AU_TRANSFER_DUTY_PROPERTY_KINDS, AU_TRANSFER_PURCHASER_KINDS } from "../../engine/au/transferDuty.ts";
import { ABSD_BUYER_KINDS, STAMP_DUTY_PROPERTY_KINDS } from "../../engine/stampDuty.ts";
import { PROPERTY_TAX_USAGES } from "../../engine/propertyTax.ts";

export function isPtaxAction(action: Action): action is PtaxAction {
  return action.type.startsWith("ptax-");
}

const fail = (reason: string): ActionResult => ({ ok: false, reason });
const succeed = (data: AppData): ActionResult => ({ ok: true, data });

function fundOf(data: AppData, fundId: string): Fund | string {
  const fund = data.funds.find((candidate) => candidate.id === fundId);
  if (!fund) return "Fund not found";
  return fund;
}

function propertyOf(data: AppData, fundId: string, propertyId: string): Property | string {
  const property = data.properties.find((candidate) => candidate.id === propertyId && candidate.fundId === fundId);
  if (!property) return "Property not found";
  return property;
}

function profileOf(data: AppData, fundId: string, propertyId: string): PropertyTaxProfile | string {
  const profile = data.propertyProfiles.find((candidate) => candidate.propertyId === propertyId && candidate.fundId === fundId);
  if (!profile) return "Property tax profile not found";
  return profile;
}

function editable(data: AppData, fundId: string, ctx: Ctx): Fund | string {
  const fund = fundOf(data, fundId);
  if (typeof fund === "string") return fund;
  if (!userHasFund(ctx.user, fund.id)) return "You do not have access to this fund";
  if (!can(ctx.user, "edit", fund, fund.governance)) return "You don't have permission to edit this fund";
  return fund;
}

function canRecordPayment(data: AppData, fundId: string, ctx: Ctx): Fund | string {
  const fund = fundOf(data, fundId);
  if (typeof fund === "string") return fund;
  if (!userHasFund(ctx.user, fund.id)) return "You do not have access to this fund";
  if (!can(ctx.user, "edit", fund, fund.governance) && !can(ctx.user, "lodge", fund, fund.governance)) return "You don't have permission to record property tax payments for this fund";
  return fund;
}

function sameProfile(a: PropertyTaxProfile, b: PropertyTaxProfile): boolean {
  return (Object.keys(a) as Array<keyof PropertyTaxProfile>).every((key) => a[key] === b[key]);
}

const EDITABLE_FIELDS = [
  "auState",
  "auLandValue",
  "auValuationYear",
  "auOwnerKind",
  "auOwnerForeign",
  "auOwnerAbsentee",
  "auTrustSurchargeApplies",
  "auResidential",
  "auResidentialShareBps",
  "sgAnnualValue",
  "sgUsage",
  "sgOwnerOccupied",
  "purchasePrice",
  "purchaseDate",
  "auPurchaserKind",
  "auPropertyKind",
  "auForeignPurchaser",
  "sgStampPropertyKind",
  "sgAbsdBuyerKind",
  "sgResidentialPropertyCountBeforePurchase",
  "sgExecutedInSingapore",
  "disposalDate",
  "disposalPrice",
] as const satisfies readonly (keyof PtaxProfilePatch)[];

const EDITABLE = new Set<string>(EDITABLE_FIELDS);
const AU_STATE_IDS = new Set<string>(AU_STATES.map((entry) => entry.id));
const AU_OWNER_KIND_IDS = new Set<string>(AU_LAND_TAX_OWNER_KINDS.map((entry) => entry.id));
const AU_PURCHASER_KIND_IDS = new Set<string>(AU_TRANSFER_PURCHASER_KINDS.map((entry) => entry.id));
const AU_PROPERTY_KIND_IDS = new Set<string>(AU_TRANSFER_DUTY_PROPERTY_KINDS.map((entry) => entry.id));
const SG_USAGE_IDS = new Set<string>(PROPERTY_TAX_USAGES.map((entry) => entry.id));
const SG_STAMP_PROPERTY_KIND_IDS = new Set<string>(STAMP_DUTY_PROPERTY_KINDS.map((entry) => entry.id));
const SG_ABSD_BUYER_KIND_IDS = new Set<string>(ABSD_BUYER_KINDS.map((entry) => entry.id));

function enumOrNull(value: unknown, allowed: Set<string>, label: string): string | null | string {
  if (value === null) return null;
  return typeof value === "string" && allowed.has(value) ? value : `${label} is not supported`;
}

function validatePatch(fund: Fund, patch: unknown): { patch?: PtaxProfilePatch; reason?: string } {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return { reason: "Profile update must be an object" };
  const clean: PtaxProfilePatch = {};
  for (const [field, value] of Object.entries(patch)) {
    if (!EDITABLE.has(field)) return { reason: `${field} cannot be updated` };
    if (value === undefined) continue;
    if (field === "purchasePrice" || field === "disposalPrice" || field === "auLandValue" || field === "sgAnnualValue") {
      if (value !== null && !isAmount(value)) return { reason: `${field} must be an amount of zero or more` };
      (clean as Record<string, unknown>)[field] = value;
    } else if (field === "purchaseDate" || field === "disposalDate") {
      if (value !== null && !isISODate(value)) return { reason: `${field} must be a date` };
      (clean as Record<string, unknown>)[field] = value;
    } else if (field === "auValuationYear") {
      if (value !== null && (!isSafeInt(value) || value < 2000 || value > 2200)) return { reason: "Valuation year must be a whole year" };
      clean[field] = value as number | null;
    } else if (field === "auResidentialShareBps") {
      if (value !== null && (!isSafeInt(value) || value < 0 || value > 10_000)) return { reason: "Residential share must be between 0 and 10,000 basis points" };
      clean[field] = value as number | null;
    } else if (field === "sgResidentialPropertyCountBeforePurchase") {
      if (value !== null && (!isSafeInt(value) || value < 0 || value > 999)) return { reason: "Residential property count must be a whole number of zero or more" };
      clean[field] = value as number | null;
    } else if (field === "auState") {
      const next = enumOrNull(value, AU_STATE_IDS, "State");
      if (typeof next === "string" && !AU_STATE_IDS.has(next)) return { reason: next };
      clean.auState = next as PtaxProfilePatch["auState"];
    } else if (field === "auOwnerKind") {
      const next = enumOrNull(value, AU_OWNER_KIND_IDS, "Owner kind");
      if (typeof next === "string" && !AU_OWNER_KIND_IDS.has(next)) return { reason: next };
      clean.auOwnerKind = next as PtaxProfilePatch["auOwnerKind"];
    } else if (field === "auPurchaserKind") {
      const next = enumOrNull(value, AU_PURCHASER_KIND_IDS, "Purchaser kind");
      if (typeof next === "string" && !AU_PURCHASER_KIND_IDS.has(next)) return { reason: next };
      clean.auPurchaserKind = next as PtaxProfilePatch["auPurchaserKind"];
    } else if (field === "auPropertyKind") {
      const next = enumOrNull(value, AU_PROPERTY_KIND_IDS, "Property kind");
      if (typeof next === "string" && !AU_PROPERTY_KIND_IDS.has(next)) return { reason: next };
      clean.auPropertyKind = next as PtaxProfilePatch["auPropertyKind"];
    } else if (field === "sgUsage") {
      const next = enumOrNull(value, SG_USAGE_IDS, "Singapore usage");
      if (typeof next === "string" && !SG_USAGE_IDS.has(next)) return { reason: next };
      clean.sgUsage = next as PtaxProfilePatch["sgUsage"];
    } else if (field === "sgStampPropertyKind") {
      const next = enumOrNull(value, SG_STAMP_PROPERTY_KIND_IDS, "Singapore stamp duty property kind");
      if (typeof next === "string" && !SG_STAMP_PROPERTY_KIND_IDS.has(next)) return { reason: next };
      clean.sgStampPropertyKind = next as PtaxProfilePatch["sgStampPropertyKind"];
    } else if (field === "sgAbsdBuyerKind") {
      const next = enumOrNull(value, SG_ABSD_BUYER_KIND_IDS, "ABSD buyer kind");
      if (typeof next === "string" && !SG_ABSD_BUYER_KIND_IDS.has(next)) return { reason: next };
      clean.sgAbsdBuyerKind = next as PtaxProfilePatch["sgAbsdBuyerKind"];
    } else {
      if (typeof value !== "boolean") return { reason: `${field} must be true or false` };
      (clean as Record<string, boolean>)[field] = value;
    }
    const auOnly = field.startsWith("au");
    const sgOnly = field.startsWith("sg");
    if (fund.market === "AU" && sgOnly && value !== null && value !== false) return { reason: `${field} is only for Singapore funds` };
    if (fund.market === "SG" && auOnly && value !== null && value !== false) return { reason: `${field} is only for Australian funds` };
  }
  return { patch: clean };
}

function schemaProblem(profile: PropertyTaxProfile): string | null {
  try {
    propertyProfileSchema(profile, "propertyProfile");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Profile is not valid";
  }
}

function replace(data: AppData, next: PropertyTaxProfile): PropertyTaxProfile[] {
  return data.propertyProfiles.map((profile) => (profile.propertyId === next.propertyId ? next : profile));
}

function changedFields(before: PropertyTaxProfile, after: PropertyTaxProfile, currency: Fund["currency"]): string {
  const labels: Partial<Record<keyof PropertyTaxProfile, string>> = {
    auState: "state",
    auLandValue: "land value",
    auValuationYear: "valuation year",
    auOwnerKind: "owner kind",
    auOwnerForeign: "foreign owner",
    auOwnerAbsentee: "absentee owner",
    auTrustSurchargeApplies: "trust surcharge",
    auResidential: "residential land",
    auResidentialShareBps: "residential share",
    sgAnnualValue: "annual value",
    sgUsage: "usage",
    sgOwnerOccupied: "owner-occupied",
    purchasePrice: "purchase price",
    purchaseDate: "purchase date",
    auPurchaserKind: "purchaser kind",
    auPropertyKind: "property kind",
    auForeignPurchaser: "foreign purchaser",
    sgStampPropertyKind: "stamp duty property kind",
    sgAbsdBuyerKind: "ABSD buyer",
    sgResidentialPropertyCountBeforePurchase: "residential count",
    sgExecutedInSingapore: "executed in Singapore",
    disposalDate: "disposal date",
    disposalPrice: "disposal price",
  };
  const moneyFields = new Set<keyof PropertyTaxProfile>(["auLandValue", "sgAnnualValue", "purchasePrice", "disposalPrice"]);
  return (Object.keys(before) as Array<keyof PropertyTaxProfile>)
    .filter((key) => before[key] !== after[key])
    .map((key) => {
      const from = before[key];
      const to = after[key];
      const fmt = (value: unknown): string => {
        if (value === null) return "not set";
        if (typeof value === "boolean") return value ? "yes" : "no";
        if (typeof value === "number" && moneyFields.has(key)) return money(value, currency);
        return String(value);
      };
      return `${labels[key] ?? key}: ${fmt(from)} → ${fmt(to)}`;
    })
    .join("; ");
}

function updateProfile(data: AppData, action: Extract<PtaxAction, { type: "ptax-update-profile" }>, ctx: Ctx): ActionResult {
  const fund = editable(data, action.fundId, ctx);
  if (typeof fund === "string") return fail(fund);
  const property = propertyOf(data, fund.id, action.propertyId);
  if (typeof property === "string") return fail(property);
  const profile = profileOf(data, fund.id, property.id);
  if (typeof profile === "string") return fail(profile);
  const validated = validatePatch(fund, action.patch);
  if (validated.reason) return fail(validated.reason);
  const next = { ...profile, ...validated.patch };
  if ((next.disposalDate === null) !== (next.disposalPrice === null)) return fail("Enter both disposal date and disposal price, or leave both blank");
  const schemaError = schemaProblem(next);
  if (schemaError) return fail(schemaError);
  if (sameProfile(profile, next)) return succeed(data);
  return succeed({
    ...data,
    propertyProfiles: replace(data, next),
    audit: appendAudit(data, ctx, [
      { fundId: fund.id, action: "Property tax profile updated", detail: `${property.name}: ${changedFields(profile, next, fund.currency)}` },
    ]),
  });
}

function resetProfile(data: AppData, action: Extract<PtaxAction, { type: "ptax-reset-profile" }>, ctx: Ctx): ActionResult {
  const fund = editable(data, action.fundId, ctx);
  if (typeof fund === "string") return fail(fund);
  const property = propertyOf(data, fund.id, action.propertyId);
  if (typeof property === "string") return fail(property);
  const profile = profileOf(data, fund.id, property.id);
  if (typeof profile === "string") return fail(profile);
  const next = { ...defaultPropertyTaxProfile(property, fund), payments: profile.payments };
  if (sameProfile(profile, next)) return succeed(data);
  return succeed({
    ...data,
    propertyProfiles: replace(data, next),
    audit: appendAudit(data, ctx, [{ fundId: fund.id, action: "Property tax profile updated", detail: `${property.name}: reset to defaults` }]),
  });
}

function recordPayment(data: AppData, action: Extract<PtaxAction, { type: "ptax-record-payment" }>, ctx: Ctx): ActionResult {
  const fund = canRecordPayment(data, action.fundId, ctx);
  if (typeof fund === "string") return fail(fund);
  const property = propertyOf(data, fund.id, action.propertyId);
  if (typeof property === "string") return fail(property);
  const profile = profileOf(data, fund.id, property.id);
  if (typeof profile === "string") return fail(profile);
  if (!["annual-tax", "duty"].includes(action.kind)) return fail("Unknown property tax payment kind");
  if (!isAmount(action.amount) || action.amount <= 0) return fail("Payment amount must be more than zero");
  if (!isISODate(action.date)) return fail("Payment date must be a date");
  const period = action.period.trim();
  const reference = action.reference.trim();
  if (period === "" || period.length > MAX_NAME) return fail("Payment period is required");
  if (reference === "" || reference.length > MAX_NAME) return fail("Payment reference is required");
  const payment: PtaxPayment = {
    id: nextSequenceId("ptp", profile.payments.map((entry) => entry.id)),
    kind: action.kind,
    period,
    amount: action.amount,
    date: action.date,
    reference,
  };
  const next = { ...profile, payments: [...profile.payments, payment] };
  const schemaError = schemaProblem(next);
  if (schemaError) return fail(schemaError);
  return succeed({
    ...data,
    propertyProfiles: replace(data, next),
    audit: appendAudit(data, ctx, [{
      fundId: fund.id,
      action: action.kind === "annual-tax" ? "Property tax payment recorded" : "Property duty payment recorded",
      detail: `${property.name}: ${money(action.amount, fund.currency)} paid ${action.date} (${reference})`,
    }]),
  });
}

function unrecordPayment(data: AppData, action: Extract<PtaxAction, { type: "ptax-unrecord-payment" }>, ctx: Ctx): ActionResult {
  const fund = canRecordPayment(data, action.fundId, ctx);
  if (typeof fund === "string") return fail(fund);
  const property = propertyOf(data, fund.id, action.propertyId);
  if (typeof property === "string") return fail(property);
  const profile = profileOf(data, fund.id, property.id);
  if (typeof profile === "string") return fail(profile);
  const payment = profile.payments.find((entry) => entry.id === action.paymentId);
  if (!payment) return fail("Payment not found");
  const next = { ...profile, payments: profile.payments.filter((entry) => entry.id !== action.paymentId) };
  const schemaError = schemaProblem(next);
  if (schemaError) return fail(schemaError);
  return succeed({
    ...data,
    propertyProfiles: replace(data, next),
    audit: appendAudit(data, ctx, [{
      fundId: fund.id,
      action: payment.kind === "annual-tax" ? "Property tax payment removed" : "Property duty payment removed",
      detail: `${property.name}: ${payment.reference}`,
    }]),
  });
}

export function applyPtaxAction(data: AppData, action: PtaxAction, ctx: Ctx): ActionResult {
  if (action.type === "ptax-update-profile") return updateProfile(data, action, ctx);
  if (action.type === "ptax-reset-profile") return resetProfile(data, action, ctx);
  if (action.type === "ptax-record-payment") return recordPayment(data, action, ctx);
  if (action.type === "ptax-unrecord-payment") return unrecordPayment(data, action, ctx);
  return fail("Unknown property tax action");
}
