import { useMemo } from "react";
import { analyticsView, visibleFunds } from "../../domain/index.ts";
import { PortfolioFrame } from "../shell/PortfolioFrame.tsx";
import { useAppData, useCtx, useUi, useVisibleFunds } from "../state.tsx";
import { EmptyState, Panel } from "../ui/index.ts";
import { analyticsEmptyMessage } from "./analytics/analyticsModel.ts";
import { LeakagePanel, MixPanel } from "./analytics/ChartPanels.tsx";
import { DeadlinesPanel } from "./analytics/DeadlinesPanel.tsx";
import { ScenarioPanel } from "./analytics/ScenarioPanel.tsx";
import { WorkbookAction } from "./analytics/WorkbookAction.tsx";
import "./analytics/analytics.css";

/** Portfolio analytics for the funds the persona can see: tax leakage, distribution mix, deadlines and a what-if scenario. */
export default function Analytics() {
  const data = useAppData();
  const ctx = useCtx();
  const { jurisdiction, user, selectedFundId } = useUi();
  const funds = useVisibleFunds();
  const view = useMemo(() => analyticsView(data, ctx, jurisdiction), [data, ctx, jurisdiction]);

  const assigned = visibleFunds(data, user, "all").length;
  const empty = analyticsEmptyMessage(user.name, jurisdiction, assigned);

  return (
    <PortfolioFrame workspace="Analytics" title="Portfolio analytics" actions={<WorkbookAction />}>
      {funds.length === 0 ? (
        <Panel>
          <EmptyState icon="bar-chart" title={empty.title}>
            {empty.body}
          </EmptyState>
        </Panel>
      ) : (
        <>
          <LeakagePanel rows={view.leakage} headline={view.leakageHeadline} />
          <MixPanel rows={view.mix} headline={view.mixHeadline} />
          <DeadlinesPanel rows={view.deadlines} overdueCount={view.overdueCount} />
          <ScenarioPanel funds={funds} preferredFundId={selectedFundId} />
        </>
      )}
    </PortfolioFrame>
  );
}
