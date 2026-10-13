import { useId, type ReactNode } from "react";
import { cls } from "./cls.ts";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  /** Accessible name of the group (visually hidden legend). */
  legend: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange(value: T): void;
  size?: "md" | "sm";
  className?: string;
}

/** A radio group drawn as a segmented control. Arrow keys move and select, exactly as native radios do. */
export function Segmented<T extends string>({ legend, options, value, onChange, size = "md", className }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className={cls("seg", size === "sm" && "seg--sm", className)}>
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={cls("seg__option", option.disabled && "seg__option--disabled")}>
          <input
            type="radio"
            className="seg__input"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span className="seg__label">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
