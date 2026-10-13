import type { SgInvestorView } from "../../../domain/types.ts";
import { downloadCsv } from "../../exports/index.ts";
import { DownloadButton, EmptyState, Icon, Panel, TableScroll, cls } from "../../ui/index.ts";
import { s45gModel } from "./model.ts";
import "./investor-reporting.css";

/** The s45G withholding tax filing: when the tax is due at IRAS, how much was deducted and paid, and the unitholders it was deducted from. */
export function S45gPanel({ s45g }: { s45g: SgInvestorView["s45g"] }) {
  const model = s45gModel(s45g);
  return (
    <Panel title="Withholding tax filing · s45G" padded={false} actions={<DownloadButton size="sm" label="Download CSV" onDownload={() => downloadCsv(s45g.csv)} />}>
      <div className="ir-pad">
        <dl className="ir-facts">
          <div className="ir-fact">
            <dt>Date of payment</dt>
            <dd>{model.paymentDate}</dd>
          </div>
          <div className={cls("ir-fact", model.overdue && "ir-fact--overdue")}>
            <dt>File and pay by</dt>
            <dd>
              {model.overdue ? <Icon name="alert-triangle" size={14} /> : null}
              {model.overdue ? `${model.fileAndPayBy} — overdue` : model.fileAndPayBy}
            </dd>
          </div>
          <div className="ir-fact">
            <dt>Tax deducted</dt>
            <dd>{model.deducted}</dd>
          </div>
          <div className="ir-fact">
            <dt>Paid to IRAS</dt>
            <dd>{model.paid}</dd>
          </div>
        </dl>
      </div>
      {model.rows.length === 0 ? (
        <div className="ir-pad">
          <EmptyState title={model.emptyMessage ?? "No tax deducted from this distribution"} />
        </div>
      ) : (
        <TableScroll label="Tax deducted from each unitholder">
          <table className="dt ir-table">
            <caption className="sr-only">Tax deducted from each unitholder's distribution</caption>
            <thead>
              <tr>
                <th scope="col">Unitholder</th>
                <th scope="col">Class</th>
                <th scope="col">Rate</th>
                <th scope="col" className="num">
                  Taxable distribution
                </th>
                <th scope="col" className="num">
                  Tax deducted
                </th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row, index) => (
                <tr key={`${index}-${row.holder}`}>
                  <th scope="row">
                    <span className="ir-holder">
                      <span className="dt__title">{row.holder}</span>
                      <span className="dt__sub">{row.country}</span>
                    </span>
                  </th>
                  <td>{row.classLabel}</td>
                  <td className="ir-nowrap">{row.rate}</td>
                  <td className="num">{row.taxable}</td>
                  <td className="num">{row.deducted}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td />
                <td />
                <td className="num">{model.total.taxable}</td>
                <td className="num">{model.total.deducted}</td>
              </tr>
            </tfoot>
          </table>
        </TableScroll>
      )}
      <p className="ir-footnote">Filed and paid through myTax Portal by the 15th of the second month after the date of payment.</p>
    </Panel>
  );
}
