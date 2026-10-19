import { assetRegisterView } from "../assets/index.ts";
import { inputHash, lastSignOffVersion } from "../governance/versions.ts";
import { gstPeriods } from "../gst/index.ts";
import { costBaseView, fundCalc, getFund, investorView, returnView, tbView, workflowView } from "../selectors.ts";
import { dutiesView, propertyTaxView } from "../ptax/index.ts";
import { riskRegister, rulesRegister } from "../portfolio/index.ts";
import { FEATURE_PROVIDERS } from "../providers.ts";
import { dateLabel, dateTimeLabel, integer, money, slug, toISODate } from "../format.ts";
import { GOVERNANCE, ROLE_LABEL, lodgmentRole, userHasFund } from "../permissions.ts";
import { moduleFor } from "../modules.ts";
import type { AppData, Cents, CsvModel, Ctx, DeadlineRow, DocModel, Fund, FundId } from "../types.ts";

export type DueDiligenceStatus = "Clear" | "Attention" | "Issue";

export interface DueDiligenceLink {
  label: string;
  path: string;
}

export interface DueDiligenceSection {
  id: string;
  title: string;
  status: DueDiligenceStatus;
  finding: string;
  evidence: string[];
  link: DueDiligenceLink;
}

export interface DueDiligenceSummary {
  clear: number;
  attention: number;
  issue: number;
}

export interface DueDiligenceView {
  fund: Fund;
  preparedBy: string;
  asAt: string;
  sections: DueDiligenceSection[];
  summary: DueDiligenceSummary;
  csv: CsvModel;
  doc: DocModel;
}

const SCOPE_LIMITATIONS =
  "Scope and limitations: this report uses demonstration data and figures held in this browser only. It is not tax advice, no tax adviser has reviewed the rules or the seeded facts, and nothing has been submitted to the ATO or IRAS from this app.";

