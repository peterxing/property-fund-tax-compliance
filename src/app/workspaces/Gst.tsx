import { FundWorkspaceFrame } from "../shell/FundWorkspaceFrame.tsx";
import { GstBody } from "./gst/GstBody.tsx";

export default function Gst() {
  return <FundWorkspaceFrame workspace="GST & BAS">{(fund) => <GstBody key={fund.id} fund={fund} />}</FundWorkspaceFrame>;
}
