import { Fragment, useId, useMemo, useState } from "react";
import { assetRegisterView, ASSET_KIND_LABEL, type AssetRegisterRow, type FixedAssetDraft } from "../../../domain/assets/index.ts";
import type { Fund } from "../../../domain/types.ts";
import { dateLabel, money } from "../../../domain/format.ts";
import { DocView } from "../../doc/DocView.tsx";
import { downloadCsv, downloadPdf } from "../../exports/index.ts";
import { readImportFile } from "../../imports/index.ts";
import { useRouteParam, useSetRouteParams } from "../../router.ts";
import { useAppData, useCtx, useDispatch, useWorkflow } from "../../state.tsx";
import { Banner, Button, Dialog, DownloadButton, Field, Kpi, KpiStrip, MoneyInput, Panel, Select, TableScroll, Tabs, Tag, TextArea, TextInput } from "../../ui/index.ts";
import { csvTemplate, defaultAssetDraft, parseAssetCsv, registerStatus } from "./model.ts";

const TABS = [
  { id: "register", label: "Register" },
  { id: "schedule", label: "Schedule" },
  { id: "document", label: "PDF preview" },
] as const;

function assetTabFromParam(value: string): (typeof TABS)[number]["id"] {
  return TABS.some((tab) => tab.id === value) ? (value as (typeof TABS)[number]["id"]) : "register";
}

function propertyOptions(data: ReturnType<typeof useAppData>, fund: Fund) {
  return [{ value: "", label: "Fund level" }, ...data.properties.filter((p) => p.fundId === fund.id).map((p) => ({ value: p.id, label: p.name }))];
}

function displayBasis(row: AssetRegisterRow): string {
  if (row.kind === "AU_DIV40") return "ITAA 1997 s40-25";
  if (row.kind === "AU_DIV43") return "ITAA 1997 s43-10";
  if (row.kind === "AU_BORROWING") return "ITAA 1997 s25-25";
  if (row.kind === "SG_RR") return "Income Tax Act s14N";
  return row.basis.replace(/^Income Tax Act · /, "Income Tax Act ");
}

function currencyFor(row: AssetRegisterRow) {
  return row.kind === "SG_PLANT" || row.kind === "SG_RR" ? "SGD" : "AUD";
}

