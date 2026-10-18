import { useMemo, useState } from "react";
import { calendarView, icsCalendar, type CalendarFilters, type CalendarRow } from "../../domain/portfolio/index.ts";
import { useRouteParam, useSetRouteParams } from "../router.ts";
import { PortfolioFrame } from "../shell/PortfolioFrame.tsx";
import { useAppData, useCtx, useUi } from "../state.tsx";
import { Button, Checkbox, DownloadButton, Kpi, KpiStrip, Panel, Segmented, Select, TableScroll, Tag } from "../ui/index.ts";
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
