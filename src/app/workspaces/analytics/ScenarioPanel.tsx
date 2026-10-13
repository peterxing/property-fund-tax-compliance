import { useMemo, useState, type KeyboardEvent } from "react";
import { scenarioView } from "../../../domain/index.ts";
import type { Fund, FundId } from "../../../domain/types.ts";
import { useAppData, useCtx } from "../../state.tsx";
import { Button, Field, MoneyInput, NumberInput, Panel, Select, TableScroll, cls, formatNumberDraft, useAnnounce } from "../../ui/index.ts";
import {
  CASH_MIN,
  PAYOUT_LIMITS,
  changedMeasures,
  resolveScenarioFund,
  scenarioFundOptions,
  scenarioHint,
  scenarioValue,
  steppedPayout,
} from "./scenario.ts";

const CAPTION = "Current position compared with the scenario";

interface Pick {
  fundId: FundId;
  /** Undefined = the current position. */
  value: number | undefined;
}

/** Puts `text` in a controlled input and fires the event React listens to, exactly as typing would, so the field's own checks still run. */
function typeInto(input: HTMLInputElement, text: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * "What if" for one fund: type a different cash distribution (Australia) or taxable payout (Singapore) and the table sets today's
 * figures beside the scenario's. Nothing is saved; the box starts at, and "Reset" returns to, the current position.
 */
export function ScenarioPanel({ funds, preferredFundId }: { funds: readonly Fund[]; preferredFundId: FundId | null }) {
  const data = useAppData();
  const ctx = useCtx();
  const announce = useAnnounce();
  const [pick, setPick] = useState<Pick | null>(null);

  const fundId = resolveScenarioFund(
    funds.map((fund) => fund.id),
    pick?.fundId,
    preferredFundId,
  );
  const value = pick !== null && pick.fundId === fundId ? pick.value : undefined;
  const view = useMemo(() => (fundId === null ? null : scenarioView(data, fundId, ctx, value)), [data, fundId, ctx, value]);
  if (fundId === null || view === null) return null;

  const changed = new Set(changedMeasures(view.rows));
  const atCurrent = value === undefined;
  const commit = (entered: number | null): void => setPick({ fundId, value: scenarioValue(view, entered) });
  const reset = (): void => {
    setPick({ fundId, value: undefined });
    announce("Scenario reset to the current position.");
  };
  // The payout box steps by half a point on ArrowUp / ArrowDown.
  const stepPayout = (event: KeyboardEvent<HTMLElement>): void => {
    if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    event.preventDefault();
    typeInto(input, formatNumberDraft(steppedPayout(input.value, view.inputValue, event.key === "ArrowUp" ? 1 : -1), PAYOUT_LIMITS.decimals));
  };

  return (
    <Panel
      title="Distribution scenario"
      actions={
        <Button size="sm" variant="secondary" disabled={atCurrent} onClick={reset}>
          Reset to current position
        </Button>
      }
    >
      <div className="scenario-controls">
        <Field label="Fund" className="scenario-field">
          <Select value={fundId} options={scenarioFundOptions(funds)} onValueChange={(id) => setPick({ fundId: id, value: undefined })} />
        </Field>
        <Field key={fundId} label={view.inputLabel} hint={scenarioHint(view.inputKind)} className="scenario-field">
          {view.inputKind === "cash" ? (
            <MoneyInput value={view.inputValue} currency={view.currency} min={CASH_MIN} allowEmpty commitOn="change" onCommit={commit} />
          ) : (
            <div className="scenario-payout" onKeyDown={stepPayout}>
              <NumberInput
                value={view.inputValue}
                min={PAYOUT_LIMITS.min}
                max={PAYOUT_LIMITS.max}
                decimals={PAYOUT_LIMITS.decimals}
                suffix="%"
                allowEmpty
                commitOn="change"
                onCommit={commit}
              />
            </div>
          )}
        </Field>
      </div>
      <TableScroll label={CAPTION}>
        <table className="dt dt--hover analytics-table">
          <caption className="sr-only">{CAPTION}</caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="num">
                Now
              </th>
              <th scope="col" className="num">
                Scenario
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.measure}>
                <th scope="row">{row.measure}</th>
                <td className="num">{row.now}</td>
                <td className={cls("num", changed.has(row.measure) && "scenario-changed")}>{row.scenario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <p className="analytics-note">{view.note}</p>
    </Panel>
  );
}