function countText(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function dueSoon(row: DeadlineRow, today: string, day90: string): boolean {
  return row.status !== "done" && row.date >= today && row.date <= day90;
}

function addDaysIso(now: Date, days: number): string {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function formatMoneyList(lines: readonly { label: string; amount: Cents }[], fund: Fund, max = 5): string {
  if (lines.length === 0) return "No amounts held.";
  const body = lines.slice(0, max).map((line) => `${line.label}: ${money(line.amount, fund.currency)}`).join("; ");
  return lines.length > max ? `${body}; ${lines.length - max} more.` : body;
}

function csvModel(fund: Fund, sections: readonly DueDiligenceSection[]): CsvModel {
  return {
    fileName: `${slug(fund.name)}-tax-due-diligence-findings.csv`,
    columns: ["Section", "Status", "Finding", "Evidence", "Link"],
    rows: sections.map((section) => [section.title, section.status, section.finding, section.evidence.join(" | "), `#${section.link.path}?fund=${fund.id}`]),
  };
}

function docModel(fund: Fund, preparedBy: string, asAt: string, sections: readonly DueDiligenceSection[]): DocModel {
  return {
    fileName: `${slug(fund.name)}-tax-due-diligence-report.pdf`,
    title: "Tax due diligence report",
    subtitle: fund.name,
    meta: [
      { label: "Prepared by", value: preparedBy },
      { label: "As at", value: asAt },
      { label: "Period", value: fund.periodLabel },
      { label: "Regime", value: `${fund.market} ${fund.regime}` },
    ],
    blocks: [
      { kind: "paragraph", text: SCOPE_LIMITATIONS, tone: "note" },
      {
        kind: "table",
        title: "Findings",
        columns: [
          { key: "section", label: "Section" },
          { key: "status", label: "Status" },
          { key: "finding", label: "Finding" },
          { key: "evidence", label: "Evidence" },
        ],
        rows: sections.map((section) => ({ section: section.title, status: section.status, finding: section.finding, evidence: section.evidence.join("; ") })),
      },
    ],
    footnotes: ["Statuses are shown in text and do not rely on colour alone.", "Links in the app open the workspace that holds or fixes the underlying record."],
  };
}

function allDeadlines(data: AppData, fund: Fund, ctx: Ctx): DeadlineRow[] {
  const calc = fundCalc(data, fund.id, ctx.now);
  return [
    ...moduleFor(fund.market).deadlines(data, fund, calc, ctx.now),
    ...FEATURE_PROVIDERS.flatMap((provider) => provider.deadlines?.(data, fund, ctx.now) ?? []),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.obligation.localeCompare(b.obligation));
}

function entitySection(data: AppData, fund: Fund): DueDiligenceSection {
  const governance = GOVERNANCE[fund.governance];
  const signOffRole = fund.governance === "agent-signs-off" ? "Tax agent" : "Head of Tax";
  const lodger = ROLE_LABEL[lodgmentRole(fund.governance)];
  const approvals = governance.levels.length > 0 ? governance.levels.map((level) => (level === "review" ? "Reviewer" : "Tax agent")).join(", ") : "No pre-sign-off approval levels";
  const status: DueDiligenceStatus = fund.unitsOnIssue > 0 ? "Clear" : "Issue";
  return {
    id: "entity",
    title: "Entity and regime",
    status,
    finding: `${fund.name} is a ${fund.market} ${fund.regime} fund for ${fund.periodLabel}.`,
    evidence: [
      `Market and regime: ${fund.market} · ${fund.regime}; sector ${fund.sector}; ${fund.listed ? "listed" : "unlisted"}.`,
      `Units on issue: ${integer(fund.unitsOnIssue)}; register rows: ${countText(data.holders.filter((h) => h.fundId === fund.id).length, "holder")}.`,
      `Governance: ${governance.label}; approvals before sign-off: ${approvals}; signs off: ${signOffRole}; lodges: ${lodger}.`,
    ],
    link: { label: "Distributions", path: "/" },
  };
}

function workflowSection(data: AppData, fund: Fund, ctx: Ctx): DueDiligenceSection {
  const workflow = workflowView(data, fund.id, ctx);
  const version = lastSignOffVersion(data, fund.id);
  const currentHash = inputHash(data, fund.id);
  const stale = Boolean(version && version.inputHash !== currentHash);
  const reopenings = data.audit.filter((entry) => entry.fundId === fund.id && entry.action.toLowerCase().includes("reopen"));
  const savedVersions = data.versions.filter((entry) => entry.fundId === fund.id);
  const status = stale ? "Issue" : fund.status === "Signed off" && workflow.openQueries === 0 && workflow.exceptions === 0 ? "Clear" : "Attention";
  const approvals = workflow.approvals.map((approval) => `${approval.label}: ${approval.done ? `done by ${approval.by} on ${approval.at ? dateTimeLabel(approval.at) : ""}` : "pending"}`);
  return {
    id: "workflow",
    title: "Workflow and governance",
    status,
    finding: stale ? "Inputs no longer match the last sign-off version." : fund.status === "Signed off" ? "Workflow is signed off and versioned." : `Workflow is ${fund.status.toLowerCase()}.`,
    evidence: [
      `Status: ${fund.status}; ${workflow.openQueries} open queries; ${workflow.exceptions} distribution exceptions.`,
      approvals.length > 0 ? approvals.join("; ") : "No approval levels required for this governance mode.",
      version ? `Last sign-off version: ${version.label}, saved ${dateTimeLabel(version.at)} by ${version.by}; current inputs ${stale ? "differ from" : "match"} that hash.` : "No sign-off version is saved.",
      `Saved calculation versions: ${savedVersions.length}; reopenings: ${reopenings.length}${reopenings.length ? ` (${reopenings.map((entry) => entry.detail ?? entry.action).join("; ")})` : ""}.`,
    ],
    link: { label: "Distributions", path: "/" },
  };
}

function distributionSection(data: AppData, fund: Fund, ctx: Ctx): DueDiligenceSection {
  const calc = fundCalc(data, fund.id, ctx.now);
  const unitVariance = calc.registerUnits - fund.unitsOnIssue;
  const reconIssue = calc.recon.status === "under-remitted" || calc.recon.status === "over-remitted";
  const status = reconIssue || unitVariance !== 0 ? "Issue" : calc.recon.status === "not-remitted" ? "Attention" : "Clear";
  const remitted = calc.recon.remitted === null ? "Not remitted" : money(calc.recon.remitted, fund.currency);
  const variance = calc.recon.variance === null ? "n/a" : money(calc.recon.variance, fund.currency);
  return {
    id: "distribution",
    title: "Distribution and withholding",
    status,
    finding: reconIssue ? "Withholding remitted does not reconcile to the computed amount." : unitVariance !== 0 ? "The register units do not agree to units on issue." : "Distribution and withholding reconcile on the current data.",
    evidence: [
      formatMoneyList(calc.components.filter((component) => component.amount !== 0).map((component) => ({ label: component.label, amount: component.amount })), fund),
      `Cash distribution: ${money(calc.cash, fund.currency)}; withholding computed: ${money(calc.withheld, fund.currency)}; remitted: ${remitted}; variance: ${variance}; status: ${calc.recon.status}.`,
      `Register units: ${integer(calc.registerUnits)}; units on issue: ${integer(fund.unitsOnIssue)}; unallocated units: ${integer(calc.unallocatedUnits)}.`,
    ],
    link: { label: "Distributions", path: "/" },
  };
}

function lodgmentSection(data: AppData, fund: Fund, ctx: Ctx): DueDiligenceSection {
  const ret = returnView(data, fund.id, ctx);
  const inv = investorView(data, fund.id, ctx);
  const gst = gstPeriods(data, fund, ctx.now);
  const overdueGst = gst.filter((period) => period.status === "overdue");
  const openGst = gst.filter((period) => period.status === "open");
  const deadlineRows = allDeadlines(data, fund, ctx);
  const overdue = deadlineRows.filter((row) => row.status === "overdue");
  const status = overdue.length > 0 || overdueGst.length > 0 ? "Issue" : ret.lodgment || inv.market === "AU" ? (openGst.length > 0 ? "Attention" : "Clear") : "Attention";
  const investorEvidence =
    inv.market === "AU"
      ? `AU investor reporting: ${inv.notices.filter((notice) => notice.publishedOn).length}/${inv.notices.length} fund payment notices published; AIIR ${inv.aiir.lodgment ? `lodged ${dateLabel(inv.aiir.lodgment.date)}` : inv.aiir.ready ? "ready but not lodged" : "not ready"}.`
      : `SG investor reporting: distribution tax notice ${inv.notice.published ? `published ${inv.notice.publishedOn ? dateLabel(inv.notice.publishedOn) : ""}` : "not published"}; s45G status ${inv.s45g.status}; file and pay by ${dateLabel(inv.s45g.fileAndPayBy)}${inv.s45g.overdue ? " (overdue)" : ""}.`;
  return {
    id: "lodgment",
    title: "Lodgment history",
    status,
    finding: overdue.length || overdueGst.length ? "One or more lodgment or filing obligations are overdue." : ret.lodgment ? "Core return lodgment is recorded." : "Some filing records are still open or not ready.",
    evidence: [
      `${ret.title}: ${ret.lodgment ? `${ret.lodgment.reference} recorded ${dateLabel(ret.lodgment.date)} by ${ret.lodgment.actor}` : `${ret.ready ? "ready" : "not ready"}; ${ret.dueLabel}`}.`,
      investorEvidence,
      `GST/BAS periods: ${gst.filter((period) => period.status === "lodged").length} lodged, ${openGst.length} open, ${overdueGst.length} overdue.`,
      overdue.length ? `Overdue deadlines: ${overdue.map((row) => `${row.obligation} due ${dateLabel(row.date)}`).join("; ")}.` : "No overdue market or feature deadlines.",
    ],
    link: { label: "Tax returns", path: "/tax-returns" },
  };
}

function openItemsSection(data: AppData, fund: Fund, ctx: Ctx): DueDiligenceSection {
  const today = toISODate(ctx.now);
  const day90 = addDaysIso(ctx.now, 90);
  const risks = riskRegister(data, ctx, "all", { fundId: fund.id }).rows.filter((row) => row.fundId === fund.id);
  const exceptions = risks.filter((row) => row.severity === "exception");
  const notes = risks.filter((row) => row.severity === "note");
  const queries = data.queries.filter((query) => query.fundId === fund.id && query.status === "open");
  const deadlines = allDeadlines(data, fund, ctx);
  const overdue = deadlines.filter((row) => row.status === "overdue");
  const upcoming = deadlines.filter((row) => dueSoon(row, today, day90));
  const status = exceptions.length || overdue.length || queries.length ? "Issue" : notes.length || upcoming.length ? "Attention" : "Clear";
  return {
    id: "open-items",
    title: "Open items",
    status,
    finding:
      status === "Clear"
        ? "No open due-diligence items are flagged."
        : status === "Issue"
          ? `${exceptions.length + queries.length + overdue.length} blocking open items need review before completion.`
          : "Advisory notes or upcoming deadlines need review before completion.",
    evidence: [
      `Open queries: ${queries.length}${queries.length ? ` (${queries.map((query) => query.subject).join("; ")})` : ""}.`,
      `Risk register: ${countText(exceptions.length, "exception")} and ${countText(notes.length, "note")}${risks.length ? `; areas ${[...new Set(risks.map((risk) => risk.area))].join(", ")}.` : "."}`,
      `Deadlines: ${overdue.length} overdue; ${upcoming.length} due in the next 90 days${upcoming.length ? ` (${upcoming.slice(0, 4).map((row) => `${row.obligation} ${dateLabel(row.date)}`).join("; ")}${upcoming.length > 4 ? "; more" : ""})` : ""}.`,
    ],
    link: { label: "Risk register", path: "/risks" },
  };
}

function propertyTaxSection(data: AppData, fund: Fund, ctx: Ctx): DueDiligenceSection {
  const annual = propertyTaxView(data, fund.id, ctx);
  const duties = dutiesView(data, fund.id, ctx);
  const today = toISODate(ctx.now);
  const annualOpen = annual.rows.filter((row) => row.status === "modelled" && !row.paid);
  const annualOverdue = annualOpen.filter((row) => row.dueDate !== null && row.dueDate < today);
  const dutyOpen = duties.rows.filter((row) => row.status === "modelled" && !row.paid);
  const dutyOverdue = dutyOpen.filter((row) => row.deadline !== null && row.deadline < today);
  const notModelled = annual.rows.filter((row) => row.status !== "modelled").length + duties.rows.filter((row) => row.status !== "modelled").length;
  const status = annualOverdue.length || dutyOverdue.length ? "Issue" : notModelled || annualOpen.length || dutyOpen.length ? "Attention" : "Clear";
  return {
    id: "property-taxes",
    title: "Property taxes and duties",
    status,
    finding: status === "Clear" ? "Modelled property taxes and acquisition duties are paid or have no open amount." : "Property tax or duty support needs review.",
    evidence: [
      `Annual ${fund.market === "AU" ? "land tax" : "property tax"} modelled total: ${money(annual.totals.total, fund.currency)}; unpaid modelled properties: ${annualOpen.length}; overdue: ${annualOverdue.length}.`,
      `Acquisition duties modelled total: ${money(duties.totals.totalDuty, fund.currency)}; unpaid modelled properties: ${dutyOpen.length}; overdue: ${dutyOverdue.length}.`,
      `Not modelled or missing-data rows: ${notModelled}. These are excluded from totals, not shown as nil.`,
    ],
    link: { label: "Property taxes", path: "/property-taxes" },
  };
}

function assetsSection(data: AppData, fund: Fund, ctx: Ctx): DueDiligenceSection {
  const assets = assetRegisterView(data, fund.id, ctx);
  const costBase = costBaseView(data, fund.id, ctx);
  const differences = assets.comparisons.filter((row) => !row.agrees);
  const status = differences.length ? "Issue" : assets.warnings.length || assets.rows.length === 0 ? "Attention" : "Clear";
  return {
    id: "assets",
    title: "Capital allowances and cost base",
    status,
    finding: differences.length ? "The asset register does not agree to the trial balance tax adjustment." : "Asset deductions and unit cost base are available for review.",
    evidence: [
      `Asset register: ${countText(assets.rows.length, "asset")}; current-year deductions ${formatMoneyList(assets.totals.map((row) => ({ label: row.label, amount: row.deduction })), fund)}.`,
      differences.length ? `Register vs trial balance differences: ${differences.map((row) => `${row.label} ${money(row.difference, fund.currency)}`).join("; ")}.` : "Register deductions agree to the trial balance adjustment lines.",
      `Unrealised property gain: ${money(costBase.propertyTotals.unrealised, fund.currency)}; unit cost base closing total: ${money(costBase.unitTotals.closing, fund.currency)}; unit cost base unrealised gain: ${money(costBase.unitTotals.unrealised, fund.currency)}.`,
      fund.market === "AU" && costBase.deferredTax ? `Deferred tax indicator (${costBase.deferredTax.selected}): ${money(costBase.deferredTax.investors.find((row) => row.id === costBase.deferredTax?.selected)?.amount ?? 0, fund.currency)}.` : (costBase.sgNote ?? "No market-specific deferred tax indicator."),
    ],
    link: { label: "Assets & allowances", path: "/assets" },
  };
}

function dataQualitySection(data: AppData, fund: Fund, ctx: Ctx): DueDiligenceSection {
  const tb = tbView(data, fund.id, ctx.now);
  const unmapped = tb.rows.filter((row) => row.category === "unmapped");
  const manual = data.manualAdjustments.filter((row) => row.fundId === fund.id);
  const assumptionRules = rulesRegister({ market: fund.market, confidence: "ASSUMPTION" }).filteredRows;
  const status = unmapped.length ? "Issue" : manual.length || assumptionRules.length ? "Attention" : "Clear";
  return {
    id: "data-quality",
    title: "Data quality",
    status,
    finding: unmapped.length ? "Trial balance mapping is incomplete." : "Core data quality checks are visible with assumptions called out.",
    evidence: [
      `Trial balance: ${tb.balanced ? "balanced" : "out of balance"}; ${tb.allMapped ? "all accounts mapped" : `${unmapped.length} unmapped account${unmapped.length === 1 ? "" : "s"}`}; ${tb.matchesDistribution ? "matches distribution" : "differs from distribution"}.`,
      manual.length ? `Manual adjustments: ${manual.map((row) => `${row.label} ${money(row.amount, fund.currency)} — ${row.reason}`).join("; ")}.` : "No manual tax adjustments are recorded for this fund.",
      assumptionRules.length ? `Fund-relevant assumption rules to review: ${assumptionRules.slice(0, 6).map((row) => row.title).join("; ")}${assumptionRules.length > 6 ? "; more" : ""}.` : "No assumption-confidence rules are listed for this market.",
    ],
    link: { label: "Trial balance", path: "/trial-balance" },
  };
}

export function dueDiligenceView(data: AppData, fundId: FundId, ctx: Ctx): DueDiligenceView {
  const fund = getFund(data, fundId);
  if (!userHasFund(ctx.user, fund.id)) throw new Error(`Fund not available to ${ctx.user.name}`);
  const asAt = dateLabel(toISODate(ctx.now));
  const sections = [
    entitySection(data, fund),
    workflowSection(data, fund, ctx),
    distributionSection(data, fund, ctx),
    lodgmentSection(data, fund, ctx),
    openItemsSection(data, fund, ctx),
    propertyTaxSection(data, fund, ctx),
    assetsSection(data, fund, ctx),
    dataQualitySection(data, fund, ctx),
  ];
  const summary = {
    clear: sections.filter((section) => section.status === "Clear").length,
    attention: sections.filter((section) => section.status === "Attention").length,
    issue: sections.filter((section) => section.status === "Issue").length,
  };
  const preparedBy = `${ctx.user.name} · ${ctx.user.title}`;
  return {
    fund,
    preparedBy,
    asAt,
    sections,
    summary,
    csv: csvModel(fund, sections),
    doc: docModel(fund, preparedBy, asAt, sections),
  };
}
