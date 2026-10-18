import type { AppData, AuHolderStatus, Cents, Fund, Holder, Property, SgHolderClass } from "../../../domain/types.ts";
import { STATE_VERSION } from "../../../domain/types.ts";
import type { EntityHolderDraft, EntityPropertyDraft } from "../../../domain/entities/types.ts";
import { saveBlob } from "../../exports/download.ts";

export const DATA_STORAGE_NOTE = "All data stays in this browser. Backups contain the full portfolio, so only a Head of Tax can download or restore them.";
export const USER_ACCESS_NOTE = "Users with All funds see new funds immediately. Other users need access granted on the Access page.";
export const DELETE_ACCESS_NOTE = "A fund cannot be deleted while any user has explicit access to only that fund. Change their access on the Access page first.";
export const BACKUP_APP = "property-fund-tax-compliance";
export const MAX_BACKUP_BYTES = 8_000_000;
export const MAX_ENTITY_IMPORT_ROWS = 2_000;

export interface BackupEnvelope {
  app: typeof BACKUP_APP;
  version: typeof STATE_VERSION;
  exportedAt: string;
  data: AppData;
}

export function backupFileName(today: Date): string {
  return `pfc-backup-${today.toISOString().slice(0, 10)}.json`;
}

export function backupEnvelope(data: AppData, now = new Date()): BackupEnvelope {
  return { app: BACKUP_APP, version: STATE_VERSION, exportedAt: now.toISOString(), data };
}

export function backupText(data: AppData, now = new Date()): string {
  return `${JSON.stringify(backupEnvelope(data, now), null, 2)}\n`;
}

export function dataFromBackup(value: unknown): AppData | string {
  if (value && typeof value === "object" && !Array.isArray(value) && "data" in value) {
    const envelope = value as Partial<BackupEnvelope>;
    if (envelope.app !== BACKUP_APP) return "This is not a Property Fund Tax Compliance backup.";
    if (envelope.version !== STATE_VERSION) return "This backup was made by another data version.";
    return envelope.data as AppData;
  }
  return value as AppData;
}

function hasPoisonKey(value: unknown): boolean {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === null || typeof next !== "object") continue;
    for (const key of Object.keys(next)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return true;
      stack.push((next as Record<string, unknown>)[key]);
    }
  }
  return false;
}

export function backupFileProblem(file: { size: number }): string | null {
  return file.size > MAX_BACKUP_BYTES ? "The file is larger than 8 MB." : null;
}

export function parseBackupText(text: string): AppData | string {
  try {
    const parsed = JSON.parse(text);
    if (hasPoisonKey(parsed)) return "The backup contains a field name that is not allowed (__proto__, constructor or prototype).";
    return dataFromBackup(parsed);
  } catch {
    return "The file is not valid JSON.";
  }
}

export function restoreSummary(data: AppData): string {
  const au = data.funds.filter((f) => f.market === "AU").length;
  const sg = data.funds.filter((f) => f.market === "SG").length;
  const lastAudit = data.audit.map((a) => a.at).sort().at(-1) ?? "No audit entries";
  return `${au} AU funds, ${sg} SG funds, ${data.holders.length} holders, last audit ${lastAudit}`;
}

/** Saves text as a file through the app's one download path (sanitised name, object URL released after the click). */
export function downloadText(text: string, fileName: string, type = "application/json;charset=utf-8"): void {
  saveBlob(fileName, new Blob([text], { type }));
}

