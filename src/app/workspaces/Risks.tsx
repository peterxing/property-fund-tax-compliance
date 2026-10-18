import { useMemo, useState } from "react";
import { riskRegister, type RiskFilters, type RiskSeverity } from "../../domain/portfolio/index.ts";
import { downloadCsv } from "../exports/index.ts";
import { PortfolioFrame } from "../shell/PortfolioFrame.tsx";
import { useAppData, useCtx, useUi } from "../state.tsx";
import { Button, DownloadButton, EmptyState, Kpi, KpiStrip, Panel, Select, TableScroll, Tag, TextInput } from "../ui/index.ts";
import { ageLabel, groupRisksByFund, riskHref, RISK_LABEL, RISK_TONE, visibleGroupRows } from "./risks/model.ts";
import "./calendar/calendar.css";
import "./risks/risks.css";

export default function Risks() {
  const data = useAppData();
  const ctx = useCtx();
  const { jurisdiction } = useUi();
  const [filters, setFilters] = useState<RiskFilters>({ severity: "exception" });
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());
  const register = useMemo(() => riskRegister(data, ctx, jurisdiction, filters), [data, ctx, jurisdiction, filters]);
  const groups = useMemo(() => groupRisksByFund(register.filteredRows), [register.filteredRows]);
  const toggleGroup = (fundId: string): void => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(fundId)) next.delete(fundId);
      else next.add(fundId);
      return next;
    });
  };

  return (
    <PortfolioFrame
      workspace="Risk register"
      title="Risk register"
      actions={<DownloadButton label="Download CSV" onDownload={() => downloadCsv(register.csv)} startedMessage="Risk CSV download started." />}
    >
      <KpiStrip label="Risk summary">
        <Kpi label="Exceptions" value={register.summary.bySeverity.exception} tone={register.summary.bySeverity.exception > 0 ? "bad" : "good"} />
        <Kpi label="Notes" value={register.summary.bySeverity.note} />
        <Kpi label="Areas" value={Object.keys(register.summary.byArea).length} />
        <Kpi label="Funds with risks" value={Object.keys(register.summary.byFund).length} />
      </KpiStrip>
      <Panel title="Filters">
        <div className="portfolio-filters" aria-label="Risk filters">
          <label>
            Severity
            <Select value={filters.severity ?? "all"} onValueChange={(severity) => setFilters({ ...filters, severity: severity as RiskSeverity | "all" })}>
              <option value="all">All severities</option>
              <option value="exception">Exception</option>
              <option value="note">Note</option>
            </Select>
          </label>
          <label>
            Area
            <Select value={filters.area ?? "all"} onValueChange={(area) => setFilters({ ...filters, area })}>
              <option value="all">All areas</option>
              {register.areaOptions.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Fund
            <Select value={filters.fundId ?? "all"} onValueChange={(fundId) => setFilters({ ...filters, fundId })}>
              <option value="all">All funds</option>
              {register.fundOptions.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Search
            <TextInput value={filters.search ?? ""} onValueChange={(search) => setFilters({ ...filters, search })} placeholder="risk, fund or detail" />
          </label>
        </div>
      </Panel>
      <Panel title="Open risks" padded={false}>
        {register.filteredRows.length === 0 ? (
          <div className="panel__body">
            <EmptyState icon="check" title="No open risks for the funds you can see">
              Adjust the filters or switch the jurisdiction if you need to review a different market.
            </EmptyState>
          </div>
        ) : (
          <div className="risk-groups">
            {groups.map((group) => {
              const expanded = expandedGroups.has(group.fundId);
              const shown = visibleGroupRows(group.rows, expanded);
              return (
                <details key={group.fundId} open className="risk-group">
                  <summary>
                    <span>{group.fund}</span>
                    <Tag>{`${group.rows.length} ${group.rows.length === 1 ? "risk" : "risks"}`}</Tag>
                  </summary>
                  <TableScroll label={`${group.fund} risks`}>
                    <table className="dt dt--hover risk-table">
                      <caption className="sr-only">{group.fund} risks</caption>
                      <thead>
                        <tr>
                          <th scope="col">Severity</th>
                          <th scope="col">Area</th>
                          <th scope="col">Title</th>
                          <th scope="col">Detail</th>
                          <th scope="col">Age</th>
                          <th scope="col">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <Tag tone={RISK_TONE[row.severity]}>{RISK_LABEL[row.severity]}</Tag>
                            </td>
                            <td>{row.area}</td>
                            <td className="risk-title">{row.title}</td>
                            <td className="risk-detail">{row.detail}</td>
                            <td>{ageLabel(row.ageDays)}</td>
                            <td>
                              <a href={riskHref(row)}>Open</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                  {group.rows.length > shown.length ? (
                    <div className="risk-group__more">
                      <Button size="sm" variant="secondary" onClick={() => toggleGroup(group.fundId)}>
                        Show more ({group.rows.length - shown.length})
                      </Button>
                    </div>
                  ) : group.rows.length > 50 ? (
                    <div className="risk-group__more">
                      <Button size="sm" variant="secondary" onClick={() => toggleGroup(group.fundId)}>
                        Show fewer
                      </Button>
                    </div>
                  ) : null}
                </details>
              );
            })}
          </div>
        )}
      </Panel>
    </PortfolioFrame>
  );
}
