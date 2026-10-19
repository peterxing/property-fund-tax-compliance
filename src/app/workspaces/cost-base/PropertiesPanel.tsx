import { useId } from "react";
import type { CostBaseView, DeferredTaxInvestor } from "../../../domain/types.ts";
import { downloadCsv, downloadPdf } from "../../exports/index.ts";
import { DownloadButton, Panel, Select, TableScroll } from "../../ui/index.ts";
import { Gain } from "./Gain.tsx";
import { cgtSummary, currencyOf, deferredTaxModel, parseInvestor, propertyTable } from "./model.ts";
import "./cost-base.css";

export interface PropertiesPanelProps {
  view: CostBaseView;
  onInvestorChange(investor: DeferredTaxInvestor): void;
}

/** What each property cost against what it is worth. Australian funds add the CGT summary and the deferred tax for a chosen type of investor. */
export function PropertiesPanel({ view, onInvestorChange }: PropertiesPanelProps) {
  const selectId = useId();
  const deferredId = useId();
  const currency = currencyOf(view.market);
  const au = view.market === "AU";
  const table = propertyTable(view);
  const summary = cgtSummary(view.cgtSummary, currency);
  const deferred = view.deferredTax ? deferredTaxModel(view.deferredTax, currency) : null;

  return (
    <Panel
      title={au ? "Unrealised CGT on properties" : "Unrealised gains on properties"}
      padded={false}
      actions={
        <>
          {deferred ? (
            <div className="cb-investor">
              <label htmlFor={selectId} className="label-caps cb-investor__label">
                Deferred tax for
              </label>
              <Select
                id={selectId}
                value={deferred.selected}
                options={deferred.options}
                onValueChange={(value) => onInvestorChange(parseInvestor(value))}
                wrapperClassName="cb-investor__select"
                aria-controls={deferredId}
              />
            </div>
          ) : null}
          <DownloadButton size="sm" label="Download CSV" onDownload={() => downloadCsv(view.propertiesCsv)} />
          <DownloadButton size="sm" label="Download PDF" onDownload={() => downloadPdf(view.propertiesDoc)} />
        </>
      }
    >
      <p className="cb-asat">{view.asAtLabel}</p>
      <TableScroll label={au ? "Unrealised CGT on properties" : "Unrealised gains on properties"}>
        <table className="dt cb-table">
          <caption>Tax cost base, valuation and unrealised gain for each property</caption>
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col">Acquired</th>
              <th scope="col" className="num">
                {au ? "Tax cost base" : "Cost"}
              </th>
              <th scope="col" className="num">
                Valuation
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
                    <span className="dt__title">{row.name}</span>
                    <span className="dt__sub">{row.location}</span>
                  </span>
                </th>
                <td className="cb-nowrap">
                  {row.acquired}
                  {row.held ? <span className="dt__sub">{row.held}</span> : null}
                </td>
                <td className="num">
                  {row.costBase}
                  {row.capitalWorks ? <span className="dt__sub">{row.capitalWorks}</span> : null}
                </td>
                <td className="num">{row.valuation}</td>
                <td className="num">
                  <Gain cell={row.unrealised} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td />
              <td className="num">{table.total.costBase}</td>
              <td className="num">{table.total.valuation}</td>
              <td className="num">
                <Gain cell={table.total.unrealised} />
              </td>
            </tr>
          </tfoot>
        </table>
      </TableScroll>
      {summary.length > 0 ? (
        <dl className="cb-summary">
          {summary.map((line) => (
            <div key={line.label} className={line.emphasis ? "cb-summary__row cb-summary__row--emphasis" : "cb-summary__row"}>
              <dt>{line.label}</dt> <dd>{line.amount}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {deferred ? (
        <div id={deferredId} className="cb-deferred" aria-live="polite" aria-atomic="true">
          <p className="cb-deferred__line">
            <span>{deferred.heading}</span> <span className="cb-deferred__amount">{deferred.amount}</span>
          </p>
          <p className="cb-deferred__note">{deferred.note}</p>
        </div>
      ) : null}
      {view.sgNote ? <p className="cb-note">{view.sgNote}</p> : null}
      {view.sgValuationNote ? <p className="cb-note">{view.sgValuationNote}</p> : null}
    </Panel>
  );
}
