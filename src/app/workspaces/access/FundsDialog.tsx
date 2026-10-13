import { useId, useMemo } from "react";
import type { Fund, FundId, User } from "../../../domain/types.ts";
import { Button, Checkbox, Dialog, MarketBadge } from "../../ui/index.ts";
import {
  fundsDialogDescription,
  fundsDialogTitle,
  selectionOf,
  selectionText,
  validateFunds,
  type FundsDraft,
} from "./accessModel.ts";
import "./access.css";

export interface FundsDialogProps {
  /** The user being edited; null while the dialog is closed. */
  user: Pick<User, "id" | "name"> | null;
  funds: readonly Fund[];
  draft: FundsDraft;
  /** Save was pressed: an empty selection now shows its message. */
  attempted: boolean;
  /** Why the domain refused the change, when it did. */
  failure: string | null;
  onSetFund(fundId: FundId, checked: boolean): void;
  onSetAll(checked: boolean): void;
  onSave(): void;
  onClose(): void;
}

/** Choose which funds one user can see: a box for each fund and an "All funds" box that ticks them all. */
export function FundsDialog({ user, funds, draft, attempted, failure, onSetFund, onSetAll, onSave, onClose }: FundsDialogProps) {
  const errorId = useId();
  const fundIds = useMemo(() => funds.map((fund) => fund.id), [funds]);
  const selection = selectionOf(draft, fundIds);
  const problem = attempted ? validateFunds(draft, fundIds) : null;
  const name = user?.name ?? "";

  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      size="sm"
      title={fundsDialogTitle(name)}
      description={fundsDialogDescription(name)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave}>
            Save
          </Button>
        </>
      }
    >
      <fieldset className="access-fieldset" aria-describedby={problem ? errorId : undefined}>
        <legend className="sr-only">Funds {name} can see</legend>
        <div className="access-fieldset__all">
          <Checkbox label="All funds" checked={selection.all} indeterminate={selection.indeterminate} onCheckedChange={onSetAll} />
        </div>
        <ul className="access-fieldset__list">
          {funds.map((fund) => (
            <li key={fund.id}>
              <Checkbox
                label={
                  <>
                    {fund.name} <MarketBadge market={fund.market} />
                  </>
                }
                checked={draft.includes(fund.id)}
                onCheckedChange={(checked) => onSetFund(fund.id, checked)}
              />
            </li>
          ))}
        </ul>
      </fieldset>
      <p className="access-fieldset__count">{selectionText(selection)}</p>
      {problem ? (
        <p id={errorId} className="field__error" role="alert">
          {problem}
        </p>
      ) : null}
      {failure ? (
        <p className="field__error" role="alert">
          {failure}
        </p>
      ) : null}
    </Dialog>
  );
}
