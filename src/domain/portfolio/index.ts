import { ALL_RULES, RULE_DOMAIN_LABEL } from "../../engine/registry.ts";
import type { RuleConfidence, RuleEntry } from "../../engine/rules.ts";
import { AU_ALL_RULES, AU_RULE_DOMAIN_LABEL } from "../../engine/au/registry.ts";
import { compareDates, slug, toISODate } from "../format.ts";
import { moduleFor } from "../modules.ts";
import { FEATURE_PROVIDERS, type RiskItem } from "../providers.ts";
import type { AppData, CheckSeverity, CsvModel, Ctx, DeadlineRow, DeadlineStatus, Fund, FundId, ISODate, JurisdictionFilter, Market, TbView } from "../types.ts";
import { calcFor } from "../core/calc.ts";
import { visibleFundsOf } from "../core/visible.ts";

export type PortfolioFilter<T extends string> = T | "all";
export type CalendarKind = "AMMA" | "AIIR" | "Notice" | "Withholding" | "Return" | "Feature" | "Other";

export interface CalendarFilters {
  market?: PortfolioFilter<Market>;
  fundId?: PortfolioFilter<FundId>;
  status?: PortfolioFilter<DeadlineStatus>;
  kind?: PortfolioFilter<CalendarKind>;
  showCompleted?: boolean;
}

export interface CalendarRow extends DeadlineRow {
  fund: string;
  market: Market;
  kind: CalendarKind;
  workspaceRoute: string;
  source: "market" | "feature";
}

export interface CalendarMonth {
  key: string;
  label: string;
  rows: CalendarRow[];
}

export interface CalendarView {
  rows: CalendarRow[];
  months: CalendarMonth[];
  counts: { overdue: number; dueIn7: number; dueIn30: number; done: number; doneThisYear: number };
  fundOptions: Array<{ id: FundId; name: string }>;
  kindOptions: CalendarKind[];
}

export interface IcsOptions {
  now: Date;
  prodId?: string;
}

export type RiskSeverity = CheckSeverity;

export interface PortfolioRiskRow {
  id: string;
  severity: RiskSeverity;
  area: string;
  fundId: FundId;
  fund: string;
  market: Market;
  title: string;
  detail: string;
  workspaceRoute: string;
  ageDays: number | null;
}

export interface RiskFilters {
  severity?: PortfolioFilter<RiskSeverity>;
  area?: PortfolioFilter<string>;
  fundId?: PortfolioFilter<FundId>;
  search?: string;
}

export interface RiskRegister {
  rows: PortfolioRiskRow[];
  filteredRows: PortfolioRiskRow[];
  summary: {
    bySeverity: Record<RiskSeverity, number>;
    byArea: Record<string, number>;
    byFund: Record<FundId, number>;
  };
  csv: CsvModel;
  areaOptions: string[];
  fundOptions: Array<{ id: FundId; name: string }>;
}

export interface RuleRegisterSource {
  title: string;
  publisher: string;
  url: string;
  retrieved: ISODate;
}

export interface RuleRegisterRow {
  registryKey: string;
  market: Market;
  id: string;
  domain: string;
  domainLabel: string;
  title: string;
  summary: string;
  effectiveFrom: ISODate | "";
  effectiveTo: ISODate | "";
  sources: RuleRegisterSource[];
  confidence: RuleConfidence;
  notes: string;
}

export interface RulesFilters {
  market?: PortfolioFilter<Market>;
  domain?: PortfolioFilter<string>;
  confidence?: PortfolioFilter<RuleConfidence>;
  effectiveOn?: ISODate | "";
  search?: string;
  id?: string;
}

