import { useMemo } from "react";
import { dueDiligenceView, type DueDiligenceSection, type DueDiligenceStatus } from "../../../domain/duediligence/index.ts";
import type { Fund } from "../../../domain/types.ts";
import { downloadCsv, downloadPdf } from "../../exports/index.ts";
import { useAppData, useCtx } from "../../state.tsx";
import { Badge, Banner, DownloadButton, Kpi, KpiStrip, Panel, TableScroll } from "../../ui/index.ts";
import "./due-diligence.css";

function tone(status: DueDiligenceStatus): "good" | "warn" | "bad" {
  return status === "Clear" ? "good" : status === "Attention" ? "warn" : "bad";
}

function EvidenceList({ section }: { section: DueDiligenceSection }) {
  return (
    <ul className="dd-evidence">
      {section.evidence.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export function DueDiligenceBody({ fund }: { fund: Fund }) {
  const data = useAppData();
  const ctx = useCtx();
  const view = useMemo(() => dueDiligenceView(data, fund.id, ctx), [data, fund.id, ctx]);

  return (
    <div className="stack dd">
      <Panel
        title="Tax due diligence report"
        actions={
          <>
            <DownloadButton size="sm" label="Download findings CSV" onDownload={() => downloadCsv(view.csv)} />
            <DownloadButton size="sm" label="Download PDF" onDownload={() => downloadPdf(view.doc)} />
          </>
        }
      >
        <p>
          <strong>{fund.name}</strong> · {fund.periodLabel} · {fund.market} {fund.regime}
        </p>
        <Banner tone="info">Read-only due-diligence pack. It uses figures held in this browser, is not tax advice, and no tax adviser has reviewed the rules or seeded facts.</Banner>
        <KpiStrip label="Due diligence status summary">
          <Kpi label="Clear" value={String(view.summary.clear)} sub="No current issue flagged" tone="good" />
          <Kpi label="Attention" value={String(view.summary.attention)} sub="Review or evidence needed" tone="warn" />
          <Kpi label="Issue" value={String(view.summary.issue)} sub="Open due-diligence blocker" tone="bad" />
          <Kpi label="Prepared by" value={view.preparedBy} sub={`As at ${view.asAt}`} />
        </KpiStrip>
      </Panel>

      <Panel title="Findings by area">
        <TableScroll label="Tax due diligence findings">
          <table className="dt">
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">Status</th>
                <th scope="col">Finding</th>
                <th scope="col">Evidence</th>
                <th scope="col">Workspace</th>
              </tr>
            </thead>
            <tbody>
              {view.sections.map((section) => (
                <tr key={section.id}>
                  <th scope="row">{section.title}</th>
                  <td><Badge tone={tone(section.status)}>{section.status}</Badge></td>
                  <td>{section.finding}</td>
                  <td><EvidenceList section={section} /></td>
                  <td><a href={`#${section.link.path}?fund=${encodeURIComponent(fund.id)}`}>{section.link.label}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>
    </div>
  );
}
