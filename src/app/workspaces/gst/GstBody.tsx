import { Fragment, useId, useMemo, useState, type ChangeEvent } from "react";
import { AU_GST_CODES } from "../../../engine/au/gstCodes.ts";
import { GST_CODES } from "../../../engine/gstCodes.ts";
import { ROLE_LABEL, can, lodgmentRole, userHasFund } from "../../../domain/permissions.ts";
import { dateLabel, money, parseMoneyInput, toISODate } from "../../../domain/format.ts";
import { defaultGstPeriod, gstCodeLabel, gstLedgerView, gstPeriods, gstReturnView, type GstEntry, type GstEntryDraft, type GstPeriod } from "../../../domain/gst/index.ts";
import type { Fund } from "../../../domain/types.ts";
import { useAppData, useCtx, useDispatch } from "../../state.tsx";
import { useRouteParam, useSetRouteParams } from "../../router.ts";
import { LODGMENT_GOVERNANCE } from "../investor-reporting/model.ts";
import { downloadCsv } from "../../exports/index.ts";
import { readImportFile } from "../../imports/index.ts";
import { Badge, Banner, Button, Dialog, EmptyState, Field, Kpi, KpiStrip, Panel, Select, TableScroll, TextArea, TextInput, buttonClass, useNotify } from "../../ui/index.ts";
import "./gst.css";

const EMPTY_ENTRY: Omit<GstEntryDraft, "fundId"> = { date: "", description: "", counterparty: "", code: "", net: 0, tax: 0, invoiceRef: "" };

function statusTone(status: GstPeriod["status"]): "good" | "warn" | "bad" {
  return status === "lodged" ? "good" : status === "overdue" ? "bad" : "warn";
}

function fmtReturnAmount(cents: number, fund: Fund): string {
  return fund.market === "AU" ? money(cents, fund.currency) : money(cents, fund.currency, 2);
}

function CodeName({ fund, code, date }: { fund: Fund; code: string; date?: string }) {
  return (
    <>
      {gstCodeLabel(fund.market, code, date)}
      <br />
      <span className="muted">{code}</span>
    </>
  );
}

function parseImport(text: string, fundId: string): { rows: GstEntryDraft[]; error: string | null } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: "Paste a CSV header and at least one row." };
  const header = lines[0]!.split(",").map((cell) => cell.trim().toLowerCase());
  const index = (name: string) => header.indexOf(name);
  const required = ["date", "description", "counterparty", "code", "net", "tax"];
  const missing = required.filter((name) => index(name) < 0);
  if (missing.length) return { rows: [], error: `Missing columns: ${missing.join(", ")}.` };
  const rows: GstEntryDraft[] = [];
  for (const [lineNo, line] of lines.slice(1).entries()) {
    const cells = line.split(",").map((cell) => cell.trim());
    const net = parseMoneyInput(cells[index("net")] ?? "");
    const tax = parseMoneyInput(cells[index("tax")] ?? "");
    if (net === null || tax === null) return { rows: [], error: `Line ${lineNo + 2}: net and tax must be amounts.` };
    rows.push({
      fundId,
      date: cells[index("date")] ?? "",
      description: cells[index("description")] ?? "",
      counterparty: cells[index("counterparty")] ?? "",
      code: cells[index("code")] ?? "",
      net,
      tax,
      invoiceRef: index("invoice") >= 0 ? cells[index("invoice")] : undefined,
    });
  }
  return { rows, error: null };
}

function saveText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function EntryDialog({ fund, entry, open, onClose }: { fund: Fund; entry: GstEntry | null; open: boolean; onClose(): void }) {
  const dispatch = useDispatch();
  const notify = useNotify();
  const [draft, setDraft] = useState<Omit<GstEntryDraft, "fundId">>(() => entry ?? { ...EMPTY_ENTRY, date: fund.periodStart, code: fund.market === "AU" ? "SALE_TAXABLE" : "SR" });
  const codes = fund.market === "AU" ? AU_GST_CODES.map((code) => ({ value: code.id, label: `${code.id} · ${code.label}` })) : GST_CODES.map((code) => ({ value: code.code, label: `${code.code} · ${code.description}` }));
  const set = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  const submit = () => {
    const next = { ...draft, fundId: fund.id };
    const result = entry ? dispatch({ type: "gst-update-entry", id: entry.id, changes: next }) : dispatch({ type: "gst-add-entry", entry: next });
    if (result.ok) {
      notify({ tone: "success", message: entry ? "GST entry updated." : "GST entry added." });
      onClose();
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={entry ? "Edit GST entry" : "Add GST entry"}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{entry ? "Save entry" : "Add entry"}</Button></>}
    >
      <div className="form-grid">
        <label>Date<TextInput type="date" value={draft.date} onValueChange={(date) => set({ date })} /></label>
        <label>Invoice reference<TextInput value={draft.invoiceRef ?? ""} onValueChange={(invoiceRef) => set({ invoiceRef })} /></label>
        <label>Description<TextInput value={draft.description} onValueChange={(description) => set({ description })} /></label>
        <label>Counterparty<TextInput value={draft.counterparty} onValueChange={(counterparty) => set({ counterparty })} /></label>
        <label>GST code<Select value={draft.code} options={codes} onValueChange={(code) => set({ code })} /></label>
        <label>Net amount<TextInput inputMode="decimal" value={String(draft.net / 100)} onValueChange={(text) => { const value = parseMoneyInput(text); if (value !== null) set({ net: value }); }} /></label>
        <label>GST amount<TextInput inputMode="decimal" value={String(draft.tax / 100)} onValueChange={(text) => { const value = parseMoneyInput(text); if (value !== null) set({ tax: value }); }} /></label>
      </div>
    </Dialog>
  );
}

