import { TableScroll } from "../../ui/index.ts";
import type { TableColumn } from "./analyticsModel.ts";

export interface FundTableProps<K extends string> {
  /** Names the table for assistive tech; it is not drawn (the panel heading already says it). */
  caption: string;
  columns: readonly TableColumn<K>[];
  rows: ReadonlyArray<Record<K | "fundId", string>>;
}

/** The numbers behind a chart as a real table: one row per fund, the non-numeric first column is the row header. */
export function FundTable<K extends string>({ caption, columns, rows }: FundTableProps<K>) {
  return (
    <TableScroll label={caption}>
      <table className="dt dt--hover analytics-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.numeric ? "num" : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.fundId}>
              {columns.map((column) =>
                column.numeric ? (
                  <td key={column.key} className="num">
                    {row[column.key]}
                  </td>
                ) : (
                  <th key={column.key} scope="row">
                    {row[column.key]}
                  </th>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
