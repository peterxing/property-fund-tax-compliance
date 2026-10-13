import { useId, type ComponentProps } from "react";
import type { Cents, Currency } from "../../domain/types.ts";
import { CURRENCY_SYMBOL } from "../../domain/format.ts";
import { cls } from "./cls.ts";
import { useFieldControl } from "./Field.tsx";
import { formatMoneyDraft, parseMoneyDraft } from "./inputParsing.ts";
import { useDraft } from "./useDraft.ts";

const CURRENCY_NAME: Record<Currency, string> = { AUD: "Australian dollars", SGD: "Singapore dollars" };

export interface MoneyInputProps
  extends Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "prefix" | "min" | "max" | "size"> {
  /** Committed amount in integer cents; null = empty. */
  value: Cents | null;
  currency: Currency;
  /** Called with the new amount when the user commits (blur or Enter, or while typing with commitOn="change"). */
  onCommit(cents: Cents | null): void;
  /** An empty box commits null instead of showing an error (e.g. "not yet remitted"). */
  allowEmpty?: boolean;
  min?: Cents;
  max?: Cents;
  commitOn?: "blur" | "change";
  invalid?: boolean;
}

/**
 * Amount box: shows grouped digits with the currency symbol outside the text, edits as text, commits cents. Accepts "1,250,000",
 * "A$1,250,000.50", "-1,200" and "(1,200)"; anything else gets an inline error (role="alert") and keeps what was typed. Escape reverts.
 */
export function MoneyInput({ value, currency, onCommit, allowEmpty, min, max, commitOn, invalid, className, ...rest }: MoneyInputProps) {
  const uid = useId();
  const draft = useDraft<Cents | null>({
    value,
    format: formatMoneyDraft,
    parse: (text) => parseMoneyDraft(text, { currency, allowEmpty, min, max }),
    onCommit,
    commitOn,
  });
  const errorId = draft.error ? `${uid}-error` : undefined;
  const currencyId = `${uid}-currency`;
  const control = useFieldControl({
    id: rest.id,
    "aria-describedby": [rest["aria-describedby"], currencyId, errorId].filter(Boolean).join(" "),
    invalid: invalid || draft.error ? true : undefined,
    required: rest.required,
  });
  return (
    <span className={cls("money", className)}>
      <span className={cls("input-affix", control["aria-invalid"] && "input-affix--invalid", rest.disabled && "input-affix--disabled")}>
        <span className="input-affix__prefix" aria-hidden="true">
          {CURRENCY_SYMBOL[currency]}
        </span>
        <input
          {...rest}
          {...control}
          {...draft.inputProps}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          className="input input--bare input--number"
        />
      </span>
      <span id={currencyId} className="sr-only">
        Amount in {CURRENCY_NAME[currency]}
      </span>
      {draft.error ? (
        <span id={errorId} className="input-error" role="alert">
          {draft.error}
        </span>
      ) : null}
    </span>
  );
}
