import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Fund, ISODate, ReturnView } from "../../../domain/types.ts";
import { useDispatch } from "../../state.tsx";
import { Banner, Button, Field, Icon, TextInput, useAnnounce } from "../../ui/index.ts";
import { checkLodgment, initialDraft, lodgmentWords, recordedMessage, type LodgmentDraft, type LodgmentErrors, type LodgmentSection } from "./model.ts";
import "./tax-returns.css";

export interface LodgmentProps {
  fund: Fund;
  view: ReturnView;
  section: LodgmentSection;
  /** Today's date: the default for a new record and the latest a record may be dated. */
  today: ISODate;
}

/** The lodgment record under the checklist: what was lodged, who records it for this fund's governance, or the form that records it. */
export function Lodgment({ fund, view, section, today }: LodgmentProps) {
  const words = lodgmentWords(view.lodgmentKind);
  const [replacing, setReplacing] = useState(false);
  // Counts the records saved here, so focus can follow the form into the summary that replaces it.
  const [saved, setSaved] = useState(0);
  const [returnFocus, setReturnFocus] = useState(false);
  const replaceRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (returnFocus && !replacing) {
      replaceRef.current?.focus();
      setReturnFocus(false);
    }
  }, [returnFocus, replacing]);

  // A fund reopened while the replace form is open must not bring the form back when it is signed off again.
  useEffect(() => {
    if (section.kind !== "lodged") setReplacing(false);
  }, [section.kind]);

  if (section.kind === "delegated") {
    return (
      <div className="ret-lodgment">
        <h4 className="ret-lodgment__title">{words.action}</h4>
        <p className="ret-note">{section.text}</p>
      </div>
    );
  }

  if (section.kind === "reopened") {
    return (
      <div className="ret-lodgment">
        <h4 className="ret-lodgment__title">{section.title}</h4>
        <div className="ret-lodged ret-lodged--reopened">
          <p className="ret-lodged__summary">
            <Icon name="reopen" size={16} />
            {section.summary}
          </p>
          <p className="ret-lodged__by">{section.recordedBy}</p>
        </div>
        <Banner tone="warn" className="ret-reopened">
          {section.note}
        </Banner>
        {section.replaceReason !== null ? <ReplaceBlocked reason={section.replaceReason} /> : null}
      </div>
    );
  }

  if (section.kind === "lodged") {
    return (
      <div className="ret-lodgment">
        <LodgedSummary title={section.title} summary={section.summary} recordedBy={section.recordedBy} focusToken={saved} />
        {section.canReplace && replacing ? (
          <LodgmentForm
            fund={fund}
            view={view}
            label="Replace the lodgment record"
            submitLabel="Save record"
            enabled
            reason={null}
            initial={initialDraft(view.lodgment, today)}
            today={today}
            focusOnMount
            onRecorded={() => {
              setReplacing(false);
              setSaved((n) => n + 1);
            }}
            onCancel={() => {
              setReplacing(false);
              setReturnFocus(true);
            }}
          />
        ) : null}
        {section.canReplace && !replacing ? (
          <Button ref={replaceRef} size="sm" className="ret-replace" onClick={() => setReplacing(true)}>
            Replace record
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="ret-lodgment">
      <h4 className="ret-lodgment__title">{words.action}</h4>
      <LodgmentForm
        fund={fund}
        view={view}
        label={words.action}
        submitLabel={words.action}
        enabled={section.enabled}
        reason={section.reason}
        initial={initialDraft(null, today)}
        today={today}
        onRecorded={() => setSaved((n) => n + 1)}
      />
    </div>
  );
}

function LodgedSummary({ title, summary, recordedBy, focusToken }: { title: string; summary: string; recordedBy: string; focusToken: number }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusToken > 0) headingRef.current?.focus();
  }, [focusToken]);
  return (
    <>
      <h4 ref={headingRef} tabIndex={-1} className="ret-lodgment__title">
        {title}
      </h4>
      <div className="ret-lodged">
        <p className="ret-lodged__summary">
          <Icon name="circle-check" size={16} />
          {summary}
        </p>
        <p className="ret-lodged__by">{recordedBy}</p>
      </div>
    </>
  );
}

/** What Replace record becomes while the fund is not signed off: still there, switched off, and saying why. */
function ReplaceBlocked({ reason }: { reason: string }) {
  const reasonId = useId();
  return (
    <div className="ret-replace-row">
      <Button size="sm" disabled aria-describedby={reasonId}>
        Replace record
      </Button>
      <p id={reasonId} className="ret-reason">
        {reason}
      </p>
    </div>
  );
}

interface LodgmentFormProps {
  fund: Fund;
  view: ReturnView;
  /** Names the form for assistive technology. */
  label: string;
  submitLabel: string;
  enabled: boolean;
  /** Why the form is switched off, shown beside it. */
  reason: string | null;
  initial: LodgmentDraft;
  today: ISODate;
  focusOnMount?: boolean;
  onRecorded(): void;
  onCancel?(): void;
}

const PLACEHOLDER = {
  "form-ut": "e.g. Acknowledgement 2027-418806",
  return: "e.g. Receipt 418806117352",
  aiir: "e.g. Receipt 418806117352",
} as const;

function LodgmentForm({ fund, view, label, submitLabel, enabled, reason, initial, today, focusOnMount = false, onRecorded, onCancel }: LodgmentFormProps) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const reasonId = useId();
  const referenceRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState(initial.reference);
  const [date, setDate] = useState(initial.date);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (focusOnMount) referenceRef.current?.focus();
  }, [focusOnMount]);

  const check = checkLodgment({ reference, date }, today, view.referenceLabel);
  // Errors wait for a first attempt to save; after that they follow the fields as they are corrected.
  const errors: LodgmentErrors = attempted && !check.ok ? check.errors : {};

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!enabled) return;
    if (!check.ok) {
      setAttempted(true);
      (check.errors.reference !== undefined ? referenceRef : dateRef).current?.focus();
      return;
    }
    const result = dispatch({ type: "record-lodgment", fundId: fund.id, kind: view.lodgmentKind, reference: check.reference, date: check.date });
    if (result.ok) {
      announce(recordedMessage(fund.name, view.lodgmentKind, check.reference));
      onRecorded();
    }
  };

  return (
    <form className="ret-form" noValidate aria-label={label} onSubmit={submit}>
      <Field label={view.referenceLabel} required error={errors.reference}>
        <TextInput
          ref={referenceRef}
          value={reference}
          onValueChange={setReference}
          placeholder={PLACEHOLDER[view.lodgmentKind]}
          autoComplete="off"
          spellCheck={false}
          disabled={!enabled}
        />
      </Field>
      <Field label="Date" required error={errors.date}>
        <TextInput ref={dateRef} type="date" value={date} max={today} onValueChange={setDate} disabled={!enabled} />
      </Field>
      <div className="ret-form__actions">
        <span className="field__label" aria-hidden="true">
          &nbsp;
        </span>
        <div className="ret-form__buttons">
          <Button type="submit" variant="primary" icon={<Icon name="check" />} disabled={!enabled} aria-describedby={reason ? reasonId : undefined}>
            {submitLabel}
          </Button>
          {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
        </div>
      </div>
      {reason ? (
        <p id={reasonId} className="ret-reason">
          {reason}
        </p>
      ) : null}
    </form>
  );
}
