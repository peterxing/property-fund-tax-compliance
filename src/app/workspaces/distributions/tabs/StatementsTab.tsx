import { useMemo } from "react";
import { statementDoc } from "../../../../domain/selectors.ts";
import { DocView } from "../../../doc/DocView.tsx";
import { downloadPdf } from "../../../exports/index.ts";
import { useRouteParam, useSetRouteParams } from "../../../router.ts";
import { useAppData, useCtx, useFundCalc } from "../../../state.tsx";
import { DownloadButton, EmptyState, Field, Select } from "../../../ui/index.ts";
import { HOLDER_PARAM, holderOptions, resolveStatementHolder } from "./tabModel.ts";

/** A unitholder's distribution statement, shown as the document it downloads as. The holder comes from `?holder=` (the Withholding tab's Statement buttons set it). */
export function StatementsTab({ fundId }: { fundId: string }) {
  const data = useAppData();
  const { now } = useCtx();
  const calc = useFundCalc(fundId);
  const requested = useRouteParam(HOLDER_PARAM);
  const setParams = useSetRouteParams();

  const options = useMemo(() => holderOptions(calc.holders), [calc.holders]);
  const holderId = resolveStatementHolder(calc.holders, requested);
  const doc = useMemo(() => (holderId ? statementDoc(data, fundId, holderId, now) : null), [data, fundId, holderId, now]);

  if (!holderId || !doc) {
    return <EmptyState title="No unitholders on the register">Add unitholders to the register to produce distribution statements.</EmptyState>;
  }

  return (
    <div className="rv-stack">
      <div className="rv-toolbar">
        <Field label="Holder" className="rv-toolbar__field">
          <Select options={options} value={holderId} onValueChange={(id) => setParams({ [HOLDER_PARAM]: id })} />
        </Field>
        <DownloadButton label="Download PDF" onDownload={() => downloadPdf(doc)} />
      </div>
      <DocView doc={doc} headingLevel={4} className="rv-doc" />
    </div>
  );
}
