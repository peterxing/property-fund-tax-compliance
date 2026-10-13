import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons.tsx";

export type Politeness = "polite" | "assertive";
export type NoticeTone = "info" | "success" | "warn" | "error";

export interface NoticeInput {
  message: string;
  tone?: NoticeTone;
  title?: string;
}
export interface Notice extends NoticeInput {
  id: number;
  tone: NoticeTone;
}

export interface LiveApi {
  /** Speak a message through the hidden live regions (nothing is shown). Identical consecutive messages are announced again. */
  announce(message: string, politeness?: Politeness): void;
  /** Show a dismissible notice. Errors are role="alert"; the others are role="status". Info and success notices clear themselves after a few seconds; warnings and errors stay until dismissed. Returns its id. */
  notify(notice: NoticeInput): number;
  dismiss(id: number): void;
}

const NOOP: LiveApi = {
  announce() {},
  notify() {
    return 0;
  },
  dismiss() {},
};

const LiveContext = createContext<LiveApi>(NOOP);

const MAX_NOTICES = 3;
/** Information and success notices go away by themselves (paused while the pointer or focus is on them); warnings and errors stay until dismissed. */
const AUTO_DISMISS_MS = 8000;
const TONE_ICON: Record<NoticeTone, IconName> = { info: "info", success: "circle-check", warn: "alert-triangle", error: "alert-circle" };

interface Spoken {
  text: string;
  n: number;
}

function Toast({ notice, onDismiss }: { notice: Notice; onDismiss(id: number): void }) {
  const [held, setHeld] = useState(false);
  const persistent = notice.tone === "error" || notice.tone === "warn";
  useEffect(() => {
    if (persistent || held) return;
    const timer = window.setTimeout(() => onDismiss(notice.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [persistent, held, notice.id, onDismiss]);

  return (
    <div
      className={`toast toast--${notice.tone}`}
      role={notice.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <Icon name={TONE_ICON[notice.tone]} size={18} className="toast__icon" />
      <p className="toast__body">
        {notice.title ? <strong>{notice.title} </strong> : null}
        {notice.message}
      </p>
      <button type="button" className="toast__close" aria-label="Dismiss notification" onClick={() => onDismiss(notice.id)}>
        <Icon name="x" />
      </button>
    </div>
  );
}

/** Hosts the two hidden live regions and the notice stack. Components use useAnnounce() / useNotify(); without a provider they do nothing. */
export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState<Spoken>({ text: "", n: 0 });
  const [assertive, setAssertive] = useState<Spoken>({ text: "", n: 0 });
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);

  const announce = useCallback((message: string, politeness: Politeness = "polite") => {
    const set = politeness === "assertive" ? setAssertive : setPolite;
    set((prev) => ({ text: message, n: prev.n + 1 }));
  }, []);

  const notify = useCallback((input: NoticeInput) => {
    const id = nextId.current++;
    const notice: Notice = { ...input, id, tone: input.tone ?? "info" };
    setNotices((prev) =>
      [...prev.filter((n) => !(n.message === notice.message && n.tone === notice.tone && n.title === notice.title)), notice].slice(-MAX_NOTICES),
    );
    return id;
  }, []);

  const dismiss = useCallback((id: number) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const api = useMemo<LiveApi>(() => ({ announce, notify, dismiss }), [announce, notify, dismiss]);

  return (
    <LiveContext.Provider value={api}>
      {children}
      {/* A trailing no-break space on alternate messages makes screen readers re-announce identical text. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite.text}
        {polite.n % 2 === 0 ? "" : "\u00A0"}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive.text}
        {assertive.n % 2 === 0 ? "" : "\u00A0"}
      </div>
      {notices.length > 0 ? (
        <div className="toasts" role="region" aria-label="Notifications">
          {notices.map((notice) => (
            <Toast key={notice.id} notice={notice} onDismiss={dismiss} />
          ))}
        </div>
      ) : null}
    </LiveContext.Provider>
  );
}

export function useLive(): LiveApi {
  return useContext(LiveContext);
}

export function useAnnounce(): LiveApi["announce"] {
  return useContext(LiveContext).announce;
}

export function useNotify(): LiveApi["notify"] {
  return useContext(LiveContext).notify;
}
