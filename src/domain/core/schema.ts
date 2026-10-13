// Deep validation of persisted state. OWNER: domain-core agent.
//
// localStorage is untrusted input: an older build, a hand edit, another tab or a page on the same origin can leave anything in it, and a
// single NaN amount is enough to make a selector throw ("The number NaN cannot be converted to a BigInt"). So the stored blob is checked
// against the exact shape the seed and the reducers produce, and rejected as a whole when any part of it is off (loadPersisted then
// starts from the seed).
//
//  * Shapes are exact. Missing fields, unknown fields (which also refuses __proto__, constructor and prototype), values of the wrong
//    type, unknown enum values, unsafe or fractional amounts, dates that do not exist and ids that point nowhere are all refused.
//  * Everything is bounded: lists hold at most MAX_ARRAY items, text MAX_STRING characters (names and ids MAX_NAME), the funds and the
//    users MAX_PEOPLE_AND_FUNDS, and the whole blob MAX_NODES values, so a hostile blob cannot keep the tab busy.
//  * The rules mirror the reducers: every state `applyAction` can produce passes (persist-hardening.test.ts replays them to prove it).
//
// Nothing here throws to the caller: a blob that cannot be read is simply "not valid".
import type {
  AppData,
  Approval,
  AuditEntry,
  AuFund,
  AuHolder,
  AuInputs,
  AuNotice,
  Lodgment,
  Market,
  Persisted,
  Property,
  Query,
  QueryMessage,
  SgFund,
  SgHolder,
  SgInputs,
  SgLedgerSeed,
  SgNotice,
  TaxAdjustmentDef,
  TbCategoryDef,
  TbRow,
  UiState,
  UnitCostBaseSeed,
  User,
} from "../types.ts";
import { STATE_VERSION, UNMAPPED_CATEGORY } from "../types.ts";
import { GOVERNANCE_MODES, ROLES } from "../permissions.ts";
import { MAX_ACCOUNT, MAX_ARRAY, MAX_FUND_ID, MAX_NAME, MAX_STRING, isISODate, isLocalDateTime } from "./validate.ts";

/** Most funds and most users a state may hold (every portfolio screen loops over them). */
export const MAX_PEOPLE_AND_FUNDS = 200;
/** Most values (strings, numbers, lists, objects) one state may hold. A seeded state has about 4,000. */
export const MAX_NODES = 500_000;
/** Most object/array records a state may contain. */
export const MAX_RECORDS = 100_000;
/** Deepest object/array nesting accepted in saved state. */
export const MAX_DEPTH = 8;
/** Largest saved state, in characters, that loadPersisted will even try to parse. */
export const MAX_SERIALISED = 8_000_000;
const MAX_PRICE = 1e9;
const MIN_ASSESSMENT_YEAR = 2000;
const MAX_ASSESSMENT_YEAR = 2200;

// ---------------------------------------------------------------------------------------------------- rule toolkit
type Rule = (value: unknown, at: string) => void;
type Field = Rule | { optional: Rule };

class Invalid extends Error {}

let nodes = 0;
let records = 0;

function bad(at: string, why: string): never {
  throw new Invalid(`${at} ${why}`);
}

function tick(at: string): void {
  nodes += 1;
  if (nodes > MAX_NODES) bad(at, "pushes the saved state past its size limit");
}

/** Names that exist on every object: never acceptable as an id or a key, because ids are used to index plain objects. */
function reserved(name: string): boolean {
  return name === "__proto__" || name === "constructor" || name === "prototype" || name in Object.prototype;
}

function preflight(value: unknown, at: string, depth = 0): void {
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
function record(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) bad(at, "must be an object");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) bad(at, "must be a plain object");
  return value as Record<string, unknown>;
}

const optional = (rule: Rule): Field => ({ optional: rule });

