import { useMemo } from "react";
import { auditFor } from "../../../../domain/selectors.ts";
import { useAppData } from "../../../state.tsx";
import { EmptyState } from "../../../ui/index.ts";
import { auditRows } from "./tabModel.ts";

/** Everything done to this distribution, newest first. */
export function AuditTab({ fundId }: { fundId: string }) {
  const data = useAppData();
  const rows = useMemo(() => auditRows(auditFor(data, fundId)), [data, fundId]);

  if (rows.length === 0) {
    return <EmptyState title="No audit entries yet">Changes to this distribution are recorded here as they happen.</EmptyState>;
  }

  return (
    <div className="rv-stack">
      <p className="rv-summary">Every change to this distribution, newest first.</p>
      <ol className="rv-audit">
        {rows.map((row) => (
          <li key={row.id} className="rv-audit__row">
            <time className="rv-audit__time" dateTime={row.at}>
              {row.atText}
            </time>
            <div className="rv-audit__body">
              <p className="rv-audit__line">
                <strong className="rv-audit__action">{row.action}</strong>
                <span aria-hidden="true"> · </span>
                <span className="sr-only"> by </span>
                <span>{row.actor}</span>
              </p>
              {row.detail ? <p className="rv-audit__detail">{row.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
