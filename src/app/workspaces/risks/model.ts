import type { PortfolioRiskRow, RiskSeverity } from "../../../domain/portfolio/index.ts";

export const RISK_LABEL: Record<RiskSeverity, string> = { exception: "Exception", note: "Note" };
export const RISK_TONE: Record<RiskSeverity, "bad" | "info"> = { exception: "bad", note: "info" };

export function ageLabel(ageDays: number | null): string {
  if (ageDays === null) return "—";
  return `${ageDays} day${ageDays === 1 ? "" : "s"}`;
}

export function riskHref(row: PortfolioRiskRow): string {
  return `#${row.workspaceRoute}?fund=${encodeURIComponent(row.fundId)}`;
}

export interface RiskGroup {
  fundId: string;
  fund: string;
  rows: PortfolioRiskRow[];
}

export function groupRisksByFund(rows: readonly PortfolioRiskRow[]): RiskGroup[] {
  const groups = new Map<string, RiskGroup>();
  for (const row of rows) {
    const group = groups.get(row.fundId) ?? { fundId: row.fundId, fund: row.fund, rows: [] };
    group.rows.push(row);
    groups.set(row.fundId, group);
  }
  return [...groups.values()];
}

export function visibleGroupRows(rows: readonly PortfolioRiskRow[], expanded: boolean, pageSize = 50): PortfolioRiskRow[] {
  return expanded ? [...rows] : rows.slice(0, pageSize);
}
