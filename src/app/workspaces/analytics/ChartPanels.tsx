import type { LeakageRow, MixRow } from "../../../domain/types.ts";
import { StackedBars } from "../../charts/StackedBars.tsx";
import { Panel } from "../../ui/index.ts";
import {
  LEAKAGE_COLUMNS,
  LEAKAGE_SERIES,
  MIX_COLUMNS,
  MIX_SERIES,
  colorsOf,
  formatPercentTick,
  formatShare,
  leakageChartRows,
  leakageSummary,
  leakageTableRows,
  legendOf,
  mixChartRows,
  mixSummary,
  mixTableRows,
} from "./analyticsModel.ts";
import { FundTable } from "./FundTable.tsx";

const LEAKAGE_COLORS = colorsOf(LEAKAGE_SERIES);
const LEAKAGE_LEGEND = legendOf(LEAKAGE_SERIES);
const MIX_COLORS = colorsOf(MIX_SERIES);
const MIX_LEGEND = legendOf(MIX_SERIES);

/** How much of each distribution the funds lose to tax, with the headline finding, the bars and the figures. */
export function LeakagePanel({ rows, headline }: { rows: readonly LeakageRow[]; headline: string }) {
  return (
    <Panel title="Tax leakage — % of each distribution">
      <p className="analytics-headline">{headline}</p>
      {rows.length > 0 ? (
        <>
          <StackedBars
            className="analytics-chart"
            rows={leakageChartRows(rows)}
            scale="max"
            summary={leakageSummary(rows)}
            segmentColors={LEAKAGE_COLORS}
            legend={LEAKAGE_LEGEND}
            formatValue={formatShare}
            formatTick={formatPercentTick}
          />
          <FundTable caption="Tax leakage by fund" columns={LEAKAGE_COLUMNS} rows={leakageTableRows(rows)} />
        </>
      ) : null}
    </Panel>
  );
}

/** What each distribution is made of, as 100% bars with the headline finding and the figures. */
export function MixPanel({ rows, headline }: { rows: readonly MixRow[]; headline: string }) {
  return (
    <Panel title="Distribution mix by tax character">
      <p className="analytics-headline">{headline}</p>
      {rows.length > 0 ? (
        <>
          <StackedBars
            className="analytics-chart"
            rows={mixChartRows(rows)}
            scale={100}
            summary={mixSummary(rows)}
            segmentColors={MIX_COLORS}
            legend={MIX_LEGEND}
            formatValue={formatShare}
            formatTick={formatPercentTick}
          />
          <FundTable caption="Distribution mix by fund, as a percentage of the distribution" columns={MIX_COLUMNS} rows={mixTableRows(rows)} />
        </>
      ) : null}
    </Panel>
  );
}
