// The "Download Power BI workbook" content: one tidy table per sheet, plain numbers in major units (dollars, 2 dp), ISO dates,
// plain-word headers, one row per record. Cells are always finite numbers or strings and every row is as wide as its header.
import type { AppData, Ctx, JurisdictionFilter, WithholdingRecon, WorkbookModel } from "../types.ts";
import { GOVERNANCE } from "../permissions.ts";
import { moduleFor } from "../modules.ts";
import { AUDIT_SIGNED_OFF, latestAudit, newestFirst } from "./audit.ts";
import { portfolioDeadlines, portfolioEntries } from "./portfolio.ts";
import { approvalChain, openQueryCount } from "./workflow.ts";

type Cell = string | number | null | undefined;
type Sheet = WorkbookModel["sheets"][number];

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const major = (cents: number): number => Math.round(finite(cents)) / 100;
const rounded = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(finite(value) * factor) / factor;
};
const clean = (cell: Cell): string | number => (typeof cell === "number" ? finite(cell) : typeof cell === "string" ? cell : "");

function sheet(name: string, columns: string[], rows: Cell[][]): Sheet {
  return { name, columns, rows: rows.map((row) => columns.map((_, i) => clean(row[i]))) };
}

const RECON_LABEL: Record<WithholdingRecon["status"], string> = {
  "not-remitted": "Not remitted",
  reconciled: "Reconciled",
  "under-remitted": "Under-remitted",
  "over-remitted": "Over-remitted",
};

const DEADLINE_LABEL = { overdue: "Overdue", open: "Open", done: "Done" } as const;

export function buildWorkbook(data: AppData, ctx: Ctx, jurisdiction: JurisdictionFilter): WorkbookModel {
  const entries = portfolioEntries(data, ctx, jurisdiction);

  const funds = sheet(
    "Funds",
    [
      "Fund", "Fund ID", "Market", "Regime", "Currency", "Sector", "Listed", "Period", "Period start", "Period end",
      "Workflow status", "Governance", "Units on issue", "Units on register", "Cash distribution", "Characterised total",
      "Withholding computed", "Withholding remitted", "Withholding variance", "Remittance status", "Exceptions", "Open queries",
    ],
    entries.map(({ fund, calc }) => [
      fund.name, fund.id, fund.market, fund.regime, fund.currency, fund.sector, fund.listed ? "Yes" : "No", fund.periodLabel,
      fund.periodStart, fund.periodEnd, fund.status, GOVERNANCE[fund.governance].label, fund.unitsOnIssue, calc.registerUnits,
      major(calc.cash), major(calc.characterTotal), major(calc.recon.computed), major(calc.recon.remitted ?? 0),
      major(calc.recon.variance ?? 0), RECON_LABEL[calc.recon.status], calc.exceptions, openQueryCount(data, fund.id),
    ]),
  );

  const components = sheet(
    "Components",
    ["Fund", "Fund ID", "Currency", "Component", "Treatment", "Counts toward tax character", "Amount", "Cents per unit", "Paid gross", "Paid net", "Withheld", "Not on register"],
    entries.flatMap(({ fund, calc }) =>
      calc.components.map((c) => [
        fund.name, fund.id, fund.currency, c.label, c.treatment, c.attributed ? "Yes" : "No", major(c.amount), rounded(c.centsPerUnit, 6),
        major(c.toGross), major(c.toNet), major(c.withheld), major(c.unallocated),
      ]),
    ),
  );

  const holders = sheet(
    "Holders",
    ["Fund", "Fund ID", "Currency", "Holder", "Country", "Tax status", "Units", "Share of units (%)", "Cash distribution", "Withholding", "Net paid", "Withholding rates"],
    entries.flatMap(({ fund, calc }) =>
      calc.holders.map((h) => [
        fund.name, fund.id, fund.currency, h.holder.holder, h.holder.country, h.statusLabel, h.holder.units, rounded(h.share * 100, 4),
        major(h.cash), major(h.withheld), major(h.net), h.rateSummary,
      ]),
    ),
  );

  const leakageRows = entries.map(({ fund, calc }) => moduleFor(fund.market).leakage(fund, calc));
  const leakage = sheet(
    "Leakage",
    ["Fund", "Fund ID", "Currency", "Distribution", "Final withholding", "Withholding holders can recover", "Tax paid by the trustee", "Total leakage (%)"],
    leakageRows.map((r) => [r.fundName, r.fundId, r.currency, major(r.distribution), major(r.finalWithholding), major(r.recoverable), major(r.trusteeTax), rounded(r.totalPct, 2)]),
  );

  const mix = sheet(
    "Mix",
    ["Fund", "Fund ID", "Taxable income (%)", "Capital gains (%)", "Tax-exempt (%)", "Tax-deferred and capital (%)"],
    entries.map(({ fund, calc }) => {
      const m = moduleFor(fund.market).mix(fund, calc);
      return [m.fundName, m.fundId, rounded(m.taxable, 2), rounded(m.capitalGains, 2), rounded(m.taxExempt, 2), rounded(m.taxDeferredAndCapital, 2)];
    }),
  );

  const deadlines = sheet(
    "Deadlines",
    ["Due date", "Fund", "Fund ID", "Obligation", "Status"],
    portfolioDeadlines(data, entries, ctx.now).map((d) => [d.date, d.fundName, d.fundId, d.obligation, DEADLINE_LABEL[d.status] ?? d.status]),
  );

  const checks = sheet(
    "Checks",
    ["Fund", "Fund ID", "Severity", "Check", "Detail"],
    entries.flatMap(({ fund, calc }) => calc.checks.map((c) => [fund.name, fund.id, c.severity === "exception" ? "Exception" : "Note", c.title, c.detail])),
  );

  const workflow = sheet(
    "Workflow",
    [
      "Fund", "Fund ID", "Workflow status", "Governance", "Reviewer approval", "Reviewer approved by", "Tax agent approval", "Tax agent approved by",
      "Signed off by", "Signed off at", "Open queries", "Open exceptions", "Lodgments recorded", "Last activity", "Last activity at",
    ],
    entries.map(({ fund, calc }) => {
      const chain = approvalChain(data, fund);
      const approval = (level: "review" | "agent") => {
        const step = chain.find((s) => s.level === level);
        return step ? { state: step.done ? "Done" : "Pending", by: step.by ?? "" } : { state: "Not required", by: "" };
      };
      const review = approval("review");
      const agent = approval("agent");
      const signedOff = fund.status === "Signed off" ? latestAudit(data.audit, fund.id, AUDIT_SIGNED_OFF) : undefined;
      const last = newestFirst(data.audit.filter((a) => a.fundId === fund.id), (a) => a.at)[0];
      return [
        fund.name, fund.id, fund.status, GOVERNANCE[fund.governance].label, review.state, review.by, agent.state, agent.by,
        signedOff?.actor ?? "", signedOff?.at ?? "", openQueryCount(data, fund.id), calc.exceptions,
        data.lodgments.filter((l) => l.fundId === fund.id).length, last?.action ?? "", last?.at ?? "",
      ];
    }),
  );

  const suffix = jurisdiction === "all" ? "" : `-${jurisdiction.toLowerCase()}`;
  return {
    fileName: `property-fund-tax-compliance-portfolio${suffix}.xlsx`,
    sheets: [funds, components, holders, leakage, mix, deadlines, checks, workflow],
  };
}