/** An object with exactly these fields (optional ones may be absent). Anything else, including __proto__, is refused. */
function shape<T>(fields: { [K in keyof T]-?: Field }): Rule {
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
const dict =
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

const list =
  (item: Rule, min = 0, max = MAX_ARRAY): Rule =>
  (value, at) => {
    tick(at);
    if (!Array.isArray(value)) bad(at, "must be a list");
    if (value.length > max) bad(at, `has more than ${max} items`);
    if (value.length < min) bad(at, `needs at least ${min} item${min === 1 ? "" : "s"}`);
    for (let i = 0; i < value.length; i++) item(value[i], `${at}[${i}]`);
  };

const text =
  (max: number, min = 0): Rule =>
  (value, at) => {
    tick(at);
    if (typeof value !== "string") bad(at, "must be text");
    if (value.length > max) bad(at, `is longer than ${max} characters`);
    if (value.length < min) bad(at, "must not be empty");
  };

const idOf =
  (max: number): Rule =>
  (value, at) => {
    text(max, 1)(value, at);
    if (reserved(value as string)) bad(at, "is a reserved word");
  };

const id = idOf(MAX_NAME);
const fundKey = idOf(MAX_FUND_ID);

const label = text(MAX_NAME);
const name = text(MAX_NAME, 1);
const longText = text(MAX_STRING);

const bool: Rule = (value, at) => {
  tick(at);
  if (typeof value !== "boolean") bad(at, "must be true or false");
};

const oneOf =
  (options: readonly string[]): Rule =>
  (value, at) => {
    tick(at);
    if (typeof value !== "string" || !options.includes(value)) bad(at, `must be one of ${options.join(", ")}`);
  };

const literal =
  (expected: string | number): Rule =>
  (value, at) => {
    tick(at);
    if (value !== expected) bad(at, `must be ${expected}`);
  };

const int =
  (min: number, max = Number.MAX_SAFE_INTEGER): Rule =>
  (value, at) => {
    tick(at);
    if (typeof value !== "number" || !Number.isSafeInteger(value)) bad(at, "must be a whole number");
    if (value < min || value > max) bad(at, `must be between ${min} and ${max}`);
  };

/** Cents or units that may not be negative. */
const amount = int(0);
/** Trial balance balances, signed. */
const signed = int(Number.MIN_SAFE_INTEGER);

const price: Rule = (value, at) => {
  tick(at);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_PRICE) bad(at, "must be a price of zero or more");
};

const isoDate: Rule = (value, at) => {
  tick(at);
  if (!isISODate(value)) bad(at, "must be a date (YYYY-MM-DD)");
};

const stamp: Rule = (value, at) => {
  tick(at);
  if (!isLocalDateTime(value)) bad(at, "must be a date and time (YYYY-MM-DDTHH:mm:ss)");
};

const nullable =
  (rule: Rule): Rule =>
  (value, at) => {
    if (value === null) tick(at);
    else rule(value, at);
  };

// ---------------------------------------------------------------------------------------------------- shapes
const auInputs = shape<AuInputs>({
  cashDistribution: amount,
  ausOtherIncome: amount,
  ncmi: amount,
  excludedNcmi: amount,
  cleanBuilding: amount,
  interest: amount,
  discountGainTarp: amount,
  otherGainTarp: amount,
  foreignIncome: amount,
});

const sgInputs = shape<SgInputs>({
  taxableSpecifiedIncome: amount,
  taxableDistributed: amount,
  taxExemptDistribution: amount,
  capitalDistribution: amount,
});

const WORKFLOW_STATUSES = ["Preparing", "In review", "Signed off"];

const auFund = shape<AuFund>({
  id: fundKey,
  name,
  sector: label,
  listed: bool,
  periodLabel: label,
  periodStart: isoDate,
  periodEnd: isoDate,
  unitsOnIssue: amount,
  status: oneOf(WORKFLOW_STATUSES),
  whtRemitted: nullable(amount),
  governance: oneOf(GOVERNANCE_MODES),
  market: literal("AU"),
  regime: literal("AMIT"),
  currency: literal("AUD"),
  inputs: auInputs,
});

