import type { Fund } from "../../../domain/types.ts";
import { useFundCalc, useWorkflow } from "../../state.tsx";
import { DistributionPanel } from "./DistributionPanel.tsx";
import { InputsPanel } from "./InputsPanel.tsx";
import { ReviewTabs } from "./tabs/ReviewTabs.tsx";

/** Everything under the fund header: the distribution, the inputs for a preparer, and the review tabs. */
export function DistributionsBody({ fund }: { fund: Fund }) {
  const calc = useFundCalc(fund.id);
  const workflow = useWorkflow(fund.id);
  return (
    <>
      <DistributionPanel fund={fund} calc={calc} workflow={workflow} />
      {workflow.can.edit ? <InputsPanel fund={fund} calc={calc} /> : null}
      <ReviewTabs fundId={fund.id} />
    </>
  );
}
