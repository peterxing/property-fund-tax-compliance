import type { AccessView, User } from "../../../domain/types.ts";
import { useDispatch } from "../../state.tsx";
import { Icon, MarketBadge, Panel, Select, StatusChip, TableScroll, useAnnounce } from "../../ui/index.ts";
import {
  governanceChangedMessage,
  governanceControl,
  governanceOptions,
  governanceSelectLabel,
  setGovernanceAction,
  type GovernanceEntry,
} from "./accessModel.ts";
import "./access.css";

const CAPTION = "How each fund is governed: who approves it before sign-off and who records lodgment";

export interface GovernancePanelProps {
  entries: readonly GovernanceEntry[];
  modes: AccessView["modes"];
  user: Pick<User, "role">;
  /** The page's read-only note, which every disabled select points at as its reason. */
  readOnlyNoteId: string;
}

/** Each fund's governance. A Head of Tax can change it until the fund is signed off; it then stays as it was signed. */
export function GovernancePanel({ entries, modes, user, readOnlyNoteId }: GovernancePanelProps) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const options = governanceOptions(modes);

  const change = (entry: GovernanceEntry, value: string): void => {
    const next = modes.find((candidate) => candidate.mode === value);
    if (!next) return;
    const result = dispatch(setGovernanceAction(entry.fund.id, next.mode));
    if (result.ok) announce(governanceChangedMessage(entry.fund.name, next.label));
  };

  return (
    <Panel title="Governance by fund" padded={false}>
      <TableScroll label={CAPTION}>
        <table className="dt dt--hover access-table">
          <caption className="sr-only">{CAPTION}</caption>
          <thead>
            <tr>
              <th scope="col">Fund</th>
              <th scope="col">Status</th>
              <th scope="col">Governance</th>
              <th scope="col">Approvals before sign-off</th>
              <th scope="col">Records lodgment</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const control = governanceControl(entry, user);
              return (
                <tr key={entry.fund.id}>
                  <th scope="row">
                    <span className="access-fund">
                      <MarketBadge market={entry.fund.market} />
                      <span className="dt__title">{entry.fund.name}</span>
                    </span>
                  </th>
                  <td>
                    <StatusChip status={entry.status} labelled />
                  </td>
                  <td className="access-governance">
                    {control.kind === "locked" ? (
                      <>
                        <span className="access-governance__label">{entry.label}</span>
                        <span className="dt__sub access-governance__reason">
                          <Icon name="lock" size={12} /> {control.reason}
                        </span>
                      </>
                    ) : (
                      <Select
                        wrapperClassName="access-select"
                        aria-label={governanceSelectLabel(entry.fund.name)}
                        aria-describedby={control.kind === "readonly" ? readOnlyNoteId : undefined}
                        value={entry.mode}
                        disabled={control.kind === "readonly"}
                        options={options}
                        onValueChange={(value) => change(entry, value)}
                      />
                    )}
                  </td>
                  <td>{entry.approvalsBeforeSignOff}</td>
                  <td>{entry.recordsLodgment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}
