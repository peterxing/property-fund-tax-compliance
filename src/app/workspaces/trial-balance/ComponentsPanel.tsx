import { useId } from "react";
import type { Fund, TbView } from "../../../domain/types.ts";
import { useDispatch } from "../../state.tsx";
import { Button, Icon, Panel, TableScroll, useAnnounce } from "../../ui/index.ts";
import { StatusPill } from "./StatusPill.tsx";
import { allAccountsMapped, componentLines, distributionSync, moneyExact } from "./model.ts";
import "./trial-balance.css";

export interface ComponentsPanelProps {
  fund: Fund;
  view: TbView;
  canEdit: boolean;
  /** Why the distribution cannot be changed, or null when it can. */
  lockNote: string | null;
}

/** The trial balance's components next to the distribution's, and the button that copies the trial balance's figures across. */
export function ComponentsPanel({ fund, view, canEdit, lockNote }: ComponentsPanelProps) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const hintId = useId();
  const lines = componentLines(view.components);
  const sync = distributionSync({ canEdit, lockedReason: lockNote ?? "", allMapped: allAccountsMapped(view), components: lines });

  const update = (): void => {
    if (!sync.enabled) return;
    const result = dispatch({ type: "sync-distribution-from-tb", fundId: fund.id });
    if (result.ok) announce(`${fund.name}: distribution components updated from the trial balance.`);
  };

  return (
    <Panel title="Distribution components" padded={false}>
      {lines.length > 0 ? (
        <TableScroll label="Distribution components">
          <table className="dt dt--dense tb-table">
            <caption>Components from the trial balance compared with the distribution</caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col" className="num">
                  Trial balance
                </th>
                <th scope="col" className="num">
                  Distribution
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <th scope="row">{line.label}</th>
                  <td className="num">{moneyExact(line.trialBalance, fund.currency)}</td>
                  <td className="num">{moneyExact(line.distribution, fund.currency)}</td>
                  <td>
                    {line.agrees ? (
                      <StatusPill tone="good">Agrees</StatusPill>
                    ) : (
                      <StatusPill tone="warn">{`Differs by ${moneyExact(Math.abs(line.difference), fund.currency)}`}</StatusPill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        <p className="tb-note">The trial balance has no components to compare with the distribution.</p>
      )}
      <div className="tb-sync">
        <Button variant="primary" icon={<Icon name="distributions" />} disabled={!sync.enabled} aria-describedby={sync.hint ? hintId : undefined} onClick={update}>
          Update distribution
        </Button>
        {sync.hint ? (
          <p id={hintId} className="tb-hint">
            {sync.hint}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
