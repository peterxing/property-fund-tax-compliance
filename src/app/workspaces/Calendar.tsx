import { useMemo, useState } from "react";
import { can } from "../../domain/permissions.ts";
import type { CustomObligation, Fund, ObligationCategory, ObligationRecurrence } from "../../domain/types.ts";
import type { EntityObligationDraft } from "../../domain/entities/types.ts";
import { OBLIGATION_CATEGORY_LABEL, OBLIGATION_RECURRENCE_LABEL, obligationOccurrences } from "../../domain/entities/obligations.ts";
import { calendarView, icsCalendar, type CalendarFilters, type CalendarRow } from "../../domain/portfolio/index.ts";
import { useRouteParam, useSetRouteParams } from "../router.ts";
import { PortfolioFrame } from "../shell/PortfolioFrame.tsx";
import { useAppData, useCtx, useDispatch, useUi, useVisibleFunds } from "../state.tsx";
import { Button, Checkbox, Dialog, DownloadButton, Field, Kpi, KpiStrip, Panel, Segmented, Select, TableScroll, Tag, TextArea, TextInput } from "../ui/index.ts";
import {
  agendaRows,
  calendarFileName,
  downloadText,
  labelForMonthKey,
  longDate,
  monthKeyOf,
  monthWeeks,
  normaliseMonthKey,
  obligationLabel,
  shiftMonth,
  STATUS_LABEL,
  STATUS_TONE,
} from "./calendar/model.ts";
import "./calendar/calendar.css";

type CalendarMode = "month" | "agenda";

function rowHref(row: CalendarRow): string {
  return `#${row.workspaceRoute}?fund=${encodeURIComponent(row.fundId)}`;
}

function RowStatus({ row }: { row: CalendarRow }) {
  return (
    <span className="calendar-status">
      <Tag tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Tag>
      <span className="sr-only"> for {row.obligation}</span>
    </span>
  );
}

