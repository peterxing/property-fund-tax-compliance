import { useMemo } from "react";
import { returnView, toISODate } from "../../../domain/index.ts";
import type { Fund } from "../../../domain/types.ts";
import { useAppData, useCtx, useWorkflow } from "../../state.tsx";
import { PapersPanel } from "./PapersPanel.tsx";
import { ReadinessPanel } from "./ReadinessPanel.tsx";
import { lodgmentSectionFor } from "./model.ts";
import "./tax-returns.css";

/** Tax returns for one fund: whether the return is ready to lodge, the lodgment record, and the working papers. */
export function TaxReturnsBody({ fund }: { fund: Fund }) {
  const data = useAppData();
  const ctx = useCtx();
  const workflow = useWorkflow(fund.id);
  const view = useMemo(() => returnView(data, fund.id, ctx), [data, fund.id, ctx]);
  const section = lodgmentSectionFor({ user: ctx.user, fund, view, workflow });
  const today = toISODate(ctx.now);
  return (
    <div className="stack">
      <ReadinessPanel fund={fund} view={view} section={section} today={today} />
      <PapersPanel view={view} />
    </div>
  );
}
