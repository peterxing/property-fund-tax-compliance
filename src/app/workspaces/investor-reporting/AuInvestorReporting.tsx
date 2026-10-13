import { useMemo } from "react";
import { investorView, toISODate } from "../../../domain/index.ts";
import type { AuFund } from "../../../domain/types.ts";
import { useRouteParam } from "../../router.ts";
import { useAppData, useCtx, useFundCalc } from "../../state.tsx";
import { AiirLinesPanel } from "./AiirLinesPanel.tsx";
import { AiirPanel } from "./AiirPanel.tsx";
import { AuNoticesPanel } from "./AuNoticesPanel.tsx";
import { VsYearPanel } from "./VsYearPanel.tsx";
import { draftNoticeAmounts } from "./drafts.ts";
import { vsYearModel } from "./model.ts";

/** Investor reporting for an Australian fund: the notices, how they compare with the year, and the annual investment income report. */
export function AuInvestorReporting({ fund }: { fund: AuFund }) {
  const data = useAppData();
  const ctx = useCtx();
  const calc = useFundCalc(fund.id);
  const noticeParam = useRouteParam("notice");

  const view = useMemo(() => investorView(data, fund.id, ctx, noticeParam || undefined), [data, fund.id, ctx, noticeParam]);
  const vsYear = useMemo(() => {
    if (view.market !== "AU") return null;
    // The draft column only appears while an unpublished notice is waiting to be published.
    const drafts = view.notices.some((n) => !n.locked) ? draftNoticeAmounts(data, fund) : null;
    return vsYearModel(view.vsYear, drafts);
  }, [data, fund, view]);

  if (view.market !== "AU" || vsYear === null) return null;
  return (
    <>
      <AuNoticesPanel fund={fund} view={view} />
      <VsYearPanel model={vsYear} />
      <AiirPanel fund={fund} aiir={view.aiir} today={toISODate(ctx.now)} />
      <AiirLinesPanel aiir={view.aiir} trustAttributed={calc.au?.attributed ?? null} />
    </>
  );
}
