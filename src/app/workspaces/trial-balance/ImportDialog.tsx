import { useDeferredValue, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Fund, FundId, TbView } from "../../../domain/types.ts";
import { integer } from "../../../domain/format.ts";
import { useDispatch } from "../../state.tsx";
import { Button, Dialog, Field, Icon, TextArea } from "../../ui/index.ts";
import { HEADER_HELP, MAX_IMPORT_BYTES, checkImportFile, parseTbCsv, type CsvIssue, type TbCsvResult } from "./csv.ts";
import { moneyExact, planImport, type ImportPlan } from "./model.ts";
import "./trial-balance.css";

const plural = (count: number, word: string): string => `${integer(count)} ${count === 1 ? word : `${word}s`}`;

export interface ImportDialogProps {
  fund: Fund;
  view: TbView;
  open: boolean;
  onClose(): void;
  /** Called once the rows are in, so the page can announce it after this dialog has closed. */
  onImported(count: number): void;
}

/** Replaces the fund's trial balance with a CSV file or pasted text: what the file says is read and shown first, and nothing is applied until it reads cleanly. */
export function ImportDialog({ fund, view, open, onClose, onImported }: ImportDialogProps) {
  const [text, setText] = useState("");
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const latestFile = useRef(0);
  const fileId = useId();
  const fileHintId = useId();
  const summaryId = useId();

  const deferred = useDeferredValue(text);
  const parsed = useMemo(() => (deferred.trim() === "" ? null : parseTbCsv(deferred, view.categories)), [deferred, view.categories]);
  const existing = useMemo(() => view.rows.map((row) => ({ account: row.account, category: row.category })), [view.rows]);
  const plan = useMemo(
    () => (parsed?.ok ? planImport(parsed.rows, existing, view.categories, fund.market) : null),
    [parsed, existing, view.categories, fund.market],
  );
  // The preview follows the text a moment late while a large paste is read; the file can only be imported once it has caught up.
  const importable = plan !== null && deferred === text && !reading && fileProblem === null;

  const reset = (): void => {
    latestFile.current++;
    setText("");
    setFileProblem(null);
    setReading(false);
  };
  const close = (): void => {
    reset();
    onClose();
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    const mine = ++latestFile.current;
    setText("");
    const problem = checkImportFile(file);
    setFileProblem(problem);
    if (problem !== null) {
      setReading(false);
      return;
    }
    setReading(true);
    file.text().then(
      (content) => {
        if (latestFile.current !== mine) return;
        setText(content);
        setReading(false);
      },
      () => {
        if (latestFile.current !== mine) return;
        setFileProblem("The file could not be read. Choose it again.");
        setReading(false);
      },
    );
  };

  const onType = (value: string): void => {
    latestFile.current++;
    setReading(false);
    setFileProblem(null);
    setText(value);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Import trial balance"
      description={`This replaces every account in the trial balance with the rows in your file. The first row names the columns: ${HEADER_HELP}.`}
      footer={<ImportActions fundId={fund.id} plan={importable ? plan : null} describedBy={summaryId} onCancel={close} onImported={(count) => { reset(); onImported(count); }} />}
    >
      <div className="tb-import">
        <div className="field">
          <label htmlFor={fileId} className="field__label">
            CSV file
          </label>
          <input id={fileId} type="file" className="tb-import__file" accept=".csv,.tsv,.txt,text/csv,text/plain" aria-describedby={fileHintId} onChange={onFile} />
          <p id={fileHintId} className="field__hint">
            Up to {Math.round(MAX_IMPORT_BYTES / (1024 * 1024))} MB. Download CSV from this page gives the layout.
          </p>
        </div>
        <Field label="Or paste the CSV text" hint="A file you choose appears here too, so you can correct a line before importing.">
          <TextArea className="tb-import__paste" rows={7} spellCheck={false} autoComplete="off" wrap="off" value={text} onValueChange={onType} />
        </Field>
        <div className="tb-import__result" aria-live="polite" aria-atomic="false">
          <Result summaryId={summaryId} text={deferred} parsed={parsed} plan={plan} reading={reading} fileProblem={fileProblem} currency={fund.currency} />
        </div>
      </div>
    </Dialog>
  );
}

interface ImportActionsProps {
  fundId: FundId;
  plan: ImportPlan | null;
  describedBy: string;
  onCancel(): void;
  onImported(count: number): void;
}

// A component of its own so that dispatch reports a refusal inside the dialog (the page behind it is inert).
function ImportActions({ fundId, plan, describedBy, onCancel, onImported }: ImportActionsProps) {
  const dispatch = useDispatch();
  const confirm = (): void => {
    if (!plan) return;
    const result = dispatch({ type: "import-tb", fundId, rows: plan.rows });
    if (result.ok) onImported(plan.count);
  };
  return (
    <>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" icon={<Icon name="upload" />} disabled={plan === null} aria-describedby={describedBy} onClick={confirm}>
        Replace trial balance
      </Button>
    </>
  );
}

