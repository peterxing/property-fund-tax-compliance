import { FundWorkspaceFrame } from "../shell/FundWorkspaceFrame.tsx";
import { AssetsBody } from "./assets/AssetsBody.tsx";

export default function Assets() {
  return <FundWorkspaceFrame workspace="Assets & allowances">{(fund) => <AssetsBody key={fund.id} fund={fund} />}</FundWorkspaceFrame>;
}
