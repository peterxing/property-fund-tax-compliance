import { Panel, TableScroll, Tag } from "../../ui/index.ts";
import { VARIANCE_LABEL, type VsYearModel, type VsYearRowModel } from "./model.ts";
import "./investor-reporting.css";

function Difference({ row }: { row: VsYearRowModel }) {
  return (
    <span className="ir-diff">
      {row.variance === "none" ? null : <Tag tone="warn">{VARIANCE_LABEL[row.variance]}</Tag>}
      <span>{row.difference}</span>
    </span>
  );
}

function VsYearRow({ row, hasDrafts }: { row: VsYearRowModel; hasDrafts: boolean }) {
  return (
    <tr>
      <th scope="row">{row.label}</th>
      <td className="num">{row.published}</td>
      {hasDrafts ? <td className="num">{row.drafts}</td> : null}
      <td className="num">{row.year}</td>
      <td className="num">
        <Difference row={row} />
      </td>
    </tr>
  );
}

/** What the notices already published say, against what the year's calculation says each component is. */
export function VsYearPanel({ model }: { model: VsYearModel }) {
  return (
    <Panel title="Notices against the year's components" padded={false}>
      <TableScroll label="Notices against the year's components">
        <table className="dt ir-table">
          <caption>Amounts notified during the year compared with the year's components</caption>
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col" className="num">
                Published notices
              </th>
              {model.hasDrafts ? (
                <th scope="col" className="num">
                  Draft notices
                </th>
              ) : null}
              <th scope="col" className="num">
                Year's components
              </th>
              <th scope="col" className="num">
                Difference
              </th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <VsYearRow key={row.label} row={row} hasDrafts={model.hasDrafts} />
            ))}
          </tbody>
          {model.total ? (
            <tfoot>
              <VsYearRow row={model.total} hasDrafts={model.hasDrafts} />
            </tfoot>
          ) : null}
        </table>
      </TableScroll>
    </Panel>
  );
}
