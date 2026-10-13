import type { ReactNode } from "react";
import { useRoute } from "../router.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { JurisdictionToggle } from "./Header.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";
import { useJurisdictionControl } from "./useShellControls.ts";

export interface PortfolioFrameProps {
  /** Workspace name, used in the document title ("Analytics"). */
  workspace: string;
  /** Page heading (an h2; the app title is the h1). */
  title: ReactNode;
  /** Right-aligned page actions: buttons, or a button with a note under it. */
  actions?: ReactNode;
  /**
   * Show the jurisdiction group (All / Australia / Singapore) under the heading. It drives the same store value as the one in the header,
   * which already scopes every portfolio page, so leave this off unless the page needs the control in reach of its content.
   */
  jurisdiction?: boolean;
  children: ReactNode;
}

/**
 * The layout of the portfolio workspaces (Bulk review, Analytics, Access): a full-width page container with a heading row. The jurisdiction
 * filter that scopes these pages is the one in the app header.
 */
export function PortfolioFrame({ workspace, title, actions, jurisdiction = false, children }: PortfolioFrameProps) {
  const route = useRoute();
  const filter = useJurisdictionControl();
  useDocumentTitle(workspace);
  return (
    <main id="main" tabIndex={-1} className="portfolio">
      <div className="portfolio__head">
        <h2 className="portfolio__title">{title}</h2>
        {actions ? <div className="portfolio__actions">{actions}</div> : null}
      </div>
      {jurisdiction ? (
        <div className="portfolio__filter">
          <JurisdictionToggle value={filter.value} onChange={filter.onChange} />
        </div>
      ) : null}
      <ErrorBoundary scope="panel" resetKeys={[route.path]}>
        <div className="portfolio__body">{children}</div>
      </ErrorBoundary>
    </main>
  );
}
