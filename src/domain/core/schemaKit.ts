// Rule toolkit for validating untrusted saved state (see schema.ts). Shared by the core schema and by every feature's own
// schema module (src/domain/<feature>/schema.ts), so a feature can describe its records without editing the core file.
// Every rule ticks a node budget; schema.ts resets it with resetBudget() before each validation run.
import { MAX_ARRAY, MAX_FUND_ID, MAX_NAME, MAX_STRING, isISODate, isLocalDateTime } from "./validate.ts";

/** Most values (strings, numbers, lists, objects) one state may hold. A seeded state has about 4,000. */
export const MAX_NODES = 500_000;
/** Most object/array records a state may contain. */
export const MAX_RECORDS = 100_000;
/** Deepest object/array nesting accepted in saved state. */
export const MAX_DEPTH = 8;
const MAX_PRICE = 1e9;

export type Rule = (value: unknown, at: string) => void;
export type Field = Rule | { optional: Rule };

export class Invalid extends Error {}

let nodes = 0;
let records = 0;

/** Starts a fresh node and record budget (call before each validation run). */
export function resetBudget(): void {
  nodes = 0;
  records = 0;
}

export function bad(at: string, why: string): never {
  throw new Invalid(`${at} ${why}`);
}

export function tick(at: string): void {
  nodes += 1;
  if (nodes > MAX_NODES) bad(at, "pushes the saved state past its size limit");
}

/** Names that exist on every object: never acceptable as an id or a key, because ids are used to index plain objects. */
export function reserved(name: string): boolean {
  return name === "__proto__" || name === "constructor" || name === "prototype" || name in Object.prototype;
}

export function preflight(value: unknown, at: string, depth = 0): void {
  tick(at);
  if (value === null || typeof value !== "object") return;
  if (depth > MAX_DEPTH) bad(at, `is nested more than ${MAX_DEPTH} levels deep`);
  records += 1;
  if (records > MAX_RECORDS) bad(at, `has more than ${MAX_RECORDS} records`);
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY) bad(at, `has more than ${MAX_ARRAY} items`);
    for (let i = 0; i < value.length; i++) preflight(value[i], `${at}[${i}]`, depth + 1);
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) bad(at, "must be a plain object");
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (reserved(key)) bad(`${at}.${key}`, "is not allowed");
    preflight(obj[key], `${at}.${key}`, depth + 1);
  }
}
export function record(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) bad(at, "must be an object");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) bad(at, "must be a plain object");
  return value as Record<string, unknown>;
}

export const optional = (rule: Rule): Field => ({ optional: rule });

/** An object with exactly these fields (optional ones may be absent). Anything else, including __proto__, is refused. */
export function shape<T>(fields: { [K in keyof T]-?: Field }): Rule {
  const entries = Object.entries(fields) as Array<[string, Field]>;
  const known = new Set(entries.map(([key]) => key));
  return (value, at) => {
    tick(at);
    const obj = record(value, at);
    for (const key of Object.keys(obj)) {
      if (!known.has(key)) bad(`${at}.${key}`, reserved(key) ? "is not allowed" : "is not a known field");
    }
    for (const [key, field] of entries) {
      const present = Object.hasOwn(obj, key) && obj[key] !== undefined;
      if (typeof field === "function") {
        if (!present) bad(`${at}.${key}`, "is missing");
        field(obj[key], `${at}.${key}`);
      } else if (present) {
        field.optional(obj[key], `${at}.${key}`);
      }
    }
  };
}

/** An object used as a lookup table: any keys (ids), every value passing `item`. */
export const dict =
  (item: Rule): Rule =>
  (value, at) => {
    tick(at);
    const obj = record(value, at);
    const keys = Object.keys(obj);
    if (keys.length > MAX_ARRAY) bad(at, `has more than ${MAX_ARRAY} entries`);
    for (const key of keys) {
      if (key === "" || key.length > MAX_NAME || reserved(key)) bad(`${at}.${key.slice(0, 40)}`, "is not an acceptable key");
      item(obj[key], `${at}.${key}`);
    }
  };

export const list =
  (item: Rule, min = 0, max = MAX_ARRAY): Rule =>
  (value, at) => {
    tick(at);
    if (!Array.isArray(value)) bad(at, "must be a list");
    if (value.length > max) bad(at, `has more than ${max} items`);
    if (value.length < min) bad(at, `needs at least ${min} item${min === 1 ? "" : "s"}`);
    for (let i = 0; i < value.length; i++) item(value[i], `${at}[${i}]`);
  };

export const text =
  (max: number, min = 0): Rule =>
  (value, at) => {
    tick(at);
    if (typeof value !== "string") bad(at, "must be text");
    if (value.length > max) bad(at, `is longer than ${max} characters`);
    if (value.length < min) bad(at, "must not be empty");
  };

export const idOf =
  (max: number): Rule =>
  (value, at) => {
    text(max, 1)(value, at);
    if (reserved(value as string)) bad(at, "is a reserved word");
  };

export const id = idOf(MAX_NAME);
export const fundKey = idOf(MAX_FUND_ID);

export const label = text(MAX_NAME);
export const name = text(MAX_NAME, 1);
export const longText = text(MAX_STRING);

export const bool: Rule = (value, at) => {
  tick(at);
  if (typeof value !== "boolean") bad(at, "must be true or false");
};

export const oneOf =
  (options: readonly string[]): Rule =>
  (value, at) => {
    tick(at);
    if (typeof value !== "string" || !options.includes(value)) bad(at, `must be one of ${options.join(", ")}`);
  };

export const literal =
  (expected: string | number): Rule =>
  (value, at) => {
    tick(at);
    if (value !== expected) bad(at, `must be ${expected}`);
  };

export const int =
  (min: number, max = Number.MAX_SAFE_INTEGER): Rule =>
  (value, at) => {
    tick(at);
    if (typeof value !== "number" || !Number.isSafeInteger(value)) bad(at, "must be a whole number");
    if (value < min || value > max) bad(at, `must be between ${min} and ${max}`);
  };

/** Cents or units that may not be negative. */
export const amount = int(0);
/** Trial balance balances, signed. */
export const signed = int(Number.MIN_SAFE_INTEGER);

export const price: Rule = (value, at) => {
  tick(at);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_PRICE) bad(at, "must be a price of zero or more");
};

export const isoDate: Rule = (value, at) => {
  tick(at);
  if (!isISODate(value)) bad(at, "must be a date (YYYY-MM-DD)");
};

export const stamp: Rule = (value, at) => {
  tick(at);
  if (!isLocalDateTime(value)) bad(at, "must be a date and time (YYYY-MM-DDTHH:mm:ss)");
};

export const nullable =
  (rule: Rule): Rule =>
  (value, at) => {
    if (value === null) tick(at);
    else rule(value, at);
  };


export function unique<T>(items: readonly T[], keyOf: (item: T) => string, at: string, what = "id"): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    const key = keyOf(item);
    if (seen.has(key)) bad(`${at}[${i}]`, `repeats ${what} ${key.slice(0, 40)}`);
    seen.add(key);
  });
}
