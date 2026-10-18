// OWNER: GST & BAS agent (F1). Exact-shape rules for this feature's saved records, plus cross-record checks.
import type { AppData, Market } from "../types.ts";
import type { GstEntry, GstFiling } from "./types.ts";
import { AU_GST_CODES } from "../../engine/au/gstCodes.ts";
import { GST_CODES, lookupGstCode } from "../../engine/gstCodes.ts";
import { bad, dict, fundKey, id, isoDate, label, optional, shape, signed, unique } from "../core/schemaKit.ts";

const figures = dict(signed);

export const gstEntry = shape<GstEntry>({
  id,
  fundId: fundKey,
  date: isoDate,
  description: label,
  counterparty: label,
  code: label,
  net: signed,
  tax: signed,
  propertyId: optional(id),
  invoiceRef: optional(label),
});

export const gstFiling = shape<GstFiling>({
  id,
  fundId: fundKey,
  periodStart: isoDate,
  periodEnd: isoDate,
  kind: label,
  reference: label,
  lodgedDate: isoDate,
  date: optional(isoDate),
  actor: label,
  figures,
});

const AU_CODES: ReadonlySet<string> = new Set(AU_GST_CODES.map((code) => code.id));
const SG_CODES: ReadonlySet<string> = new Set(GST_CODES.map((code) => code.code));

/** Cross-record checks run after the shapes pass: ids unique, fund ids exist, markets and periods match. */
export function gstRelations(data: AppData, marketFor: (fundId: string, at: string) => Market): void {
  unique(data.gstLedger, (r) => r.id ?? "", "gstLedger");
  data.gstLedger.forEach((r, i) => {
    const market = marketFor(r.fundId, `gstLedger[${i}].fundId`);
    if (market === "AU" && !AU_CODES.has(r.code)) bad(`gstLedger[${i}].code`, "is not an Australian GST code");
    if (market === "SG" && (!SG_CODES.has(r.code) || !lookupGstCode(r.code, r.date))) bad(`gstLedger[${i}].code`, "is not a Singapore GST code for the entry date");
  });
  unique(data.gstFilings, (r) => r.id ?? "", "gstFilings");
  unique(data.gstFilings, (r) => `${r.fundId}/${r.periodStart}/${r.periodEnd}`, "gstFilings", "filing period");
  data.gstFilings.forEach((r, i) => {
    const market = marketFor(r.fundId, `gstFilings[${i}].fundId`);
    if (r.periodStart > r.periodEnd) bad(`gstFilings[${i}].periodEnd`, "is before the period start");
    if (market === "AU" && r.kind !== "BAS") bad(`gstFilings[${i}].kind`, "must be BAS for an Australian fund");
    if (market === "SG" && r.kind !== "GST F5") bad(`gstFilings[${i}].kind`, "must be GST F5 for a Singapore fund");
  });
}
