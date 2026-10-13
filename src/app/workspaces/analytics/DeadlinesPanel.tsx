import { useMemo, useState } from "react";
import type { DeadlineRow } from "../../../domain/types.ts";
import { Checkbox, Icon, Panel, TableScroll, Tag, useAnnounce } from "../../ui/index.ts";
import {
  DEADLINE_COLUMNS,
  DEADLINE_STATUS_LABEL,
  DEADLINE_STATUS_TONE,
  deadlineDate,
  deadlinesAnnouncement,
  deadlinesEmptyMessage,
  deadlinesTitle,
  obligationLabel,
  visibleDeadlines,
} from "./analyticsModel.ts";

const CAPTION = "Filing and notice deadlines by fund";

/** Every filing and notice deadline for the funds you can see, earliest first; completed ones stay hidden until asked for. */
export function DeadlinesPanel({ rows, overdueCount }: { rows: readonly DeadlineRow[]; overdueCount: number }) {
  const announce = useAnnounce();
  const [showCompleted, setShowCompleted] = useState(false);
  const shown = useMemo(() => visibleDeadlines(rows, showCompleted), [rows, showCompleted]);

  const toggle = (checked: boolean): void => {
    setShowCompleted(checked);
    announce(deadlinesAnnouncement(visibleDeadlines(rows, checked).length, checked));
  };

  return (
    <Panel
      title={deadlinesTitle(overdueCount)}
      actions={<Checkbox label="Show completed" checked={showCompleted} onCheckedChange={toggle} />}
    >
      {shown.length === 0 ? (
        <p className="analytics-empty">{deadlinesEmptyMessage(showCompleted, rows)}</p>
      ) : (
        <TableScroll label={CAPTION}>
          <table className="dt dt--hover analytics-table">
            <caption className="sr-only">{CAPTION}</caption>
            <thead>
              <tr>
                {DEADLINE_COLUMNS.map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={`${row.date}|${row.fundId}|${row.obligation}`}>
                  <td className="analytics-date">{deadlineDate(row.date)}</td>
                  <td>{row.fundName}</td>
                  <td>{obligationLabel(row.obligation)}</td>
                  <td>
                    <span className={`deadline-status deadline-status--${row.status}`}>
                      {row.status === "overdue" ? <Icon name="alert-circle" size={14} /> : null}
                      <Tag tone={DEADLINE_STATUS_TONE[row.status]}>{DEADLINE_STATUS_LABEL[row.status]}</Tag>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  );
}
