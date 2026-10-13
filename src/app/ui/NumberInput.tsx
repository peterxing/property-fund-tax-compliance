import { useId, type ComponentProps, type ReactNode } from "react";
import { cls } from "./cls.ts";
import { useFieldControl } from "./Field.tsx";
import { formatNumberDraft, parseNumberDraft } from "./inputParsing.ts";
import { useDraft } from "./useDraft.ts";

export interface NumberInputProps
  extends Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "prefix" | "min" | "max" | "size"> {
  /** Committed value; null = empty. */
  value: number | null;
  onCommit(value: number | null): void;
  allowEmpty?: boolean;
  min?: number;
  max?: number;
  /** Whole numbers only (units on issue). */
  integer?: boolean;
  /** Most decimal places accepted when not integer (default 2). */
  decimals?: number;
  /** Text after the number ("%", "units"); decorative, so say the unit in the label too. */
  suffix?: ReactNode;
  commitOn?: "blur" | "change";
  invalid?: boolean;
}

/** Number box with grouped digits (684,215,000), commit on blur / Enter, Escape reverts, inline error (role="alert") for bad input. */
export function NumberInput({
  value,
  onCommit,
  allowEmpty,
  min,
  max,
  integer = false,
  decimals = 2,
  suffix,
  commitOn,
  invalid,
  className,
  ...rest
}: NumberInputProps) {
  const uid = useId();
  const places = integer ? 0 : decimals;
  const draft = useDraft<number | null>({
    value,
    format: (v) => formatNumberDraft(v, places),
    parse: (text) => parseNumberDraft(text, { allowEmpty, min, max, integer, decimals: places }),
    onCommit,
    commitOn,
  });
  const errorId = draft.error ? `${uid}-error` : undefined;
  const control = useFieldControl({
    id: rest.id,
    "aria-describedby": [rest["aria-describedby"], errorId].filter(Boolean).join(" "),
    invalid: invalid || draft.error ? true : undefined,
    required: rest.required,
  });
  return (
    <span className={cls("money", className)}>
      <span className={cls("input-affix", control["aria-invalid"] && "input-affix--invalid", rest.disabled && "input-affix--disabled")}>
        <input
          {...rest}
          {...control}
          {...draft.inputProps}
          type="text"
          inputMode={integer ? "numeric" : "decimal"}
          autoComplete="off"
          spellCheck={false}
          className="input input--bare input--number"
        />
        {suffix ? (
          <span className="input-affix__suffix" aria-hidden="true">
            {suffix}
          </span>
        ) : null}
      </span>
      {draft.error ? (
        <span id={errorId} className="input-error" role="alert">
          {draft.error}
        </span>
      ) : null}
    </span>
  );
}
