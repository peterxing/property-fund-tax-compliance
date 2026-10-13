import { useId, useMemo } from "react";
import { accessView } from "../../domain/index.ts";
import { PortfolioFrame } from "../shell/PortfolioFrame.tsx";
import { useAppData, useCtx, useUi } from "../state.tsx";
import { Icon } from "../ui/index.ts";
import { GovernancePanel } from "./access/GovernancePanel.tsx";
import { PermissionsPanel } from "./access/PermissionsPanel.tsx";
import { ResetPanel } from "./access/ResetPanel.tsx";
import { UsersPanel } from "./access/UsersPanel.tsx";
import { canManageAccess, readOnlyNote } from "./access/accessModel.ts";
import "./access/access.css";

/** Who can see which funds, how each fund is governed and what every role can do. A Head of Tax can change the first two; everyone else reads. */
export default function Access() {
  const data = useAppData();
  const ctx = useCtx();
  const { user } = useUi();
  const readOnlyNoteId = useId();
  const view = useMemo(() => accessView(data, ctx), [data, ctx]);
  const funds = useMemo(() => view.governance.map((entry) => entry.fund), [view]);
  const canManage = canManageAccess(user);

  return (
    <PortfolioFrame workspace="Access" title="Access and governance">
      <p className="access-disclaimer">{view.disclaimer}</p>
      {canManage ? null : (
        <p id={readOnlyNoteId} className="access-readonly">
          <Icon name="lock" size={14} />
          <span>{readOnlyNote()}</span>
        </p>
      )}
      <UsersPanel users={view.users} funds={funds} canManage={canManage} />
      <GovernancePanel entries={view.governance} modes={view.modes} user={user} readOnlyNoteId={readOnlyNoteId} />
      <PermissionsPanel view={view} />
      <ResetPanel />
    </PortfolioFrame>
  );
}