const sgFund = shape<SgFund>({
  id: fundKey,
  name,
  sector: label,
  listed: bool,
  periodLabel: label,
  periodStart: isoDate,
  periodEnd: isoDate,
  unitsOnIssue: amount,
  status: oneOf(WORKFLOW_STATUSES),
  whtRemitted: nullable(amount),
  governance: oneOf(GOVERNANCE_MODES),
  market: literal("SG"),
  regime: literal("S-REIT"),
  currency: literal("SGD"),
  assessmentYear: int(MIN_ASSESSMENT_YEAR, MAX_ASSESSMENT_YEAR),
  inputs: sgInputs,
});

const fund: Rule = (value, at) => {
  const market = record(value, at).market;
  const rule = market === "AU" ? auFund : market === "SG" ? sgFund : bad(`${at}.market`, "must be AU or SG");
  rule(value, at);
  if ((value as AuFund).periodStart > (value as AuFund).periodEnd) bad(`${at}.periodEnd`, "is before the period start");
};

// One shape for both markets: which of the two class fields is present is checked against the fund's market in `relations`.
const holder = shape<AuHolder & SgHolder>({
  id,
  fundId: fundKey,
  holder: name,
  country: label,
  units: amount,
  auStatus: optional(oneOf(["resident", "foreign-eoi", "foreign-non-eoi"])),
  sgClass: optional(oneOf(["individual", "qualifying", "nrni", "nr-fund", "other"])),
});

const tbRow = shape<TbRow>({ id, fundId: fundKey, account: text(MAX_ACCOUNT, 1), name: label, category: id, current: signed, prior: signed });
const tbCategory = shape<TbCategoryDef>({ id, label, treatment: label });
const adjustmentDef = shape<TaxAdjustmentDef>({ key: id, label, help: longText });

const property = shape<Property>({
  id,
  fundId: fundKey,
  name,
  location: label,
  acquired: isoDate,
  cost: amount,
  improvements: amount,
  capitalWorksClaimed: amount,
  valuation: amount,
});

const unitCostBase = shape<UnitCostBaseSeed>({ unitPrice: price, priceBasis: oneOf(["market price", "NAV per unit"]), opening: dict(amount) });
const sgLedger = shape<SgLedgerSeed>({ exempt: amount, capital: amount, afterTax: amount });

const auNotice = shape<AuNotice>({
  id,
  fundId: fundKey,
  label,
  recordDate: isoDate,
  paymentDate: isoDate,
  cash: amount,
  final: bool,
  publishedOn: nullable(isoDate),
  notified: nullable(
    shape<NonNullable<AuNotice["notified"]>>({ other: amount, ncmi: amount, excludedNcmi: amount, clean: amount, interest: amount }),
  ),
});

const sgNotice = shape<SgNotice>({
  id,
  fundId: fundKey,
  recordDate: isoDate,
  declarationDeadline: isoDate,
  paymentDate: isoDate,
  publishedOn: nullable(isoDate),
  notified: nullable(shape<NonNullable<SgNotice["notified"]>>({ taxable: amount, exempt: amount, capital: amount })),
});

const query = shape<Query>({
  id,
  fundId: fundKey,
  subject: label,
  status: oneOf(["open", "resolved"]),
  raisedBy: label,
  raisedAt: stamp,
  messages: list(shape<QueryMessage>({ by: label, at: stamp, text: longText }), 1),
});

const auditEntry = shape<AuditEntry>({ id, fundId: fundKey, at: stamp, actor: label, action: label, detail: optional(longText) });
const approval = shape<Approval>({ fundId: fundKey, level: oneOf(["review", "agent"]), by: label, at: stamp });
const lodgment = shape<Lodgment>({ fundId: fundKey, kind: oneOf(["aiir", "return", "form-ut"]), reference: label, date: isoDate, actor: label });

const userFunds: Rule = (value, at) => {
  if (value === "all") tick(at);
  else list(fundKey, 1)(value, at);
};
const user = shape<User>({ id, name, title: label, organisation: label, role: oneOf(ROLES), funds: userFunds });

const byMarket = (rule: Rule): Rule => shape<Record<Market, unknown>>({ AU: rule, SG: rule });

