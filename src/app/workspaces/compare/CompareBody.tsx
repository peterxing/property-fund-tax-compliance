import { useEffect, useId, useMemo, useState, type ChangeEvent } from "react";
import { compareSources, type ParsedTheirFile } from "../../../domain/compare/index.ts";
import { money } from "../../../domain/format.ts";
import type { CompareSource } from "../../../domain/providers.ts";
import type { Fund } from "../../../domain/types.ts";
import { downloadCsv } from "../../exports/index.ts";
import { useAppData, useCtx, useDispatch, useWorkflow } from "../../state.tsx";
import { Badge, Banner, Button, DownloadButton, Field, Panel, Select, TableScroll, Tag, TextArea, TextInput, buttonClass, useAnnounce } from "../../ui/index.ts";
import { comparisonFor, loadMappings, ourCsv, parseText, queryDraft, saveMappings } from "./model.ts";
import { PRACTICE_FILES } from "./practiceFiles.ts";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "match", label: "Match" },
  { value: "within-tolerance", label: "Within tolerance" },
  { value: "differs", label: "Differs" },
  { value: "only-in-theirs", label: "Only in theirs" },
  { value: "only-in-ours", label: "Only in ours" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  match: "Match",
  "within-tolerance": "Within tolerance",
  differs: "Differs",
  "only-in-theirs": "Only in theirs",
  "only-in-ours": "Only in ours",
};

function lineKey(line: { reference?: string; label: string }): string {
  return line.reference ?? line.label;
}

function ColumnSelect({ label, value, parsed, onChange, allowNone = false }: { label: string; value: number | null; parsed: ParsedTheirFile; onChange(value: number | null): void; allowNone?: boolean }) {
  const options = [
    ...(allowNone ? [{ value: "-1", label: "None" }] : []),
    ...parsed.columns.map((column, index) => ({ value: String(index), label: `${column} (${index + 1})` })),
  ];
  return (
    <Field label={label}>
      <Select value={value === null ? "-1" : String(value)} options={options} onValueChange={(next) => onChange(next === "-1" ? null : Number(next))} />
    </Field>
  );
}

