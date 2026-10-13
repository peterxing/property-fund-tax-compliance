import { FundWorkspaceFrame } from "../shell/FundWorkspaceFrame.tsx";
import { CostBaseBody } from "./cost-base/CostBaseBody.tsx";

export default function CostBase() {
  return <FundWorkspaceFrame workspace="Cost base & CGT">{(fund) => <CostBaseBody key={fund.id} fund={fund} />}</FundWorkspaceFrame>;
}
