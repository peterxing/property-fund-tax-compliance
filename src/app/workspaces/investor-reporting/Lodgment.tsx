import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { AuFund, ISODate } from "../../../domain/types.ts";
import { useDispatch } from "../../state.tsx";
import { Banner, Button, Field, Icon, TextInput, useAnnounce } from "../../ui/index.ts";
import { REPLACE_LABEL, SAVE_RECORD_LABEL, checkLodgment, recordedMessage, type LodgmentDraft, type LodgmentErrors, type LodgmentSection } from "./model.ts";
import "./investor-reporting.css";

export interface LodgmentProps {
  fund: AuFund;
  section: LodgmentSection;
  /** Today's date, the latest a lodgment may be dated. */
  today: ISODate;
}

/** Where focus goes once the form that had it gives way: onto the summary of the record just saved, or back onto the button that opened the form. */
type FocusNext = "summary" | "replace" | null;

/**
 * The lodgment record under the AIIR: what was lodged, with Replace lodgment record for whoever records it once the fund is signed off; the same
 * record on a fund that was reopened after it was lodged (history, with a warning, and the replace control switched off until the fund is signed
 * off again); who records it for this fund's governance; or the form to record it.
 */
export function Lodgment({ fund, section, today }: LodgmentProps) {
  const [replacing, setReplacing] = useState(false);
  // Set by whatever closes a form that had focus; the effect below hands focus on once the new content is in place, then clears it, so a summary
  // that comes back later (the fund signed off again after a reopen) leaves focus alone.
  const focusNext = useRef<FocusNext>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const canReplace = section.kind === "lodged" && section.canReplace;

  // The replace form goes when there is nothing to replace or no right to replace it (the fund was reopened, another person was picked), and
  // does not come back by itself when that changes again.
  useEffect(() => {
    if (!canReplace) setReplacing(false);
  }, [canReplace]);

  useEffect(() => {
    const next = focusNext.current;
    if (next === null || replacing) return;
    focusNext.current = null;
    (next === "summary" ? headingRef : replaceRef).current?.focus();
  }, [section.kind, replacing]);

  const recorded = (): void => {
    focusNext.current = "summary";
    setReplacing(false);
  };
  const cancelReplace = (): void => {
    focusNext.current = "replace";
    setReplacing(false);
  };

  if (section.kind === "lodged") {
    return (
      <div className="ir-lodgment">
        <h4 ref={headingRef} tabIndex={-1} className="label-caps ir-lodgment__title">
          {section.title}
        </h4>
        <div className="ir-lodged">
          <p className="ir-lodged__summary">
            <Icon name="circle-check" size={16} />
            {section.summary}
          </p>
          <p className="ir-lodged__by">{section.recordedBy}</p>
        </div>
        {section.canReplace && replacing ? (
          <LodgmentForm fund={fund} enabled reason={null} today={today} replacing={{ record: section.record, onCancel: cancelReplace }} onRecorded={recorded} />
        ) : null}
        {section.canReplace && !replacing ? (
          <Button ref={replaceRef} size="sm" className="ir-replace" onClick={() => setReplacing(true)}>
            {REPLACE_LABEL}
          </Button>
        ) : null}
      </div>
    );
  }
  if (section.kind === "reopened") {
    return (
      <div className="ir-lodgment">
        <h4 className="label-caps ir-lodgment__title">{section.title}</h4>
        <div className="ir-lodged ir-lodged--reopened">
          <p className="ir-lodged__summary">
            <Icon name="reopen" size={16} />
            {section.summary}
          </p>
          <p className="ir-lodged__by">{section.recordedBy}</p>
        </div>
        <Banner tone="warn" className="ir-reopened">
          {section.note}
        </Banner>
        {section.replaceReason === null ? null : <ReplaceBlocked reason={section.replaceReason} />}
      </div>
    );
  }
  if (section.kind === "delegated") {
    return (
      <div className="ir-lodgment">
        <h4 className="label-caps ir-lodgment__title">Lodgment</h4>
        <p className="ir-note">{section.text}</p>
      </div>
    );
  }
  return (
    <div className="ir-lodgment">
      <h4 id={titleId} className="label-caps ir-lodgment__title">
        Record lodgment
      </h4>
      <LodgmentForm fund={fund} titleId={titleId} enabled={section.enabled} reason={section.reason} today={today} onRecorded={recorded} />
    </div>
  );
}

