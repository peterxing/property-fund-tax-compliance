import { useEffect, useRef, type ChangeEvent, type ComponentProps, type ReactNode } from "react";
import { cls } from "./cls.ts";
import { Icon } from "./icons.tsx";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type" | "size" | "children"> {
  /** Visible label. Without one, pass aria-label (a bare checkbox in a table row needs a name like "Select Southbank Industrial Partners Fund"). */
  label?: ReactNode;
  /** Mixed state for a "select all" box; the native indeterminate flag is kept in sync. */
  indeterminate?: boolean;
  /** Called with the new checked state (in addition to onChange). */
  onCheckedChange?(checked: boolean): void;
}

export function Checkbox({ label, indeterminate = false, onCheckedChange, onChange, className, ...rest }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate, rest.checked]);
  return (
    <label className={cls("checkbox", rest.disabled && "checkbox--disabled", className)}>
      <input
        {...rest}
        ref={ref}
        type="checkbox"
        className="checkbox__input"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange?.(event);
          onCheckedChange?.(event.target.checked);
        }}
      />
      <span className="checkbox__box" aria-hidden="true">
        <Icon name="check" size={14} className="checkbox__tick" />
        <Icon name="minus" size={14} className="checkbox__dash" />
      </span>
      {label ? <span className="checkbox__label">{label}</span> : null}
    </label>
  );
}
