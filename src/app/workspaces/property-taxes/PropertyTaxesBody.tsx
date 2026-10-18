import { useMemo, useState } from "react";
import { AU_STATES } from "../../../engine/au/types.ts";
import { AU_LAND_TAX_OWNER_KINDS } from "../../../engine/au/landTax.ts";
import { AU_TRANSFER_DUTY_PROPERTY_KINDS, AU_TRANSFER_PURCHASER_KINDS } from "../../../engine/au/transferDuty.ts";
import { ABSD_BUYER_KINDS, STAMP_DUTY_PROPERTY_KINDS } from "../../../engine/stampDuty.ts";
import { PROPERTY_TAX_USAGES } from "../../../engine/propertyTax.ts";
import { AU_LAND_TAX_ASSUMPTION, dutiesView, profileRows, propertyTaxKpis, propertyTaxView } from "../../../domain/ptax/index.ts";
import type { AnnualTaxRow, DutyRow, PtaxPaymentKind, PtaxProfilePatch } from "../../../domain/ptax/types.ts";
import type { Fund, Property } from "../../../domain/types.ts";
import { dateLabel, money, toISODate } from "../../../domain/format.ts";
import { downloadCsv, downloadPdf } from "../../exports/index.ts";
import { useRouteParam, useSetRouteParams } from "../../router.ts";
import { useAppData, useCtx, useDispatch, useWorkflow } from "../../state.tsx";
import { Badge, Button, Dialog, DownloadButton, Field, Kpi, KpiStrip, MoneyInput, NumberInput, Panel, Select, TableScroll, Tabs, TextInput } from "../../ui/index.ts";
import { bpsPct, deadlineText, profileSummary, ptaxTabFromParam, PTAX_TABS, rowAmountText, statusText, statusTone, valueText, yesNo } from "./model.ts";
import "./property-taxes.css";

const VIEW_ONLY = "View only for your role";

function options<T extends readonly { id: string; label: string }[]>(items: T): Array<{ value: string; label: string }> {
  return items.map((item) => ({ value: item.id, label: item.label }));
}

function BasisCell({ row }: { row: Pick<AnnualTaxRow | DutyRow, "basis" | "basisTitle" | "ruleIds" | "status"> }) {
  if (row.status !== "modelled") return <span>{row.basis}</span>;
  return (
    <span className="ptax-basis">
      <span>{row.basisTitle}</span>
      <small>{row.ruleIds.join("; ")}</small>
      <small>{row.basis}</small>
    </span>
  );
}

