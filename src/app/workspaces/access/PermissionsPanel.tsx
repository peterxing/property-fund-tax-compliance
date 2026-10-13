import type { AccessView } from "../../../domain/types.ts";
import { Icon, Panel, TableScroll } from "../../ui/index.ts";
import { PERMISSIONS_FOOTNOTE, PERMISSIONS_SUBTITLE, matrixColumns, matrixRows } from "./accessModel.ts";
import "./access.css";

const CAPTION = "Which roles can take each action";

/** A grid of actions against roles: a tick where the role can take the action, a dash where it can't (and "Yes" / "No" for a screen reader). */
export function PermissionsPanel({ view }: { view: Pick<AccessView, "permissions" | "roles"> }) {
  const columns = matrixColumns(view);
  const rows = matrixRows(view);
  return (
    <Panel title="Permissions by role" padded={false}>
      <p className="access-subtitle">{PERMISSIONS_SUBTITLE}</p>
      <TableScroll label={CAPTION}>
        <table className="dt dt--hover access-table access-matrix">
          <caption className="sr-only">{CAPTION}</caption>
          <thead>
            <tr>
              <th scope="col">Action</th>
              {columns.map((column) => (
                <th key={column.id} scope="col" className="access-matrix__role">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.action}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell) => (
                  <td key={cell.role} className="access-matrix__cell">
                    <Icon name={cell.allowed ? "check" : "minus"} className={cell.allowed ? "access-yes" : "access-no"} />
                    <span className="sr-only">{cell.text}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <p className="access-footnote">{PERMISSIONS_FOOTNOTE}</p>
    </Panel>
  );
}
