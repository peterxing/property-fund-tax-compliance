import type { Cents, Fund, FundCalc } from "../../../domain/types.ts";
import { useDispatch } from "../../state.tsx";
import { Field, MoneyInput, Panel, useAnnounce } from "../../ui/index.ts";
import { AMOUNT_RULES, INPUTS_INTRO, inputAction, inputFields, inputValue, savedMessage, type InputField } from "./model.ts";
import "./distributions.css";

/** One amount box per input, for a preparer on a fund that is still being prepared. Each box saves through the domain's update-inputs action. */
export function InputsPanel({ fund, calc }: { fund: Fund; calc: FundCalc }) {
  const dispatch = useDispatch();
  const announce = useAnnounce();

  const commit = (field: InputField, cents: Cents | null): void => {
    const action = inputAction(fund, field.key, cents);
    if (!action) return;
    if (dispatch(action).ok) announce(savedMessage(field));
  };

  return (
    <Panel title="Distribution inputs">
      <p className="dist-inputs__intro">{INPUTS_INTRO}</p>
      <div className="dist-inputs">
        {inputFields(fund.market).map((field) => (
          <Field key={field.key} label={field.label} hint={field.hint}>
            <MoneyInput
              value={inputValue(fund, field.key)}
              currency={fund.currency}
              min={AMOUNT_RULES.min}
              allowEmpty={AMOUNT_RULES.allowEmpty}
              onCommit={(cents) => commit(field, cents)}
            />
          </Field>
        ))}
      </div>
      <p className="dist-inputs__result">
        <span className="dist-inputs__result-label">Result</span>
        {calc.narrative}
      </p>
    </Panel>
  );
}