function PaymentDialog({ fund, propertyId, propertyName, kind, period, amount, open, onClose }: { fund: Fund; propertyId: string; propertyName: string; kind: PtaxPaymentKind; period: string; amount: number; open: boolean; onClose(): void }) {
  const dispatch = useDispatch();
  const today = toISODate(useCtx().now);
  const [paid, setPaid] = useState<number | null>(amount > 0 ? amount : null);
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const submit = (): void => {
    if (paid === null) return;
    const result = dispatch({ type: "ptax-record-payment", fundId: fund.id, propertyId, kind, period, amount: paid, date, reference });
    if (result.ok) onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Record payment — ${propertyName}`}
      description="Record a paid assessment or duty so the calendar and risk register mark it done."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Record payment</Button></>}
    >
      <div className="ptax-form">
        <Field label="Amount paid"><MoneyInput value={paid} currency={fund.currency} onCommit={setPaid} min={1} /></Field>
        <Field label="Payment date"><TextInput type="date" value={date} onValueChange={setDate} /></Field>
        <Field label="Reference" required><TextInput value={reference} onValueChange={setReference} /></Field>
      </div>
    </Dialog>
  );
}

function annualPaymentPeriod(fund: Fund, row: AnnualTaxRow): string {
  const year = row.dueDate?.slice(0, 4) ?? fund.periodEnd.slice(0, 4);
  return fund.market === "AU" ? `land-tax-${year}` : `property-tax-${year}`;
}

function AnnualPanel({ fund, canRecord }: { fund: Fund; canRecord: boolean }) {
  const data = useAppData();
  const ctx = useCtx();
  const [payment, setPayment] = useState<AnnualTaxRow | null>(null);
  const view = useMemo(() => propertyTaxView(data, fund.id, ctx), [data, fund.id, ctx]);
  return (
    <Panel
      title={view.title}
      actions={
        <>
          <DownloadButton size="sm" label="Download CSV" onDownload={() => downloadCsv(view.csv)} />
          <DownloadButton size="sm" label="Download PDF" onDownload={() => downloadPdf(view.doc)} />
        </>
      }
    >
      <TableScroll label="Annual property taxes">
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col">{fund.market === "AU" ? "State" : "Usage"}</th>
              <th scope="col" className="num">{fund.market === "AU" ? "Land value" : "Annual value"}</th>
              <th scope="col">Rate basis</th>
              <th scope="col" className="num">Tax</th>
              <th scope="col" className="num">Surcharge / rebate</th>
              <th scope="col" className="num">Total</th>
              <th scope="col">Due</th>
              <th scope="col">Status</th>
              {canRecord ? <th scope="col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.propertyId}>
                <th scope="row"><span>{row.propertyName}</span><small>{row.location}</small></th>
                <td>{row.stateOrUsage}</td>
                <td className="num">{valueText(row.value, fund.currency)}</td>
                <td><BasisCell row={row} /></td>
                <td className="num">{rowAmountText(row.status, row.tax, fund.currency)}</td>
                <td className="num">{rowAmountText(row.status, row.surcharge, fund.currency)}</td>
                <td className="num">{rowAmountText(row.status, row.total, fund.currency)}</td>
                <td>{row.dueLabel}</td>
                <td><Badge tone={row.paid ? "good" : statusTone(row.status)}>{row.paid ? "Paid" : statusText(row.status)}</Badge></td>
                {canRecord ? <td>{row.status === "modelled" && !row.paid ? <Button size="sm" onClick={() => setPayment(row)}>Record payment</Button> : null}</td> : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total">
              <th scope="row" colSpan={4}>Total</th>
              <td className="num">{money(view.totals.tax, fund.currency)}</td>
              <td className="num">{money(view.totals.surcharge, fund.currency)}</td>
              <td className="num">{money(view.totals.total, fund.currency)}</td>
              <td colSpan={canRecord ? 3 : 2}></td>
            </tr>
          </tfoot>
        </table>
      </TableScroll>
      {payment ? <PaymentDialog fund={fund} propertyId={payment.propertyId} propertyName={payment.propertyName} kind="annual-tax" period={annualPaymentPeriod(fund, payment)} amount={payment.total} open={true} onClose={() => setPayment(null)} /> : null}
    </Panel>
  );
}

function DutiesPanel({ fund, canRecord }: { fund: Fund; canRecord: boolean }) {
  const data = useAppData();
  const ctx = useCtx();
  const [payment, setPayment] = useState<DutyRow | null>(null);
  const view = useMemo(() => dutiesView(data, fund.id, ctx), [data, fund.id, ctx]);
  return (
    <Panel
      title="Duties on acquisition"
      actions={
        <>
          <DownloadButton size="sm" label="Download CSV" onDownload={() => downloadCsv(view.csv)} />
          <DownloadButton size="sm" label="Download PDF" onDownload={() => downloadPdf(view.doc)} />
        </>
      }
    >
      <TableScroll label="Duties on acquisition">
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col">Purchase date</th>
              <th scope="col" className="num">Price</th>
              <th scope="col">Basis</th>
              <th scope="col" className="num">Duty</th>
              <th scope="col" className="num">{fund.market === "AU" ? "Foreign surcharge" : "ABSD"}</th>
              <th scope="col" className="num">SSD</th>
              <th scope="col" className="num">Total</th>
              <th scope="col">Deadline</th>
              <th scope="col">Status</th>
              {canRecord ? <th scope="col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.propertyId}>
                <th scope="row"><span>{row.propertyName}</span><small>{row.location}</small></th>
                <td>{dateLabel(row.purchaseDate)}</td>
                <td className="num">{money(row.purchasePrice, fund.currency)}</td>
                <td><BasisCell row={row} /></td>
                <td className="num">{rowAmountText(row.status, row.baseDuty, fund.currency)}</td>
                <td className="num">{rowAmountText(row.status, row.surchargeDuty, fund.currency)}</td>
                <td className="num">{rowAmountText(row.status, row.ssdDuty, fund.currency)}</td>
                <td className="num">{rowAmountText(row.status, row.totalDuty, fund.currency)}</td>
                <td>{deadlineText(row.deadline, row.deadlineLabel)}</td>
                <td><Badge tone={row.paid ? "good" : statusTone(row.status)}>{row.paid ? "Paid" : statusText(row.status)}</Badge></td>
                {canRecord ? <td>{row.status === "modelled" && !row.paid ? <Button size="sm" onClick={() => setPayment(row)}>Record payment</Button> : null}</td> : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total">
              <th scope="row" colSpan={4}>Total</th>
              <td className="num">{money(view.totals.baseDuty, fund.currency)}</td>
              <td className="num">{money(view.totals.surchargeDuty, fund.currency)}</td>
              <td className="num">{money(view.totals.ssdDuty, fund.currency)}</td>
              <td className="num">{money(view.totals.totalDuty, fund.currency)}</td>
              <td colSpan={canRecord ? 3 : 2}></td>
            </tr>
          </tfoot>
        </table>
      </TableScroll>
      {payment ? <PaymentDialog fund={fund} propertyId={payment.propertyId} propertyName={payment.propertyName} kind="duty" period={`duty-${payment.purchaseDate}`} amount={payment.totalDuty} open={true} onClose={() => setPayment(null)} /> : null}
    </Panel>
  );
}

function patchOf(field: keyof PtaxProfilePatch, value: PtaxProfilePatch[keyof PtaxProfilePatch]): PtaxProfilePatch {
  return { [field]: value } as PtaxProfilePatch;
}

function isResidentialUsage(value: string | null): boolean {
  return value === "OWNER_OCCUPIED_RESIDENTIAL" || value === "NON_OWNER_OCCUPIED_RESIDENTIAL";
}

function ProfileDialog({ fund, property, open, onClose }: { fund: Fund; property: Property; open: boolean; onClose(): void }) {
  const data = useAppData();
  const dispatch = useDispatch();
  const profile = data.propertyProfiles.find((candidate) => candidate.propertyId === property.id);
  if (!profile) return null;
  const save = (patch: PtaxProfilePatch): void => {
    dispatch({ type: "ptax-update-profile", fundId: fund.id, propertyId: property.id, patch });
  };
  const reset = (): void => {
    const result = dispatch({ type: "ptax-reset-profile", fundId: fund.id, propertyId: property.id });
    if (result.ok) onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Property tax profile — ${property.name}`}
      description="Reference data for annual property taxes and acquisition duties. Distribution workflow status does not lock these profiles."
      size="lg"
      footer={
        <>
          <Button onClick={reset}>Reset to defaults</Button>
          <Button data-autofocus variant="primary" onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="ptax-form">
        {fund.market === "AU" ? (
          <>
            <Field label="State or territory"><Select value={profile.auState ?? ""} options={options(AU_STATES)} onValueChange={(value) => save(patchOf("auState", value as PtaxProfilePatch["auState"]))} /></Field>
            <Field label="Taxable land value"><MoneyInput value={profile.auLandValue} currency={fund.currency} onCommit={(value) => save(patchOf("auLandValue", value))} allowEmpty min={0} /></Field>
            <Field label="Valuation year"><NumberInput value={profile.auValuationYear} onCommit={(value) => save(patchOf("auValuationYear", value === null ? null : Math.round(value)))} allowEmpty integer min={2000} max={2200} /></Field>
            <Field label="Owner kind"><Select value={profile.auOwnerKind ?? ""} options={options(AU_LAND_TAX_OWNER_KINDS)} onValueChange={(value) => save(patchOf("auOwnerKind", value as PtaxProfilePatch["auOwnerKind"]))} /></Field>
            <Field label="Trust surcharge applies"><Select value={String(profile.auTrustSurchargeApplies)} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} onValueChange={(value) => save(patchOf("auTrustSurchargeApplies", value === "true"))} /></Field>
            <Field label="Residential land"><Select value={String(profile.auResidential)} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} onValueChange={(value) => save(patchOf("auResidential", value === "true"))} /></Field>
            <Field label="Residential share (bps)"><NumberInput value={profile.auResidentialShareBps} onCommit={(value) => save(patchOf("auResidentialShareBps", value === null ? null : Math.round(value)))} allowEmpty integer min={0} max={10000} /></Field>
            <Field label="Purchase price"><MoneyInput value={profile.purchasePrice} currency={fund.currency} onCommit={(value) => value !== null && save(patchOf("purchasePrice", value))} min={0} /></Field>
            <Field label="Purchase date"><TextInput type="date" value={profile.purchaseDate} onValueChange={(value) => save(patchOf("purchaseDate", value))} /></Field>
            <Field label="Transfer duty property kind"><Select value={profile.auPropertyKind ?? ""} options={options(AU_TRANSFER_DUTY_PROPERTY_KINDS)} onValueChange={(value) => save(patchOf("auPropertyKind", value as PtaxProfilePatch["auPropertyKind"]))} /></Field>
            <Field label="Purchaser kind"><Select value={profile.auPurchaserKind ?? ""} options={options(AU_TRANSFER_PURCHASER_KINDS)} onValueChange={(value) => save(patchOf("auPurchaserKind", value as PtaxProfilePatch["auPurchaserKind"]))} /></Field>
            <Field label="Foreign purchaser"><Select value={String(profile.auForeignPurchaser)} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} onValueChange={(value) => save(patchOf("auForeignPurchaser", value === "true"))} /></Field>
          </>
        ) : (
          <>
            <Field label="Annual value"><MoneyInput value={profile.sgAnnualValue} currency={fund.currency} onCommit={(value) => save(patchOf("sgAnnualValue", value))} allowEmpty min={0} /></Field>
            <Field label="Property tax usage"><Select value={profile.sgUsage ?? ""} options={options(PROPERTY_TAX_USAGES)} onValueChange={(value) => save(patchOf("sgUsage", value as PtaxProfilePatch["sgUsage"]))} /></Field>
            <Field label="Owner-occupied" hint={isResidentialUsage(profile.sgUsage) ? "Applies the owner-occupier rates for private residential property." : "Only residential usages can be owner-occupied."}>
              <Select
                value={String(isResidentialUsage(profile.sgUsage) && profile.sgOwnerOccupied)}
                disabled={!isResidentialUsage(profile.sgUsage)}
                options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]}
                onValueChange={(value) => save(patchOf("sgOwnerOccupied", value === "true"))}
              />
            </Field>
            <Field label="Purchase price"><MoneyInput value={profile.purchasePrice} currency={fund.currency} onCommit={(value) => value !== null && save(patchOf("purchasePrice", value))} min={0} /></Field>
            <Field label="Purchase date"><TextInput type="date" value={profile.purchaseDate} onValueChange={(value) => save(patchOf("purchaseDate", value))} /></Field>
            <Field label="Stamp duty property kind"><Select value={profile.sgStampPropertyKind ?? ""} options={options(STAMP_DUTY_PROPERTY_KINDS)} onValueChange={(value) => save(patchOf("sgStampPropertyKind", value as PtaxProfilePatch["sgStampPropertyKind"]))} /></Field>
            <Field label="ABSD buyer kind"><Select value={profile.sgAbsdBuyerKind ?? ""} onValueChange={(value) => save(patchOf("sgAbsdBuyerKind", value === "" ? null : value as PtaxProfilePatch["sgAbsdBuyerKind"]))}>
              <option value="">No ABSD profile</option>
              {ABSD_BUYER_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
            </Select></Field>
            <Field label="Residential property count before purchase"><NumberInput value={profile.sgResidentialPropertyCountBeforePurchase} onCommit={(value) => save(patchOf("sgResidentialPropertyCountBeforePurchase", value === null ? null : Math.round(value)))} allowEmpty integer min={0} /></Field>
            <Field label="Executed in Singapore"><Select value={String(profile.sgExecutedInSingapore)} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} onValueChange={(value) => save(patchOf("sgExecutedInSingapore", value === "true"))} /></Field>
          </>
        )}
      </div>
    </Dialog>
  );
}

