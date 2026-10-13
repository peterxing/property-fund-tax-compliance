import { useId, useState } from "react";
import type { Fund, TbView } from "../../../domain/types.ts";
import { downloadCsv } from "../../exports/index.ts";
import { Button, DownloadButton, Icon, Panel, useAnnounce } from "../../ui/index.ts";
import { ImportDialog } from "./ImportDialog.tsx";
import { StatusPill } from "./StatusPill.tsx";
import { statusChips, tbExportCsv } from "./model.ts";
import "./trial-balance.css";

export interface HeaderPanelProps {
  fund: Fund;
  view: TbView;
  canEdit: boolean;
  /** Why the trial balance cannot be changed (shown with a lock), or null when it can. */
  lockNote: string | null;
}

/** The period, the three checks (balanced, mapped, matches the distribution), and the CSV export and import. */
export function HeaderPanel({ fund, view, canEdit, lockNote }: HeaderPanelProps) {
  const lockId = useId();
  const announce = useAnnounce();
  const [importing, setImporting] = useState(false);

  return (
    <Panel
      title={`Trial balance · ${view.periodLabel}`}
      actions={
        <>
          <DownloadButton size="sm" label="Download CSV" onDownload={() => downloadCsv(tbExportCsv(fund.name, view))} />
          <Button size="sm" icon={<Icon name="upload" />} disabled={!canEdit} aria-describedby={!canEdit && lockNote ? lockId : undefined} onClick={() => setImporting(true)}>
            Import trial balance
          </Button>
        </>
      }
    >
      <div className="tb-status">
        <ul className="tb-chips" aria-label="Trial balance checks">
          {statusChips(view, fund.currency).map((chip) => (
            <li key={chip.key}>
              <StatusPill tone={chip.tone}>{chip.text}</StatusPill>
            </li>
          ))}
        </ul>
        {lockNote ? (
          <p id={lockId} className="tb-lock">
            <Icon name="lock" size={14} />
            {lockNote}
          </p>
        ) : null}
      </div>
      <ImportDialog
        fund={fund}
        view={view}
        open={importing}
        onClose={() => setImporting(false)}
        onImported={(count) => {
          setImporting(false);
          announce(`${fund.name}: trial balance imported, ${count} ${count === 1 ? "account" : "accounts"}.`);
        }}
      />
    </Panel>
  );
}
