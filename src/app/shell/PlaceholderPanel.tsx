import type { ReactNode } from "react";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Panel } from "../ui/Panel.tsx";

export interface PlaceholderPanelProps {
  /** Workspace name ("Trial balance"). */
  workspace: string;
  /** What will live here; shown under the heading. */
  children?: ReactNode;
}

/** The body of a scaffolded workspace: clearly labelled, so it is never mistaken for finished work. */
export function PlaceholderPanel({ workspace, children }: PlaceholderPanelProps) {
  return (
    <Panel title="Workspace scaffold">
      <EmptyState title={`${workspace} content is in progress`} icon="info">
        {children ?? "This workspace has a place in the navigation and the layout while the feature team adds the page content."}
      </EmptyState>
    </Panel>
  );
}