function ProfilesPanel({ fund, canEdit, lockNote }: { fund: Fund; canEdit: boolean; lockNote: string | null }) {
  const data = useAppData();
  const rows = useMemo(() => profileRows(data, fund.id), [data, fund.id]);
  const [editing, setEditing] = useState<Property | null>(null);
  return (
    <Panel title="Profiles" actions={lockNote ? <span className="muted">{lockNote}</span> : <span className="muted">Reference data: workflow status does not lock profiles.</span>}>
      {fund.market === "AU" ? <p className="ptax-note">{AU_LAND_TAX_ASSUMPTION}</p> : null}
      <TableScroll label="Property tax profiles">
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col">Annual tax profile</th>
              <th scope="col">Acquisition facts</th>
              <th scope="col">Surcharge facts</th>
              <th scope="col">Payments</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ property, profile }) => (
              <tr key={property.id}>
                <th scope="row"><span>{property.name}</span><small>{property.location}</small></th>
                <td>{profile ? profileSummary(profile, fund.currency) : "Missing profile"}</td>
                <td>{profile ? `${dateLabel(profile.purchaseDate)} · ${money(profile.purchasePrice, fund.currency)}` : "Missing"}</td>
                <td>
                  {profile
                    ? fund.market === "AU"
                      ? `Foreign purchaser ${yesNo(profile.auForeignPurchaser)} · residential share ${bpsPct(profile.auResidentialShareBps)}`
                      : `ABSD ${profile.sgAbsdBuyerKind ?? "none"} · executed in Singapore ${yesNo(profile.sgExecutedInSingapore)}`
                    : "Missing"}
                </td>
                <td>{profile && profile.payments.length > 0 ? profile.payments.map((payment) => `${dateLabel(payment.date)} · ${money(payment.amount, fund.currency)} · ${payment.reference}`).join("; ") : "No payments recorded"}</td>
                <td>{canEdit ? <Button size="sm" onClick={() => setEditing(property)}>Edit profile</Button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {editing ? <ProfileDialog fund={fund} property={editing} open={true} onClose={() => setEditing(null)} /> : null}
    </Panel>
  );
}

