import type { ReactNode } from "react";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Panel } from "../ui/Panel.tsx";

export interface PlaceholderPanelProps {
  /** Workspace name ("Trial balance"). */
  workspace: string;
  /** What will live here; shown under the heading. */
  children?: ReactNode;
}

/** The body of a workspace nobody has built yet: clearly labelled, so it is never mistaken for finished work. */
export function PlaceholderPanel({ workspace, children }: PlaceholderPanelProps) {
  return (
    <Panel title="Placeholder">
      <EmptyState title={`${workspace} is not built yet`} icon="info">
        {children ?? "This workspace has a place in the navigation and the layout, but its content has not been written."}
      </EmptyState>
    </Panel>
  );
}
