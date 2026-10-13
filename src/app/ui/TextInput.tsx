import type { ChangeEvent, ComponentProps } from "react";
import { cls } from "./cls.ts";
import { useFieldControl } from "./Field.tsx";

export interface TextInputProps extends Omit<ComponentProps<"input">, "size"> {
  /** Called with the new value on every change (in addition to onChange). */
  onValueChange?(value: string): void;
  invalid?: boolean;
}

export function TextInput({ onValueChange, onChange, invalid, className, type = "text", required, ...rest }: TextInputProps) {
  const control = useFieldControl({ id: rest.id, "aria-describedby": rest["aria-describedby"], invalid, required });
  return (
    <input
      {...rest}
      {...control}
      type={type}
      required={required}
      className={cls("input", className)}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        onChange?.(event);
        onValueChange?.(event.target.value);
      }}
    />
  );
}

export interface TextAreaProps extends ComponentProps<"textarea"> {
  onValueChange?(value: string): void;
  invalid?: boolean;
}

export function TextArea({ onValueChange, onChange, invalid, className, rows = 3, required, ...rest }: TextAreaProps) {
  const control = useFieldControl({ id: rest.id, "aria-describedby": rest["aria-describedby"], invalid, required });
  return (
    <textarea
      {...rest}
      {...control}
      rows={rows}
      required={required}
      className={cls("input", "textarea", className)}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
        onChange?.(event);
        onValueChange?.(event.target.value);
      }}
    />
  );
}
