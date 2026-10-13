import { Banner, Button } from "../../ui/index.ts";
import { outcomeLines, type BulkOutcome } from "./bulkModel.ts";
import "./bulk-review.css";

export interface BulkResultBannerProps {
  outcome: BulkOutcome;
  onDismiss(): void;
}

/** What a bulk run did: the title, then the funds that took the step and the funds that were skipped with the reason for each. */
export function BulkResultBanner({ outcome, onDismiss }: BulkResultBannerProps) {
  const lines = outcomeLines(outcome);
  return (
    <Banner
      tone={outcome.tone}
      role="none"
      title={outcome.title}
      actions={
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      }
    >
      {lines.length > 0 ? (
        <ul className="bulk-result__lines">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </Banner>
  );
}