type CellMap = Record<string, string>;
const clean = (value: string | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

function parseCsv(text: string): string[][] | string {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (quoted) return "A quoted CSV value is not closed.";
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows.map((cells) => cells.map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"')));
}

function rowsOf(text: string): CellMap[] | string {
  const parsed = parseCsv(text);
  if (typeof parsed === "string") return parsed;
  if (parsed.length < 2) return "The CSV needs a header row and at least one data row.";
  const dataRows = parsed.slice(1);
  if (dataRows.length > MAX_ENTITY_IMPORT_ROWS) return `The CSV can have up to ${MAX_ENTITY_IMPORT_ROWS.toLocaleString("en-AU")} rows.`;
  const headers = parsed[0]!.map((h) => h.toLowerCase());
  return dataRows.map((row) => Object.fromEntries(row.map((cell, i) => [headers[i] ?? `col${i}`, cell])));
}

function parseWhole(value: string, label: string, line: number): number | string {
  const n = Number(value.replace(/,/g, ""));
  return Number.isSafeInteger(n) && n >= 0 ? n : `Line ${line}: ${label} must be a whole number of zero or more.`;
}

function parseMoney(value: string, label: string, line: number): Cents | string {
  const text = value.replace(/[$,\s]/g, "");
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) return `Line ${line}: ${label} must be a non-negative amount.`;
  return Math.round(n * 100);
}

const AU_STATUSES: readonly AuHolderStatus[] = ["resident", "foreign-eoi", "foreign-non-eoi"];
const SG_CLASSES: readonly SgHolderClass[] = ["individual", "qualifying", "nrni", "nr-fund", "other"];

export function parseHoldersCsv(text: string, market: Fund["market"]): EntityHolderDraft[] | string {
  const rows = rowsOf(text);
  if (typeof rows === "string") return rows;
  const out: EntityHolderDraft[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const line = i + 2;
    const row = rows[i]!;
    const holder = clean(row.holder ?? row.name);
    const country = clean(row.country);
    if (!holder || !country) return `Line ${line}: holder and country are required.`;
    const dedupe = holder.toLowerCase();
    if (seen.has(dedupe)) return `Line ${line}: holder ${holder} appears more than once.`;
    seen.add(dedupe);
    const units = parseWhole(clean(row.units), "units", line);
    if (typeof units === "string") return units;
    if (market === "AU") {
      const auStatus = clean(row.austatus ?? row.auStatus ?? row.status) as AuHolderStatus;
      if (!AU_STATUSES.includes(auStatus)) return `Line ${line}: auStatus must be resident, foreign-eoi or foreign-non-eoi.`;
      out.push({ holder, country, units, auStatus });
    } else {
      const sgClass = clean(row.sgclass ?? row.sgClass ?? row.class) as SgHolderClass;
      if (!SG_CLASSES.includes(sgClass)) return `Line ${line}: sgClass must be individual, qualifying, nrni, nr-fund or other.`;
      out.push({ holder, country, units, sgClass });
    }
  }
  return out;
}

export function parsePropertiesCsv(text: string): EntityPropertyDraft[] | string {
  const rows = rowsOf(text);
  if (typeof rows === "string") return rows;
  const out: EntityPropertyDraft[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const line = i + 2;
    const row = rows[i]!;
    const name = clean(row.name);
    const location = clean(row.location);
    const acquired = clean(row.acquired);
    if (!name || !location || !/^\d{4}-\d{2}-\d{2}$/.test(acquired)) return `Line ${line}: name, location and acquired (YYYY-MM-DD) are required.`;
    const dedupe = name.toLowerCase();
    if (seen.has(dedupe)) return `Line ${line}: property ${name} appears more than once.`;
    seen.add(dedupe);
    const cost = parseMoney(clean(row.cost), "cost", line);
    const improvements = parseMoney(clean(row.improvements ?? "0"), "improvements", line);
    const capitalWorksClaimed = parseMoney(clean(row.capitalWorksClaimed ?? row.capitalworksclaimed ?? "0"), "capital works claimed", line);
    const valuation = parseMoney(clean(row.valuation), "valuation", line);
    for (const value of [cost, improvements, capitalWorksClaimed, valuation]) if (typeof value === "string") return value;
    if (typeof cost === "string" || typeof improvements === "string" || typeof capitalWorksClaimed === "string" || typeof valuation === "string") return "The property amounts could not be read.";
    out.push({ name, location, acquired, cost, improvements, capitalWorksClaimed, valuation });
  }
  return out;
}

export function holdersTemplate(market: Fund["market"]): string {
  return market === "AU"
    ? "holder,country,units,auStatus\nExample Holder,Australia,1000000,resident\n"
    : "holder,country,units,sgClass\nExample Holder,Singapore,1000000,qualifying\n";
}

export function propertiesTemplate(): string {
  return "name,location,acquired,cost,improvements,capitalWorksClaimed,valuation\nExample Tower,Sydney NSW,2024-01-15,10000000,0,0,12500000\n";
}

export function holderCount(holders: readonly Holder[], fundId: string): number {
  return holders.filter((h) => h.fundId === fundId).length;
}

export function propertyCount(properties: readonly Property[], fundId: string): number {
  return properties.filter((p) => p.fundId === fundId).length;
}