export function PropertyTaxesBody({ fund }: { fund: Fund }) {
  const data = useAppData();
  const ctx = useCtx();
  const workflow = useWorkflow(fund.id);
  const tab = ptaxTabFromParam(useRouteParam("tab"));
  const setParams = useSetRouteParams();
  const kpis = useMemo(() => propertyTaxKpis(data, fund.id, ctx), [data, fund.id, ctx]);
  const canEdit = workflow.can.edit;
  const canRecord = workflow.can.edit || workflow.can.lodge;
  const lockNote = canEdit ? null : workflow.lockedReason || VIEW_ONLY;
  const tabs = PTAX_TABS.map((item) => ({ id: item.id, label: item.label }));

  return (
    <div className="ptax">
      <KpiStrip label="Property taxes summary">
        <Kpi label="Total annual tax this year" value={money(kpis.annualTax, fund.currency)} sub={fund.market === "AU" ? "Land tax allocation where modelled" : "Property tax for the calendar year"} />
        <Kpi label="Total duty on acquisitions" value={kpis.dutyModelled === 0 ? "Not modelled" : money(kpis.dutyPaid, fund.currency)} sub={`${kpis.dutyModelled} of ${kpis.dutyTotal} properties modelled${kpis.dutyNotModelled ? ` (${kpis.dutyNotModelled} not modelled)` : ""}`} />
        <Kpi label="Properties needing data" value={String(kpis.needsData)} tone={kpis.needsData > 0 ? "warn" : "good"} sub="Missing data or unsupported state" />
      </KpiStrip>
      <Panel title="Property taxes and duties">
        <p className="ptax-note">Property details can be updated in any workflow status by anyone who can edit this fund.</p>
        <Tabs tabs={tabs} value={tab} onValueChange={(next) => setParams({ tab: next })} label="Property taxes">
          <Tabs.Panel id="annual"><AnnualPanel fund={fund} canRecord={canRecord} /></Tabs.Panel>
          <Tabs.Panel id="duties"><DutiesPanel fund={fund} canRecord={canRecord} /></Tabs.Panel>
          <Tabs.Panel id="profiles"><ProfilesPanel fund={fund} canEdit={canEdit} lockNote={lockNote} /></Tabs.Panel>
        </Tabs>
      </Panel>
    </div>
  );
}
