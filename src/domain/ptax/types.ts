// OWNER: Property taxes & duties agent (F2). Record, action and view-model types for this feature.
import type { AbsdBuyerKind, StampDutyPropertyKind } from "../../engine/stampDuty.ts";
import type { AuLandTaxOwnerKind } from "../../engine/au/landTax.ts";
import type { AuState } from "../../engine/au/types.ts";
import type { AuTransferDutyPropertyKind, AuTransferPurchaserKind } from "../../engine/au/transferDuty.ts";
import type { PropertyTaxUsage } from "../../engine/propertyTax.ts";
import type { Cents, CsvModel, DocModel, FundId, ISODate } from "../types.ts";

export type PtaxPaymentKind = "annual-tax" | "duty";

export interface PtaxPayment {
  id: string;
  kind: PtaxPaymentKind;
  period: string;
  amount: Cents;
  date: ISODate;
  reference: string;
}

export interface PtaxNotice {
  id: string;
  period: string;
  assessedAmount: Cents;
  issueDate: ISODate;
  dueDate: ISODate;
  reference: string;
}

export interface PropertyTaxProfile {
  propertyId: string;
  fundId: FundId;
  auState: AuState | null;
  auLandValue: Cents | null;
  auValuationYear: number | null;
  auOwnerKind: AuLandTaxOwnerKind | null;
  auOwnerForeign: boolean;
  auOwnerAbsentee: boolean;
  auTrustSurchargeApplies: boolean;
  auResidential: boolean;
  auResidentialShareBps: number | null;
  /** Optional saved field. WA holdings default to true when absent because the engine treats omitted metropolitanRegion as metropolitan. */
  auMetropolitanRegion?: boolean;
  sgAnnualValue: Cents | null;
  sgUsage: PropertyTaxUsage | null;
  sgOwnerOccupied: boolean;
  purchasePrice: Cents;
  purchaseDate: ISODate;
  auPurchaserKind: AuTransferPurchaserKind | null;
  auPropertyKind: AuTransferDutyPropertyKind | null;
  auForeignPurchaser: boolean;
  sgStampPropertyKind: StampDutyPropertyKind | null;
  sgAbsdBuyerKind: AbsdBuyerKind | null;
  sgResidentialPropertyCountBeforePurchase: number | null;
  sgExecutedInSingapore: boolean;
  disposalDate: ISODate | null;
  disposalPrice: Cents | null;
  payments: PtaxPayment[];
  /** Optional saved field. Missing means no assessment notice has been recorded for any annual property-tax period. */
  notices?: PtaxNotice[];
}

export type PtaxEditableField = Exclude<keyof PropertyTaxProfile, "propertyId" | "fundId" | "payments" | "notices">;
export type PtaxProfilePatch = Partial<Pick<PropertyTaxProfile, PtaxEditableField>>;

export type PtaxAction =
  | { type: "ptax-update-profile"; fundId: FundId; propertyId: string; patch: PtaxProfilePatch }
  | { type: "ptax-reset-profile"; fundId: FundId; propertyId: string }
  | { type: "ptax-record-payment"; fundId: FundId; propertyId: string; kind: PtaxPaymentKind; period: string; amount: Cents; date: ISODate; reference: string }
  | { type: "ptax-unrecord-payment"; fundId: FundId; propertyId: string; paymentId: string }
  | { type: "ptax-record-notice"; fundId: FundId; propertyId: string; period: string; assessedAmount: Cents; issueDate: ISODate; dueDate: ISODate; reference: string }
  | { type: "ptax-remove-notice"; fundId: FundId; propertyId: string; noticeId: string };

export interface PtaxKpis {
  annualTax: Cents;
  dutyPaid: Cents;
  needsData: number;
  dutyModelled: number;
  dutyTotal: number;
  dutyNotModelled: number;
}

export interface PtaxAmountCell {
  amount: Cents;
  label: string;
}

export interface AnnualTaxRow {
  propertyId: string;
  propertyName: string;
  location: string;
  stateOrUsage: string;
  value: Cents | null;
  valueLabel: string;
  basis: string;
  basisTitle: string;
  tax: Cents;
  surcharge: Cents;
  total: Cents;
  period: string;
  dueDate: ISODate | null;
  dueLabel: string;
  dueEstimated: boolean;
  notice: PtaxNotice | null;
  assessedAmount: Cents | null;
  assessedVariance: Cents | null;
  assessedLabel: string;
  paid: boolean;
  payments: PtaxPayment[];
  status: "modelled" | "not-modelled" | "missing-data";
  notes: string[];
  ruleIds: string[];
}

export interface DutyRow {
  propertyId: string;
  propertyName: string;
  location: string;
  purchaseDate: ISODate;
  purchasePrice: Cents;
  basis: string;
  basisTitle: string;
  baseDuty: Cents;
  surchargeDuty: Cents;
  ssdDuty: Cents;
  totalDuty: Cents;
  deadline: ISODate | null;
  deadlineLabel: string;
  paid: boolean;
  payments: PtaxPayment[];
  status: "modelled" | "not-modelled" | "missing-data";
  notes: string[];
  ruleIds: string[];
}

export interface PropertyTaxView {
  fundId: FundId;
  market: "AU" | "SG";
  title: string;
  rows: AnnualTaxRow[];
  totals: { tax: Cents; surcharge: Cents; total: Cents };
  kpis: PtaxKpis;
  csv: CsvModel;
  doc: DocModel;
}

export interface DutiesView {
  fundId: FundId;
  market: "AU" | "SG";
  title: string;
  rows: DutyRow[];
  totals: { baseDuty: Cents; surchargeDuty: Cents; ssdDuty: Cents; totalDuty: Cents };
  csv: CsvModel;
  doc: DocModel;
}