function parseCents(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

function DraftForm({ fund, value, onChange }: { fund: Fund; value: FixedAssetDraft; onChange(next: FixedAssetDraft): void }) {
  const data = useAppData();
  const props = propertyOptions(data, fund);
  const set = (patch: Partial<FixedAssetDraft>) => onChange({ ...value, ...patch } as FixedAssetDraft);
  return (
    <div className="form-grid">
      <Field label="Kind">
        <Select
          value={value.kind}
          onValueChange={(kind) => {
            if (kind === value.kind) return;
            onChange(kind === "AU_DIV43"
              ? { kind: "AU_DIV43", propertyId: value.propertyId, description: value.description, cost: value.cost, startDate: value.startDate, buildingType: "COMMERCIAL", constructionStartDate: value.startDate, constructionCompleteDate: value.startDate, firstIncomeUseDate: value.startDate, constructionExpenditure: value.cost }
              : kind === "AU_DIV40"
                ? { kind: "AU_DIV40", propertyId: value.propertyId, description: value.description, cost: value.cost, startDate: value.startDate, assetClassId: "OTHER_PLANT", method: "PRIME_COST", effectiveLifeYears: 10 }
                : kind === "SG_RR"
                  ? { kind: "SG_RR", propertyId: value.propertyId, description: "New renovation and refurbishment claim", cost: value.cost, startDate: value.startDate, claimMode: "THREE_YEAR" }
                : { kind: "SG_PLANT", propertyId: value.propertyId, description: value.description, cost: value.cost, startDate: value.startDate, assetClassId: "P_AND_M_GENERAL", regime: "S19A_3Y" });
          }}
          options={fund.market === "AU" ? [{ value: "AU_DIV40", label: "Division 40 plant" }, { value: "AU_DIV43", label: "Division 43 capital works" }] : [{ value: "SG_PLANT", label: "Singapore plant and machinery" }, { value: "SG_RR", label: "s14N renovation & refurbishment" }]}
        />
      </Field>
      <Field label="Property">
        <Select value={value.propertyId ?? ""} onValueChange={(propertyId) => set({ propertyId: propertyId || null })} options={props} />
      </Field>
      <Field label="Description">
        <TextInput value={value.description} onValueChange={(description) => set({ description })} />
      </Field>
      <Field label={value.kind === "AU_DIV43" ? "Construction expenditure" : "Cost"}>
        <MoneyInput value={value.kind === "AU_DIV43" ? value.constructionExpenditure : value.cost} currency={fund.currency} onCommit={(cost) => {
          const amount = cost ?? 0;
          set(value.kind === "AU_DIV43" ? { cost: amount, constructionExpenditure: amount } : { cost: amount });
        }} min={0} />
      </Field>
      <Field label="Start date">
        <TextInput type="date" value={value.startDate} onValueChange={(startDate) => set({ startDate })} />
      </Field>
      {value.kind === "AU_DIV40" ? (
        <>
          <Field label="Asset class">
            <Select value={value.assetClassId} onValueChange={(assetClassId) => set({ assetClassId })} options={[{ value: "HVAC_PACKAGED_UNIT", label: "HVAC packaged unit" }, { value: "LIFTS_ELECTRIC", label: "Electric lift" }, { value: "CARPET", label: "Carpet" }, { value: "OTHER_PLANT", label: "Other plant" }]} />
          </Field>
          <Field label="Method">
            <Select value={value.method} onValueChange={(method) => set({ method: method === "DIMINISHING_VALUE" ? "DIMINISHING_VALUE" : "PRIME_COST" })} options={[{ value: "PRIME_COST", label: "Prime cost" }, { value: "DIMINISHING_VALUE", label: "Diminishing value" }]} />
          </Field>
          <Field label="Effective life (years)">
            <TextInput value={String(value.effectiveLifeYears ?? "")} onValueChange={(v) => set({ effectiveLifeYears: Number(v) || undefined })} />
          </Field>
          <Field label="Low-value pool">
            <Select value={value.poolMethod ?? ""} onValueChange={(poolMethod) => set({ poolMethod: poolMethod === "LOW_VALUE_POOL" ? "LOW_VALUE_POOL" : undefined })} options={[{ value: "", label: "No — calculate this asset separately" }, { value: "LOW_VALUE_POOL", label: "Yes — allocate to low-value pool" }]} />
            <p className="field__hint">Only low-cost assets under A$1,000, or low-value assets with opening adjustable value under A$1,000, can be pooled.</p>
          </Field>
        </>
      ) : value.kind === "AU_DIV43" ? (
        <>
          <Field label="Building type">
            <Select value={value.buildingType} onValueChange={(buildingType) => set({ buildingType: buildingType as FixedAssetDraft extends infer T ? T extends { kind: "AU_DIV43"; buildingType: infer B } ? B : never : never })} options={[{ value: "COMMERCIAL", label: "Commercial / non-residential" }, { value: "INDUSTRIAL", label: "Industrial" }, { value: "STRUCTURAL_IMPROVEMENT", label: "Structural improvement" }]} />
          </Field>
          <Field label="Construction start">
            <TextInput type="date" value={value.constructionStartDate} onValueChange={(constructionStartDate) => set({ constructionStartDate })} />
          </Field>
          <Field label="First income use">
            <TextInput type="date" value={value.firstIncomeUseDate} onValueChange={(firstIncomeUseDate) => set({ firstIncomeUseDate })} />
          </Field>
        </>
      ) : value.kind === "SG_PLANT" ? (
        <>
          <Field label="Asset class">
            <Select value={value.assetClassId} onValueChange={(assetClassId) => set({ assetClassId })} options={[{ value: "P_AND_M_GENERAL", label: "Plant & machinery" }, { value: "LIFTS_ESCALATORS_HVAC", label: "Lifts, escalators and HVAC" }, { value: "IT_EQUIPMENT", label: "IT equipment" }]} />
          </Field>
          <Field label="Regime">
            <Select value={value.regime} onValueChange={(regime) => set({ regime: regime === "S19A_1Y_SPECIFIC" ? "S19A_1Y_SPECIFIC" : "S19A_3Y" })} options={[{ value: "S19A_3Y", label: "s19A 3-year write-off" }, { value: "S19A_1Y_SPECIFIC", label: "s19A one-year write-off" }]} />
          </Field>
        </>
      ) : value.kind === "SG_RR" ? (
        <Field label="Claim option">
          <Select value={value.claimMode ?? "THREE_YEAR"} onValueChange={(claimMode) => set({ claimMode: claimMode === "ONE_YEAR" ? "ONE_YEAR" : "THREE_YEAR" })} options={[{ value: "THREE_YEAR", label: "Deduct over 3 YAs" }, { value: "ONE_YEAR", label: "Deduct in 1 YA" }]} />
          <p className="field__hint">The engine applies the S$300,000 cap for each relevant 3-year period.</p>
        </Field>
      ) : (
        <Field label="Loan end date">
          <TextInput type="date" value={value.loanEndDate} onValueChange={(loanEndDate) => set({ loanEndDate })} />
        </Field>
      )}
    </div>
  );
}

function RegisterTable({ rows, onEdit, onDispose, onDelete, readOnly }: { rows: readonly AssetRegisterRow[]; onEdit(row: AssetRegisterRow): void; onDispose(row: AssetRegisterRow): void; onDelete(row: AssetRegisterRow): void; readOnly: boolean }) {
  const grouped = rows.reduce<Array<{ propertyName: string; rows: AssetRegisterRow[]; subtotal: number }>>((acc, row) => {
    let group = acc.find((entry) => entry.propertyName === row.propertyName);
    if (!group) {
      group = { propertyName: row.propertyName, rows: [], subtotal: 0 };
      acc.push(group);
    }
    group.rows.push(row);
    group.subtotal += row.deduction;
    return acc;
  }, []);
  const columnCount = readOnly ? 10 : 11;
  return (
    <TableScroll label="Asset register">
      <table className="dt dt--dense dt--hover">
        <thead>
          <tr>
            <th scope="col">Kind</th>
            <th scope="col">Asset</th>
            <th scope="col" className="num">Cost</th>
            <th scope="col">Start</th>
            <th scope="col">Basis</th>
            <th scope="col" className="num">Opening WDV</th>
            <th scope="col" className="num">Base deduction</th>
            <th scope="col" className="num">Balancing adjustment</th>
            <th scope="col" className="num">Net deduction</th>
            <th scope="col" className="num">Closing WDV</th>
            {readOnly ? null : <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {grouped.map((group) => (
            <Fragment key={group.propertyName}>
              <tr key={`${group.propertyName}-group`} className="total">
                <th scope="row" colSpan={5}>
                  {group.propertyName}
                </th>
                <td colSpan={4}></td>
                <td className="num">{money(group.subtotal, currencyFor(group.rows[0]!), 0)}</td>
                {readOnly ? null : <td></td>}
              </tr>
              {group.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.kindLabel}</td>
                  <th scope="row">
                    <span className="dt__title">{row.description}</span>
                    {row.note ? <span className="dt__sub">{row.note}</span> : null}
                  </th>
                  <td className="num">{money(row.cost, currencyFor(row), 0)}</td>
                  <td>{dateLabel(row.startDate)}</td>
                  <td><span className="dt__sub">{displayBasis(row)}</span></td>
                  <td className="num">{money(row.openingWrittenDownValue, currencyFor(row), 0)}</td>
                  <td className="num">{money(row.baseDeduction, currencyFor(row), 0)}</td>
                  <td className="num">{money(row.balancingAdjustmentDeduction - row.balancingAdjustmentIncome, currencyFor(row), 0)}</td>
                  <td className="num">{money(row.deduction, currencyFor(row), 0)}</td>
                  <td className="num">{money(row.closingWrittenDownValue, currencyFor(row), 0)}</td>
                  {readOnly ? null : (
                    <td>
                      {row.source === "asset" ? (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => onEdit(row)}>Edit</Button>{" "}
                          <Button size="sm" variant="secondary" onClick={() => onDispose(row)}>Dispose</Button>{" "}
                          <Button size="sm" variant="ghost" onClick={() => onDelete(row)}>Delete</Button>
                        </>
                      ) : (
                        <span className="dt__sub">Calculated line</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </Fragment>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount}>No assets are recorded for this fund.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </TableScroll>
  );
}

export function AssetsBody({ fund }: { fund: Fund }) {
  const data = useAppData();
  const ctx = useCtx();
  const dispatch = useDispatch();
  const workflow = useWorkflow(fund.id);
  const routeTab = assetTabFromParam(useRouteParam("tab"));
  const setRouteParams = useSetRouteParams();
  const view = useMemo(() => assetRegisterView(data, fund.id, ctx), [data, fund.id, ctx]);
  const status = registerStatus(view.comparisons, fund.currency);
  const [draft, setDraft] = useState<FixedAssetDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importFileNote, setImportFileNote] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssetRegisterRow | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<AssetRegisterRow | null>(null);
  // The Australian register follows the engine's 30 June income years, so a disposal defaults to the end of the year it shows.
  const registerYearEnd = fund.market === "AU" ? `${fund.periodEnd.slice(0, 4)}-06-30` : fund.periodEnd;
  const [disposeDate, setDisposeDate] = useState(registerYearEnd);
  const [disposeProceedsText, setDisposeProceedsText] = useState("0");
  const fileInputId = useId();
  const fileHintId = `${fileInputId}-hint`;
  const preview = useMemo(() => parseAssetCsv(importText, fund, data.properties), [importText, fund, data.properties]);
  const readOnly = !workflow.can.edit;
  const lock = workflow.lockedReason || "View only for your role";

  const openAdd = () => { setEditingId(null); setDraft(defaultAssetDraft(fund, data.properties)); };
  const openEdit = (row: AssetRegisterRow) => {
    const asset = data.assets.find((a) => a.id === row.id);
    if (asset) { setEditingId(asset.id); const { id, fundId, ...rest } = asset; void id; void fundId; setDraft(rest); }
  };
  const saveDraft = () => {
    if (!draft) return;
    dispatch(editingId ? { type: "asset-update", fundId: fund.id, assetId: editingId, asset: draft } : { type: "asset-add", fundId: fund.id, asset: draft });
    setDraft(null);
  };
  const openDispose = (row: AssetRegisterRow) => {
    setDisposeTarget(row);
    setDisposeDate(row.disposalDate ?? registerYearEnd);
    setDisposeProceedsText(String((row.disposalProceeds ?? 0) / 100));
  };
  const saveDispose = () => {
    const disposeProceeds = parseCents(disposeProceedsText);
    if (!disposeTarget || disposeProceeds === null) return;
    dispatch({ type: "asset-dispose", fundId: fund.id, assetId: disposeTarget.id, disposalDate: disposeDate, disposalProceeds: disposeProceeds });
    setDisposeTarget(null);
  };
  const disposeProceeds = parseCents(disposeProceedsText);

  return (
    <>
      <KpiStrip label="Asset register summary">
        {view.totals.map((total) => <Kpi key={total.kind} label={total.label} value={money(total.deduction, fund.currency)} sub={`${total.count} asset${total.count === 1 ? "" : "s"}`} />)}
        <Kpi label="Trial balance status" value={<Tag tone={status.tone}>{status.text}</Tag>} sub={view.comparisons.map((c) => c.label).join(" · ")} />
      </KpiStrip>

      {readOnly ? <Banner tone="warn" title={lock}>Asset edits and applying totals are disabled for this fund.</Banner> : null}
      {view.warnings.map((warning, i) => <Banner key={i} tone="error" title="Asset register input needs review">{warning}</Banner>)}

      <Tabs tabs={TABS} value={routeTab} onValueChange={(tab) => setRouteParams({ tab })} label="Asset register tabs">
        <Tabs.Panel id="register">
          <Panel title="Asset register" actions={<>
            {readOnly ? null : <Button onClick={openAdd}>Add asset</Button>}
            {readOnly ? null : <Button onClick={() => setImportOpen(true)}>Import CSV</Button>}
            <DownloadButton onDownload={() => downloadCsv(view.csv)}>Download register CSV</DownloadButton>
            {readOnly ? null : <Button variant="primary" disabled={view.comparisons.every((c) => c.agrees)} onClick={() => dispatch({ type: "asset-apply-to-trial-balance", fundId: fund.id })}>Use register totals in the trial balance</Button>}
          </>}>
            <p className="muted">Division 40 balancing adjustments are included in the year's Div 40 trial-balance line: decline in value plus balancing deductions, less balancing income. Singapore balancing charges are shown the same way in the capital-allowances line.</p>
            <RegisterTable rows={view.rows} readOnly={readOnly} onEdit={openEdit} onDispose={openDispose} onDelete={setDeleteTarget} />
          </Panel>
          <Panel title="Register vs trial balance">
            <TableScroll label="Register to trial balance comparison">
              <table className="dt dt--dense">
                <thead><tr><th scope="col">Adjustment</th><th scope="col" className="num">Register</th><th scope="col" className="num">Trial balance</th><th scope="col" className="num">Difference</th><th scope="col">Status</th></tr></thead>
                <tbody>{view.comparisons.map((c) => <tr key={c.key}><th scope="row">{c.label}</th><td className="num">{money(c.register, fund.currency)}</td><td className="num">{money(c.trialBalance, fund.currency)}</td><td className="num">{money(c.difference, fund.currency)}</td><td><Tag tone={c.agrees ? "good" : "warn"}>{c.agrees ? "Agrees" : "Differs"}</Tag></td></tr>)}</tbody>
              </table>
            </TableScroll>
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel id="schedule">
          <Panel title="Next 10 income years" actions={<DownloadButton onDownload={() => downloadPdf(view.scheduleDoc)}>Download PDF</DownloadButton>}>
            <TableScroll label="Asset allowance schedule">
              <table className="dt dt--dense"><thead><tr><th scope="col">Year</th><th scope="col">Kind</th><th scope="col" className="num">Base deduction</th><th scope="col" className="num">Balancing adjustment</th><th scope="col" className="num">Net deduction</th></tr></thead><tbody>{view.schedule.map((row) => <tr key={`${row.year}-${row.kind}`}><th scope="row">{row.year}</th><td>{row.label}</td><td className="num">{money(row.baseDeduction, fund.currency)}</td><td className="num">{money(row.balancingAdjustmentDeduction - row.balancingAdjustmentIncome, fund.currency)}</td><td className="num">{money(row.deduction, fund.currency)}</td></tr>)}</tbody></table>
            </TableScroll>
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel id="document">
          <Panel title="Allowance schedule document"><DocView doc={view.scheduleDoc} /></Panel>
        </Tabs.Panel>
      </Tabs>

      <Dialog open={draft !== null} onClose={() => setDraft(null)} title={editingId ? "Edit asset" : "Add asset"} footer={<><Button onClick={() => setDraft(null)}>Cancel</Button><Button variant="primary" onClick={saveDraft}>Save asset</Button></>}>
        {draft ? <DraftForm fund={fund} value={draft} onChange={setDraft} /> : null}
      </Dialog>

      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} role="alertdialog" title="Delete asset" description={deleteTarget ? `Delete ${deleteTarget.description} from the asset register?` : undefined} footer={<><Button data-autofocus onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (deleteTarget) dispatch({ type: "asset-delete", fundId: fund.id, assetId: deleteTarget.id }); setDeleteTarget(null); }}>Delete asset</Button></>}>
        <p>This removes the record from the register and recalculates the register totals. It does not change the trial balance until you apply register totals.</p>
      </Dialog>

      <Dialog open={disposeTarget !== null} onClose={() => setDisposeTarget(null)} title="Dispose asset" description={disposeTarget ? `Record the disposal date and termination value for ${disposeTarget.description}.` : undefined} footer={<><Button onClick={() => setDisposeTarget(null)}>Cancel</Button><Button variant="primary" disabled={disposeProceeds === null} onClick={saveDispose}>Record disposal</Button></>}>
        <div className="form-grid">
          <Field label="Disposal date" hint={fund.market === "AU" ? `This register shows the income year ending ${dateLabel(registerYearEnd)}; a later date falls in a later year.` : undefined}>
            <TextInput type="date" value={disposeDate} onValueChange={setDisposeDate} />
          </Field>
          <Field label="Termination value / proceeds">
            <TextInput inputMode="decimal" value={disposeProceedsText} onValueChange={setDisposeProceedsText} />
          </Field>
        </div>
        <p className="muted">The engine compares termination value with adjustable value for the year and shows assessable balancing income or a deductible balancing adjustment.</p>
      </Dialog>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Import assets" size="lg" footer={<><DownloadButton onDownload={() => downloadCsv(csvTemplate(fund))}>Template CSV</DownloadButton><Button onClick={() => setImportOpen(false)}>Cancel</Button><Button variant="primary" disabled={preview.assets.length === 0 || preview.errors.length > 0} onClick={() => { dispatch({ type: "asset-import", fundId: fund.id, assets: preview.assets }); setImportOpen(false); }}>Import {preview.assets.length || ""}</Button></>}>
        <div className="field">
          <label className="field__label" htmlFor={fileInputId}>CSV or Excel file</label>
          <input
            id={fileInputId}
            className="input"
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-describedby={fileHintId}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              setImportFileNote(null);
              if (!file) return;
              if (file.size > 1_000_000) {
                setImportFileNote("The file is larger than 1 MB.");
                return;
              }
              readImportFile(file).then(
                (read) => {
                  setImportText(read.text);
                  setImportFileNote(read.note ?? null);
                },
                (error: unknown) => setImportFileNote(error instanceof Error ? error.message : "The file could not be read."),
              );
            }}
          />
          <p id={fileHintId} className="field__hint">{importFileNote ?? "Choose a CSV or Excel file (the first sheet is read), or paste rows below. The file replaces the paste box."}</p>
        </div>
        <Field label="CSV rows" hint="Columns: kind, propertyId, description, cost, startDate, assetClassId, methodOrRegime, effectiveLifeYears. Import replaces this fund's asset register.">
          <TextArea rows={8} value={importText} onValueChange={setImportText} />
        </Field>
        {preview.errors.length ? <Banner tone="error" title="Import cannot run">{preview.errors.join(" ")}</Banner> : <p>{preview.assets.length} asset{preview.assets.length === 1 ? "" : "s"} ready to import.</p>}
      </Dialog>
    </>
  );
}
