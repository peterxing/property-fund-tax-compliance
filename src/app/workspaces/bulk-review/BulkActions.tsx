import type { Ref } from "react";
import type { BulkKind } from "../../../domain/types.ts";
import { Button } from "../../ui/index.ts";
import type { BulkButtonState } from "./bulkModel.ts";
import "./bulk-review.css";

export interface BulkActionsProps {
  buttons: readonly BulkButtonState[];
  /** Id of the visible selection summary; a disabled button points at it so the reason is read with the button. */
  summaryId: string;
  onRun(kind: BulkKind): void;
  /** The button group, so the page can return focus here after a result is dismissed. */
  ref?: Ref<HTMLDivElement>;
}

/** The three bulk steps. They stay in view when disabled (the summary says why) so the page reads the same for every persona. */
export function BulkActions({ buttons, summaryId, onRun, ref }: BulkActionsProps) {
  return (
    <div ref={ref} className="bulk-actions" role="group" aria-label="Bulk actions">
      {buttons.map((button) => (
        <Button
          key={button.kind}
          variant={button.kind === "sign-off" ? "primary" : "secondary"}
          disabled={!button.enabled}
          aria-describedby={summaryId}
          onClick={() => onRun(button.kind)}
        >
          {button.label}
        </Button>
      ))}
    </div>
  );
}
