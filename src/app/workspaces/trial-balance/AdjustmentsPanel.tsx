import { useMemo, useState } from "react";
import type { Cents, Fund, TbView } from "../../../domain/types.ts";
import type { ManualAdjustmentComponent } from "../../../domain/governance/types.ts";
import { inputLabel } from "../../../domain/core/labels.ts";
import { dateTimeLabel } from "../../../domain/format.ts";
import { useAppData, useDispatch } from "../../state.tsx";
import { Button, Dialog, Field, MoneyInput, Panel, Select, TextArea, TextInput, useAnnounce } from "../../ui/index.ts";
import { moneyExact } from "./model.ts";
import "./trial-balance.css";

export interface AdjustmentsPanelProps {
  fund: Fund;
  view: TbView;
  canEdit: boolean;
}

/** The tax figures the ledger cannot give (tax depreciation, capital works, capital gains), edited here while the fund is being prepared. */
export function AdjustmentsPanel({ fund, view, canEdit }: AdjustmentsPanelProps) {
  const data = useAppData();
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const adjustments = useMemo(() => data.manualAdjustments.filter((a) => a.fundId === fund.id), [data.manualAdjustments, fund.id]);

  const commit = (key: string, label: string, amount: Cents | null): void => {
    if (amount === null) return;
    const result = dispatch({ type: "update-tax-adjustment", fundId: fund.id, key, amount });
    if (result.ok) announce(`${label} set to ${moneyExact(amount, fund.currency)}.`);
  };

  return (
    <Panel title="Tax adjustments" actions={canEdit ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Add manual adjustment</Button> : undefined}>
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
      <ManualAdjustmentsList fund={fund} adjustments={adjustments} canEdit={canEdit} />
      <ManualAdjustmentDialog fund={fund} open={open} onClose={() => setOpen(false)} />
    </Panel>
  );
}

function componentOptions(fund: Fund) {
  const keys: ManualAdjustmentComponent[] =
    fund.market === "AU"
      ? ["ausOtherIncome", "ncmi", "excludedNcmi", "cleanBuilding", "interest", "discountGainTarp", "otherGainTarp", "foreignIncome"]
      : ["taxableSpecifiedIncome"];
  return keys.map((key) => ({ value: key, label: inputLabel(key) }));
}

function ManualAdjustmentsList({ fund, adjustments, canEdit }: { fund: Fund; adjustments: ReturnType<typeof useAppData>["manualAdjustments"]; canEdit: boolean }) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const remove = (id: string, label: string): void => {
    if (!window.confirm(`Remove manual adjustment "${label}"?`)) return;
    const result = dispatch({ type: "gov-remove-adjustment", fundId: fund.id, id });
    if (result.ok) announce(`Manual adjustment removed: ${label}.`);
  };
  return (
    <div className="tb-manual">
      <p className="tb-manual__heading">Manual adjustments</p>
      {adjustments.length === 0 ? (
        <p className="tb-note">No manual tax adjustments. Current-year manual adjustments only affect the current year; prior-year book-to-tax uses the TB prior balances only.</p>
      ) : (
        <ul className="tb-manual__list">
          {adjustments.map((adjustment) => (
            <li key={adjustment.id} className="tb-manual__item">
              <div>
                <strong>{adjustment.label}</strong> · {inputLabel(adjustment.component)} · {moneyExact(adjustment.amount, fund.currency)}
                <p>{adjustment.reason}</p>
                <p className="tb-manual__meta">By {adjustment.by}, {dateTimeLabel(adjustment.at)}</p>
              </div>
              {canEdit ? <Button size="sm" variant="ghost" onClick={() => remove(adjustment.id, adjustment.label)}>Remove</Button> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ManualAdjustmentDialog({ fund, open, onClose }: { fund: Fund; open: boolean; onClose(): void }) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const options = componentOptions(fund);
  const [label, setLabel] = useState("");
  const [component, setComponent] = useState<ManualAdjustmentComponent>(options[0].value as ManualAdjustmentComponent);
  const [amount, setAmount] = useState<Cents>(0);
  const [reason, setReason] = useState("");
  const save = (): void => {
    const result = dispatch({ type: "gov-add-adjustment", fundId: fund.id, label, component, amount, reason });
    if (!result.ok) return;
    announce(`Manual adjustment added: ${label.trim()}.`);
    setLabel("");
    setAmount(0);
    setReason("");
    setComponent(options[0].value as ManualAdjustmentComponent);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add manual adjustment"
      description="Manual adjustments are current-year only and require a reason."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save adjustment</Button></>}
    >
      <div className="tb-manual__form">
        <Field label="Label"><TextInput value={label} onChange={(event) => setLabel(event.currentTarget.value)} /></Field>
        <Field label="Component"><Select value={component} options={options} onValueChange={(value) => setComponent(value as ManualAdjustmentComponent)} /></Field>
        <Field label="Amount" hint="Signed amount in fund currency. Use a negative amount for a reduction."><MoneyInput value={amount} currency={fund.currency} onCommit={(value) => setAmount(value ?? 0)} /></Field>
        <Field label="Reason"><TextArea value={reason} rows={4} onChange={(event) => setReason(event.currentTarget.value)} /></Field>
      </div>
    </Dialog>
  );
}
