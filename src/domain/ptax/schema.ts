// OWNER: Property taxes & duties agent (F2). Exact-shape rules for this feature's saved records, plus cross-record checks. core/schema.ts calls these.
import type { AppData, Market } from "../types.ts";
import type { PropertyTaxProfile, PtaxNotice, PtaxPayment } from "./types.ts";
import { amount, bad, bool, fundKey, id, int, isoDate, label, list, nullable, oneOf, optional, shape, unique } from "../core/schemaKit.ts";
import { AU_STATES } from "../../engine/au/types.ts";
import { AU_LAND_TAX_OWNER_KINDS } from "../../engine/au/landTax.ts";
import { AU_TRANSFER_DUTY_PROPERTY_KINDS, AU_TRANSFER_PURCHASER_KINDS } from "../../engine/au/transferDuty.ts";
import { ABSD_BUYER_KINDS, STAMP_DUTY_PROPERTY_KINDS } from "../../engine/stampDuty.ts";
import { PROPERTY_TAX_USAGES } from "../../engine/propertyTax.ts";

const bps = int(0, 10_000);
const year = int(2000, 2200);
const state = oneOf(AU_STATES.map((entry) => entry.id));
const auOwnerKind = oneOf(AU_LAND_TAX_OWNER_KINDS.map((entry) => entry.id));
const auPurchaserKind = oneOf(AU_TRANSFER_PURCHASER_KINDS.map((entry) => entry.id));
const auPropertyKind = oneOf(AU_TRANSFER_DUTY_PROPERTY_KINDS.map((entry) => entry.id));
const sgUsage = oneOf(PROPERTY_TAX_USAGES.map((entry) => entry.id));
const sgStampPropertyKind = oneOf(STAMP_DUTY_PROPERTY_KINDS.map((entry) => entry.id));
const sgAbsdBuyerKind = oneOf(ABSD_BUYER_KINDS.map((entry) => entry.id));
const payment = shape<PtaxPayment>({ id, kind: oneOf(["annual-tax", "duty"]), period: label, amount, date: isoDate, reference: label });
const notice = shape<PtaxNotice>({ id, period: label, assessedAmount: amount, issueDate: isoDate, dueDate: isoDate, reference: label });

export const propertyProfile = shape<PropertyTaxProfile>({
  propertyId: id,
  fundId: fundKey,
  auState: nullable(state),
  auLandValue: nullable(amount),
  auValuationYear: nullable(year),
  auOwnerKind: nullable(auOwnerKind),
  auOwnerForeign: bool,
  auOwnerAbsentee: bool,
  auTrustSurchargeApplies: bool,
  auResidential: bool,
  auResidentialShareBps: nullable(bps),
  auMetropolitanRegion: optional(bool),
  sgAnnualValue: nullable(amount),
  sgUsage: nullable(sgUsage),
  sgOwnerOccupied: bool,
  purchasePrice: amount,
  purchaseDate: isoDate,
  auPurchaserKind: nullable(auPurchaserKind),
  auPropertyKind: nullable(auPropertyKind),
  auForeignPurchaser: bool,
  sgStampPropertyKind: nullable(sgStampPropertyKind),
  sgAbsdBuyerKind: nullable(sgAbsdBuyerKind),
  sgResidentialPropertyCountBeforePurchase: nullable(int(0, 999)),
  sgExecutedInSingapore: bool,
  disposalDate: nullable(isoDate),
  disposalPrice: nullable(amount),
  payments: list(payment),
  notices: optional(list(notice)),
});

/** Cross-record checks run after the shapes pass: ids unique, fund ids exist (marketFor throws for unknown funds), markets match. */
export function ptaxRelations(data: AppData, marketFor: (fundId: string, at: string) => Market): void {
  unique(data.propertyProfiles, (r) => r.propertyId, "propertyProfiles");
  const propertyFund = new Map(data.properties.map((property) => [property.id, property.fundId]));
  data.propertyProfiles.forEach((r, i) => {
    const at = `propertyProfiles[${i}]`;
    const market = marketFor(r.fundId, `${at}.fundId`);
    const ownerFundId = propertyFund.get(r.propertyId);
    if (!ownerFundId) bad(`${at}.propertyId`, "names a property that does not exist");
    if (ownerFundId !== r.fundId) bad(`${at}.fundId`, "does not match the property's fund");
    if (market === "AU") {
      if (r.auState === null || r.auOwnerKind === null || r.auPurchaserKind === null || r.auPropertyKind === null) bad(at, "is missing Australian tax fields");
      if (r.auState !== "WA" && r.auMetropolitanRegion !== undefined) bad(`${at}.auMetropolitanRegion`, "is only meaningful for Western Australian land");
      if (r.sgAnnualValue !== null || r.sgUsage !== null || r.sgStampPropertyKind !== null || r.sgAbsdBuyerKind !== null || r.sgResidentialPropertyCountBeforePurchase !== null || r.sgOwnerOccupied || r.sgExecutedInSingapore) {
        bad(at, "has Singapore-only fields on an Australian fund");
      }
    } else {
      if (r.sgAnnualValue === null || r.sgUsage === null || r.sgStampPropertyKind === null) bad(at, "is missing Singapore tax fields");
      if (r.auState !== null || r.auLandValue !== null || r.auValuationYear !== null || r.auOwnerKind !== null || r.auPurchaserKind !== null || r.auPropertyKind !== null || r.auOwnerForeign || r.auOwnerAbsentee || r.auTrustSurchargeApplies || r.auResidential || r.auResidentialShareBps !== null || r.auMetropolitanRegion !== undefined || r.auForeignPurchaser) {
        bad(at, "has Australian-only fields on a Singapore fund");
      }
    }
    if ((r.disposalDate === null) !== (r.disposalPrice === null)) bad(at, "needs both disposalDate and disposalPrice for SSD, or neither");
    unique(r.payments, (payment) => payment.id, `${at}.payments`);
    unique(r.notices ?? [], (notice) => notice.id, `${at}.notices`);
    unique(r.notices ?? [], (notice) => notice.period, `${at}.notices`, "period");
    for (const notice of r.notices ?? []) {
      if (notice.dueDate < notice.issueDate) bad(`${at}.notices`, "has a due date before the issue date");
      if (market === "AU" && !/^land-tax-\d{4}$/.test(notice.period)) bad(`${at}.notices`, "has a notice period that does not match an Australian land-tax period");
      if (market === "SG" && !/^property-tax-\d{4}$/.test(notice.period)) bad(`${at}.notices`, "has a notice period that does not match a Singapore property-tax period");
    }
  });
  for (const property of data.properties) {
    if (!data.propertyProfiles.some((profile) => profile.propertyId === property.id)) bad("propertyProfiles", `is missing a profile for ${property.id}`);
  }
}
