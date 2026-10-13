import type { BulkRow, FundId } from "../../../domain/types.ts";
import { Checkbox, ExceptionChip, Icon, MarketBadge, Panel, StatusChip, TableScroll, cls } from "../../ui/index.ts";
import { approvalsText, fundHref, isActionable, nextIcon, selectAllState, type Selection } from "./bulkModel.ts";
import "./bulk-review.css";

export interface BulkTableProps {
  rows: readonly BulkRow[];
  selection: Selection;
  onToggle(fundId: FundId, checked: boolean): void;
  onToggleAll(checked: boolean): void;
}

/** Every visible fund with its status, approvals, exceptions, open queries and the next step for the current persona. */
export function BulkTable({ rows, selection, onToggle, onToggleAll }: BulkTableProps) {
  const all = selectAllState(rows, selection);
  return (
    <Panel padded={false} className="bulk-card">
      <TableScroll label="Funds with their review status">
        <table className="dt dt--hover bulk-table">
          <caption className="sr-only">Funds with their status, approvals, exceptions, open queries and the next step for you</caption>
          <thead>
            <tr>
              <th scope="col" className="bulk-select">
                <span className="sr-only">Row selection</span>
                <Checkbox aria-label="Select all funds" checked={all === "all"} indeterminate={all === "some"} onCheckedChange={onToggleAll} />
              </th>
              <th scope="col">Fund</th>
              <th scope="col">Status</th>
              <th scope="col">Approvals</th>
              <th scope="col">Exceptions</th>
              <th scope="col">Open queries</th>
              <th scope="col">Next for you</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <BulkTableRow key={row.fund.id} row={row} checked={selection.has(row.fund.id)} onToggle={onToggle} />
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}

interface BulkTableRowProps {
  row: BulkRow;
  checked: boolean;
  onToggle(fundId: FundId, checked: boolean): void;
}

function BulkTableRow({ row, checked, onToggle }: BulkTableRowProps) {
  const { fund, next } = row;
  const icon = nextIcon(next.kind);
  return (
    <tr className={cls(checked && "bulk-row--selected")}>
      <td className="bulk-select">
        <Checkbox aria-label={`Select ${fund.name}`} checked={checked} onCheckedChange={(value) => onToggle(fund.id, value)} />
      </td>
      <th scope="row" className="bulk-fund">
        <span className="bulk-fund__name">
          <MarketBadge market={fund.market} />
          <a className="bulk-fund__link" href={fundHref(fund.id)}>
            {fund.name}
          </a>
        </span>
        <span className="bulk-fund__governance">{row.governanceLabel}</span>
      </th>
      <td>
        <StatusChip status={row.status} labelled />
      </td>
      <td>{approvalsText(row)}</td>
      <td>
        <ExceptionChip count={row.exceptions} />
      </td>
      <td className="bulk-queries">{row.openQueries}</td>
      <td>
        <span className={cls("bulk-next", isActionable(next.kind) && "bulk-next--action", next.kind === "blocked" && "bulk-next--blocked")}>
          {icon ? <Icon name={icon} size={14} className="bulk-next__icon" /> : null}
          {next.text}
        </span>
      </td>
    </tr>
  );
}
