import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { can, roleCan } from "../../domain/permissions.ts";
import type { EntityFundDraft } from "../../domain/entities/types.ts";
import type { AppData, AuHolderStatus, Fund, Holder, SgFundSection, SgHolderClass } from "../../domain/types.ts";
import { dateLabel, money } from "../../domain/format.ts";
import { buildHash, useRouteParam, useSetRouteParams } from "../router.ts";
import { PortfolioFrame } from "../shell/PortfolioFrame.tsx";
import { readImportFile } from "../imports/index.ts";
import { useAppData, useDispatch, useStore, useUi, useVisibleFunds } from "../state.tsx";
import { Banner, Button, Dialog, EmptyState, Field, Icon, MarketBadge, Panel, Select, StatusChip, TableScroll, Tabs, TextArea, TextInput, useFieldControl } from "../ui/index.ts";
import {
  DATA_STORAGE_NOTE,
  DELETE_ACCESS_NOTE,
  MAX_FUND_IMPORT_BYTES,
  USER_ACCESS_NOTE,
  backupFileName,
  backupText,
  backupFileProblem,
  downloadText,
  fundsTemplate,
  holderCount,
  holdersTemplate,
  parseFundsCsv,
  parseHoldersCsv,
  parseBackupText,
  parsePropertiesCsv,
  propertiesTemplate,
  propertyCount,
  restoreSummary,
} from "./data/model.ts";
import "./data/data.css";

