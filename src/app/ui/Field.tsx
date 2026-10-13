import { createContext, useContext, useId, type ReactNode } from "react";
import { cls } from "./cls.ts";

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}
const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps {
  label: ReactNode;
  /** Helper text under the control, tied to it with aria-describedby. */
  hint?: ReactNode;
  /** Error text; announced when it appears (role="alert") and sets aria-invalid on the control. */
  error?: ReactNode;
  required?: boolean;
  /** Visually hide the label (it stays for assistive tech). */
  labelHidden?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint + error with the ids wired up. The control (TextInput, TextArea, Select, NumberInput, MoneyInput) picks them up. */
export function Field({ label, hint, error, required = false, labelHidden = false, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cls("field", className)}>
      <label htmlFor={id} className={cls("field__label", labelHidden && "sr-only")}>
        {label}
        {required ? <span className="field__required" aria-hidden="true"> *</span> : null}
      </label>
      <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), required }}>{children}</FieldContext.Provider>
      {hint ? (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface ControlAttributes {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
}

/** Attributes a form control spreads onto its native element: the Field's id and description ids, merged with any the caller passed. */
export function useFieldControl(own: { id?: string; "aria-describedby"?: string; invalid?: boolean; required?: boolean } = {}): ControlAttributes {
  const field = useContext(FieldContext);
  const describedBy = [field?.describedBy, own["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  const invalid = own.invalid ?? field?.invalid ?? false;
  const required = own.required ?? field?.required ?? false;
  return {
    id: own.id ?? field?.id,
    "aria-describedby": describedBy,
    "aria-invalid": invalid ? true : undefined,
    "aria-required": required ? true : undefined,
  };
}
