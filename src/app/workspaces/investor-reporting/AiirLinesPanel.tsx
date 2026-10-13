import type { AuInvestorView, Cents } from "../../../domain/types.ts";
import { downloadCsv } from "../../exports/index.ts";
import { DownloadButton, Panel, TableScroll } from "../../ui/index.ts";
import { aiirTable, type AiirAmountsModel } from "./model.ts";
import "./investor-reporting.css";

export interface AiirLinesPanelProps {
  aiir: AuInvestorView["aiir"];
  /** The attributed amount the trust itself calculated, so the investor lines can be tied back to it. */
  trustAttributed: Cents | null;
}

function NetAmount({ cell }: { cell: AiirAmountsModel["costBaseNet"] }) {
  return (
    <span className="ir-net">
      <span>{cell.amount}</span>
      {cell.kind === "nil" ? null : <span className="ir-net__kind">{cell.kind}</span>}
    </span>
  );
}

/** What the ATO is told about each investor, with the totals and the trust components that no investor line carries. */
export function AiirLinesPanel({ aiir, trustAttributed }: AiirLinesPanelProps) {
  const table = aiirTable(aiir, trustAttributed);
  return (
    <Panel title="AIIR investor lines" padded={false} actions={<DownloadButton size="sm" label="Download CSV" onDownload={() => downloadCsv(aiir.csv)} />}>
      <TableScroll label="AIIR investor lines">
        <table className="dt ir-table">
          <caption className="sr-only">Annual investment income report lines for each investor</caption>
          <thead>
            <tr>
              <th scope="col">Investor</th>
              <th scope="col">Tax status</th>
              <th scope="col" className="num">
                Units
              </th>
              <th scope="col" className="num">
                Attributed
              </th>
              <th scope="col" className="num">
                Cash
              </th>
              <th scope="col" className="num">
                Cost base net amount
              </th>
              <th scope="col" className="num">
                Withheld
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <span className="ir-holder">
                    <span className="dt__title">{row.holder}</span>
                    <span className="dt__sub">{row.country}</span>
                  </span>
                </th>
                <td>{row.status}</td>
                <td className="num">{row.units}</td>
                <td className="num">{row.attributed}</td>
                <td className="num">{row.cash}</td>
                <td className="num">
                  <NetAmount cell={row.costBaseNet} />
                </td>
                <td className="num">{row.withheld}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total reported</th>
              <td />
              <td className="num">{table.total.units}</td>
              <td className="num">{table.total.attributed}</td>
              <td className="num">{table.total.cash}</td>
              <td className="num">
                <NetAmount cell={table.total.costBaseNet} />
              </td>
              <td className="num">{table.total.withheld}</td>
            </tr>
            {table.unreported ? (
              <tr className="ir-gap">
                <th scope="row" colSpan={3}>
                  {table.unreported.label}
                </th>
                <td className="num">{table.unreported.amount}</td>
                <td colSpan={3} />
              </tr>
            ) : null}
          </tfoot>
        </table>
      </TableScroll>
      <p className="ir-footnote">The CSV is a working file with every tax character. The ATO receives the AIIR in its electronic reporting format.</p>
    </Panel>
  );
}
