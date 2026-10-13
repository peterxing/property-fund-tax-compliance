import { FundWorkspaceFrame } from "../shell/FundWorkspaceFrame.tsx";
import { AuInvestorReporting } from "./investor-reporting/AuInvestorReporting.tsx";
import { SgInvestorReporting } from "./investor-reporting/SgInvestorReporting.tsx";

export default function InvestorReporting() {
  return (
    <FundWorkspaceFrame workspace="Investor reporting">
      {(fund) => (fund.market === "AU" ? <AuInvestorReporting key={fund.id} fund={fund} /> : <SgInvestorReporting key={fund.id} fund={fund} />)}
    </FundWorkspaceFrame>
  );
}
