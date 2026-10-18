import { FundWorkspaceFrame } from "../shell/FundWorkspaceFrame.tsx";
import { CompareBody } from "./compare/CompareBody.tsx";

export default function Compare() {
  return (
    <FundWorkspaceFrame workspace="Compare">
      {(fund) => <CompareBody key={fund.id} fund={fund} />}
    </FundWorkspaceFrame>
  );
}
