import { FundWorkspaceFrame } from "../shell/FundWorkspaceFrame.tsx";
import { DueDiligenceBody } from "./due-diligence/DueDiligenceBody.tsx";

export default function DueDiligence() {
  return <FundWorkspaceFrame workspace="Due diligence">{(fund) => <DueDiligenceBody key={fund.id} fund={fund} />}</FundWorkspaceFrame>;
}