const appData = shape<AppData>({
  version: literal(STATE_VERSION),
  funds: list(fund, 0, MAX_PEOPLE_AND_FUNDS),
  holders: list(holder),
  tbRows: list(tbRow),
  tbCategories: byMarket(list(tbCategory)),
  taxAdjustments: dict(dict(amount)),
  adjustmentDefs: byMarket(list(adjustmentDef)),
  properties: list(property),
  unitCostBase: dict(unitCostBase),
  sgLedger: dict(sgLedger),
  auNotices: list(auNotice),
  sgNotices: list(sgNotice),
  queries: list(query),
  audit: list(auditEntry),
  approvals: list(approval),
  lodgments: list(lodgment),
  users: list(user, 1, MAX_PEOPLE_AND_FUNDS),
});

const ui = shape<UiState>({ currentUserId: id, jurisdiction: oneOf(["all", "AU", "SG"]), selectedFundId: nullable(fundKey) });
const persisted = shape<Persisted>({ data: appData, ui });

// ---------------------------------------------------------------------------------------------------- relations between records
function unique<T>(items: readonly T[], keyOf: (item: T) => string, at: string, what = "id"): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    const key = keyOf(item);
    if (seen.has(key)) bad(`${at}[${i}]`, `repeats ${what} ${key.slice(0, 40)}`);
    seen.add(key);
  });
}