export interface RulesRegister {
  rows: RuleRegisterRow[];
  filteredRows: RuleRegisterRow[];
  lookup(id: string): RuleRegisterRow | undefined;
  markets: Market[];
  domains: Array<{ id: string; label: string }>;
  confidences: RuleConfidence[];
  caveat: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const KIND_OPTIONS: CalendarKind[] = ["AMMA", "AIIR", "Notice", "Withholding", "Return", "Feature", "Other"];
const CONFIDENCES: RuleConfidence[] = ["VERIFIED", "VERIFIED_SECONDARY", "ASSUMPTION"];

function daysBetween(a: ISODate, b: ISODate): number {
  const start = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  const end = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
  return Math.round((end - start) / 86_400_000);
}

function ageInDays(from: ISODate, now: Date): number {
  return Math.max(0, daysBetween(from, toISODate(now)));
}

function kindOf(row: DeadlineRow): CalendarKind {
  const text = row.obligation.toLowerCase();
  if (text.includes("amma")) return "AMMA";
  if (text.includes("aiir")) return "AIIR";
  if (text.includes("notice")) return "Notice";
  if (text.includes("withholding") || text.includes("s45g")) return "Withholding";
  if (text.includes("form ut") || text.includes("return")) return "Return";
  if (row.workspace && !["/", "/investor-reporting", "/tax-returns"].includes(row.workspace)) return "Feature";
  return "Other";
}

function routeOf(row: DeadlineRow): string {
  if (row.workspace) return row.workspace;
  switch (kindOf(row)) {
    case "AIIR":
    case "Notice":
    case "Withholding":
      return "/investor-reporting";
    case "Return":
      return "/tax-returns";
    case "AMMA":
      return "/";
    default:
      return "/";
  }
}

function calendarRowsFor(data: AppData, ctx: Ctx, jurisdiction: JurisdictionFilter): CalendarRow[] {
  const funds = visibleFundsOf(data, ctx.user, jurisdiction);
  const rows: CalendarRow[] = [];
  for (const fund of funds) {
    const calc = calcFor(data, fund, ctx.now);
    const sourcedRows: Array<{ row: DeadlineRow; source: CalendarRow["source"] }> = [
      ...moduleFor(fund.market).deadlines(data, fund, calc, ctx.now).map((row) => ({ row, source: "market" as const })),
      ...FEATURE_PROVIDERS.flatMap((provider) => provider.deadlines?.(data, fund, ctx.now) ?? []).map((row) => ({ row, source: "feature" as const })),
    ];
    for (const { row, source } of sourcedRows) {
      const kind = kindOf(row);
      rows.push({
        ...row,
        fund: row.fundName || fund.name,
        fundName: row.fundName || fund.name,
        market: fund.market,
        kind,
        workspaceRoute: routeOf(row),
        source,
      });
    }
  }
  return rows.sort((a, b) => compareDates(a.date, b.date) || a.fund.localeCompare(b.fund) || a.obligation.localeCompare(b.obligation));
}

function matchesCalendar(row: CalendarRow, filters: CalendarFilters): boolean {
  if (filters.market && filters.market !== "all" && row.market !== filters.market) return false;
  if (filters.fundId && filters.fundId !== "all" && row.fundId !== filters.fundId) return false;
  if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;
  if (filters.kind && filters.kind !== "all" && row.kind !== filters.kind) return false;
  if (!filters.showCompleted && row.status === "done") return false;
  return true;
}

function monthLabel(key: string): string {
  const year = key.slice(0, 4);
  const month = Number(key.slice(5, 7));
  return `${MONTHS[month - 1]} ${year}`;
}

export function calendarView(data: AppData, ctx: Ctx, jurisdiction: JurisdictionFilter, options: CalendarFilters = {}): CalendarView {
  const allRows = calendarRowsFor(data, ctx, jurisdiction);
  const rows = allRows.filter((row) => matchesCalendar(row, options));
  const today = toISODate(ctx.now);
  const thisYear = today.slice(0, 4);
  const groups = new Map<string, CalendarRow[]>();
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return {
    rows,
    months: [...groups.entries()].map(([key, monthRows]) => ({ key, label: monthLabel(key), rows: monthRows })),
    counts: {
      overdue: allRows.filter((row) => row.status === "overdue").length,
      dueIn7: allRows.filter((row) => row.status === "open" && daysBetween(today, row.date) >= 0 && daysBetween(today, row.date) <= 7).length,
      dueIn30: allRows.filter((row) => row.status === "open" && daysBetween(today, row.date) >= 0 && daysBetween(today, row.date) <= 30).length,
      done: allRows.filter((row) => row.status === "done").length,
      doneThisYear: allRows.filter((row) => row.status === "done" && row.date.slice(0, 4) === thisYear).length,
    },
    fundOptions: visibleFundsOf(data, ctx.user, jurisdiction).map((fund) => ({ id: fund.id, name: fund.name })),
    kindOptions: KIND_OPTIONS,
  };
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function utcStamp(now: Date): string {
  const z = (n: number): string => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${z(now.getUTCMonth() + 1)}${z(now.getUTCDate())}T${z(now.getUTCHours())}${z(now.getUTCMinutes())}${z(now.getUTCSeconds())}Z`;
}

function dateStamp(date: ISODate): string {
  return date.replace(/-/g, "");
}

function uidOf(row: CalendarRow): string {
  return `${slug(`${row.fundId}-${row.obligation}-${row.date}`)}@property-fund-tax-compliance.local`;
}

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const chars = [...line];
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of chars) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      out.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  out.push(current);
  return out.join("\r\n");
}

export function icsCalendar(rows: readonly CalendarRow[], options: IcsOptions): string {
  const stamp = utcStamp(options.now);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${options.prodId ?? "-//Property Fund Tax Compliance//Compliance Calendar//EN"}`, "CALSCALE:GREGORIAN"];
  for (const row of rows.filter((r) => r.status !== "done")) {
    const summary = `${row.fund} — ${row.obligation}`;
    const page = `#${row.workspaceRoute}?fund=${encodeURIComponent(row.fundId)}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(uidOf(row))}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateStamp(row.date)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(`Status: ${row.status}. Open ${page}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

function addRisk(rows: PortfolioRiskRow[], fund: Fund, risk: Omit<PortfolioRiskRow, "fund" | "market">): void {
  rows.push({ ...risk, fund: fund.name, market: fund.market });
}

function trialBalanceRisks(data: AppData, fund: Fund, tb: TbView): Array<Omit<PortfolioRiskRow, "fund" | "market">> {
  const rows: Array<Omit<PortfolioRiskRow, "fund" | "market">> = [];
  if (!tb.balanced) {
    rows.push({
      id: `${fund.id}:tb:balance`,
      severity: "exception",
      area: "Trial balance",
      fundId: fund.id,
      title: "Trial balance is out of balance",
      detail: "Debits less credits do not net to zero.",
      workspaceRoute: "/trial-balance",
      ageDays: null,
    });
  }
  const unmapped = tb.rows.filter((row) => row.category === "unmapped");
  if (unmapped.length > 0) {
    rows.push({
      id: `${fund.id}:tb:unmapped`,
      severity: "exception",
      area: "Trial balance",
      fundId: fund.id,
      title: `${unmapped.length} account${unmapped.length === 1 ? "" : "s"} need a tax category`,
      detail: unmapped.map((row) => `${row.account} ${row.name}`).join("; "),
      workspaceRoute: "/trial-balance",
      ageDays: null,
    });
  }
  const differences = tb.components.filter((component) => !component.agrees);
  if (differences.length > 0) {
    rows.push({
      id: `${fund.id}:tb:components`,
      severity: "exception",
      area: "Trial balance",
      fundId: fund.id,
      title: "Trial balance differs from the distribution",
      detail: differences.map((component) => component.label).join(", "),
      workspaceRoute: "/trial-balance",
      ageDays: null,
    });
  }
  return rows;
}

function matchesRisk(row: PortfolioRiskRow, filters: RiskFilters): boolean {
  if (filters.severity && filters.severity !== "all" && row.severity !== filters.severity) return false;
  if (filters.area && filters.area !== "all" && row.area !== filters.area) return false;
  if (filters.fundId && filters.fundId !== "all" && row.fundId !== filters.fundId) return false;
  const q = filters.search?.trim().toLowerCase();
  if (q && ![row.fund, row.area, row.title, row.detail].some((part) => part.toLowerCase().includes(q))) return false;
  return true;
}

function csvFor(rows: readonly PortfolioRiskRow[]): CsvModel {
  return {
    fileName: "portfolio-risk-register.csv",
    columns: ["Severity", "Area", "Fund", "Market", "Title", "Detail", "Age days", "Workspace"],
    rows: rows.map((row) => [row.severity, row.area, row.fund, row.market, row.title, row.detail, row.ageDays ?? "", `#${row.workspaceRoute}?fund=${row.fundId}`]),
  };
}

export function riskRegister(data: AppData, ctx: Ctx, jurisdiction: JurisdictionFilter, filters: RiskFilters = {}): RiskRegister {
  const funds = visibleFundsOf(data, ctx.user, jurisdiction);
  const risks: PortfolioRiskRow[] = [];
  const overdue = calendarView(data, ctx, jurisdiction, { showCompleted: true }).rows.filter((row) => row.status === "overdue" && row.source === "market");
  for (const fund of funds) {
    const calc = calcFor(data, fund, ctx.now);
    for (const check of calc.checks) {
      addRisk(risks, fund, {
        id: `${fund.id}:check:${check.id}`,
        severity: check.severity,
        area: "Distribution",
        fundId: fund.id,
        title: check.title,
        detail: check.detail,
        workspaceRoute: "/",
        ageDays: null,
      });
    }
    const tb = moduleFor(fund.market).tbView(data, fund, ctx.now);
    for (const risk of trialBalanceRisks(data, fund, tb)) addRisk(risks, fund, risk);
    for (const query of data.queries.filter((q) => q.fundId === fund.id && q.status === "open")) {
      const ageDays = ageInDays(query.raisedAt.slice(0, 10), ctx.now);
      if (ageDays > 14) {
        addRisk(risks, fund, {
          id: `${fund.id}:query:${query.id}`,
          severity: "note",
          area: "Queries",
          fundId: fund.id,
          title: "Open query older than 14 days",
          detail: `${query.subject} — raised by ${query.raisedBy}`,
          workspaceRoute: "/",
          ageDays,
        });
      }
    }
    for (const row of overdue.filter((d) => d.fundId === fund.id)) {
      addRisk(risks, fund, {
        id: `${fund.id}:deadline:${row.date}:${slug(row.obligation)}`,
        severity: "exception",
        area: "Compliance calendar",
        fundId: fund.id,
        title: `${row.obligation} is overdue`,
        detail: `Due ${row.date}.`,
        workspaceRoute: row.workspaceRoute,
        ageDays: ageInDays(row.date, ctx.now),
      });
    }
    for (const providerRisk of FEATURE_PROVIDERS.flatMap((provider) => provider.risks?.(data, fund, ctx.now) ?? [])) {
      addRisk(risks, fund, {
        id: providerRisk.id,
        severity: providerRisk.severity,
        area: providerRisk.area,
        fundId: providerRisk.fundId,
        title: providerRisk.title,
        detail: providerRisk.detail,
        workspaceRoute: providerRisk.workspace,
        ageDays: null,
      });
    }
  }
  const deduped = new Map<string, PortfolioRiskRow>();
  for (const risk of risks) {
    const key = `${risk.fundId}|${risk.title.toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || (existing.severity === "note" && risk.severity === "exception")) deduped.set(key, risk);
  }
  const rows = [...deduped.values()].sort((a, b) => {
    const severity = Number(a.severity === "note") - Number(b.severity === "note");
    return severity || a.area.localeCompare(b.area) || a.fund.localeCompare(b.fund) || a.title.localeCompare(b.title);
  });
  const filteredRows = rows.filter((row) => matchesRisk(row, filters));
  const bySeverity: Record<RiskSeverity, number> = { exception: 0, note: 0 };
  const byArea: Record<string, number> = {};
  const byFund: Record<FundId, number> = {};
  for (const row of filteredRows) {
    bySeverity[row.severity] += 1;
    byArea[row.area] = (byArea[row.area] ?? 0) + 1;
    byFund[row.fundId] = (byFund[row.fundId] ?? 0) + 1;
  }
  return {
    rows,
    filteredRows,
    summary: { bySeverity, byArea, byFund },
    csv: csvFor(filteredRows),
    areaOptions: [...new Set(rows.map((row) => row.area))].sort(),
    fundOptions: funds.map((fund) => ({ id: fund.id, name: fund.name })),
  };
}

function toRuleRow(rule: RuleEntry, market: Market): RuleRegisterRow {
  const labelMap = market === "AU" ? AU_RULE_DOMAIN_LABEL : RULE_DOMAIN_LABEL;
  return {
    registryKey: `${market}:${rule.id}`,
    market,
    id: rule.id,
    domain: rule.domain,
    domainLabel: labelMap[rule.domain] ?? rule.domain,
    title: rule.title,
    summary: rule.summary,
    effectiveFrom: rule.effectiveFrom ?? "",
    effectiveTo: rule.effectiveTo ?? "",
    sources: rule.sources.map((source) => ({
      title: source.title,
      publisher: source.publisher ?? "",
      url: source.url,
      retrieved: source.retrieved,
    })),
    confidence: rule.confidence,
    notes: rule.notes ?? "",
  };
}

function effectiveOn(row: RuleRegisterRow, date: ISODate | ""): boolean {
  if (!date) return true;
  return (!row.effectiveFrom || row.effectiveFrom <= date) && (!row.effectiveTo || row.effectiveTo >= date);
}

function matchesRule(row: RuleRegisterRow, filters: RulesFilters): boolean {
  if (filters.market && filters.market !== "all" && row.market !== filters.market) return false;
  if (filters.domain && filters.domain !== "all" && row.domain !== filters.domain) return false;
  if (filters.confidence && filters.confidence !== "all" && row.confidence !== filters.confidence) return false;
  if (!effectiveOn(row, filters.effectiveOn ?? "")) return false;
  const q = filters.search?.trim().toLowerCase();
  if (q) {
    const haystack = [row.id, row.title, row.summary, ...row.sources.map((source) => source.title)].join(" ").toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (filters.id && row.id !== filters.id && row.registryKey !== filters.id) return false;
  return true;
}

export function rulesRegister(input: PortfolioFilter<Market> | RulesFilters = "all"): RulesRegister {
  const filters: RulesFilters = typeof input === "string" ? { market: input } : input;
  const rows = [...AU_ALL_RULES.map((rule) => toRuleRow(rule, "AU")), ...ALL_RULES.map((rule) => toRuleRow(rule, "SG"))].sort((a, b) =>
    a.market === b.market ? a.domainLabel.localeCompare(b.domainLabel) || a.title.localeCompare(b.title) : a.market.localeCompare(b.market),
  );
  const filteredRows = rows.filter((row) => matchesRule(row, filters));
  const domains = [...new Map(rows.map((row) => [row.domain, { id: row.domain, label: row.domainLabel }])).values()].sort((a, b) => a.label.localeCompare(b.label));
  return {
    rows,
    filteredRows,
    lookup: (id: string) => rows.find((row) => row.registryKey === id || row.id === id),
    markets: ["AU", "SG"],
    domains,
    confidences: CONFIDENCES,
    caveat: "No tax adviser has reviewed these rules. Treat the register as decision-support evidence, not tax advice.",
  };
}

export type { RiskItem, RuleConfidence };
