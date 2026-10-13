import type { CostBaseView, Fund } from "../../../domain/types.ts";
import { downloadCsv } from "../../exports/index.ts";
import { DownloadButton, Panel, TableScroll } from "../../ui/index.ts";
import { Gain } from "./Gain.tsx";
import { unitPriceHeading, unitTable } from "./model.ts";
import "./cost-base.css";

export interface UnitCostBasePanelProps {
  fund: Fund;
  view: CostBaseView;
}

/** What each holder's units cost, how this period's distributions moved that cost, and what the units are worth. */
export function UnitCostBasePanel({ fund, view }: UnitCostBasePanelProps) {
  const table = unitTable(view);
  return (
    <Panel title="Unit cost base" padded={false} actions={<DownloadButton size="sm" label="Download CSV" onDownload={() => downloadCsv(view.unitsCsv)} />}>
      <dl className="cb-facts">
        <div className="cb-fact">
          <dt>{unitPriceHeading(fund.periodEnd)}</dt> <dd>{view.unitPriceLabel}</dd>
        </div>
        <div className="cb-fact">
          <dt>This period's adjustment</dt> <dd>{view.adjustmentLabel}</dd>
        </div>
      </dl>
      <TableScroll label="Unit cost base by holder">
        <table className="dt cb-table cb-table--units">
          <caption className="sr-only">Cost base, market value and unrealised gain for each holder's units</caption>
          <thead>
            <tr>
              <th scope="col">Holder</th>
              <th scope="col" className="num">
                Units
              </th>
              <th scope="col" className="num">
                Opening cost base
              </th>
              <th scope="col" className="num">
                Adjustment
              </th>
              <th scope="col" className="num">
                Closing cost base
              </th>
              <th scope="col" className="num">
                Per unit
              </th>
              <th scope="col" className="num">
                Market value
              </th>
              <th scope="col" className="num">
                Unrealised gain
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <span className="cb-name">
                    <span className="dt__title">{row.holder}</span>
                    <span className="dt__sub">{row.status}</span>
                  </span>
                </th>
                <td className="num">{row.units}</td>
                <td className="num">{row.opening}</td>
                <td className="num">{row.adjustment}</td>
                <td className="num">{row.closing}</td>
                <td className="num">{row.perUnit}</td>
                <td className="num">{row.marketValue}</td>
                <td className="num">
                  <Gain cell={row.unrealised} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="num">{table.total.units}</td>
              <td className="num">{table.total.opening}</td>
              <td className="num">{table.total.adjustment}</td>
              <td className="num">{table.total.closing}</td>
              <td />
              <td className="num">{table.total.marketValue}</td>
              <td className="num">
                <Gain cell={table.total.unrealised} />
              </td>
            </tr>
          </tfoot>
        </table>
      </TableScroll>
      <p className="cb-footnote">{view.footnote}</p>
    </Panel>
  );
}