function ImportDialog({ fund, lockedPeriods, open, onClose }: { fund: Fund; lockedPeriods: readonly string[]; open: boolean; onClose(): void }) {
  const [text, setText] = useState("date,invoice,description,counterparty,code,net,tax\n");
  const [fileMessage, setFileMessage] = useState("");
  const fileId = useId();
  const dispatch = useDispatch();
  const notify = useNotify();
  const plan = useMemo(() => parseImport(text, fund.id), [text, fund.id]);
  const onFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    readImportFile(file).then(
      (result) => {
        setText(result.text);
        setFileMessage(result.note ?? "");
      },
      (error) => setFileMessage(error instanceof Error ? error.message : "The file could not be read. Choose it again."),
    );
  };
  const run = () => {
    if (plan.error) return;
    const result = dispatch({ type: "gst-import-entries", fundId: fund.id, entries: plan.rows });
    if (result.ok) {
      notify({ tone: "success", message: `${plan.rows.length} GST entries imported.` });
      onClose();
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Import GST ledger" description="CSV or Excel columns: date, invoice, description, counterparty, code, net, tax." size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={Boolean(plan.error)} onClick={run}>Replace GST ledger</Button></>}>
      <div className="button-row">
        <label className={buttonClass({ variant: "secondary" })} htmlFor={fileId}>Choose CSV or Excel file</label>
        <input id={fileId} type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={onFile} />
      </div>
      {fileMessage ? <Banner tone={fileMessage.startsWith("Read ") ? "info" : "error"}>{fileMessage}</Banner> : null}
      <label>CSV text<TextArea rows={10} value={text} onValueChange={(value) => { setFileMessage(""); setText(value); }} /></label>
      {lockedPeriods.length ? <Banner tone="info">Locked periods are kept and cannot be imported into: {lockedPeriods.join(", ")}.</Banner> : null}
      {plan.error ? <Banner tone="error">{plan.error}</Banner> : <p>{plan.rows.length} rows ready to import. The import replaces entries only in open, unlodged periods; lodged periods are kept.</p>}
    </Dialog>
  );
}

