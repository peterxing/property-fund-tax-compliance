import { FundWorkspaceFrame } from "../shell/FundWorkspaceFrame.tsx";
import { DistributionsBody } from "./distributions/DistributionsBody.tsx";

// Keyed by fund so a half-typed amount never carries over to the next fund.
export default function Distributions() {
  return <FundWorkspaceFrame workspace="Distributions">{(fund) => <DistributionsBody key={fund.id} fund={fund} />}</FundWorkspaceFrame>;
}
