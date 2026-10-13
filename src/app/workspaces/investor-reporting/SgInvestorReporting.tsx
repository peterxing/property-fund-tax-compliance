import { useMemo } from "react";
import { investorView } from "../../../domain/index.ts";
import type { SgFund } from "../../../domain/types.ts";
import { useAppData, useCtx } from "../../state.tsx";
import { S45gPanel } from "./S45gPanel.tsx";
import { SgNoticePanel } from "./SgNoticePanel.tsx";
import { latestSgNotice } from "./model.ts";

/** Investor reporting for a Singapore fund: the distribution tax notice and the s45G withholding tax filing. */
export function SgInvestorReporting({ fund }: { fund: SgFund }) {
  const data = useAppData();
  const ctx = useCtx();
  const view = useMemo(() => investorView(data, fund.id, ctx), [data, fund.id, ctx]);
  const noticeId = useMemo(() => latestSgNotice(data.sgNotices, fund.id)?.id ?? null, [data.sgNotices, fund.id]);

  if (view.market !== "SG") return null;
  return (
    <>
      <SgNoticePanel fund={fund} notice={view.notice} noticeId={noticeId} />
      <S45gPanel s45g={view.s45g} />
    </>
  );
}