export function GstBody({ fund }: { fund: Fund }) {
  const data = useAppData();
  const ctx = useCtx();
  const dispatch = useDispatch();
  const notify = useNotify();
  const routePeriod = useRouteParam("period");
  const setParams = useSetRouteParams();
  const periods = useMemo(() => gstPeriods(data, fund, ctx.now), [data, fund, ctx.now]);
  const selected = periods.find((period) => period.end === routePeriod) ?? defaultGstPeriod(data, fund, ctx.now);
  const lockedPeriods = useMemo(() => periods.filter((period) => period.status === "lodged").map((period) => period.label), [periods]);
  const view = useMemo(() => gstReturnView(data, fund.id, selected.end, ctx), [data, fund.id, selected.end, ctx]);
  const [filter, setFilter] = useState("");
  const [ledgerScope, setLedgerScope] = useState<"period" | "all">("period");
  const ledger = useMemo(() => gstLedgerView(data, fund.id, filter, ledgerScope === "period" ? selected : null), [data, fund.id, filter, ledgerScope, selected]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [entry, setEntry] = useState<GstEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GstEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [lodgedDate, setLodgedDate] = useState(toISODate(ctx.now));
  const [unlockReason, setUnlockReason] = useState("");
  const canEditRole = userHasFund(ctx.user, fund.id) && can(ctx.user, "edit", fund, fund.governance);
  const canEdit = canEditRole && selected.status !== "lodged";
  const canLodge = userHasFund(ctx.user, fund.id) && can(ctx.user, "lodge", fund, fund.governance);
  const canUnlock = userHasFund(ctx.user, fund.id) && can(ctx.user, "reopen", fund, fund.governance);
  const lockReason = selected.status === "lodged" ? "Lodged period — unlock to edit" : canEditRole ? "" : "View only for your role";
  const lockId = `gst-lock-${fund.id}-${selected.end}`;
  const deleteEntry = (row: GstEntry) => {
    const result = dispatch({ type: "gst-delete-entry", id: row.id });
    if (result.ok) {
      notify({ tone: "success", message: "GST entry deleted." });
      setDeleteTarget(null);
    }
  };
  const lodge = () => {
    const result = dispatch({ type: "gst-record-lodgment", fundId: fund.id, periodEnd: selected.end, reference, lodgedDate });
    if (result.ok) {
      notify({ tone: "success", message: `${selected.kind} lodgment recorded.` });
      setReference("");
    }
  };
  const unlock = () => {
    const result = dispatch({ type: "gst-unlock-period", fundId: fund.id, periodEnd: selected.end, reason: unlockReason });
    if (result.ok) {
      notify({ tone: "success", message: `${selected.kind} period unlocked.` });
      setUnlockReason("");
    }
  };

  return (
    <div className="stack">
      <Panel title="GST & BAS period" actions={<Select aria-label="GST period" value={selected.end} options={periods.map((p) => ({ value: p.end, label: `${p.label} · due ${dateLabel(p.dueDate)}` }))} onValueChange={(period) => setParams({ period })} />}>
        <KpiStrip label="GST summary">
          <Kpi label={view.netGst >= 0 ? "Net GST payable" : "Net GST refundable"} value={money(Math.abs(view.netGst), fund.currency, 2)} sub={selected.label} />
          <Kpi label="Due date" value={dateLabel(selected.dueDate)} sub={selected.dueBasis} tone={selected.status === "overdue" ? "bad" : selected.status === "lodged" ? "good" : "default"} />
          <Kpi label="Ledger lines" value={String(view.ledger.length)} sub={fund.market === "AU" ? "BAS worksheet" : "GST F5 worksheet"} />
        </KpiStrip>
        <p><Badge tone={statusTone(selected.status)}>{selected.status === "lodged" ? "Lodged" : selected.status === "overdue" ? "Overdue" : "Open"}</Badge> {lockReason ? <span className="muted">{lockReason}.</span> : null}</p>
      </Panel>

      <Panel title={fund.market === "AU" ? "BAS labels" : "GST F5 boxes"} actions={<><Button size="sm" onClick={() => downloadCsv(view.returnCsv)}>Download return CSV</Button>{fund.market === "AU" ? <Button size="sm" onClick={() => downloadCsv(view.worksheetCsv)}>Download BAS worksheet (CSV)</Button> : view.iaf ? <Button size="sm" onClick={() => saveText(view.iaf!.fileName, view.iaf!.text)}>Download IRAS Audit File (IAF)</Button> : null}</>}>
        {fund.market === "AU" ? <p className="muted">BAS label amounts are rounded down to whole dollars for the ATO form.</p> : null}
        <TableScroll label="GST return boxes">
          <table className="dt">
            <thead><tr><th scope="col">Box</th><th scope="col" className="num">Amount</th><th scope="col">Worksheet</th></tr></thead>
            <tbody>
              {view.boxes.map((box) => (
                <Fragment key={box.ref}>
                  <tr>
                    <th scope="row">{box.label}<br /><span className="muted">{box.ref}</span></th>
                    <td className="num">{fmtReturnAmount(box.amount, fund)}</td>
                    <td>
                      {box.worksheet.length ? (
                        <Button size="sm" variant="ghost" aria-expanded={Boolean(expanded[box.ref])} onClick={() => setExpanded((current) => ({ ...current, [box.ref]: !current[box.ref] }))}>
                          {expanded[box.ref] ? "Hide ledger lines" : `Show ${box.worksheet.length} ledger line${box.worksheet.length === 1 ? "" : "s"}`}
                        </Button>
                      ) : "No ledger lines for this box"}
                    </td>
                  </tr>
                  {expanded[box.ref] ? (
                    <tr key={`${box.ref}-lines`}>
                      <td colSpan={3}>
                        <TableScroll label={`${box.ref} worksheet lines`}>
                          <table className="dt">
                            <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Code</th><th scope="col" className="num">Net</th><th scope="col" className="num">GST</th></tr></thead>
                            <tbody>{box.worksheet.map((line) => (
                              <tr key={`${box.ref}-${line.id}-${line.code}`}>
                                <td>{dateLabel(line.date)}</td>
                                <td>{line.description}</td>
                                <td>{line.codeLabel}<br /><span className="muted">{line.code}</span></td>
                                <td className="num">{money(line.net, fund.currency, 2)}</td>
                                <td className="num">{money(line.tax, fund.currency, 2)}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </TableScroll>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      <Panel title="GST ledger" actions={<><Button size="sm" onClick={() => downloadCsv(view.ledgerCsv)}>Download ledger CSV</Button><Button size="sm" disabled={!canEdit} aria-describedby={!canEdit ? lockId : undefined} onClick={() => setImportOpen(true)}>Import CSV or Excel</Button><Button size="sm" variant="primary" disabled={!canEdit} aria-describedby={!canEdit ? lockId : undefined} onClick={() => setAddOpen(true)}>Add entry</Button></>}>
        <div className="gst-toolbar">
          <Select aria-label="Ledger period scope" value={ledgerScope} options={[{ value: "period", label: "Selected period" }, { value: "all", label: "All periods" }]} onValueChange={(scope) => setLedgerScope(scope === "all" ? "all" : "period")} />
          <TextInput className="gst-toolbar__filter" aria-label="Filter GST ledger" placeholder="Filter by code, label, text or invoice" value={filter} onValueChange={setFilter} />
        </div>
        {lockReason ? <Banner id={lockId} tone="info">{lockReason}.</Banner> : null}
        {ledger.rows.length === 0 ? <EmptyState title="No GST entries" icon="receipt">Add or import ledger entries for this fund.</EmptyState> : (
          <TableScroll label="GST ledger entries">
            <table className="dt">
              <thead><tr><th scope="col">Date</th><th scope="col">Invoice</th><th scope="col">Counterparty</th><th scope="col">Description</th><th scope="col">Code</th><th scope="col" className="num">Net</th><th scope="col" className="num">GST</th>{canEdit ? <th scope="col">Actions</th> : null}</tr></thead>
              <tbody>
                {ledger.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{dateLabel(row.date)}</td><td>{row.invoiceRef ?? "—"}</td><td>{row.counterparty}</td><td>{row.description}</td><td><CodeName fund={fund} code={row.code} date={row.date} /></td><td className="num">{money(row.net, fund.currency, 2)}</td><td className="num">{money(row.tax, fund.currency, 2)}</td>
                    {canEdit ? <td><Button size="sm" onClick={() => setEntry(row)}>Edit</Button> <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(row)}>Delete</Button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <Panel title="Checks">
        {view.checks.length === 0 ? <p>No GST exceptions for this period.</p> : view.checks.map((check) => <Banner key={check.id} tone={check.severity === "exception" ? "error" : "info"}><strong>{check.title}.</strong> {check.detail}</Banner>)}
        {view.iaf?.problems.length ? <Banner tone="info"><strong>IRAS Audit File.</strong> {view.iaf.problems.join(" ")}</Banner> : null}
      </Panel>

      <Panel title="Lodgment">
        {selected.filing ? (
          <div className="stack">
            <p><strong>{selected.kind} lodged.</strong> {selected.filing.reference} · {dateLabel(selected.filing.lodgedDate)} · {selected.filing.actor}</p>
            {canUnlock ? (
              <div className="gst-unlock">
                <Field label="Unlock reason"><TextInput value={unlockReason} onValueChange={setUnlockReason} /></Field>
                <div className="gst-lodge__action"><Button disabled={!unlockReason.trim()} onClick={unlock}>Unlock lodged period</Button></div>
              </div>
            ) : (
              <p className="muted">Only the Head of Tax can unlock a lodged period.</p>
            )}
          </div>
        ) : canLodge ? (
          <div className="gst-lodge">
            <Field label="Reference"><TextInput value={reference} onValueChange={setReference} /></Field>
            <Field label="Lodged date"><TextInput type="date" value={lodgedDate} onValueChange={setLodgedDate} /></Field>
            <div className="gst-lodge__action"><Button variant="primary" disabled={!reference.trim()} onClick={lodge}>Record lodgment</Button></div>
          </div>
        ) : (
          <p className="muted">{`Recorded by the ${ROLE_LABEL[lodgmentRole(fund.governance)].toLowerCase()} under this fund's governance (${LODGMENT_GOVERNANCE[fund.governance]}).`}</p>
        )}
      </Panel>

      <EntryDialog fund={fund} entry={entry} open={entry !== null} onClose={() => setEntry(null)} />
      <EntryDialog fund={fund} entry={null} open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportDialog fund={fund} lockedPeriods={lockedPeriods} open={importOpen} onClose={() => setImportOpen(false)} />
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete GST entry"
        role="alertdialog"
        footer={<><Button data-autofocus onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="danger" onClick={() => deleteTarget && deleteEntry(deleteTarget)}>Delete</Button></>}
      >
        <p>Delete {deleteTarget?.invoiceRef ?? deleteTarget?.description}? This removes the ledger line from the selected fund.</p>
      </Dialog>
    </div>
  );
}
