import type { Fund, TbView } from "../../../domain/types.ts";
import { CURRENCY_SYMBOL } from "../../../domain/format.ts";
import { Panel, TableScroll } from "../../ui/index.ts";
import { bookToTaxLines, changePctText, moneyExact } from "./model.ts";
import "./trial-balance.css";

/** The reconciliation from accounting profit to taxable income, line by line, as the trial balance gives it. */
export function BookToTaxPanel({ fund, view }: { fund: Fund; view: TbView }) {
  const { bookToTax } = view;
  const { extra } = bookToTax;
  return (
    <Panel title="Book to tax" padded={false}>
      <TableScroll label="Book to tax reconciliation">
        <table className="dt dt--dense tb-table">
          <caption>{bookToTax.title}</caption>
          <thead>
            <tr>
              <th scope="col">Reconciliation</th>
              <th scope="col" className="num">
                Current {CURRENCY_SYMBOL[fund.currency]}
              </th>
              <th scope="col" className="num">
                Prior
              </th>
              <th scope="col" className="num">
                Change
              </th>
              <th scope="col" className="num">
                Change %
              </th>
            </tr>
          </thead>
          <tbody>
            {bookToTaxLines(bookToTax).map((line, index) => (
              <tr key={`${index}-${line.label}`} className={line.kind === "result" ? "total" : line.kind === "subtotal" ? "tb-subtotal" : undefined}>
                <th scope="row">{line.label}</th>
                <td className="num">{moneyExact(line.amount, fund.currency)}</td>
                <td className="num">{line.prior === undefined ? "–" : moneyExact(line.prior, fund.currency)}</td>
                <td className="num">{line.change === undefined ? "–" : moneyExact(line.change, fund.currency)}</td>
                <td className="num">{line.changePct === undefined ? "–" : changePctText(line.changePct)}</td>
              </tr>
            ))}
            {extra ? (
              <tr className="tb-extra">
                <th scope="row">{extra.label}</th>
                <td className="num">{moneyExact(extra.amount, fund.currency)}</td>
                <td className="num">–</td>
                <td className="num">–</td>
                <td className="num">–</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}
