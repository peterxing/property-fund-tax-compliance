import { dateLabel, dateLabelWithWeekday } from "../../../domain/format.ts";
import type { CalendarMonth, CalendarRow } from "../../../domain/portfolio/index.ts";

export const STATUS_LABEL = { overdue: "Overdue", open: "Open", done: "Done" } as const;
export const STATUS_TONE = { overdue: "bad", open: "neutral", done: "good" } as const;

export function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function monthWeeks(month: CalendarMonth): Array<Array<{ iso: string; day: number; rows: CalendarRow[] } | null>> {
  const [yearText, monthText] = month.key.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const byDate = new Map<string, CalendarRow[]>();
  for (const row of month.rows) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  const cells: Array<{ iso: string; day: number; rows: CalendarRow[] } | null> = Array.from({ length: firstDay }, () => null);
  for (let day = 1; day <= days; day++) {
    const iso = `${yearText}-${monthText}-${String(day).padStart(2, "0")}`;
    cells.push({ iso, day, rows: byDate.get(iso) ?? [] });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<{ iso: string; day: number; rows: CalendarRow[] } | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const longDate = dateLabelWithWeekday;
export const shortDate = dateLabel;

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function normaliseMonthKey(value: string, fallback: string): string {
  return /^\d{4}-\d{2}$/.test(value) ? value : fallback;
}

export function labelForMonthKey(key: string): string {
  const [year, month] = key.split("-");
  return dateLabel(`${year}-${month}-01`).replace(/^1 /, "");
}

export function shiftMonth(key: string, delta: number): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)) - 1;
  return monthKeyOf(new Date(year, month + delta, 1));
}

export function agendaRows(rows: readonly CalendarRow[], now: Date, showLater: boolean): CalendarRow[] {
  const today = monthKeyOf(now) + `-${String(now.getDate()).padStart(2, "0")}`;
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
  const horizonIso = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, "0")}-${String(horizon.getDate()).padStart(2, "0")}`;
  return rows.filter((row) => row.status === "overdue" || showLater || (row.date >= today && row.date <= horizonIso));
}

export function obligationLabel(text: string): string {
  return text.replace(/ - /g, " — ");
}

export function calendarFileName(): string {
  return "property-fund-tax-compliance-calendar.ics";
}

export function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
