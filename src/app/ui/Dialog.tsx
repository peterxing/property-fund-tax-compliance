import { useEffect, useId, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { cls } from "./cls.ts";
import { Icon } from "./icons.tsx";
import { LiveRegionProvider } from "./LiveRegion.tsx";

export interface DialogProps {
  /** The parent owns this. */
  open: boolean;
  /** Called when the user asks to close (Escape, backdrop click, the close button). Set `open` to false in response. */
  onClose(): void;
  title: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Default true. When false, Escape / backdrop / the close button do nothing and the footer must offer its own Cancel. */
  dismissible?: boolean;
  /** "alertdialog" for confirmations that need an immediate decision. */
  role?: "dialog" | "alertdialog";
  /** Action row (buttons), right-aligned. Put `data-autofocus` on the control that should take focus first (the safe choice for destructive actions). */
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusInitial(dialog: HTMLDialogElement): void {
  const target =
    dialog.querySelector<HTMLElement>("[data-autofocus]") ??
    dialog.querySelector<HTMLElement>(`.dialog__body :is(${FOCUSABLE})`) ??
    dialog.querySelector<HTMLElement>(".dialog__footer button:not([disabled])") ??
    dialog.querySelector<HTMLElement>(".dialog__panel");
  target?.focus();
}

/**
 * A modal built on the native <dialog>: focus is trapped and the page behind is inert, Escape and a click on the backdrop ask to close,
 * and focus returns to the opener. Children are mounted only while open, so forms start fresh each time. Anything announced or notified from
 * inside (useAnnounce / useNotify / a failed useDispatch) is routed into the dialog, because the page behind it is inert.
 */
export function Dialog({ open, onClose, title, description, size = "md", dismissible = true, role, footer, className, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const downOnBackdrop = useRef(false);
  const titleId = useId();
  const descId = useId();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      focusInitial(dialog);
    } else if (!open && dialog.open) {
      dialog.close();
      const el = opener.current;
      opener.current = null;
      if (el?.isConnected) el.focus();
      else document.getElementById("main")?.focus();
    }
  }, [open]);

  useEffect(
    () => () => {
      if (ref.current?.open) ref.current.close();
    },
    [],
  );

  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>): void => {
    const hit = event.target === event.currentTarget && downOnBackdrop.current;
    downOnBackdrop.current = false;
    if (hit && dismissible) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={cls("dialog", `dialog--${size}`, className)}
      role={role === "alertdialog" ? "alertdialog" : undefined}
      aria-labelledby={open ? titleId : undefined}
      aria-describedby={open && description ? descId : undefined}
      onCancel={(event) => {
        // Keep React in charge of closing (also stops the browser closing a non-dismissible dialog).
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClose={() => {
        // The browser closed it on its own (repeated Escape): keep the parent in sync.
        if (open) onClose();
      }}
      onMouseDown={(event) => {
        downOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={onBackdropClick}
    >
      {open ? (
        <LiveRegionProvider>
          <div className="dialog__panel" tabIndex={-1}>
            <header className="dialog__header">
              <h2 id={titleId} className="dialog__title">
                {title}
              </h2>
              {dismissible ? (
                <button type="button" className="dialog__close" aria-label="Close dialog" onClick={onClose}>
                  <Icon name="x" />
                </button>
              ) : null}
            </header>
            <div className="dialog__body">
              {description ? (
                <p id={descId} className="dialog__description">
                  {description}
                </p>
              ) : null}
              {children}
            </div>
            {footer ? <footer className="dialog__footer">{footer}</footer> : null}
          </div>
        </LiveRegionProvider>
      ) : null}
    </dialog>
  );
}
