import { useMemo } from "react";
import { costBaseView } from "../../../domain/index.ts";
import type { Fund } from "../../../domain/types.ts";
import { useRouteParam, useSetRouteParams } from "../../router.ts";
import { useAppData, useCtx } from "../../state.tsx";
import { PropertiesPanel } from "./PropertiesPanel.tsx";
import { UnitCostBasePanel } from "./UnitCostBasePanel.tsx";
import { DEFAULT_INVESTOR, parseInvestor } from "./model.ts";

/** The Cost base & CGT workspace for one fund. The investor type for the deferred tax lives in the URL (`?investor=`) so a view can be shared. */
export function CostBaseBody({ fund }: { fund: Fund }) {
  const data = useAppData();
  const ctx = useCtx();
  const setParams = useSetRouteParams();
  const investor = parseInvestor(useRouteParam("investor"));
  const view = useMemo(() => costBaseView(data, fund.id, ctx, investor), [data, fund.id, ctx, investor]);

  return (
    <>
      <PropertiesPanel view={view} onInvestorChange={(next) => setParams({ investor: next === DEFAULT_INVESTOR ? null : next })} />
      <UnitCostBasePanel fund={fund} view={view} />
    </>
  );
}
