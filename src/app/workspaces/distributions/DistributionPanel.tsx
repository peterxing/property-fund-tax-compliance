import type { Fund, FundCalc, WorkflowView } from "../../../domain/types.ts";
import { SankeyChart } from "../../charts/SankeyChart.tsx";
import { Icon, Panel } from "../../ui/index.ts";
import { ComponentsTable } from "./ComponentsTable.tsx";
import { DistributionKpis } from "./DistributionKpis.tsx";
import { emptyChartMessage, panelNote } from "./model.ts";
import "./distributions.css";

export interface DistributionPanelProps {
  fund: Fund;
  calc: FundCalc;
  workflow: WorkflowView;
}

/** "Distribution by tax character": the chart and its sentence, the components table and the key figures, read-only whatever the role. */
export function DistributionPanel({ fund, calc, workflow }: DistributionPanelProps) {
  const note = panelNote(workflow);
  return (
    <Panel
      title="Distribution by tax character"
      actions={
        note ? (
          <span className="dist-note">
            <Icon name={note.kind === "locked" ? "lock" : "info"} size={14} />
            {note.text}
          </span>
        ) : undefined
      }
    >
      <SankeyChart model={calc.sankey} summary={calc.narrative} emptyMessage={emptyChartMessage(workflow.can.edit)} className="dist-sankey" />
      <p className="dist-narrative">{calc.narrative}</p>
      <ComponentsTable fund={fund} calc={calc} canEdit={workflow.can.edit} />
      <DistributionKpis fund={fund} calc={calc} />
    </Panel>
  );
}
