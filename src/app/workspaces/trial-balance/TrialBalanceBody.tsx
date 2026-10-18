import { useMemo } from "react";
import { tbView } from "../../../domain/index.ts";
import type { Fund } from "../../../domain/types.ts";
import { useAppData, useCtx, useWorkflow } from "../../state.tsx";
import { AdjustmentsPanel } from "./AdjustmentsPanel.tsx";
import { BookToTaxPanel } from "./BookToTaxPanel.tsx";
import { ComponentsPanel } from "./ComponentsPanel.tsx";
import { HeaderPanel } from "./HeaderPanel.tsx";
import { MappingPanel } from "./MappingPanel.tsx";
import "./trial-balance.css";

const VIEW_ONLY = "View only for your role";

/** The Trial balance workspace for one fund. Editing follows the workflow's `can.edit`; when it is off, the reason is shown beside what it locks. */
export function TrialBalanceBody({ fund }: { fund: Fund }) {
  const data = useAppData();
  const ctx = useCtx();
  const workflow = useWorkflow(fund.id);
  const view = useMemo(() => tbView(data, fund.id, ctx.now), [data, fund.id, ctx.now]);
  const canEdit = workflow.can.edit;
  const lockNote = canEdit ? null : workflow.lockedReason || VIEW_ONLY;

  return (
    <>
      <HeaderPanel fund={fund} view={view} canEdit={canEdit} lockNote={lockNote} />
      <BookToTaxPanel fund={fund} view={view} />
      <div className="tb-adjustments-wrap">
        <AdjustmentsPanel fund={fund} view={view} canEdit={canEdit} />
      </div>
      <ComponentsPanel fund={fund} view={view} canEdit={canEdit} lockNote={lockNote} />
      <MappingPanel fund={fund} view={view} canEdit={canEdit} />
    </>
  );
}