interface ResultProps {
  summaryId: string;
  text: string;
  parsed: TbCsvResult | null;
  plan: ImportPlan | null;
  reading: boolean;
  fileProblem: string | null;
  currency: Fund["currency"];
}

function Result({ summaryId, text, parsed, plan, reading, fileProblem, currency }: ResultProps) {
  if (fileProblem !== null) return <Summary id={summaryId} tone="bad" text={fileProblem} />;
  if (reading) return <Summary id={summaryId} tone="info" text="Reading the file…" />;
  if (text.trim() === "" || parsed === null) {
    return <Summary id={summaryId} tone="info" text="Choose a CSV file or paste its text to see what would change." />;
  }
  if (parsed.fatal !== null) return <Summary id={summaryId} tone="bad" text={parsed.fatal} />;
  if (!plan) {
    const problems = plural(parsed.errorCount, "problem");
    return (
      <>
        <Summary id={summaryId} tone="bad" text={`${problems} found. Nothing can be imported until the file reads cleanly.`} />
        <Issues title="Fix these first" issues={parsed.errors} total={parsed.errorCount} />
        <Issues title="Also noted" issues={parsed.warnings} total={parsed.warningCount} />
      </>
    );
  }
  return (
    <>
      <Summary id={summaryId} tone="ok" text={`${plural(plan.count, "account")} ready to import.`} />
      <PlanFacts plan={plan} currency={currency} />
      <Issues title="Noted" issues={parsed.warnings} total={parsed.warningCount} />
    </>
  );
}

type Tone = "ok" | "bad" | "info";
const SUMMARY_ICON = { ok: "circle-check", bad: "alert-circle", info: "info" } as const;

function Summary({ id, tone, text }: { id: string; tone: Tone; text: string }) {
  return (
    <p id={id} className={`tb-import__summary tb-import__summary--${tone}`}>
      <Icon name={SUMMARY_ICON[tone]} size={18} />
      <span>{text}</span>
    </p>
  );
}

interface Fact {
  tone: "ok" | "warn" | "info";
  text: string;
}

function planFacts(plan: ImportPlan, currency: Fund["currency"]): Fact[] {
  const facts: Fact[] = [{ tone: "info", text: `This replaces the ${plural(plan.replaces, "account")} in the trial balance now.` }];
  if (plan.dropped > 0) {
    facts.push({
      tone: "warn",
      text: `${plural(plan.dropped, "account")} in the trial balance ${plan.dropped === 1 ? "is" : "are"} not in the file and will be removed.`,
    });
  }
  if (plan.added > 0) facts.push({ tone: "info", text: `${plural(plan.added, "account")} in the file ${plan.added === 1 ? "is" : "are"} new.` });
  facts.push(
    plan.balanced
      ? { tone: "ok", text: `Current balances total ${moneyExact(plan.totalCurrent, currency)}: balanced.` }
      : {
          tone: "warn",
          text: `Current balances total ${moneyExact(plan.totalCurrent, currency)}, so the trial balance would be out of balance. You can still import it.`,
        },
  );
  facts.push({ tone: "info", text: `Prior balances total ${moneyExact(plan.totalPrior, currency)}.` });
  if (plan.kept > 0) {
    facts.push({ tone: "info", text: `${plural(plan.kept, "account")} not given a category in the file ${plan.kept === 1 ? "keeps" : "keep"} the tax category ${plan.kept === 1 ? "it has" : "they have"} now.` });
  }
  facts.push(
    plan.unmapped === 0
      ? { tone: "ok", text: "Every account has a tax category." }
      : { tone: "warn", text: `${plural(plan.unmapped, "account")} will need a tax category after the import.` },
  );
  return facts;
}

const FACT_ICON = { ok: "circle-check", warn: "alert-triangle", info: "info" } as const;

function PlanFacts({ plan, currency }: { plan: ImportPlan; currency: Fund["currency"] }) {
  return (
    <ul className="tb-import__list">
      {planFacts(plan, currency).map((fact) => (
        <li key={fact.text} className={`tb-import__fact tb-import__fact--${fact.tone}`}>
          <Icon name={FACT_ICON[fact.tone]} size={16} />
          <span>{fact.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Issues({ title, issues, total }: { title: string; issues: readonly CsvIssue[]; total: number }) {
  if (issues.length === 0) return null;
  return (
    <div>
      <h3 className="tb-import__heading">{title}</h3>
      <ul className="tb-import__issues">
        {issues.map((issue, index) => (
          <li key={`${issue.line ?? "file"}-${index}`}>{issue.line === null ? issue.message : `Line ${integer(issue.line)}: ${issue.message}`}</li>
        ))}
      </ul>
      {total > issues.length ? <p className="tb-import__more">Showing the first {integer(issues.length)} of {integer(total)}.</p> : null}
    </div>
  );
}
