import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "./Button.tsx";
import { Icon } from "./icons.tsx";
import { useAnnounce, useNotify } from "./LiveRegion.tsx";

export interface DownloadButtonProps extends Omit<ButtonProps, "onClick" | "loading" | "children" | "type"> {
  /** Produces and saves the file (an export helper). May be async; a throw or rejection shows an inline error next to the button. */
  onDownload(): void | Promise<void>;
  /** Button label, e.g. "Download CSV". Use `label` or children. */
  label?: string;
  children?: ReactNode;
  /** Spoken (politely) once the download has started. Default "Download started." */
  startedMessage?: string;
}

function errorText(error: unknown): string {
  const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
  return `The file could not be created.${detail}`;
}

/** A button that runs an export: busy while it works, a polite "download started" announcement, and a role="alert" error if it fails. */
export function DownloadButton({ onDownload, label, children, startedMessage = "Download started.", icon = <Icon name="download" />, variant = "secondary", ...rest }: DownloadButtonProps) {
  const announce = useAnnounce();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDownload();
      announce(startedMessage);
    } catch (caught) {
      // Navigating away while the file is being made must not hide a failure.
      if (mounted.current) setError(errorText(caught));
      else notify({ tone: "error", message: errorText(caught) });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <span className="dl">
      <Button {...rest} variant={variant} icon={icon} loading={busy} onClick={() => void run()}>
        {children ?? label}
      </Button>
      {error ? (
        <span className="dl__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
