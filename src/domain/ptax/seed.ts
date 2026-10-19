// OWNER: Property taxes & duties agent (F2). Fictional demo records for the nine seeded funds (integer cents). Must pass ./schema.ts.
import type { Fund, Property } from "../types.ts";
import { FUNDS } from "../seed/funds.ts";
import { PROPERTIES } from "../seed/properties.ts";
import type { PropertyTaxProfile, PtaxNotice, PtaxPayment } from "./types.ts";
import type { AuState } from "../../engine/au/types.ts";

const fundMarket = new Map(FUNDS.map((fund) => [fund.id, fund]));

function auState(location: string): AuState {
  if (/\bNSW\b/.test(location)) return "NSW";
  if (/\bVIC\b/.test(location)) return "VIC";
  if (/\bQLD\b/.test(location)) return "QLD";
  if (/\bWA\b/.test(location)) return "WA";
  if (/\bSA\b/.test(location)) return "SA";
  if (/\bTAS\b/.test(location)) return "TAS";
  if (/\bACT\b/.test(location)) return "ACT";
  return "NT";
}

function landValue(property: Property): number {
  const location = property.location;
  const ratio =
    /\bSydney|Macquarie|Brookvale|Banksmeadow|Eastern Creek|Wattle Grove\b/.test(location) ? 62 :
    /\bMelbourne|Collins|Dandenong|Clayton|Frankston\b/.test(location) ? 58 :
    /\bBrisbane|Townsville|Robina\b/.test(location) ? 54 :
    50;
  return Math.round((property.valuation * ratio) / 100);
}

function annualValue(property: Property): number {
  const ratioBps = /Tower|Exchange|Gateway|Mall|Junction|Point/.test(property.name) ? 450 : /Logistics|Cold|Distribution|Industrial/.test(property.name) ? 520 : 560;
  return Math.round((property.valuation * ratioBps) / 10_000);
}

export function defaultPropertyTaxProfile(property: Property, fund: Fund = fundMarket.get(property.fundId)!): PropertyTaxProfile {
  const payments = seedPayments(property, fund);
  const notices = seedNotices(property, fund);
  if (fund.market === "AU") {
    const state = auState(property.location);
    const residential = /Hospital|Medical|Surgery/.test(property.name);
    return {
      propertyId: property.id,
      fundId: property.fundId,
      auState: state,
      auLandValue: landValue(property),
      auValuationYear: Number(fund.periodEnd.slice(0, 4)),
      auOwnerKind: "TRUST",
      auOwnerForeign: false,
      auOwnerAbsentee: false,
      // South Australia assesses a listed or widely held public unit trust scheme at the general rates, not the trust rates.
      auTrustSurchargeApplies: !(state === "SA" && fund.listed),
      auResidential: residential,
      auResidentialShareBps: residential ? 10_000 : null,
      ...(state === "WA" ? { auMetropolitanRegion: true } : {}),
      sgAnnualValue: null,
      sgUsage: null,
      sgOwnerOccupied: false,
      purchasePrice: property.cost,
      purchaseDate: property.acquired,
      auPurchaserKind: "TRUST",
      auPropertyKind: residential ? "RESIDENTIAL" : "NON_RESIDENTIAL",
      auForeignPurchaser: false,
      sgStampPropertyKind: null,
      sgAbsdBuyerKind: null,
      sgResidentialPropertyCountBeforePurchase: null,
      sgExecutedInSingapore: false,
      disposalDate: null,
      disposalPrice: null,
      payments,
      ...(notices.length > 0 ? { notices } : {}),
    };
  }
  return {
    propertyId: property.id,
    fundId: property.fundId,
    auState: null,
    auLandValue: null,
    auValuationYear: null,
    auOwnerKind: null,
    auOwnerForeign: false,
    auOwnerAbsentee: false,
    auTrustSurchargeApplies: false,
    auResidential: false,
    auResidentialShareBps: null,
    sgAnnualValue: annualValue(property),
    sgUsage: "NON_RESIDENTIAL_OR_VACANT",
    sgOwnerOccupied: false,
    purchasePrice: property.cost,
    purchaseDate: property.acquired,
    auPurchaserKind: null,
    auPropertyKind: null,
    auForeignPurchaser: false,
    sgStampPropertyKind: "NON_RESIDENTIAL",
    sgAbsdBuyerKind: null,
    sgResidentialPropertyCountBeforePurchase: null,
    sgExecutedInSingapore: true,
    disposalDate: null,
    disposalPrice: null,
    payments,
    ...(notices.length > 0 ? { notices } : {}),
  };
}

function seedPayments(property: Property, fund: Fund): PtaxPayment[] {
  const annualPeriod = fund.market === "AU" ? `land-tax-${fund.periodEnd.slice(0, 4)}` : "property-tax-2026";
  const payments: PtaxPayment[] = [];
  const leaveAnnualUnpaid = property.id === "wattle-wattle-grove-shopping-centre" || property.id === "telok-ayer-cecil-exchange";
  if (!leaveAnnualUnpaid) {
    payments.push({
      id: `ptp-${property.id}-annual`,
      kind: "annual-tax",
      period: annualPeriod,
      amount: fund.market === "AU" ? Math.round(landValue(property) / 50) : Math.round(annualValue(property) / 10),
      date: fund.market === "AU" ? "2026-09-15" : "2026-01-20",
      reference: fund.market === "AU" ? `SRO ${property.id.slice(0, 12)}` : `IRAS PT ${property.id.slice(0, 12)}`,
    });
  }
  payments.push({
    id: `ptp-${property.id}-duty`,
    kind: "duty",
    period: `duty-${property.acquired}`,
    amount: Math.round(property.cost * (fund.market === "AU" ? 0.055 : 0.03)),
    date: property.acquired,
    reference: fund.market === "AU" ? `Duty ${property.id.slice(0, 12)}` : `Stamp ${property.id.slice(0, 12)}`,
  });
  return payments;
}

function seedNotices(property: Property, fund: Fund): PtaxNotice[] {
  const period = fund.market === "AU" ? `land-tax-${fund.periodEnd.slice(0, 4)}` : "property-tax-2026";
  const notice = (assessedAmount: number, issueDate: string, dueDate: string, reference: string): PtaxNotice => ({
    id: `ptn-${property.id}-annual`,
    period,
    assessedAmount,
    issueDate,
    dueDate,
    reference,
  });
  if (property.id === "wattle-wattle-grove-shopping-centre") return [notice(886_126_601, "2026-08-15", "2026-09-16", "NSW LT WAT-2026-0916")];
  if (property.id === "wattle-banksia-plaza") return [notice(737_821_991, "2026-08-28", "2026-09-30", "WA LT BAN-2026-0930")];
  if (property.id === "kurrajong-fremantle-wharf-offices") return [notice(323_230_666, "2026-08-28", "2026-09-30", "WA LT FRE-2026-0930")];
  if (property.id === "telok-ayer-cecil-exchange") return [notice(848_757_282, "2026-01-01", "2026-01-31", "IRAS PT CE-2026")];
  if (property.id === "telok-ayer-telok-ayer-tower") return [notice(1_375_572_147, "2026-01-01", "2026-01-31", "IRAS PT TA-2026")];
  return [];
}

export const SEED_PROPERTY_PROFILES: readonly PropertyTaxProfile[] = PROPERTIES.map((property) => defaultPropertyTaxProfile(property));
