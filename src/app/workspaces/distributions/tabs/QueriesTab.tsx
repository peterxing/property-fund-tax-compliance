import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { queriesFor } from "../../../../domain/selectors.ts";
import { useAppData, useDispatch, useWorkflow } from "../../../state.tsx";
import { Button, EmptyState, Field, Icon, Tag, TextArea, TextInput, useAnnounce } from "../../../ui/index.ts";
import {
  QUERY_DENIED_REASON,
  queryRaisedMessage,
  queryResolvedMessage,
  replySentMessage,
  threadModel,
  validateQuery,
  validateReply,
  type QueryDraft,
  type QueryField,
  type ThreadModel,
} from "./tabModel.ts";

const EMPTY_DRAFT: QueryDraft = { subject: "", message: "" };

function NewQuery({ fundId, canQuery }: { fundId: string; canQuery: boolean }) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const uid = useId();
  const subjectRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<QueryDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<QueryField, string>>>({});
  const reasonId = canQuery ? undefined : `${uid}-reason`;
  const titleId = `${uid}-title`;

  const change = (field: QueryField, value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canQuery) return;
    const check = validateQuery(draft);
    if (!check.ok) {
      setErrors(check.errors);
      (check.first === "subject" ? subjectRef : messageRef).current?.focus();
      return;
    }
    const result = dispatch({ type: "raise-query", fundId, subject: check.value.subject, message: check.value.message });
    if (!result.ok) return;
    setDraft(EMPTY_DRAFT);
    setErrors({});
    announce(queryRaisedMessage(check.value.subject));
  };

  return (
    <form className="rv-form" noValidate aria-labelledby={titleId} onSubmit={submit}>
      <h4 id={titleId} className="rv-heading">
        New query
      </h4>
      {canQuery ? null : (
        <p id={reasonId} className="rv-note rv-note--lock">
          <Icon name="lock" />
          <span>{QUERY_DENIED_REASON}</span>
        </p>
      )}
      <Field label="Subject" required error={errors.subject}>
        <TextInput ref={subjectRef} value={draft.subject} disabled={!canQuery} autoComplete="off" onValueChange={(value) => change("subject", value)} />
      </Field>
      <Field label="Message" required error={errors.message}>
        <TextArea ref={messageRef} value={draft.message} disabled={!canQuery} rows={3} onValueChange={(value) => change("message", value)} />
      </Field>
      <div className="rv-form__actions">
        <Button type="submit" variant="primary" disabled={!canQuery} aria-describedby={reasonId} icon={<Icon name="send" />}>
          Raise query
        </Button>
      </div>
    </form>
  );
}

interface ThreadProps {
  thread: ThreadModel;
  fundId: string;
  canQuery: boolean;
}

function Thread({ thread, fundId, canQuery }: ThreadProps) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const uid = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const replyButtonRef = useRef<HTMLButtonElement>(null);
  const replyBoxRef = useRef<HTMLTextAreaElement>(null);
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const headingId = `${uid}-title`;
  const formId = `${uid}-reply`;

  useEffect(() => {
    if (replying) replyBoxRef.current?.focus();
  }, [replying]);

  const closeReply = (): void => {
    setReplying(false);
    setText("");
    setError(undefined);
    replyButtonRef.current?.focus();
  };

  const sendReply = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const check = validateReply(text);
    if (!check.ok) {
      setError(check.error);
      replyBoxRef.current?.focus();
      return;
    }
    const result = dispatch({ type: "reply-query", fundId, queryId: thread.id, message: check.message });
    if (!result.ok) return;
    closeReply();
    announce(replySentMessage(thread.subject));
  };

  const resolve = (): void => {
    const result = dispatch({ type: "resolve-query", fundId, queryId: thread.id });
    if (!result.ok) return;
    headingRef.current?.focus();
    announce(queryResolvedMessage(thread.subject));
  };

  const onReplyKeyDown = (event: KeyboardEvent<HTMLFormElement>): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeReply();
  };

  return (
    <article className="rv-thread" aria-labelledby={headingId}>
      <header className="rv-thread__head">
        <h5 id={headingId} ref={headingRef} tabIndex={-1} className="rv-thread__title">
          {thread.subject}
        </h5>
        <Tag tone={thread.open ? "warn" : "good"}>{thread.statusLabel}</Tag>
      </header>
      <p className="rv-thread__meta">{thread.raised}</p>
      <ol className="rv-messages">
        {thread.messages.map((message) => (
          <li key={message.key} className="rv-message">
            <p className="rv-message__head">
              <span className="rv-message__by">{message.by}</span>
              <time dateTime={message.at}>{message.atText}</time>
            </p>
            <p className="rv-message__text">{message.text}</p>
          </li>
        ))}
      </ol>
      {thread.open && canQuery ? (
        <div className="rv-thread__actions">
          <Button
            ref={replyButtonRef}
            size="sm"
            variant="secondary"
            aria-label={`Reply to ${thread.subject}`}
            aria-expanded={replying}
            aria-controls={replying ? formId : undefined}
            onClick={() => (replying ? closeReply() : setReplying(true))}
          >
            Reply
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Resolve ${thread.subject}`} icon={<Icon name="check" />} onClick={resolve}>
            Resolve
          </Button>
        </div>
      ) : null}
      {replying ? (
        <form id={formId} className="rv-reply" noValidate onSubmit={sendReply} onKeyDown={onReplyKeyDown}>
          <Field
            label={
              <>
                Reply <span className="sr-only">to {thread.subject}</span>
              </>
            }
            required
            error={error}
          >
            <TextArea
              ref={replyBoxRef}
              value={text}
              rows={3}
              onValueChange={(value) => {
                setText(value);
                setError(undefined);
              }}
            />
          </Field>
          <div className="rv-form__actions">
            <Button type="submit" variant="primary" size="sm">
              Send reply
            </Button>
            <Button size="sm" variant="ghost" onClick={closeReply}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

/** Raise a query, read the threads (newest first), and reply to or resolve the open ones. Anyone can read; changing needs the "query" permission. */
export function QueriesTab({ fundId }: { fundId: string }) {
  const data = useAppData();
  const workflow = useWorkflow(fundId);
  const threadsId = useId();
  const threads = useMemo(() => queriesFor(data, fundId).map(threadModel), [data, fundId]);
  const canQuery = workflow.can.query;

  return (
    <div className="rv-stack">
      <NewQuery fundId={fundId} canQuery={canQuery} />
      {threads.length === 0 ? (
        <EmptyState title="No queries on this distribution">
          {canQuery ? "Use the form above to raise a question about it." : "Nobody has raised a query about it yet."}
        </EmptyState>
      ) : (
        <section className="rv-threads" aria-labelledby={threadsId}>
          <h4 id={threadsId} className="rv-heading">
            Threads
          </h4>
          {threads.map((thread) => (
            <Thread key={thread.id} thread={thread} fundId={fundId} canQuery={canQuery} />
          ))}
        </section>
      )}
    </div>
  );
}