/** Ids point at records that exist, classes match the fund's market, and nothing is listed twice. Runs on data that passed the shapes. */
function relations(data: AppData, state: UiState): void {
  const marketOf = new Map<string, Market>();
  unique(data.funds, (f) => f.id, "funds");
  for (const f of data.funds) marketOf.set(f.id, f.market);
  const marketFor = (fundId: string, at: string): Market => marketOf.get(fundId) ?? bad(at, `names a fund that does not exist (${fundId.slice(0, 40)})`);

  const categories: Record<Market, Set<string>> = { AU: new Set(), SG: new Set() };
  for (const market of ["AU", "SG"] as const) {
    data.tbCategories[market].forEach((c, i) => {
      if (c.id === UNMAPPED_CATEGORY) bad(`tbCategories.${market}[${i}].id`, `uses the reserved id ${UNMAPPED_CATEGORY}`);
      categories[market].add(c.id);
    });
    unique(data.tbCategories[market], (c) => c.id, `tbCategories.${market}`);
    unique(data.adjustmentDefs[market], (d) => d.key, `adjustmentDefs.${market}`, "key");
  }

  unique(data.holders, (h) => h.id, "holders");
  const holdersOf = new Map<string, Set<string>>();
  data.holders.forEach((h, i) => {
    const market = marketFor(h.fundId, `holders[${i}].fundId`);
    const own = h as Partial<AuHolder & SgHolder>;
    const right = market === "AU" ? own.auStatus !== undefined && own.sgClass === undefined : own.sgClass !== undefined && own.auStatus === undefined;
    if (!right) bad(`holders[${i}]`, `does not carry the ${market === "AU" ? "auStatus" : "sgClass"} of a ${market} fund`);
    const ids = holdersOf.get(h.fundId) ?? new Set<string>();
    ids.add(h.id);
    holdersOf.set(h.fundId, ids);
  });

  unique(data.tbRows, (r) => r.id, "tbRows");
  data.tbRows.forEach((row, i) => {
    const market = marketFor(row.fundId, `tbRows[${i}].fundId`);
    if (row.category !== UNMAPPED_CATEGORY && !categories[market].has(row.category)) bad(`tbRows[${i}].category`, `is not a ${market} category`);
  });

  for (const [fundId, adjustments] of Object.entries(data.taxAdjustments)) {
    const market = marketFor(fundId, `taxAdjustments.${fundId}`);
    const keys = new Set(data.adjustmentDefs[market].map((d) => d.key));
    for (const key of Object.keys(adjustments)) if (!keys.has(key)) bad(`taxAdjustments.${fundId}.${key}`, `is not an adjustment for ${market} funds`);
  }

  unique(data.properties, (p) => p.id, "properties");
  data.properties.forEach((p, i) => marketFor(p.fundId, `properties[${i}].fundId`));

  for (const f of data.funds) if (!Object.hasOwn(data.unitCostBase, f.id)) bad(`unitCostBase.${f.id}`, "is missing");
  for (const [fundId, base] of Object.entries(data.unitCostBase)) {
    marketFor(fundId, `unitCostBase.${fundId}`);
    for (const holderId of Object.keys(base.opening)) {
      if (!holdersOf.get(fundId)?.has(holderId)) bad(`unitCostBase.${fundId}.opening.${holderId}`, "names a holder the fund does not have");
    }
  }
  for (const fundId of Object.keys(data.sgLedger)) {
    if (marketFor(fundId, `sgLedger.${fundId}`) !== "SG") bad(`sgLedger.${fundId}`, "is only for Singapore funds");
  }

  unique(data.auNotices, (n) => n.id, "auNotices");
  data.auNotices.forEach((n, i) => {
    if (marketFor(n.fundId, `auNotices[${i}].fundId`) !== "AU") bad(`auNotices[${i}].fundId`, "is not an Australian fund");
  });
  unique(data.sgNotices, (n) => n.id, "sgNotices");
  data.sgNotices.forEach((n, i) => {
    if (marketFor(n.fundId, `sgNotices[${i}].fundId`) !== "SG") bad(`sgNotices[${i}].fundId`, "is not a Singapore fund");
  });

  unique(data.queries, (q) => q.id, "queries");
  data.queries.forEach((q, i) => marketFor(q.fundId, `queries[${i}].fundId`));
  unique(data.audit, (a) => a.id, "audit");
  data.audit.forEach((a, i) => marketFor(a.fundId, `audit[${i}].fundId`));

  unique(data.approvals, (a) => `${a.fundId}/${a.level}`, "approvals", "approval");
  data.approvals.forEach((a, i) => marketFor(a.fundId, `approvals[${i}].fundId`));
  unique(data.lodgments, (l) => `${l.fundId}/${l.kind}`, "lodgments", "lodgment");
  data.lodgments.forEach((l, i) => {
    const market = marketFor(l.fundId, `lodgments[${i}].fundId`);
    if ((l.kind === "form-ut") !== (market === "SG")) bad(`lodgments[${i}].kind`, `is not a ${market} lodgment`);
  });

  unique(data.users, (u) => u.id, "users");
  data.users.forEach((u, i) => {
    if (u.funds === "all") return;
    unique(u.funds, (fundId) => fundId, `users[${i}].funds`, "fund");
    u.funds.forEach((fundId, j) => marketFor(fundId, `users[${i}].funds[${j}]`));
  });

  if (!data.users.some((u) => u.id === state.currentUserId)) bad("ui.currentUserId", "names a user that does not exist");
  if (state.selectedFundId !== null) marketFor(state.selectedFundId, "ui.selectedFundId");
}

// ---------------------------------------------------------------------------------------------------- entry points
function run(value: unknown, check: (value: unknown) => void): string | null {
  nodes = 0;
  records = 0;
  try {
    preflight(value, "state");
    check(value);
    return null;
  } catch (error) {
    return error instanceof Invalid ? error.message : "could not be read";
  }
}

/** Why this is not a usable state ("data.funds[2].inputs.ncmi must be a whole number"), or null when it is one. Never throws. */
export function persistedProblem(value: unknown): string | null {
  return run(value, (state) => {
    persisted(state, "state");
    const { data, ui: uiState } = state as Persisted;
    relations(data, uiState);
  });
}

/** The same check for the data alone (the ui can be repaired, the data cannot). */
export function appDataProblem(value: unknown): string | null {
  return run(value, (data) => {
    appData(data, "data");
    relations(data as AppData, { currentUserId: (data as AppData).users[0].id, jurisdiction: "all", selectedFundId: null });
  });
}

/** A fresh copy when the value is a complete, consistent, bounded Persisted; otherwise null. Never throws. */
export function validatePersisted(value: unknown): Persisted | null {
  if (persistedProblem(value) !== null) return null;
  try {
    return structuredClone(value) as Persisted;
  } catch {
    return null;
  }
}

