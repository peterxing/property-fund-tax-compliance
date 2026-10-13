import { useMemo } from "react";
import type { Fund, FundCalc } from "../../../domain/types.ts";
import { TableScroll, cls } from "../../ui/index.ts";
import { NIL, distributionTable, emptyTableMessage } from "./model.ts";
import "./distributions.css";

/** Nothing is written as a dash; assistive technology gets the word instead. */
function Amount({ text }: { text: string }) {
  if (text !== NIL) return <>{text}</>;
  return (
    <>
      <span aria-hidden="true">{NIL}</span>
      <span className="sr-only">Nil</span>
    </>
  );
}

/** The components that have an amount with where each one goes, a total, and (Australia) the cash paid. */
export function ComponentsTable({ fund, calc, canEdit }: { fund: Fund; calc: FundCalc; canEdit: boolean }) {
  const { columns, rows, total, cash } = useMemo(() => distributionTable(fund, calc), [fund, calc]);
  // Component, Amount and c / unit, then one column per destination.
  const width = 3 + columns.length;
  return (
    <TableScroll label="Distribution components" className="dist-table-scroll">
      <table className={cls("dt", "dist-table", columns.length > 3 && "dist-table--crowded")}>
        <caption className="sr-only">Each component of the distribution, with its amount, cents per unit and where it goes</caption>
        <thead>
          <tr>
            <th scope="col">Component</th>
            <th scope="col" className="num">
              Amount
            </th>
            <th scope="col" className="num">
              c / unit
            </th>
            {columns.map((column) => (
              <th scope="col" className="num" key={column.key}>
                <span className={cls("dist-key", `dist-key--${column.key}`)} aria-hidden="true" />
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="dist-table__empty" colSpan={width}>
                {emptyTableMessage(canEdit)}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  <span className="dt__title">{row.label}</span>
                  <span className="dt__sub">{row.treatment}</span>
                </th>
                <td className="num">
                  <Amount text={row.amount} />
                </td>
                <td className="num">
                  <Amount text={row.perUnit} />
                </td>
                {row.cells.map((cell, index) => (
                  <td className="num" key={columns[index]?.key ?? index}>
                    <Amount text={cell} />
                  </td>
                ))}
              </tr>
            ))
          )}
          <tr className="total">
            <th scope="row">{total.label}</th>
            <td className="num">
              <Amount text={total.amount} />
            </td>
            <td className="num">
              <Amount text={total.perUnit} />
            </td>
            {total.cells.map((cell, index) => (
              <td className="num" key={columns[index]?.key ?? index}>
                <Amount text={cell} />
              </td>
            ))}
          </tr>
          {cash ? (
            <tr>
              <th scope="row">
                <span className="dt__title">{cash.label}</span>
                <span className="dt__sub">{cash.note}</span>
              </th>
              <td className="num">
                <Amount text={cash.amount} />
              </td>
              <td className="num">
                <Amount text={cash.perUnit} />
              </td>
              <td colSpan={columns.length} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </TableScroll>
  );
}
