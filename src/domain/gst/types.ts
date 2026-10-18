// OWNER: GST & BAS agent (F1). Record, action and view-model types for this feature.
import type { Cents, CsvModel, FundId, ISODate, Market } from "../types.ts";

export type GstFilingKind = "GST F5" | "BAS";
export type GstPeriodStatus = "open" | "overdue" | "lodged";
export type GstCheckSeverity = "exception" | "note";

export interface GstEntry {
  id: string;
  fundId: FundId;
  date: ISODate;
  description: string;
  counterparty: string;
  code: string;
  net: Cents;
  tax: Cents;
  propertyId?: string;
  invoiceRef?: string;
}

export interface GstFiling {
  id: string;
  fundId: FundId;
  periodStart: ISODate;
  periodEnd: ISODate;
  kind: GstFilingKind;
  reference: string;
  lodgedDate: ISODate;
  /** Legacy alias accepted for older tests/saves; new records use lodgedDate. */
  date?: ISODate;
  actor: string;
  figures: Record<string, Cents>;
}

export interface GstPeriod {
  fundId: FundId;
  market: Market;
  kind: GstFilingKind;
  start: ISODate;
  end: ISODate;
  dueDate: ISODate;
  dueBasis: string;
  status: GstPeriodStatus;
  filing: GstFiling | null;
  label: string;
}

export interface GstWorksheetLine {
  id: string;
  date: ISODate;
  description: string;
  counterparty: string;
  code: string;
  codeLabel: string;
  net: Cents;
  tax: Cents;
  amount: Cents;
}

export interface GstBoxLine {
  ref: string;
  label: string;
  amount: Cents;
  worksheet: GstWorksheetLine[];
}

export interface GstCheck {
  id: string;
  severity: GstCheckSeverity;
  title: string;
  detail: string;
}

export interface GstReturnView {
  fundId: FundId;
  market: Market;
  period: GstPeriod;
  boxes: GstBoxLine[];
  netGst: Cents;
  payable: Cents;
  refundable: Cents;
  checks: GstCheck[];
  ledger: GstEntry[];
  ledgerCsv: CsvModel;
  returnCsv: CsvModel;
  worksheetCsv: CsvModel;
  iaf?: { fileName: string; text: string; problems: string[] };
  notes: string[];
}

export type GstEntryDraft = Omit<GstEntry, "id"> & { id?: string };

export type GstAction =
  | { type: "gst-add-entry"; entry: GstEntryDraft }
  | { type: "gst-update-entry"; id: string; changes: Partial<GstEntryDraft> }
  | { type: "gst-delete-entry"; id: string }
  | { type: "gst-import-entries"; fundId: FundId; entries: GstEntryDraft[] }
  | { type: "gst-record-lodgment"; fundId: FundId; periodEnd: ISODate; reference: string; lodgedDate: ISODate }
  | { type: "gst-unlock-period"; fundId: FundId; periodEnd: ISODate; reason: string };
