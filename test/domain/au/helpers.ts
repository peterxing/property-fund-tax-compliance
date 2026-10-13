// Shared fixtures for the Australian module tests. Every test builds its own data with seedData(), which returns a fresh deep clone.
import assert from "node:assert/strict";
import { auModule } from "../../../src/domain/au/index.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import type { AppData, AuFund, Ctx, DocModel, FundCalc } from "../../../src/domain/types.ts";

/** The reference "today" for the golden values: 12 Oct 2026 (local time, as the app reads it). */
export const NOW = new Date(2026, 9, 12, 9, 0, 0);

export const AU_IDS = ["harbourline", "southbank", "wattle", "kurrajong", "coastline"] as const;
export type AuId = (typeof AU_IDS)[number];

export function freshData(): AppData {
  return seedData();
}

export function auFund(data: AppData, id: string): AuFund {
  const fund = data.funds.find((f) => f.id === id);
  if (!fund || fund.market !== "AU") throw new Error(`No AU fund ${id}`);
  return fund;
}

export function ctxFor(data: AppData, userId = "a-moreno", now: Date = NOW): Ctx {
  const user = data.users.find((u) => u.id === userId);
  if (!user) throw new Error(`No user ${userId}`);
  return { user, now };
}

export function calcFor(data: AppData, id: string, now: Date = NOW): FundCalc {
  return auModule.fundCalc(data, auFund(data, id), now);
}

/** Cents -> dollars as a plain number (two decimals), the unit of the golden captures. */
export const usd = (cents: number): number => Math.round(cents) / 100;

/** Asserts |actual - expected| <= tolerance (both in the same unit). */
export function near(actual: number, expected: number, tolerance: number, message?: string): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? "value"}: expected ${expected} (+/- ${tolerance}), got ${actual}`);
}

/** The captures show whole dollars, so a rounding step at an exact half dollar may differ by 1. */
export function nearDollars(cents: number, expectedDollars: number, message?: string): void {
  near(cents / 100, expectedDollars, 1, message);
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** Stable text for deep comparison of view models. */
export function snapshot(value: unknown): string {
  return JSON.stringify(value);
}

/** Every number found anywhere in a value. */
export function allNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allNumbers(v, out);
  else if (value !== null && typeof value === "object") for (const v of Object.values(value)) allNumbers(v, out);
  return out;
}

/** Every string found anywhere in a value. */
export function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value !== null && typeof value === "object") for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** A document as plain text lines: key/value rows and table cells tab-separated, the way the reference captures read. */
export function docLines(doc: DocModel): string[] {
  const out: string[] = [doc.title];
  if (doc.subtitle) out.push(doc.subtitle);
  for (const m of doc.meta ?? []) out.push(`${m.label}\t${m.value}`);
  for (const block of doc.blocks) {
    if (block.kind === "paragraph" || block.kind === "heading") out.push(block.text);
    else if (block.kind === "list") out.push(...block.items);
    else if (block.kind === "kv") {
      if (block.title) out.push(block.title);
      for (const row of block.rows) out.push(`${row.label}\t${row.value}`);
    } else {
      if (block.title) out.push(block.title);
      out.push(block.columns.map((c) => c.label).join("\t"));
      for (const row of block.rows) out.push(block.columns.map((c) => row[c.key]).join("\t"));
      if (block.totalRow) out.push(block.columns.map((c) => block.totalRow?.[c.key]).join("\t"));
    }
  }
  out.push(...(doc.footnotes ?? []));
  return out;
}

/** "A$1,234.50" or "−A$3,912,000" as a signed number of dollars (the app prints a typographic minus). */
export function dollarsOf(text: string): number {
  const digits = text.replace(/[^0-9.]/g, "");
  assert.ok(digits.length > 0, `no amount in "${text}"`);
  const value = (/[−-]/.test(text) ? -1 : 1) * Number(digits);
  return value === 0 ? 0 : value;
}

/** The same, in cents, for amounts printed with two decimals. */
export const centsOfText = (text: string): number => Math.round(dollarsOf(text) * 100);
