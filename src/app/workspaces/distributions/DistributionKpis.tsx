import { useMemo } from "react";
import type { Fund, FundCalc } from "../../../domain/types.ts";
import { Kpi, KpiStrip } from "../../ui/index.ts";
import { kpiModels } from "./model.ts";
import "./distributions.css";

/** The three key figures under the table: fund payment, cost base and withholding (Australia); income, payout and trustee tax (Singapore). */
export function DistributionKpis({ fund, calc }: { fund: Fund; calc: FundCalc }) {
  const kpis = useMemo(() => kpiModels(fund, calc), [fund, calc]);
  return (
    <KpiStrip label="Distribution summary" className="dist-kpis">
      {kpis.map((kpi) => (
        <Kpi
          key={kpi.id}
          label={kpi.label}
          tone={kpi.tone}
          value={
            <>
              {kpi.value}
              {kpi.unit ? (
                <>
                  {" "}
                  <span className="dist-unit">{kpi.unit}</span>
                </>
              ) : null}
            </>
          }
          sub={kpi.sub}
        />
      ))}
    </KpiStrip>
  );
}