/** What Replace lodgment record becomes while the fund is not signed off: still there, switched off, and saying why. */
function ReplaceBlocked({ reason }: { reason: string }) {
  const reasonId = useId();
  return (
    <div className="ir-replace-row">
      <Button size="sm" disabled aria-describedby={reasonId}>
        {REPLACE_LABEL}
      </Button>
      <p id={reasonId} className="ir-reason">
        {reason}
      </p>
    </div>
  );
}

interface LodgmentFormProps {
  fund: AuFund;
  /** The heading that names a first record's form; a replace form carries its own label. */
  titleId?: string;
  enabled: boolean;
  reason: string | null;
  today: ISODate;
  /** Set when the form replaces the record: what it starts from, and the way out without saving. */
  replacing?: { record: LodgmentDraft; onCancel(): void };
  onRecorded(): void;
}

function LodgmentForm({ fund, titleId, enabled, reason, today, replacing, onRecorded }: LodgmentFormProps) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const reasonId = useId();
  const referenceRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const isReplacing = replacing !== undefined;
  const [reference, setReference] = useState(replacing?.record.reference ?? "");
  const [date, setDate] = useState<string>(replacing?.record.date ?? today);
  const [attempted, setAttempted] = useState(false);

  // The form that opens in place of the Replace button takes focus; a first record's form is where the page leaves it.
  useEffect(() => {
    if (isReplacing) referenceRef.current?.focus();
  }, [isReplacing]);

  const check = checkLodgment({ reference, date }, today);
  // Errors wait for a first attempt to record; after that they follow the fields as they are corrected.
  const errors: LodgmentErrors = attempted && !check.ok ? check.errors : {};

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!enabled) return;
    if (!check.ok) {
      setAttempted(true);
      (check.errors.reference !== undefined ? referenceRef : dateRef).current?.focus();
      return;
    }
    const result = dispatch({ type: "record-lodgment", kind: "aiir", fundId: fund.id, reference: check.reference, date: check.date });
    if (result.ok) {
      announce(recordedMessage(fund.name, check.reference, isReplacing));
      onRecorded();
    }
  };

  const save = (
    <Button type="submit" variant="primary" icon={<Icon name="check" />} disabled={!enabled} aria-describedby={reason ? reasonId : undefined}>
      {isReplacing ? SAVE_RECORD_LABEL : "Record lodgment"}
    </Button>
  );

  return (
    <form
      className={isReplacing ? "ir-lodge-form ir-lodge-form--replace" : "ir-lodge-form"}
      noValidate
      aria-labelledby={isReplacing ? undefined : titleId}
      aria-label={isReplacing ? REPLACE_LABEL : undefined}
      onSubmit={submit}
    >
      <Field label="ATO receipt reference" required error={errors.reference}>
        <TextInput ref={referenceRef} value={reference} onValueChange={setReference} placeholder="Receipt 418806117352" autoComplete="off" disabled={!enabled} />
      </Field>
      <Field label="Date" required error={errors.date}>
        <TextInput ref={dateRef} type="date" value={date} max={today} onValueChange={setDate} disabled={!enabled} />
      </Field>
      <div className="ir-lodge-form__submit">
        {replacing ? (
          <div className="ir-lodge-form__buttons">
            {save}
            <Button onClick={replacing.onCancel}>Cancel</Button>
          </div>
        ) : (
          save
        )}
        {reason ? (
          <p id={reasonId} className="ir-reason">
            {reason}
          </p>
        ) : null}
      </div>
    </form>
  );
}
