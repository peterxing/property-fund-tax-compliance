/**
 * IRAS Audit File (IAF) exporter.
 *
 * IMPORTANT: this module remains assumption-heavy. An official IRAS IAF field-layout specification
 * could not be directly obtained during implementation, so the layout below is a conservative
 * pipe-delimited text structure aligned to reputable secondary descriptions and flagged as such in RULES.
 */
import type { ISODate } from "./dates.ts";
import type { Cents } from "./money.ts";
import { lookupGstCode } from "./gstCodes.ts";
import type { RuleEntry } from "./rules.ts";
import { ENGINE_DISCLAIMER } from "./rules.ts";
import type { Finding } from "./types.ts";

export interface IafCompanyInfo {
  companyName: string;
  companyUen: string;
  gstRegistrationNumber: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  preparedOn?: ISODate;
  contactName?: string;
  contactEmail?: string;
}

export interface IafLedgerLine {
  date: ISODate;
  documentNo: string;
  counterpartyName: string;
  counterpartyReference?: string;
  description?: string;
  taxCode: string;
  currency?: string;
  netAmount: Cents;
  gstAmount: Cents;
  propertyRef?: string;
  permitNumber?: string;
}

export interface IafGeneralLedgerLine {
  date: ISODate;
  journalNo: string;
  accountCode: string;
  accountName: string;
  description?: string;
  debit: Cents;
  credit: Cents;
  taxCode?: string;
  sourceDocumentNo?: string;
}

export interface IafInput {
  company: IafCompanyInfo;
  purchaseLedger: readonly IafLedgerLine[];
  supplyLedger: readonly IafLedgerLine[];
  generalLedger: readonly IafGeneralLedgerLine[];
  version?: string;
}

export interface IafBuildResult {
  version: string;
  text: string;
  findings: Finding[];
}

const ASSUMED_IAF_VERSION = "IRAS-IAF-ASSUMED-2026.1";

function sanitise(value: string | undefined): string {
  return (value ?? "").replace(/[\r\n|]+/g, " ").trim();
}

function fmtAmount(value: Cents): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function validateIafInput(input: IafInput): Finding[] {
  const findings: Finding[] = [];
  if (!input.company.companyName || !input.company.companyUen || !input.company.gstRegistrationNumber) {
    findings.push({ id: "IAF.COMPANY.REQUIRED", severity: "ERROR", message: "Company name, UEN and GST registration number are required for the IAF export." });
  }
  for (const section of [input.purchaseLedger, input.supplyLedger]) {
    for (const row of section) {
      if (!lookupGstCode(row.taxCode, row.date)) {
        findings.push({ id: "IAF.CODE.UNKNOWN", severity: "ERROR", message: `Unknown GST code ${row.taxCode} in IAF line ${row.documentNo}.` });
      }
    }
  }
  for (const line of input.generalLedger) {
    if (line.taxCode && !lookupGstCode(line.taxCode, line.date)) {
      findings.push({ id: "IAF.GL_CODE.UNKNOWN", severity: "ERROR", message: `Unknown GST code ${line.taxCode} in GL journal ${line.journalNo}.` });
    }
  }
  return findings;
}

