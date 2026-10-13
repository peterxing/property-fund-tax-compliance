import { useId, useRef } from "react";
import type { DocModel } from "../../../domain/types.ts";
import { downloadPdf } from "../../exports/index.ts";
import { Button, DownloadButton, Icon, cls } from "../../ui/index.ts";
import type { PublishControl } from "./model.ts";
import "./investor-reporting.css";

export interface NoticeBarProps {
  /** What state the notice is in: "Published 21 Aug 2026 — locked." */
  status: string;
  locked: boolean;
  control: PublishControl;
  /** "Publish notice" (Australia) or "Announce notice" (Singapore). */
  publishLabel: string;
  /** Runs the publish action; returns true when it went through. */
  onPublish(): boolean;
  doc: DocModel | null;
  /** No gap above the bar (when nothing sits over it). */
  first?: boolean;
}

/** The line under a notice: its state, the publish button (with the reason when it is unavailable) and the PDF download. */
export function NoticeBar({ status, locked, control, publishLabel, onPublish, doc, first = false }: NoticeBarProps) {
  const reasonId = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const reason = !control.enabled ? control.reason : null;

  const publish = (): void => {
    if (!onPublish()) return;
    // The button goes away once the notice is locked, so focus would fall back to the page: put it on the new state instead.
    window.setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) statusRef.current?.focus();
    }, 0);
  };

  return (
    <div className={cls("ir-bar", first && "ir-bar--first")}>
      <p ref={statusRef} tabIndex={-1} className={cls("ir-bar__status", locked && "ir-bar__status--locked")}>
        {locked ? <Icon name="lock" size={14} /> : null}
        {status}
      </p>
      <div className="ir-bar__actions">
        {control.visible ? (
          <div className="ir-action">
            <Button variant="primary" icon={<Icon name="send" />} disabled={!control.enabled} aria-describedby={reason ? reasonId : undefined} onClick={publish}>
              {publishLabel}
            </Button>
            {reason ? (
              <p id={reasonId} className="ir-reason">
                {reason}
              </p>
            ) : null}
          </div>
        ) : null}
        {doc ? <DownloadButton label="Download PDF" onDownload={() => downloadPdf(doc)} /> : null}
      </div>
    </div>
  );
}
