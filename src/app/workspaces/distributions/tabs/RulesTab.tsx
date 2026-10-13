import { useMemo } from "react";
import { getFund, rulesFor } from "../../../../domain/selectors.ts";
import { useAppData } from "../../../state.tsx";
import { EmptyState, TableScroll } from "../../../ui/index.ts";

/** How this market treats each item in the distribution: the module's own table, shown as it is. */
export function RulesTab({ fundId }: { fundId: string }) {
  const data = useAppData();
  const fund = getFund(data, fundId);
  const rules = useMemo(() => rulesFor(fund), [fund]);

  if (rules.rows.length === 0) return <EmptyState title="No rules to show">There are no withholding rules recorded for this fund's market.</EmptyState>;

  return (
    <TableScroll label={rules.title} className="rv-table-scroll">
      <table className="dt rv-rules">
        <caption>{rules.title}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Treatment</th>
            <th scope="col">Basis</th>
          </tr>
        </thead>
        <tbody>
          {rules.rows.map((row, index) => (
            <tr key={`${index}-${row.item}`}>
              <th scope="row">{row.item}</th>
              <td>{row.treatment}</td>
              <td>{row.basis}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
