import { useId, useMemo, useRef, useState } from "react";
import { bulkRows, visibleFunds } from "../../domain/index.ts";
import type { BulkKind, FundId, UserId } from "../../domain/types.ts";
import { PortfolioFrame } from "../shell/PortfolioFrame.tsx";
import { useAppData, useCtx, useDispatchBulk, useUi } from "../state.tsx";
import { EmptyState, Panel } from "../ui/index.ts";
import { BulkActions } from "./bulk-review/BulkActions.tsx";
import { BulkResultBanner } from "./bulk-review/BulkResultBanner.tsx";
import { BulkTable } from "./bulk-review/BulkTable.tsx";
import {
  EMPTY_SELECTION,
  bulkButtons,
  bulkOutcome,
  emptyMessage,
  pruneSelection,
  selectedRows,
  selectionAfterRun,
  selectionSummary,
  setAllSelected,
  setSelected,
  type BulkOutcome,
  type Selection,
} from "./bulk-review/bulkModel.ts";
import "./bulk-review/bulk-review.css";

const FOOTNOTE =
  "Bulk approval and sign-off skip funds with open exceptions; bulk sign-off also skips funds with open queries or missing approvals. Sign those off from the fund itself.";

/** Review and sign off many funds at once: tick funds, then submit, approve or sign them off. Funds that can't take the step are skipped with a reason. */
export default function BulkReview() {
  const data = useAppData();
  const ctx = useCtx();
  const { jurisdiction, user } = useUi();
  const dispatchBulk = useDispatchBulk();
  const summaryId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => bulkRows(data, ctx, jurisdiction), [data, ctx, jurisdiction]);

  // The ticks and the last result belong to the persona that made them: switching persona starts clean.
  const [ticked, setTicked] = useState<{ owner: UserId; ids: Selection }>({ owner: user.id, ids: EMPTY_SELECTION });
  const [report, setReport] = useState<{ owner: UserId; outcome: BulkOutcome } | null>(null);
  const selection = useMemo(() => (ticked.owner === user.id ? pruneSelection(ticked.ids, rows) : EMPTY_SELECTION), [ticked, user.id, rows]);
  const outcome = report !== null && report.owner === user.id ? report.outcome : null;

  const buttons = useMemo(() => bulkButtons(rows, selection, user.role), [rows, selection, user.role]);
  const summary = selectionSummary(rows, selection, user.role);

  const choose = (ids: Selection): void => setTicked({ owner: user.id, ids });
  const nameOf = (fundId: FundId): string => data.funds.find((fund) => fund.id === fundId)?.name ?? fundId;

  const run = (kind: BulkKind): void => {
    const ids = selectedRows(rows, selection).map((row) => row.fund.id);
    if (ids.length === 0) return;
    const result = dispatchBulk(kind, ids);
    setReport({ owner: user.id, outcome: bulkOutcome(kind, result, nameOf, user.role) });
    choose(selectionAfterRun(selection, result));
  };

  const dismiss = (): void => {
    setReport(null);
    actionsRef.current?.querySelector("button")?.focus();
  };

  const assigned = visibleFunds(data, user, "all").length;
  const empty = emptyMessage(user.name, jurisdiction, assigned);

  return (
    <PortfolioFrame
      workspace="Bulk review"
      title="Review and sign off in bulk"
      actions={<BulkActions ref={actionsRef} buttons={buttons} summaryId={summaryId} onRun={run} />}
    >
      <div className="bulk">
        <div className="bulk__result" role="status">
          {outcome ? <BulkResultBanner outcome={outcome} onDismiss={dismiss} /> : null}
        </div>
        <p id={summaryId} className="bulk__summary" aria-live="polite" aria-atomic="true">
          {summary}
        </p>
        {rows.length > 0 ? (
          <BulkTable
            rows={rows}
            selection={selection}
            onToggle={(fundId, checked) => choose(setSelected(selection, fundId, checked))}
            onToggleAll={(checked) => choose(setAllSelected(selection, rows, checked))}
          />
        ) : (
          <Panel>
            <EmptyState icon="list-checks" title={empty.title}>
              {empty.body}
            </EmptyState>
          </Panel>
        )}
        <p className="bulk__note">{FOOTNOTE}</p>
      </div>
    </PortfolioFrame>
  );
}
