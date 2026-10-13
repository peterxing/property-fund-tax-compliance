import { useMemo } from "react";
import { useFundCalc } from "../../../state.tsx";
import { EmptyState, Tag } from "../../../ui/index.ts";
import { CHECK_TAGS, NO_CHECKS, checksSummary, orderChecks } from "./tabModel.ts";

/** The checks the market module raised for this distribution: exceptions first, then notes. */
export function ChecksTab({ fundId }: { fundId: string }) {
  const calc = useFundCalc(fundId);
  const checks = useMemo(() => orderChecks(calc.checks), [calc.checks]);

  if (checks.length === 0) {
    return (
      <EmptyState icon="circle-check" title={NO_CHECKS}>
        Every check passed for this distribution.
      </EmptyState>
    );
  }

  return (
    <div className="rv-stack">
      <p className="rv-summary">{checksSummary(calc.checks)}</p>
      <ol className="rv-checks">
        {checks.map((check) => {
          const tag = CHECK_TAGS[check.severity];
          return (
            <li key={check.id} className="rv-check">
              <Tag tone={tag.tone}>{tag.label}</Tag>
              <div className="rv-check__body">
                <p className="rv-check__title">{check.title}</p>
                <p className="rv-check__detail">{check.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
