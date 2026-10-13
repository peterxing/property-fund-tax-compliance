import type { Cents, Fund, TbView } from "../../../domain/types.ts";
import { useDispatch } from "../../state.tsx";
import { Field, MoneyInput, Panel, useAnnounce } from "../../ui/index.ts";
import { moneyExact } from "./model.ts";
import "./trial-balance.css";

export interface AdjustmentsPanelProps {
  fund: Fund;
  view: TbView;
  canEdit: boolean;
}

/** The tax figures the ledger cannot give (tax depreciation, capital works, capital gains), edited here while the fund is being prepared. */
export function AdjustmentsPanel({ fund, view, canEdit }: AdjustmentsPanelProps) {
  const dispatch = useDispatch();
  const announce = useAnnounce();

  const commit = (key: string, label: string, amount: Cents | null): void => {
    if (amount === null) return;
    const result = dispatch({ type: "update-tax-adjustment", fundId: fund.id, key, amount });
    if (result.ok) announce(`${label} set to ${moneyExact(amount, fund.currency)}.`);
  };

  return (
    <Panel title="Tax adjustments">
      <ul className="tb-adjust">
        {view.adjustments.map((adjustment) => (
          <li key={adjustment.key} className="tb-adjust__item">
            {canEdit ? (
              <Field label={adjustment.label} hint={adjustment.help}>
                <MoneyInput value={adjustment.amount} currency={fund.currency} min={0} onCommit={(amount) => commit(adjustment.key, adjustment.label, amount)} />
              </Field>
            ) : (
              <div className="tb-adjust__fixed">
                <span className="tb-adjust__label">{adjustment.label}</span>
                <span className="tb-adjust__help">{adjustment.help}</span>
                <span className="tb-adjust__amount">{moneyExact(adjustment.amount, fund.currency)}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
