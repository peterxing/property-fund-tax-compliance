import type { SgFund, SgInvestorView } from "../../../domain/types.ts";
import { DocView } from "../../doc/DocView.tsx";
import { useDispatch } from "../../state.tsx";
import { Panel, useAnnounce } from "../../ui/index.ts";
import { NoticeBar } from "./NoticeBar.tsx";
import { publishControl, sgNoticeStatus } from "./model.ts";
import "./investor-reporting.css";

export interface SgNoticePanelProps {
  fund: SgFund;
  notice: SgInvestorView["notice"];
  /** The notice the domain reports on (the fund's latest); null when the fund has none, which leaves nothing to announce. */
  noticeId: string | null;
}

/** The Singapore distribution tax notice: its state, the announce action and the statement. */
export function SgNoticePanel({ fund, notice, noticeId }: SgNoticePanelProps) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const status = sgNoticeStatus(notice);

  const publish = (): boolean => {
    if (noticeId === null) return false;
    const result = dispatch({ type: "publish-notice", fundId: fund.id, noticeId });
    if (result.ok) announce(`${fund.name}: the distribution tax notice is announced and locked.`);
    return result.ok;
  };

  return (
    <Panel title="Distribution tax notice">
      <NoticeBar
        first
        status={status.text}
        locked={status.locked}
        control={publishControl({ hasNotice: noticeId !== null, locked: notice.published, canPublish: notice.canPublish, verb: "announce" })}
        publishLabel="Announce notice"
        onPublish={publish}
        doc={notice.doc}
      />
      <div className="ir-doc">
        <DocView doc={notice.doc} headingLevel={4} />
      </div>
    </Panel>
  );
}
