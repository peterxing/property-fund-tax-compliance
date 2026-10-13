import type { AuFund, AuInvestorView } from "../../../domain/types.ts";
import { DocView } from "../../doc/DocView.tsx";
import { useSetRouteParams } from "../../router.ts";
import { useDispatch } from "../../state.tsx";
import { EmptyState, Panel, useAnnounce } from "../../ui/index.ts";
import { NoticeBar } from "./NoticeBar.tsx";
import { NoticePicker } from "./NoticePicker.tsx";
import { auNoticeStatus, noticeListItems, publishControl } from "./model.ts";
import "./investor-reporting.css";

export interface AuNoticesPanelProps {
  fund: AuFund;
  view: AuInvestorView;
}

/** The fund payment notices for the year: pick one, see whether it is a draft or locked, publish a draft and download the statement. */
export function AuNoticesPanel({ fund, view }: AuNoticesPanelProps) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const setParams = useSetRouteParams();
  const selected = view.notices.find((n) => n.id === view.selectedNoticeId) ?? null;
  const status = auNoticeStatus(selected);

  const publish = (): boolean => {
    if (!selected) return false;
    const result = dispatch({ type: "publish-notice", fundId: fund.id, noticeId: selected.id });
    if (result.ok) announce(`${fund.name}: the fund payment notice for ${selected.label} is published and locked.`);
    return result.ok;
  };

  return (
    <Panel title="Fund payment notices">
      {view.notices.length === 0 ? (
        <EmptyState title="No fund payment notices yet" icon="file-text">
          Notices appear here once a distribution has been paid.
        </EmptyState>
      ) : (
        <>
          <NoticePicker items={noticeListItems(view.notices)} selectedId={view.selectedNoticeId} onSelect={(id) => setParams({ notice: id })} />
          {selected && status ? (
            <NoticeBar
              status={status.text}
              locked={status.locked}
              control={publishControl({ hasNotice: true, locked: selected.locked, canPublish: view.canPublishSelected })}
              publishLabel="Publish notice"
              onPublish={publish}
              doc={view.noticeDoc}
            />
          ) : null}
          {view.noticeDoc ? (
            <div className="ir-doc">
              <DocView doc={view.noticeDoc} headingLevel={4} />
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
