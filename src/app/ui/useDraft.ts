import { useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from "react";
import type { ParseResult } from "./inputParsing.ts";

export interface DraftOptions<T> {
  /** The committed value (from the store). */
  value: T;
  format(value: T): string;
  parse(text: string): ParseResult<T>;
  onCommit(value: T): void;
  /** "blur" (default): commit on blur / Enter. "change": also commit while typing whenever the text is valid. */
  commitOn?: "blur" | "change";
}

export interface DraftBinding {
  inputProps: {
    value: string;
    onChange(event: ChangeEvent<HTMLInputElement>): void;
    onFocus(event: FocusEvent<HTMLInputElement>): void;
    onBlur(): void;
    onKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
  };
  error: string | null;
}

/**
 * Edit-as-text, commit-as-value. While focused the user edits a draft string; blur or Enter parses it and commits (or shows the error and
 * keeps the draft); Escape reverts. When not editing the box shows the formatted committed value, so a rejected commit snaps back.
 */
export function useDraft<T>({ value, format, parse, onCommit, commitOn = "blur" }: DraftOptions<T>): DraftBinding {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = (text: string, final: boolean): void => {
    const result = parse(text);
    if (!result.ok) {
      if (final) setError(result.message);
      return;
    }
    setError(null);
    if (format(result.value) !== format(value)) onCommit(result.value);
    if (final) setDraft(null);
  };

  return {
    error,
    inputProps: {
      value: draft ?? format(value),
      onChange(event) {
        const text = event.target.value;
        setDraft(text);
        setError(null);
        if (commitOn === "change") commit(text, false);
      },
      onFocus(event) {
        event.currentTarget.select();
      },
      onBlur() {
        if (draft !== null) commit(draft, true);
      },
      onKeyDown(event) {
        if (event.key === "Enter" && draft !== null) {
          event.preventDefault();
          commit(draft, true);
        } else if (event.key === "Escape" && (draft !== null || error)) {
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
          setError(null);
        }
      },
    },
  };
}