function Filters({ filters, setFilters, view }: { filters: CalendarFilters; setFilters(next: CalendarFilters): void; view: ReturnType<typeof calendarView> }) {
  return (
    <div className="portfolio-filters" aria-label="Calendar filters">
      <label>
        Fund
        <Select value={filters.fundId ?? "all"} onValueChange={(fundId) => setFilters({ ...filters, fundId })}>
          <option value="all">All funds</option>
          {view.fundOptions.map((fund) => (
            <option key={fund.id} value={fund.id}>
              {fund.name}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Status
        <Select value={filters.status ?? "all"} onValueChange={(status) => setFilters({ ...filters, status: status as CalendarFilters["status"] })}>
          <option value="all">All statuses</option>
          <option value="overdue">Overdue</option>
          <option value="open">Open</option>
          <option value="done">Done</option>
        </Select>
      </label>
      <label>
        Kind
        <Select value={filters.kind ?? "all"} onValueChange={(kind) => setFilters({ ...filters, kind: kind as CalendarFilters["kind"] })}>
          <option value="all">All kinds</option>
          {view.kindOptions.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </Select>
      </label>
      <Checkbox label="Show completed" checked={Boolean(filters.showCompleted)} onCheckedChange={(showCompleted) => setFilters({ ...filters, showCompleted })} />
    </div>
  );
}

function Agenda({ rows }: { rows: CalendarRow[] }) {
  return (
    <TableScroll label="Compliance calendar agenda">
      <table className="dt dt--hover calendar-agenda">
        <caption className="sr-only">Compliance calendar agenda</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Fund</th>
            <th scope="col">Market</th>
            <th scope="col">Obligation</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.date}|${row.fundId}|${row.obligation}`}>
              <td>{longDate(row.date)}</td>
              <td>{row.fund}</td>
              <td>{row.market}</td>
              <td>
                <a href={rowHref(row)}>{obligationLabel(row.obligation)}</a>
              </td>
              <td>
                <RowStatus row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function MonthView({ view, monthKey, setMonth }: { view: ReturnType<typeof calendarView>; monthKey: string; setMonth(month: string): void }) {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const month = view.months.find((item) => item.key === monthKey) ?? { key: monthKey, label: labelForMonthKey(monthKey), rows: [] };
  return (
    <div className="calendar-month-view">
      <Panel
        title={month.label}
        level={3}
        actions={
          <div className="calendar-month-actions">
            <Button size="sm" variant="secondary" onClick={() => setMonth(shiftMonth(monthKey, -1))}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMonth(monthKeyOf(new Date()))}>
              Today
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMonth(shiftMonth(monthKey, 1))}>
              Next
            </Button>
          </div>
        }
        padded={false}
      >
          <TableScroll label={`${month.label} obligations`}>
            <table className="dt calendar-grid">
              <caption className="sr-only">{month.label} obligations by week and weekday</caption>
              <thead>
                <tr>
                  {weekdays.map((day) => (
                    <th key={day} scope="col">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthWeeks(month).map((week, index) => (
                  <tr key={index}>
                    {week.map((cell, i) =>
                      cell ? (
                        <td key={cell.iso} className="calendar-day">
                          <span className="calendar-day__number">{cell.day}</span>
                          {cell.rows.length > 0 ? (
                            <ul className="calendar-day__list">
                              {cell.rows.map((row) => (
                                <li key={`${row.fundId}|${row.obligation}`} className="calendar-item">
                                  <a href={rowHref(row)}>{obligationLabel(row.obligation)}</a>
                                  <span>{row.fund}</span>
                                  <span className="calendar-item__meta">
                                    {row.market} · {STATUS_LABEL[row.status]}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="sr-only">No obligations</span>
                          )}
                        </td>
                      ) : (
                        <td key={`blank-${i}`} className="calendar-empty-cell" aria-hidden="true" />
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Panel>
    </div>
  );
}

const CATEGORY_OPTIONS = Object.entries(OBLIGATION_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
const RECURRENCE_OPTIONS = Object.entries(OBLIGATION_RECURRENCE_LABEL).map(([value, label]) => ({ value, label }));

function defaultObligation(fundId: string): EntityObligationDraft {
  return { fundId, title: "", category: "council-rates", firstDue: "2026-10-31", recurrence: "none", notes: "" };
}

function ObligationDialog({ funds, obligation, open, onClose, onSave }: { funds: readonly Fund[]; obligation?: CustomObligation; open: boolean; onClose(): void; onSave(draft: EntityObligationDraft): void }) {
  const [draft, setDraft] = useState<EntityObligationDraft>(obligation ? { fundId: obligation.fundId, title: obligation.title, category: obligation.category, firstDue: obligation.firstDue, recurrence: obligation.recurrence, notes: obligation.notes } : defaultObligation(funds[0]?.id ?? ""));
  const set = <K extends keyof EntityObligationDraft>(key: K, value: EntityObligationDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <Dialog open={open} onClose={onClose} title={obligation ? "Edit custom obligation" : "Add custom obligation"} description="Custom obligations appear on the compliance calendar and overdue ones appear in the risk register." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave({ ...draft, title: draft.title.trim(), notes: draft.notes.trim() })}>Save obligation</Button></>}>
      <div className="data-form-grid">
        <Field label="Fund"><Select disabled={Boolean(obligation)} value={draft.fundId} onValueChange={(fundId) => set("fundId", fundId)} options={funds.map((fund) => ({ value: fund.id, label: fund.name }))} /></Field>
        <Field label="Title" required><TextInput value={draft.title} onValueChange={(title) => set("title", title)} /></Field>
        <Field label="Category"><Select value={draft.category} onValueChange={(category) => set("category", category as ObligationCategory)} options={CATEGORY_OPTIONS} /></Field>
        <Field label="First due"><TextInput type="date" value={draft.firstDue} onValueChange={(firstDue) => set("firstDue", firstDue)} /></Field>
        <Field label="Recurrence"><Select value={draft.recurrence} onValueChange={(recurrence) => set("recurrence", recurrence as ObligationRecurrence)} options={RECURRENCE_OPTIONS} /></Field>
      </div>
      <Field label="Notes"><TextArea rows={3} value={draft.notes} onValueChange={(notes) => set("notes", notes)} /></Field>
    </Dialog>
  );
}

function DeleteObligationDialog({ obligation, open, onClose, onDelete }: { obligation: CustomObligation; open: boolean; onClose(): void; onDelete(): void }) {
  return (
    <Dialog open={open} onClose={onClose} role="alertdialog" title="Delete custom obligation?" description={`This removes ${obligation.title} and its completed dates from the calendar.`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" onClick={onDelete}>Delete obligation</Button></>}>
      <p>This does not change any modelled tax filing or payment record.</p>
    </Dialog>
  );
}

function CustomObligations() {
  const data = useAppData();
  const ctx = useCtx();
  const funds = useVisibleFunds();
  const dispatch = useDispatch();
  const { user } = useUi();
  const editableFunds = funds.filter((fund) => can(user, "edit", fund, fund.governance));
  const [newOpen, setNewOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const visibleIds = new Set(funds.map((fund) => fund.id));
  const fundName = new Map(funds.map((fund) => [fund.id, fund.name]));
  const obligations = data.obligations.filter((obligation) => visibleIds.has(obligation.fundId));
  const occurrences = obligations
    .flatMap((obligation) => obligationOccurrences(obligation, ctx.now).map((occurrence) => ({ ...occurrence, fund: fundName.get(obligation.fundId) ?? obligation.fundId })))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.obligation.title.localeCompare(b.obligation.title));
  const editObligation = obligations.find((obligation) => obligation.id === editId) ?? null;
  const deleteObligation = obligations.find((obligation) => obligation.id === deleteId) ?? null;
  const editable = (obligation: CustomObligation): boolean => editableFunds.some((fund) => fund.id === obligation.fundId);
  return (
    <Panel title="Custom obligations" actions={editableFunds.length > 0 ? <Button variant="primary" onClick={() => setNewOpen(true)}>Add obligation</Button> : null} padded={false}>
      <p className="data-note">{editableFunds.length > 0 ? "Add payroll, FBT, insurance, council rates and other dates the tax engine does not model." : "View only for your role. You can see custom obligations but cannot change them."}</p>
      <TableScroll label="Custom obligation occurrences">
        <table className="dt dt--hover">
          <thead><tr><th scope="col">Due</th><th scope="col">Fund</th><th scope="col">Obligation</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {occurrences.map((row) => (
              <tr key={`${row.obligation.id}-${row.dueDate}`}>
                <td>{longDate(row.dueDate)}</td>
                <td>{row.fund}</td>
                <th scope="row">{row.obligation.title}<span className="dt__sub">{OBLIGATION_RECURRENCE_LABEL[row.obligation.recurrence]}{row.obligation.notes ? ` · ${row.obligation.notes}` : ""}</span></th>
                <td>{OBLIGATION_CATEGORY_LABEL[row.obligation.category]}</td>
                <td><Tag tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Tag></td>
                <td className="data-actions">
                  {editable(row.obligation) ? (
                    <>
                      <Button size="sm" onClick={() => dispatch({ type: "entity-set-obligation-done", id: row.obligation.id, dueDate: row.dueDate, done: row.status !== "done" })}>{row.status === "done" ? "Reopen" : "Mark done"}</Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditId(row.obligation.id)}>Edit</Button>
                      <Button size="sm" variant="secondary" onClick={() => setDeleteId(row.obligation.id)}>Delete</Button>
                    </>
                  ) : "View only"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {obligations.length === 0 ? <p className="data-note">No custom obligations for the visible funds.</p> : null}
      {newOpen ? <ObligationDialog funds={editableFunds} open={true} onClose={() => setNewOpen(false)} onSave={(obligation) => { const result = dispatch({ type: "entity-add-obligation", obligation }); if (result.ok) setNewOpen(false); }} /> : null}
      {editObligation ? <ObligationDialog funds={editableFunds} obligation={editObligation} open={true} onClose={() => setEditId(null)} onSave={(draft) => { const { title, category, firstDue, recurrence, notes } = draft; const result = dispatch({ type: "entity-update-obligation", id: editObligation.id, patch: { title, category, firstDue, recurrence, notes } }); if (result.ok) setEditId(null); }} /> : null}
      {deleteObligation ? <DeleteObligationDialog obligation={deleteObligation} open={true} onClose={() => setDeleteId(null)} onDelete={() => { const result = dispatch({ type: "entity-delete-obligation", id: deleteObligation.id }); if (result.ok) setDeleteId(null); }} /> : null}
    </Panel>
  );
}

export default function Calendar() {
  const data = useAppData();
  const ctx = useCtx();
  const { jurisdiction } = useUi();
  const monthParam = useRouteParam("month");
  const setRouteParams = useSetRouteParams();
  const todayMonth = monthKeyOf(ctx.now);
  const monthKey = normaliseMonthKey(monthParam, todayMonth);
  const [mode, setMode] = useState<CalendarMode>("agenda");
  const [filters, setFilters] = useState<CalendarFilters>({});
  const [showLater, setShowLater] = useState(false);
  const view = useMemo(() => calendarView(data, ctx, jurisdiction, filters), [data, ctx, jurisdiction, filters]);
  const openRows = view.rows.filter((row) => row.status !== "done");
  const shownAgenda = useMemo(() => agendaRows(view.rows, ctx.now, showLater), [view.rows, ctx.now, showLater]);
  const hiddenLater = view.rows.length - agendaRows(view.rows, ctx.now, false).length;
  const setMonth = (month: string): void => setRouteParams({ month }, { replace: false });

  return (
    <PortfolioFrame
      workspace="Compliance calendar"
      title="Compliance calendar"
      actions={
        <DownloadButton
          label="Download calendar (.ics)"
          onDownload={() => downloadText(calendarFileName(), icsCalendar(openRows, { now: ctx.now }), "text/calendar;charset=utf-8")}
          startedMessage="Calendar download started."
        />
      }
    >
      <KpiStrip label="Calendar summary">
        <Kpi label="Overdue" value={view.counts.overdue} tone={view.counts.overdue > 0 ? "bad" : "good"} />
        <Kpi label="Due in 7 days" value={view.counts.dueIn7} />
        <Kpi label="Due in 30 days" value={view.counts.dueIn30} />
        <Kpi label="Done this year" value={view.counts.doneThisYear} tone="good" />
      </KpiStrip>
      <Panel
        title="Calendar controls"
        actions={
          <Segmented<CalendarMode>
            legend="Calendar view"
            value={mode}
            onChange={setMode}
            options={[
              { value: "month", label: "Month" },
              { value: "agenda", label: "Agenda" },
            ]}
            size="sm"
          />
        }
      >
        <div className="calendar-toolbar">
          <Filters filters={filters} setFilters={setFilters} view={view} />
          <p className="access-note">{view.rows.length} obligations shown. The header jurisdiction filter controls the market.</p>
        </div>
      </Panel>
      <CustomObligations />
      {view.rows.length === 0 ? (
        <Panel>
          <p className="access-note">There are no obligations for the selected filters.</p>
        </Panel>
      ) : mode === "agenda" ? (
        <Panel
          title="Agenda"
          actions={
            hiddenLater > 0 ? (
              <Button size="sm" variant="secondary" onClick={() => setShowLater((value) => !value)}>
                {showLater ? "Hide later" : `Show later (${hiddenLater})`}
              </Button>
            ) : null
          }
          padded={false}
        >
          <Agenda rows={shownAgenda} />
        </Panel>
      ) : (
        <MonthView view={view} monthKey={monthKey} setMonth={setMonth} />
      )}
    </PortfolioFrame>
  );
}