export function buildIaf(input: IafInput): IafBuildResult {
  const findings = validateIafInput(input);
  const version = input.version ?? ASSUMED_IAF_VERSION;
  const rows: string[] = [];
  rows.push("[CompanyInfo]");
  rows.push("Field|Value");
  rows.push(`Version|${sanitise(version)}`);
  rows.push(`CompanyName|${sanitise(input.company.companyName)}`);
  rows.push(`CompanyUEN|${sanitise(input.company.companyUen)}`);
  rows.push(`GSTNo|${sanitise(input.company.gstRegistrationNumber)}`);
  rows.push(`PeriodStart|${input.company.periodStart}`);
  rows.push(`PeriodEnd|${input.company.periodEnd}`);
  rows.push(`PreparedOn|${input.company.preparedOn ?? input.company.periodEnd}`);
  rows.push(`ContactName|${sanitise(input.company.contactName)}`);
  rows.push(`ContactEmail|${sanitise(input.company.contactEmail)}`);
  rows.push("");
  rows.push("[PurchaseLedger]");
  rows.push("LineNo|Date|DocumentNo|Counterparty|CounterpartyRef|Description|TaxCode|Currency|NetAmountSGD|GSTAmountSGD|GrossAmountSGD|PropertyRef|PermitNumber");
  input.purchaseLedger.forEach((row, index) => {
    rows.push([
      index + 1,
      row.date,
      sanitise(row.documentNo),
      sanitise(row.counterpartyName),
      sanitise(row.counterpartyReference),
      sanitise(row.description),
      sanitise(row.taxCode),
      sanitise(row.currency ?? "SGD"),
      fmtAmount(row.netAmount),
      fmtAmount(row.gstAmount),
      fmtAmount(row.netAmount + row.gstAmount),
      sanitise(row.propertyRef),
      sanitise(row.permitNumber),
    ].join("|"));
  });
  rows.push("");
  rows.push("[SupplyLedger]");
  rows.push("LineNo|Date|DocumentNo|Counterparty|CounterpartyRef|Description|TaxCode|Currency|NetAmountSGD|GSTAmountSGD|GrossAmountSGD|PropertyRef");
  input.supplyLedger.forEach((row, index) => {
    rows.push([
      index + 1,
      row.date,
      sanitise(row.documentNo),
      sanitise(row.counterpartyName),
      sanitise(row.counterpartyReference),
      sanitise(row.description),
      sanitise(row.taxCode),
      sanitise(row.currency ?? "SGD"),
      fmtAmount(row.netAmount),
      fmtAmount(row.gstAmount),
      fmtAmount(row.netAmount + row.gstAmount),
      sanitise(row.propertyRef),
    ].join("|"));
  });
  rows.push("");
  rows.push("[GeneralLedger]");
  rows.push("LineNo|Date|JournalNo|AccountCode|AccountName|Description|DebitSGD|CreditSGD|TaxCode|SourceDocumentNo");
  input.generalLedger.forEach((row, index) => {
    rows.push([
      index + 1,
      row.date,
      sanitise(row.journalNo),
      sanitise(row.accountCode),
      sanitise(row.accountName),
      sanitise(row.description),
      fmtAmount(row.debit),
      fmtAmount(row.credit),
      sanitise(row.taxCode),
      sanitise(row.sourceDocumentNo),
    ].join("|"));
  });
  findings.push({ id: "IAF.SPEC.ASSUMED", severity: "WARNING", message: "The IAF layout is an assumed pipe-delimited text structure built from verifiable secondary descriptions because an official IRAS field-layout specification could not be directly obtained during implementation." });
  return { version, text: rows.join("\r\n"), findings };
}

export const RULES = [
  {
    id: "gst.iaf.export.assumed.2022-plus",
    domain: "GST",
    title: "IRAS Audit File export layout",
    summary:
      "The engine emits a pipe-delimited company / purchase-ledger / supply-ledger / general-ledger text file with field names chosen to align with reputable secondary descriptions of the IRAS Audit File, because a directly verifiable official field-layout specification was not located.",
    effectiveFrom: "2022-01-01",
    sources: [
      { title: "Microsoft Learn | IRAS Audit File (Singapore)", url: "https://learn.microsoft.com/", retrieved: "2026-10-09", publisher: "Microsoft" },
      { title: "NetSuite | Singapore GST Audit File support notes", url: "https://docs.oracle.com/", retrieved: "2026-10-09", publisher: "Oracle" },
    ],
    confidence: "ASSUMPTION",
    notes:
      "This is intentionally flagged as an assumption-heavy module. Users should compare the output with the latest IRAS IAF schema or a sample accepted by IRAS before filing or responding to an audit request.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER];
