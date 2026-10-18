import { FundWorkspaceFrame } from "../shell/FundWorkspaceFrame.tsx";
import { PropertyTaxesBody } from "./property-taxes/PropertyTaxesBody.tsx";

export default function PropertyTaxes() {
  return <FundWorkspaceFrame workspace="Property taxes">{(fund) => <PropertyTaxesBody key={fund.id} fund={fund} />}</FundWorkspaceFrame>;
}
