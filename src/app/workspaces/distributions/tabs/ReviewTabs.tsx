import { useEffect, useMemo, useRef } from "react";
import { queriesFor } from "../../../../domain/selectors.ts";
import { useRouteParam, useSetRouteParams } from "../../../router.ts";
import { useAppData, useFundCalc } from "../../../state.tsx";
import { Panel, Tabs, type TabDef } from "../../../ui/index.ts";
import { AuditTab } from "./AuditTab.tsx";
import { ChecksTab } from "./ChecksTab.tsx";
import { QueriesTab } from "./QueriesTab.tsx";
import { RulesTab } from "./RulesTab.tsx";
import { StatementsTab } from "./StatementsTab.tsx";
import { VersionsTab } from "./VersionsTab.tsx";
import { WithholdingTab } from "./WithholdingTab.tsx";
import {
  REVIEW_TABS,
  TAB_PARAM,
  checksBadge,
  queriesBadge,
  reviewTabFromParam,
  statementParams,
  type ReviewTabId,
  type TabBadge,
} from "./tabModel.ts";
import "./tabs.css";

/** Who moved the tab: the tab strip keeps focus where it is; the Statement buttons and links from elsewhere move focus to the new panel. */
type Origin = "tabs" | "statement";

/**
 * The review tabs under the distribution: Withholding, Statements, Checks, Queries, Audit trail and Rules. The tab is the `tab` hash
 * parameter (so it can be linked to and survives a fund switch) and the Statements tab's holder is `holder`.
 */
export function ReviewTabs({ fundId }: { fundId: string }) {
  const data = useAppData();
  const calc = useFundCalc(fundId);
  const tab = reviewTabFromParam(useRouteParam(TAB_PARAM));
  const setParams = useSetRouteParams();
  const sectionRef = useRef<HTMLElement>(null);
  const shownTab = useRef<ReviewTabId>(tab);
  const origin = useRef<Origin | null>(null);

  const queries = useMemo(() => queriesFor(data, fundId), [data, fundId]);
  const tabs = useMemo<TabDef[]>(() => {
    const badges: Partial<Record<ReviewTabId, TabBadge | null>> = { checks: checksBadge(calc.checks), queries: queriesBadge(queries) };
    return REVIEW_TABS.map(({ id, label }) => {
      const badge = badges[id];
      if (!badge) return { id, label };
      return {
        id,
        label: `${label} `,
        badge: (
          <span className="rv-badge" data-tone={badge.tone}>
            {badge.text}
          </span>
        ),
      };
    });
  }, [calc.checks, queries]);

  // A tab changed from outside the tab strip (a Statement button, the header's "open queries" link): bring the panel into view and move focus to it.
  useEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    const from = origin.current;
    origin.current = null;
    if (from === "tabs") return;
    const section = sectionRef.current;
    if (!section) return;
    section.scrollIntoView?.({ block: "start" });
    section.querySelector<HTMLElement>('[role="tabpanel"]')?.focus({ preventScroll: true });
  }, [tab]);

  const select = (id: string): void => {
    const next = reviewTabFromParam(id);
    if (next !== tab) origin.current = "tabs";
    setParams({ [TAB_PARAM]: next });
  };

  const openStatement = (holderId: string): void => {
    origin.current = "statement";
    setParams(statementParams(holderId));
  };

  return (
    <Panel ref={sectionRef} title="Review" className="rv-review">
      <Tabs tabs={tabs} value={tab} onValueChange={select} label="Review">
        <Tabs.Panel id="withholding">
          <WithholdingTab fundId={fundId} onOpenStatement={openStatement} />
        </Tabs.Panel>
        <Tabs.Panel id="statements">
          <StatementsTab fundId={fundId} />
        </Tabs.Panel>
        <Tabs.Panel id="checks">
          <ChecksTab fundId={fundId} />
        </Tabs.Panel>
        <Tabs.Panel id="queries">
          <QueriesTab fundId={fundId} />
        </Tabs.Panel>
        <Tabs.Panel id="versions">
          <VersionsTab fundId={fundId} />
        </Tabs.Panel>
        <Tabs.Panel id="audit">
          <AuditTab fundId={fundId} />
        </Tabs.Panel>
        <Tabs.Panel id="rules">
          <RulesTab fundId={fundId} />
        </Tabs.Panel>
      </Tabs>
    </Panel>
  );
}
