import type { ChangeEvent, ComponentProps, ReactNode } from "react";
import { cls } from "./cls.ts";
import { useFieldControl } from "./Field.tsx";
import { Icon } from "./icons.tsx";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ComponentProps<"select">, "size"> {
  /** Either pass options or <option> children. */
  options?: readonly SelectOption[];
  /** Called with the chosen value (in addition to onChange). */
  onValueChange?(value: string): void;
  invalid?: boolean;
  /** Class for the wrapper (className goes to the native select). */
  wrapperClassName?: string;
  children?: ReactNode;
}

/** A native select (keyboard and screen reader behaviour for free) with the app's chevron. */
export function Select({ options, onValueChange, onChange, invalid, className, wrapperClassName, required, children, ...rest }: SelectProps) {
  const control = useFieldControl({ id: rest.id, "aria-describedby": rest["aria-describedby"], invalid, required });
  return (
    <span className={cls("select", wrapperClassName)}>
      <select
        {...rest}
        {...control}
        required={required}
        className={cls("input", "select__control", className)}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          onChange?.(event);
          onValueChange?.(event.target.value);
        }}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      <Icon name="chevron-down" className="select__chevron" />
    </span>
  );
}