const TABS = [
  { id: "funds", label: "Funds" },
  { id: "holders", label: "Holders" },
  { id: "properties", label: "Properties" },
  { id: "backup", label: "Backup & restore" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const clean = (value: string): string => value.replace(/\s+/g, " ").trim();
const asInt = (value: string): number => Number.parseInt(value.replace(/,/g, ""), 10);
const asCents = (value: string): number => Math.round(Number(value.replace(/[$,\s]/g, "")) * 100);

function fundOptions(funds: readonly Fund[]) {
  return funds.map((f) => ({ value: f.id, label: `${f.name} (${f.market})` }));
}

function currentFund(funds: readonly Fund[], fundId: string): Fund | null {
  return funds.find((f) => f.id === fundId) ?? funds[0] ?? null;
}

const AU_HOLDER_LABEL: Record<string, string> = { resident: "Australian resident", "foreign-eoi": "Foreign resident — EOI", "foreign-non-eoi": "Foreign resident — non-EOI" };
const SG_HOLDER_LABEL: Record<string, string> = { individual: "Individual", qualifying: "Qualifying unitholder", nrni: "Non-resident non-individual", "nr-fund": "Non-resident fund", other: "Other / undeclared" };
const SG_FUND_SECTIONS: readonly SgFundSection[] = ["13D", "13U", "13V", "13OA"];
const sgHolderLabel = (h: Holder): string => ("sgClass" in h ? `${SG_HOLDER_LABEL[h.sgClass]}${h.sgClass === "nr-fund" ? ` · section ${h.sgFundSection ?? "13D/13U/13V"}` : ""}` : "");
const CSV_TYPE = "text/csv;charset=utf-8";
const PROPERTY_FIELDS = [
  ["name", "Name"],
  ["location", "Location"],
  ["acquired", "Acquired"],
  ["cost", "Cost"],
  ["improvements", "Improvements"],
  ["capitalWorksClaimed", "Capital works claimed"],
  ["valuation", "Valuation"],
] as const;

export default function Data() {
  const tabParam = useRouteParam("tab");
  const setRoute = useSetRouteParams();
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "funds";
  return (
    <PortfolioFrame workspace="Data" title="Data">
      <Banner tone="info" title="Browser-only data">
        {DATA_STORAGE_NOTE}
      </Banner>
      <Tabs tabs={TABS} value={tab} label="Data sections" onValueChange={(id) => setRoute({ tab: id })}>
        <Tabs.Panel id="funds"><FundsTab /></Tabs.Panel>
        <Tabs.Panel id="holders"><HoldersTab /></Tabs.Panel>
        <Tabs.Panel id="properties"><PropertiesTab /></Tabs.Panel>
        <Tabs.Panel id="backup"><BackupTab /></Tabs.Panel>
      </Tabs>
    </PortfolioFrame>
  );
}

function FundsTab() {
  const data = useAppData();
  const funds = useVisibleFunds();
  const dispatch = useDispatch();
  const { user } = useUi();
  const [newOpen, setNewOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importCsv, setImportCsv] = useState("");
  const [importProblem, setImportProblem] = useState<string | null>(null);
  const canManage = roleCan(user.role, "manage-access");
  const mayEdit = (fund: Fund): boolean => can(user, "edit", fund, fund.governance);
  const showActions = canManage || funds.some(mayEdit);
  const editFund = funds.find((f) => f.id === editId && mayEdit(f)) ?? null;
  const deleteFund = funds.find((f) => f.id === deleteId) ?? null;
  const preview = useMemo(() => parseFundsCsv(importCsv), [importCsv]);
  return (
    <>
      <Panel title="Funds" actions={<Button variant="primary" icon={<Icon name="plus" />} disabled={!canManage} onClick={() => setNewOpen(true)}>New fund</Button>}>
        <p className="data-note">{USER_ACCESS_NOTE} {DELETE_ACCESS_NOTE}</p>
        <TableScroll label="Funds">
          <table className="dt dt--hover">
            <thead><tr><th scope="col">Fund</th><th scope="col">Market</th><th scope="col">Period</th><th scope="col">Status</th><th scope="col" className="num">Holders</th><th scope="col" className="num">Properties</th>{showActions ? <th scope="col">Actions</th> : null}</tr></thead>
            <tbody>
              {funds.map((fund) => (
                <tr key={fund.id}>
                  <th scope="row"><a className="dt__title" href={buildHash({ path: "/", params: { fund: fund.id } })}>{fund.name}</a><span className="dt__sub">{fund.sector} · {fund.listed ? "Listed" : "Unlisted"}</span></th>
                  <td><MarketBadge market={fund.market} /></td>
                  <td>{fund.periodLabel}</td>
                  <td><StatusChip status={fund.status} labelled /></td>
                  <td className="num">{holderCount(data.holders, fund.id)}</td>
                  <td className="num">{propertyCount(data.properties, fund.id)}</td>
                  {showActions ? <td className="data-actions">{mayEdit(fund) ? <Button size="sm" onClick={() => setEditId(fund.id)}>Edit</Button> : null}{canManage && fund.status !== "Signed off" ? <Button size="sm" variant="secondary" onClick={() => setDeleteId(fund.id)}>Delete</Button> : null}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>
      {canManage ? (
        <Panel title="Import funds" actions={<Button onClick={() => downloadText(fundsTemplate(), "funds-template.csv", CSV_TYPE)}>Download template</Button>}>
          <p className="data-note">Paste or choose a CSV with market, name, sector, listed, periodStart, periodEnd, unitsOnIssue, governance and assessmentYear. The import creates every valid row, or none if any row has an error.</p>
          <div className="data-split">
            <div>
              <SpreadsheetFileField label="CSV or Excel file" hint="Up to 1 MB and 200 funds; for an Excel workbook the first sheet is read." onText={(text) => { setImportProblem(null); setImportCsv(text); }} />
              <Field label="CSV"><TextArea rows={8} value={importCsv} onValueChange={(value) => { setImportProblem(null); setImportCsv(value); }} /></Field>
              {importProblem ? <p className="field__error" role="alert">{importProblem}</p> : null}
              <p className={preview.errors.length > 0 ? "field__error" : "data-note"}>{importCsv.trim() === "" ? "Paste CSV to preview." : preview.errors.length > 0 ? `${preview.errors.length} row issue${preview.errors.length === 1 ? "" : "s"} to fix.` : `${preview.validRows.length} ${preview.validRows.length === 1 ? "fund" : "funds"} ready.`}</p>
              <Button variant="primary" disabled={importCsv.trim() === "" || preview.errors.length > 0 || preview.validRows.length === 0} onClick={() => { const r = dispatch({ type: "entity-import-funds", rows: preview.validRows }); if (r.ok) setImportCsv(""); }}>Import funds</Button>
            </div>
            <div>
              <TableScroll label="Fund import preview">
                <table className="dt">
                  <thead><tr><th scope="col">Line</th><th scope="col">Fund</th><th scope="col">Market</th><th scope="col">Status</th></tr></thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.line}>
                        <td>{row.line}</td>
                        <th scope="row">{row.draft?.name ?? "Not ready"}</th>
                        <td>{row.draft?.market ?? "—"}</td>
                        <td>{row.errors.length === 0 ? "Ready" : row.errors.join(" ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          </div>
        </Panel>
      ) : null}
      <FundDialog open={newOpen} onClose={() => setNewOpen(false)} onSave={(draft) => { const r = dispatch({ type: "entity-create-fund", fund: draft }); if (r.ok) setNewOpen(false); }} />
      {editFund ? <FundDialog fund={editFund} open={true} onClose={() => setEditId(null)} onSave={(draft) => { const { name, sector, listed, periodStart, periodEnd, unitsOnIssue, assessmentYear } = draft; const r = dispatch({ type: "entity-update-fund", fundId: editFund.id, patch: { name, sector, listed, periodStart, periodEnd, unitsOnIssue, assessmentYear } }); if (r.ok) setEditId(null); }} /> : null}
      {deleteFund ? <DeleteFundDialog fund={deleteFund} open={true} onClose={() => setDeleteId(null)} onDelete={(confirmName) => { const r = dispatch({ type: "entity-delete-fund", fundId: deleteFund.id, confirmName }); if (r.ok) setDeleteId(null); }} /> : null}
    </>
  );
}

function defaultDraft(fund?: Fund): EntityFundDraft {
  return fund
    ? { market: fund.market, name: fund.name, sector: fund.sector, listed: fund.listed, periodStart: fund.periodStart, periodEnd: fund.periodEnd, unitsOnIssue: fund.unitsOnIssue, governance: fund.governance, assessmentYear: fund.market === "SG" ? fund.assessmentYear : 2027 }
    : { market: "AU", name: "", sector: "", listed: false, periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 1, governance: "no-agent", assessmentYear: 2027 };
}

function FundDialog({ fund, open, onClose, onSave }: { fund?: Fund; open: boolean; onClose(): void; onSave(draft: EntityFundDraft): void }) {
  const [draft, setDraft] = useState(defaultDraft(fund));
  const preparing = !fund || fund.status === "Preparing";
  const set = <K extends keyof EntityFundDraft>(key: K, value: EntityFundDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Dialog open={open} onClose={onClose} title={fund ? "Edit fund" : "New fund"} description={fund ? "Name and sector can be changed in any status. Period and units are locked outside Preparing." : "Create an empty fund with zero tax inputs."} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave({ ...draft, name: clean(draft.name), sector: clean(draft.sector), unitsOnIssue: draft.unitsOnIssue })}>Save fund</Button></>}>
      <div className="data-form-grid">
        <Field label="Market"><Select disabled={Boolean(fund)} value={draft.market} onValueChange={(v) => set("market", v as Fund["market"])} options={[{ value: "AU", label: "Australia AMIT" }, { value: "SG", label: "Singapore S-REIT" }]} /></Field>
        <Field label="Fund name" required><TextInput value={draft.name} onValueChange={(v) => set("name", v)} /></Field>
        <Field label="Sector" required><TextInput value={draft.sector} onValueChange={(v) => set("sector", v)} /></Field>
        <Field label="Listed"><Select value={draft.listed ? "yes" : "no"} onValueChange={(v) => set("listed", v === "yes")} options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} /></Field>
        <Field label="Period start"><TextInput type="date" disabled={!preparing} value={draft.periodStart} onValueChange={(v) => set("periodStart", v)} /></Field>
        <Field label="Period end"><TextInput type="date" disabled={!preparing} value={draft.periodEnd} onValueChange={(v) => set("periodEnd", v)} /></Field>
        <Field label="Units on issue"><TextInput inputMode="numeric" disabled={!preparing} value={String(draft.unitsOnIssue)} onValueChange={(v) => set("unitsOnIssue", asInt(v) || 0)} /></Field>
        {!fund ? <Field label="Governance"><Select value={draft.governance} onValueChange={(v) => set("governance", v as EntityFundDraft["governance"])} options={[{ value: "no-agent", label: "No tax agent" }, { value: "agent-signs-off", label: "Tax agent signs off; you lodge" }, { value: "agent-lodges", label: "Tax agent reviews and lodges" }]} /></Field> : null}
        {draft.market === "SG" ? <Field label="Assessment year"><TextInput inputMode="numeric" disabled={!preparing} value={String(draft.assessmentYear ?? 2027)} onValueChange={(v) => set("assessmentYear", asInt(v) || 0)} /></Field> : null}
      </div>
    </Dialog>
  );
}

function DeleteFundDialog({ fund, open, onClose, onDelete }: { fund: Fund; open: boolean; onClose(): void; onDelete(confirmName: string): void }) {
  const [text, setText] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      role="alertdialog"
      title="Delete fund?"
      description={`This permanently removes ${fund.name} and everything recorded for it: holders, properties, trial balance, GST, property taxes, assets, versions and its own audit trail. A "Fund deleted" note is added to the audit trail of the first remaining fund. Type the fund name to confirm.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" disabled={text !== fund.name} onClick={() => onDelete(text)}>Delete fund</Button></>}
    >
      <Field label="Fund name"><TextInput value={text} onValueChange={setText} /></Field>
    </Dialog>
  );
}

function HoldersTab() {
  const data = useAppData();
  const funds = useVisibleFunds();
  const dispatch = useDispatch();
  const { user } = useUi();
  const routeFund = useRouteParam("fund");
  const setRoute = useSetRouteParams();
  const [fundId, setFundId] = useState(routeFund || funds[0]?.id || "");
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [editId, setEditId] = useState<string | null>(null);
  const fund = currentFund(funds, fundId);
  useEffect(() => {
    const fallback = currentFund(funds, routeFund || fundId);
    const next = fallback?.id ?? "";
    if (next !== fundId) setFundId(next);
    if (routeFund && routeFund !== next) setRoute({ fund: next || null });
  }, [funds, routeFund, fundId, setRoute]);
  const canEdit = Boolean(fund && fund.status === "Preparing" && roleCan(user.role, "edit"));
  const readOnly = fund ? (canEdit ? "" : fund.status === "Preparing" ? "View only for your role." : `${fund.status} — return to Preparing before editing holders.`) : "";
  const rows = fund ? data.holders.filter((h) => h.fundId === fund.id) : [];
  const [draft, setDraft] = useState({ holder: "", country: "", units: "0", auStatus: "resident", sgClass: "qualifying", sgFundSection: "" });
  if (!fund) return <Panel title="Holders"><p>No funds are available.</p></Panel>;
  const imported = parseHoldersCsv(csv, fund.market);
  const editHolder = editId ? rows.find((h) => h.id === editId) ?? null : null;
  const sgSectionOptions = [{ value: "", label: "Default (13D/13U/13V)" }, ...SG_FUND_SECTIONS.map((s) => ({ value: s, label: `Section ${s}` }))];
  const sgClassOptions = [{ value: "individual", label: "Individual" }, { value: "qualifying", label: "Qualifying" }, { value: "nrni", label: "NRNI" }, { value: "nr-fund", label: "NR fund" }, { value: "other", label: "Other" }];
  const addDraft = () => ({
    holder: draft.holder,
    country: draft.country,
    units: asInt(draft.units) || 0,
    auStatus: draft.auStatus as never,
    sgClass: draft.sgClass as never,
    sgFundSection: draft.sgClass === "nr-fund" && draft.sgFundSection ? (draft.sgFundSection as SgFundSection) : undefined,
  });
  return (
    <Panel title="Holders" actions={<Field label="Fund" labelHidden><Select value={fund.id} onValueChange={(id) => { setFundId(id); setRoute({ fund: id }); }} options={fundOptions(funds)} /></Field>}>
      {readOnly ? <p className="data-note">{readOnly}</p> : null}
      <TableScroll label="Holders">
        <table className="dt dt--hover"><thead><tr><th scope="col">Holder</th><th scope="col">Country</th><th scope="col">Status/class</th><th scope="col" className="num">Units</th>{canEdit ? <th scope="col">Actions</th> : null}</tr></thead><tbody>
          {rows.map((h) => <tr key={h.id}><th scope="row"><span className="dt__title">{h.holder}</span></th><td>{h.country}</td><td>{"auStatus" in h ? AU_HOLDER_LABEL[h.auStatus] : sgHolderLabel(h)}</td><td className="num">{h.units.toLocaleString("en-AU")}</td>{canEdit ? <td className="data-actions"><Button size="sm" onClick={() => setEditId(h.id)}>Edit</Button><Button size="sm" variant="secondary" onClick={() => dispatch({ type: "entity-remove-holder", fundId: fund.id, holderId: h.id })}>Remove</Button></td> : null}</tr>)}
        </tbody></table>
      </TableScroll>
      {rows.length === 0 ? <EmptyState title="No holders yet">{canEdit ? "Add a holder or import a CSV register." : "This fund has no holders in the current browser data."}</EmptyState> : null}
      {canEdit ? (
      <div className="data-split">
        <Panel title="Add holder">
          <div className="data-form-grid">
            <Field label="Holder"><TextInput value={draft.holder} onValueChange={(v) => setDraft({ ...draft, holder: v })} /></Field>
            <Field label="Country"><TextInput value={draft.country} onValueChange={(v) => setDraft({ ...draft, country: v })} /></Field>
            <Field label="Units"><TextInput inputMode="numeric" value={draft.units} onValueChange={(v) => setDraft({ ...draft, units: v })} /></Field>
            {fund.market === "AU" ? <Field label="AU status"><Select value={draft.auStatus} onValueChange={(v) => setDraft({ ...draft, auStatus: v })} options={[{ value: "resident", label: "Resident" }, { value: "foreign-eoi", label: "Foreign EOI" }, { value: "foreign-non-eoi", label: "Foreign non-EOI" }]} /></Field> : <Field label="SG class"><Select value={draft.sgClass} onValueChange={(v) => setDraft({ ...draft, sgClass: v, sgFundSection: v === "nr-fund" ? draft.sgFundSection : "" })} options={sgClassOptions} /></Field>}
            {fund.market === "SG" && draft.sgClass === "nr-fund" ? <Field label="Fund exemption section"><Select value={draft.sgFundSection} onValueChange={(v) => setDraft({ ...draft, sgFundSection: v })} options={sgSectionOptions} /></Field> : null}
          </div>
          <Button variant="primary" onClick={() => dispatch({ type: "entity-add-holder", fundId: fund.id, holder: addDraft() })}>Add holder</Button>
        </Panel>
        <Panel title="Import holders" actions={<Button onClick={() => downloadText(holdersTemplate(fund.market), "holders-template.csv", CSV_TYPE)}>Download template</Button>}>
          <Field label="Mode"><Select value={mode} onValueChange={(v) => setMode(v as "append" | "replace")} options={[{ value: "append", label: "Append" }, { value: "replace", label: "Replace register" }]} /></Field>
          <SpreadsheetFileField label="CSV or Excel file" hint="Up to 1 MB; for an Excel workbook the first sheet is read." onText={setCsv} />
          <Field label="CSV"><TextArea rows={6} value={csv} onValueChange={setCsv} /></Field>
          <p className={typeof imported === "string" ? "field__error" : "data-note"}>{csv.trim() === "" ? "Paste CSV to preview." : typeof imported === "string" ? imported : `${imported.length} ${imported.length === 1 ? "holder" : "holders"} ready.`}</p>
          <Button disabled={typeof imported === "string"} onClick={() => typeof imported !== "string" && dispatch({ type: "entity-import-holders", fundId: fund.id, rows: imported, mode })}>Import holders</Button>
        </Panel>
      </div>
      ) : null}
      {editHolder ? <HolderDialog fund={fund} holder={editHolder} sgClassOptions={sgClassOptions} sgSectionOptions={sgSectionOptions} onClose={() => setEditId(null)} onSave={(patch) => { const r = dispatch({ type: "entity-update-holder", fundId: fund.id, holderId: editHolder.id, patch }); if (r.ok) setEditId(null); }} /> : null}
    </Panel>
  );
}

function HolderDialog({ fund, holder, sgClassOptions, sgSectionOptions, onClose, onSave }: { fund: Fund; holder: Holder; sgClassOptions: Array<{ value: string; label: string }>; sgSectionOptions: Array<{ value: string; label: string }>; onClose(): void; onSave(patch: { holder: string; country: string; units: number; auStatus?: never; sgClass?: never; sgFundSection?: SgFundSection | undefined }): void }) {
  const [draft, setDraft] = useState({
    holder: holder.holder,
    country: holder.country,
    units: String(holder.units),
    auStatus: "auStatus" in holder ? holder.auStatus : "resident",
    sgClass: "sgClass" in holder ? holder.sgClass : "qualifying",
    sgFundSection: "sgFundSection" in holder ? holder.sgFundSection ?? "" : "",
  });
  const patch = {
    holder: draft.holder,
    country: draft.country,
    units: asInt(draft.units) || 0,
    auStatus: fund.market === "AU" ? (draft.auStatus as never) : undefined,
    sgClass: fund.market === "SG" ? (draft.sgClass as never) : undefined,
    sgFundSection: fund.market === "SG" && draft.sgClass === "nr-fund" && draft.sgFundSection ? (draft.sgFundSection as SgFundSection) : undefined,
  };
  return (
    <Dialog open={true} onClose={onClose} title="Edit holder" description="Update the holder details used across withholding, investor reporting and cost base." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave(patch)}>Save holder</Button></>}>
      <div className="data-form-grid">
        <Field label="Holder"><TextInput value={draft.holder} onValueChange={(v) => setDraft({ ...draft, holder: v })} /></Field>
        <Field label="Country"><TextInput value={draft.country} onValueChange={(v) => setDraft({ ...draft, country: v })} /></Field>
        <Field label="Units"><TextInput inputMode="numeric" value={draft.units} onValueChange={(v) => setDraft({ ...draft, units: v })} /></Field>
        {fund.market === "AU" ? (
          <Field label="AU status"><Select value={draft.auStatus} onValueChange={(v) => setDraft({ ...draft, auStatus: v as AuHolderStatus })} options={[{ value: "resident", label: "Resident" }, { value: "foreign-eoi", label: "Foreign EOI" }, { value: "foreign-non-eoi", label: "Foreign non-EOI" }]} /></Field>
        ) : (
          <>
            <Field label="SG class"><Select value={draft.sgClass} onValueChange={(v) => setDraft({ ...draft, sgClass: v as SgHolderClass, sgFundSection: v === "nr-fund" ? draft.sgFundSection : "" })} options={sgClassOptions} /></Field>
            {draft.sgClass === "nr-fund" ? <Field label="Fund exemption section"><Select value={draft.sgFundSection} onValueChange={(v) => setDraft({ ...draft, sgFundSection: v })} options={sgSectionOptions} /></Field> : null}
          </>
        )}
      </div>
    </Dialog>
  );
}

function PropertiesTab() {
  const data = useAppData();
  const funds = useVisibleFunds();
  const dispatch = useDispatch();
  const { user } = useUi();
  const routeFund = useRouteParam("fund");
  const setRoute = useSetRouteParams();
  const [fundId, setFundId] = useState(routeFund || funds[0]?.id || "");
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const fund = currentFund(funds, fundId);
  useEffect(() => {
    const fallback = currentFund(funds, routeFund || fundId);
    const next = fallback?.id ?? "";
    if (next !== fundId) setFundId(next);
    if (routeFund && routeFund !== next) setRoute({ fund: next || null });
  }, [funds, routeFund, fundId, setRoute]);
  const [draft, setDraft] = useState({ name: "", location: "", acquired: "2026-01-01", cost: "0", improvements: "0", capitalWorksClaimed: "0", valuation: "0" });
  if (!fund) return <Panel title="Properties"><p>No funds are available.</p></Panel>;
  const canEdit = fund.status === "Preparing" && roleCan(user.role, "edit");
  const imported = parsePropertiesCsv(csv);
  const rows = data.properties.filter((p) => p.fundId === fund.id);
  const toDraft = () => ({ name: draft.name, location: draft.location, acquired: draft.acquired, cost: asCents(draft.cost) || 0, improvements: asCents(draft.improvements) || 0, capitalWorksClaimed: asCents(draft.capitalWorksClaimed) || 0, valuation: asCents(draft.valuation) || 0 });
  return (
    <Panel title="Properties" actions={<Field label="Fund" labelHidden><Select value={fund.id} onValueChange={(id) => { setFundId(id); setRoute({ fund: id }); }} options={fundOptions(funds)} /></Field>}>
      {canEdit ? null : <p className="data-note">{fund.status === "Preparing" ? "View only for your role." : `${fund.status} — return to Preparing before editing properties.`}</p>}
      <TableScroll label="Properties">
        <table className="dt dt--hover"><thead><tr><th scope="col">Property</th><th scope="col">Location</th><th scope="col">Acquired</th><th scope="col" className="num">Valuation</th>{canEdit ? <th scope="col">Actions</th> : null}</tr></thead><tbody>
          {rows.map((p) => <tr key={p.id}><th scope="row"><span className="dt__title">{p.name}</span></th><td>{p.location}</td><td>{dateLabel(p.acquired)}</td><td className="num">{money(p.valuation, fund.currency)}</td>{canEdit ? <td><Button size="sm" variant="secondary" onClick={() => dispatch({ type: "entity-remove-property", fundId: fund.id, propertyId: p.id })}>Remove</Button></td> : null}</tr>)}
        </tbody></table>
      </TableScroll>
      {rows.length === 0 ? <EmptyState title="No properties yet">{canEdit ? "Add a property or import a CSV property list." : "This fund has no properties in the current browser data."}</EmptyState> : null}
      {canEdit ? (
      <div className="data-split">
        <Panel title="Add property">
          <div className="data-form-grid">
            {PROPERTY_FIELDS.map(([key, label]) => <Field key={key} label={label}><TextInput type={key === "acquired" ? "date" : "text"} inputMode={key === "name" || key === "location" || key === "acquired" ? undefined : "decimal"} value={draft[key]} onValueChange={(v) => setDraft({ ...draft, [key]: v })} /></Field>)}
          </div>
          <Button variant="primary" onClick={() => dispatch({ type: "entity-add-property", fundId: fund.id, property: toDraft() })}>Add property</Button>
        </Panel>
        <Panel title="Import properties" actions={<Button onClick={() => downloadText(propertiesTemplate(), "properties-template.csv", CSV_TYPE)}>Download template</Button>}>
          <Field label="Mode"><Select value={mode} onValueChange={(v) => setMode(v as "append" | "replace")} options={[{ value: "append", label: "Append" }, { value: "replace", label: "Replace register" }]} /></Field>
          <SpreadsheetFileField label="CSV or Excel file" hint="Up to 1 MB; for an Excel workbook the first sheet is read." onText={setCsv} />
          <Field label="CSV"><TextArea rows={6} value={csv} onValueChange={setCsv} /></Field>
          <p className={typeof imported === "string" ? "field__error" : "data-note"}>{csv.trim() === "" ? "Paste CSV to preview." : typeof imported === "string" ? imported : `${imported.length} ${imported.length === 1 ? "property" : "properties"} ready.`}</p>
          <Button disabled={typeof imported === "string"} onClick={() => typeof imported !== "string" && dispatch({ type: "entity-import-properties", fundId: fund.id, rows: imported, mode })}>Import properties</Button>
        </Panel>
      </div>
      ) : null}
    </Panel>
  );
}

/** A file chooser that takes its label and hint from the surrounding Field. */
function FileInput(props: { accept: string; disabled?: boolean; onChange(event: ChangeEvent<HTMLInputElement>): void }) {
  const control = useFieldControl();
  return <input {...control} className="input" type="file" accept={props.accept} disabled={props.disabled} onChange={props.onChange} />;
}

const SPREADSHEET_ACCEPT = ".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** "CSV or Excel file": reads the chosen file (the first sheet of a workbook) into CSV text for the import box below it. */
function SpreadsheetFileField({ label, hint, onText }: { label: string; hint: string; onText(text: string): void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    setProblem(null);
    setNote(null);
    if (!file) return;
    if (file.size > MAX_FUND_IMPORT_BYTES) {
      setProblem("The file is larger than 1 MB.");
      return;
    }
    readImportFile(file).then(
      (read) => {
        setNote(read.note ?? null);
        onText(read.text);
      },
      (error: unknown) => setProblem(error instanceof Error ? error.message : "The file could not be read."),
    );
  };
  return (
    <Field label={label} hint={note ?? hint} error={problem ?? undefined}>
      <FileInput accept={SPREADSHEET_ACCEPT} onChange={onChange} />
    </Field>
  );
}

function BackupTab() {
  const data = useAppData();
  const store = useStore();
  const { user } = useUi();
  const canManage = roleCan(user.role, "manage-access");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<AppData | null>(null);
  const summary = useMemo(() => (pending ? restoreSummary(pending) : ""), [pending]);
  const onFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    setProblem(null);
    setPending(null);
    if (!file) return;
    const sizeProblem = backupFileProblem(file);
    if (sizeProblem) {
      setProblem(sizeProblem);
      return;
    }
    file.text().then(
      (text) => {
        const dataOrProblem = parseBackupText(text);
        if (typeof dataOrProblem === "string") setProblem(dataOrProblem);
        else setPending(dataOrProblem);
      },
      () => setProblem("The file could not be read."),
    );
  };
  return (
    <Panel title="Backup & restore">
      <p>{DATA_STORAGE_NOTE} Reset demo data remains on the <a href={buildHash({ path: "/access" })}>Access page</a>.</p>
      <div className="data-actions">
        <Button variant="primary" icon={<Icon name="download" />} disabled={!canManage} onClick={() => downloadText(backupText(data), backupFileName(new Date()))}>Download full backup</Button>
      </div>
      <Field label="Restore backup" hint="Choose a backup file downloaded from this app (.json). All data in this browser is replaced after you confirm.">
        <FileInput accept=".json,application/json" disabled={!canManage} onChange={onFile} />
      </Field>
      {problem ? <p className="field__error" role="alert">{problem}</p> : null}
      {pending ? <Dialog open={true} onClose={() => setPending(null)} role="alertdialog" title="Restore this backup?" description={`This replaces the current browser data with: ${summary}.`} footer={<><Button onClick={() => setPending(null)}>Cancel</Button><Button variant="primary" onClick={() => { const p = store.importData(pending); if (p) setProblem(p); setPending(null); }}>Restore backup</Button></>}>
        <p>Only restore backups you trust. The whole file is checked before anything is replaced.</p>
      </Dialog> : null}
    </Panel>
  );
}
