import type { ReactNode } from "react";
import type { Fund } from "../../domain/types.ts";
import { useRoute } from "../router.ts";
import { JURISDICTION_OPTIONS } from "../labels.ts";
import { FundContext, useFundParam, useUi, useVisibleFunds } from "../state.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { FundHeader } from "./FundHeader.tsx";
import { FundRail } from "./FundRail.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";

export interface FundWorkspaceFrameProps {
  /** Workspace name, used in the document title ("Trial balance"). */
  workspace: string;
  /** The workspace body, or a function of the selected fund. Rendered under the fund header; descendants can also call `useFund()`. */
  children: ReactNode | ((fund: Fund) => ReactNode);
  /** Hide the fund header block for workspaces that draw their own. */
  header?: boolean;
}

function FrameBody({ fund, children }: { fund: Fund; children: FundWorkspaceFrameProps["children"] }) {
  return <>{typeof children === "function" ? children(fund) : children}</>;
}

/**
 * The layout of every fund workspace: the fund rail on the left, the fund header and the workspace body on the right. The selected fund
 * comes from the `?fund=` hash parameter (kept in step with the store); the rail keeps working if the body throws.
 */
export function FundWorkspaceFrame({ workspace, children, header = true }: FundWorkspaceFrameProps) {
  const route = useRoute();
  const fundId = useFundParam();
  const funds = useVisibleFunds();
  const { jurisdiction } = useUi();
  const fund = funds.find((candidate) => candidate.id === fundId) ?? null;
  useDocumentTitle(workspace, fund?.name);

  return (
    <div className="fund-layout">
      <FundRail selectedId={fund?.id ?? null} />
      <main id="main" tabIndex={-1} className="fund-main">
        {fund ? (
          <FundContext.Provider value={fund}>
            {header ? (
              <ErrorBoundary scope="panel" resetKeys={[fund.id]}>
                <FundHeader fund={fund} />
              </ErrorBoundary>
            ) : null}
            <ErrorBoundary scope="panel" resetKeys={[fund.id, route.path, route.params.tab]}>
              <div className="fund-body">
                <FrameBody fund={fund}>{children}</FrameBody>
              </div>
            </ErrorBoundary>
          </FundContext.Provider>
        ) : (
          <EmptyState title="No funds assigned to this persona" headingLevel={2} icon="users">
            {jurisdiction === "all"
              ? "Choose another persona above to see funds."
              : `Nothing is visible with the ${JURISDICTION_OPTIONS.find((option) => option.value === jurisdiction)?.label ?? jurisdiction} filter on. Choose another persona, or set the jurisdiction to All.`}
          </EmptyState>
        )}
      </main>
    </div>
  );
}
