import { FundWorkspaceFrame } from "../shell/FundWorkspaceFrame.tsx";
import { TrialBalanceBody } from "./trial-balance/TrialBalanceBody.tsx";

export default function TrialBalance() {
  return <FundWorkspaceFrame workspace="Trial balance">{(fund) => <TrialBalanceBody key={fund.id} fund={fund} />}</FundWorkspaceFrame>;
}