function TheirInput({
  text,
  setText,
  parsed,
  reparse,
  practice,
}: {
  text: string;
  setText(value: string): void;
  parsed: ParsedTheirFile | null;
  reparse(options: { referenceColumn?: number | null; labelColumn?: number; amountColumn?: number }): void;
  practice?: { label: string; text: string };
}) {
  const [error, setError] = useState("");
  const fileId = useId();
  const readFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((value) => {
        setError("");
        setText(value);
      })
      .catch(() => setError("Could not read the file."));
  };
  return (
    <Panel title="2. Load their figures" bodyClassName="stack stack--tight">
      <p className="text-muted">Upload a CSV or paste an Excel range. It all runs in your browser; nothing is sent to a server.</p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="button-row">
        <label className={buttonClass({ variant: "secondary" })} htmlFor={fileId}>
          Choose CSV file
        </label>
        <input id={fileId} type="file" accept=".csv,.txt,.tsv,text/csv,text/tab-separated-values,text/plain" className="sr-only" onChange={readFile} />
        {practice ? (
          <Button type="button" variant="secondary" onClick={() => setText(practice.text)}>
            Load the practice file
          </Button>
        ) : null}
      </div>
      <Field label="Or paste their CSV or Excel range">
        <TextArea value={text} rows={7} onValueChange={setText} placeholder="Reference, Label, Amount&#10;component.ausOtherIncome, Australian income, A$60,006,781" />
      </Field>
      {parsed ? (
        <>
          <div className="form-grid form-grid--3">
            <ColumnSelect label="Reference column" value={parsed.detected.reference} parsed={parsed} allowNone onChange={(referenceColumn) => reparse({ referenceColumn })} />
            <ColumnSelect label="Label column" value={parsed.detected.label} parsed={parsed} onChange={(labelColumn) => { if (labelColumn !== null) reparse({ labelColumn }); }} />
            <ColumnSelect label="Amount column" value={parsed.detected.amount} parsed={parsed} onChange={(amountColumn) => { if (amountColumn !== null) reparse({ amountColumn }); }} />
          </div>
          <p className="text-muted">
            Loaded {parsed.lines.length} line{parsed.lines.length === 1 ? "" : "s"}; skipped {parsed.skipped.length} heading or non-amount row{parsed.skipped.length === 1 ? "" : "s"}.
          </p>
          <TableScroll label="Parsed preview">
            <table className="dt dt--dense">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Label</th>
                  <th scope="col" className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {parsed.lines.slice(0, 10).map((line) => (
                  <tr key={`${line.index}-${line.reference ?? line.label}`}>
                    <td>{line.reference ?? "—"}</td>
                    <td>{line.label}</td>
                    <td className="num">{(line.amount / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      ) : null}
    </Panel>
  );
}

function RemapSelect({ source, value, onChange }: { source: CompareSource; value: string; onChange(value: string): void }) {
  const options = [{ value: "", label: "No manual mapping" }, ...source.lines.map((line) => ({ value: line.ref, label: `${line.ref} — ${line.label}` }))];
  return <Select aria-label="Manual remap" value={value} options={options} onValueChange={onChange} />;
}

export function CompareBody({ fund }: { fund: Fund }) {
  const data = useAppData();
  const ctx = useCtx();
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const workflow = useWorkflow(fund.id);
  const sources = useMemo(() => compareSources(data, fund.id, ctx), [data, fund.id, ctx]);
  const [sourceId, setSourceId] = useState("");
  const defaultSource = sources.find((s) => s.id === "distribution-components") ?? sources[0]!;
  const source = sources.find((s) => s.id === sourceId) ?? defaultSource;
  const [text, setText] = useState("");
  const [columns, setColumns] = useState<{ referenceColumn?: number | null; labelColumn?: number; amountColumn?: number }>({});
  const [toleranceText, setToleranceText] = useState("1.00");
  const [status, setStatus] = useState("all");
  const [showOnlyOurs, setShowOnlyOurs] = useState(false);
  const [remember, setRemember] = useState(true);
  const [remaps, setRemaps] = useState<Record<string, string>>({});

  useEffect(() => {
    setSourceId((current) => (sources.some((s) => s.id === current) ? current : sources.find((s) => s.id === "distribution-components")?.id ?? sources[0]?.id ?? ""));
  }, [sources]);

  useEffect(() => {
    if (!source) return;
    setToleranceText(((source.tolerance ?? 100) / 100).toFixed(2));
    setRemaps(loadMappings(fund, source));
  }, [fund, source]);

  const parsedState = useMemo((): { parsed: ParsedTheirFile | null; error: string } => {
    try {
      return { parsed: parseText(text, columns), error: "" };
    } catch (error) {
      return { parsed: null, error: error instanceof Error ? error.message : "Could not parse the file." };
    }
  }, [text, columns]);
  const parsed = parsedState.parsed;

  const tolerance = Math.round(Number(toleranceText.replace(/,/g, "")) * 100);
  const comparison = useMemo(() => {
    if (!source || !parsed || !Number.isSafeInteger(tolerance) || tolerance < 0) return null;
    return comparisonFor(fund, { ...source, tolerance }, parsed, remaps);
  }, [fund, source, parsed, tolerance, remaps]);

  if (!source) return <Panel title="Compare"><p>No comparable sources are available for this fund.</p></Panel>;

  const updateMap = (key: string, value: string): void => {
    const next = { ...remaps };
    if (value) next[key] = value;
    else delete next[key];
    setRemaps(next);
    if (remember) saveMappings(fund, source, next);
  };

  const raiseQuery = (): void => {
    if (!comparison || !workflow.can.query) return;
    const draft = queryDraft(fund, source, comparison);
    const result = dispatch({ type: "raise-query", fundId: fund.id, subject: draft.subject, message: draft.message });
    if (result.ok) announce(`Query raised for ${source.label}.`);
  };

  const rows = comparison?.rows.filter((row) => (status === "all" || row.status === status) && (showOnlyOurs || row.status !== "only-in-ours")) ?? [];

  return (
    <div className="workspace-stack">
      <Panel title="1. Choose our statement" bodyClassName="stack stack--tight">
        <Field label="Statement to compare">
          <Select value={source.id} options={sources.map((s) => ({ value: s.id, label: s.label }))} onValueChange={setSourceId} />
        </Field>
        <p className="text-muted">
          {source.description} {source.lines.length} line{source.lines.length === 1 ? "" : "s"}. Default tolerance {money(source.tolerance ?? 100, fund.currency, 2)}.
        </p>
        <div className="button-row">
          <DownloadButton label="Download our figures (CSV)" onDownload={() => downloadCsv(ourCsv(fund, source))} />
        </div>
      </Panel>

      <TheirInput
        text={text}
        setText={(value) => {
          setText(value);
          setColumns({});
        }}
        parsed={parsed}
        reparse={(next) => setColumns((current) => ({ ...current, ...next }))}
        practice={PRACTICE_FILES[fund.id]}
      />
      {parsedState.error ? <Banner tone="error">{parsedState.error}</Banner> : null}

      <Panel title="3. Compare" bodyClassName="stack">
        <div className="stack stack--tight">
          <div className="form-grid form-grid--3">
            <Field label={`Tolerance (${fund.currency})`}>
              <TextInput value={toleranceText} onValueChange={setToleranceText} inputMode="decimal" />
            </Field>
            <Field label="Status filter">
              <Select value={status} options={STATUS_OPTIONS} onValueChange={setStatus} />
            </Field>
            <label className="check-row">
              <input type="checkbox" checked={showOnlyOurs} onChange={(event) => setShowOnlyOurs(event.target.checked)} />
              Show only-in-ours lines
            </label>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Remember my mappings for this fund and statement
          </label>
          {comparison ? (
            <>
              <h3>{comparison.headline}</h3>
              <div className="button-row">
                <DownloadButton label="Download comparison (CSV)" onDownload={() => downloadCsv(comparison.csv)} />
                <Button type="button" variant="secondary" disabled={!workflow.can.query} onClick={raiseQuery}>
                  Raise a query with this comparison
                </Button>
                {workflow.can.query ? null : <span className="text-muted">You don't have permission to raise queries for this fund.</span>}
              </div>
            </>
          ) : (
            <p className="text-muted">Load their figures to compare against {source.label}.</p>
          )}
        </div>

        {comparison ? (
          <TableScroll label="Comparison results">
            <table className="dt dt--dense">
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Their label</th>
                  <th scope="col">Our label</th>
                  <th scope="col" className="num">Their amount</th>
                  <th scope="col" className="num">Our amount</th>
                  <th scope="col" className="num">Difference</th>
                  <th scope="col">Hint</th>
                  <th scope="col">Our basis note</th>
                  <th scope="col">Manual re-map</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = row.theirs ? lineKey(row.theirs) : "";
                  return (
                    <tr key={row.id}>
                      <td><Badge>{STATUS_LABEL[row.status]}</Badge></td>
                      <td>{row.theirs ? <><strong>{row.theirs.label}</strong><br /><span className="text-muted">{row.theirs.reference}</span></> : "—"}</td>
                      <td>{row.ours ? <><strong>{row.ours.label}</strong><br /><span className="text-muted">{row.ours.ref}</span></> : "—"}</td>
                      <td className="num">{row.theirs ? money(row.theirs.amount, fund.currency, 2) : "—"}</td>
                      <td className="num">{row.ours ? money(row.ours.amount, fund.currency, 2) : "—"}</td>
                      <td className="num">{row.difference === null ? "—" : money(row.difference, fund.currency, 2)}</td>
                      <td>{row.hint ? <Tag tone="warn">{row.hint}</Tag> : "—"}</td>
                      <td>{row.ours?.note ?? "—"}</td>
                      <td>{row.status === "only-in-theirs" && row.theirs ? <RemapSelect source={source} value={remaps[key] ?? ""} onChange={(value) => updateMap(key, value)} /> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        ) : null}
      </Panel>
    </div>
  );
}
