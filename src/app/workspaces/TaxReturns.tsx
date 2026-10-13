import { FundWorkspaceFrame } from "../shell/FundWorkspaceFrame.tsx";
import { TaxReturnsBody } from "./tax-returns/TaxReturnsBody.tsx";

export default function TaxReturns() {
  return <FundWorkspaceFrame workspace="Tax returns">{(fund) => <TaxReturnsBody key={fund.id} fund={fund} />}</FundWorkspaceFrame>;
}