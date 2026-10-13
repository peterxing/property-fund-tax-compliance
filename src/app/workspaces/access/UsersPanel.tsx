import { useMemo, useState } from "react";
import type { Fund, FundId, UserId } from "../../../domain/types.ts";
import { useDispatch } from "../../state.tsx";
import { Button, Panel, TableScroll, Tag, useAnnounce } from "../../ui/index.ts";
import { FundsDialog } from "./FundsDialog.tsx";
import {
  draftFunds,
  fundsChanged,
  fundsSavedMessage,
  fundsText,
  initialFundsDraft,
  roleLabelOf,
  setAllTicked,
  setFundTicked,
  setUserFundsAction,
  userMeta,
  validateFunds,
  type FundsDraft,
  type UserEntry,
} from "./accessModel.ts";
import "./access.css";

const CAPTION = "Users, their roles and the funds they can see";

interface Editing {
  userId: UserId;
  draft: FundsDraft;
  attempted: boolean;
  failure: string | null;
}

export interface UsersPanelProps {
  users: readonly UserEntry[];
  funds: readonly Fund[];
  /** Only a Head of Tax gets the "Change funds" buttons; everyone else sees the table as it is. */
  canManage: boolean;
}

/** Everyone who can work in the app, their role and the funds they can see. */
export function UsersPanel({ users, funds, canManage }: UsersPanelProps) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const [editing, setEditing] = useState<Editing | null>(null);
  const fundIds = useMemo<FundId[]>(() => funds.map((fund) => fund.id), [funds]);
  const target = editing ? (users.find((entry) => entry.user.id === editing.userId)?.user ?? null) : null;

  const open = (entry: UserEntry): void =>
    setEditing({ userId: entry.user.id, draft: initialFundsDraft(entry.user.funds, fundIds), attempted: false, failure: null });

  const save = (): void => {
    if (!editing || !target) return;
    if (validateFunds(editing.draft, fundIds) !== null) {
      setEditing({ ...editing, attempted: true });
      return;
    }
    // Nothing to change: close quietly instead of recording a no-op.
    if (!fundsChanged(target.funds, editing.draft, fundIds)) {
      setEditing(null);
      return;
    }
    const result = dispatch(setUserFundsAction(target.id, editing.draft, fundIds));
    if (!result.ok) {
      setEditing({ ...editing, failure: result.reason });
      return;
    }
    setEditing(null);
    announce(fundsSavedMessage(target.name, draftFunds(editing.draft, fundIds)));
  };

  const setFund = (fundId: FundId, checked: boolean): void => {
    if (editing) setEditing({ ...editing, draft: setFundTicked(editing.draft, fundId, checked, fundIds), failure: null });
  };
  const setAll = (checked: boolean): void => {
    if (editing) setEditing({ ...editing, draft: setAllTicked(checked, fundIds), failure: null });
  };

  return (
    <Panel title="Users" padded={false}>
      <TableScroll label={CAPTION}>
        <table className="dt dt--hover access-table">
          <caption className="sr-only">{CAPTION}</caption>
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Role</th>
              <th scope="col">Funds</th>
              {canManage ? (
                <th scope="col">
                  <span className="sr-only">Change access</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {users.map((entry) => (
              <tr key={entry.user.id}>
                <th scope="row" className="access-user">
                  <span className="access-user__line">
                    <span className="dt__title">{entry.user.name}</span>
                    {entry.isCurrent ? <Tag tone="info">working as</Tag> : null}
                  </span>
                  <span className="dt__sub">{userMeta(entry.user)}</span>
                </th>
                <td>{roleLabelOf(entry.user)}</td>
                <td className="access-funds">{fundsText(entry)}</td>
                {canManage ? (
                  <td className="access-action">
                    <Button size="sm" onClick={() => open(entry)}>
                      Change funds<span className="sr-only"> for {entry.user.name}</span>
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <FundsDialog
        user={target ? { id: target.id, name: target.name } : null}
        funds={funds}
        draft={editing?.draft ?? []}
        attempted={editing?.attempted ?? false}
        failure={editing?.failure ?? null}
        onSetFund={setFund}
        onSetAll={setAll}
        onSave={save}
        onClose={() => setEditing(null)}
      />
    </Panel>
  );
}
