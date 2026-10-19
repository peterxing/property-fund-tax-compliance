import type { AppData, Cents, Ctx, Fund, FundCalc, FundId, TbView } from "../types.ts";
import { toLocalDateTime } from "../format.ts";
import { inputLabel } from "../core/labels.ts";
import { calcFor } from "../core/calc.ts";
import { nextSequenceId } from "../core/ids.ts";
import { moduleFor } from "../modules.ts";
import type { CalcSnapshotInput, CalcSnapshotLine, CalcVersion, CalcVersionTrigger, VersionDiff } from "./types.ts";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function sortObject(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  }
  return value;
}

export function canonicalJson(value: Json): string {
  return JSON.stringify(sortObject(value));
}

export function fnv1a64Hex(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

function fundOf(data: AppData, fundId: FundId): Fund {
  const fund = data.funds.find((f) => f.id === fundId);
  if (!fund) throw new Error(`Unknown fund: ${fundId}`);
  return fund;
}

function inputState(data: AppData, fund: Fund): Json {
  const holders = data.holders
    .filter((h) => h.fundId === fund.id)
    .map((h) => ({
      id: h.id,
      units: h.units,
      status: "auStatus" in h ? h.auStatus : h.sgClass,
      // The fund section changes an nr-fund holder's withholding (SG s45G), so it is a calculation input. Added only when set, so the
      // hashes of versions saved before sections existed stay the same.
      ...("sgFundSection" in h && h.sgFundSection !== undefined ? { sgFundSection: h.sgFundSection } : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const tbRows = data.tbRows
    .filter((r) => r.fundId === fund.id)
    .map((r) => ({ account: r.account, category: r.category, current: r.current, prior: r.prior }))
    .sort((a, b) => a.account.localeCompare(b.account, "en", { numeric: true }));
  const manualAdjustments = data.manualAdjustments
    .filter((a) => a.fundId === fund.id)
    .map((a) => ({ id: a.id, label: a.label, amount: a.amount, component: a.component, reason: a.reason }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    fund: {
      inputs: fund.inputs as unknown as Json,
      unitsOnIssue: fund.unitsOnIssue,
      whtRemitted: fund.whtRemitted,
      ...(fund.market === "AU" ? { expenseAllocation: (fund.expenseAllocation ?? { method: "pro-rata" }) as unknown as Json } : {}),
    },
    holders,
    tbRows,
    taxAdjustments: (data.taxAdjustments[fund.id] ?? {}) as Json,
    manualAdjustments,
  };
}

export function inputHash(data: AppData, fundId: FundId): string {
  return fnv1a64Hex(canonicalJson(inputState(data, fundOf(data, fundId))));
}

const addLine = (lines: CalcSnapshotLine[], ref: string, label: string, amount: Cents): void => {
  lines.push({ ref, label, amount });
};

function snapshotLines(calc: FundCalc, tb: TbView): CalcSnapshotLine[] {
  const lines: CalcSnapshotLine[] = [];
  for (const component of calc.components) addLine(lines, `component:${component.key}`, component.label, component.amount);
  addLine(lines, "cash", "Cash distribution", calc.cash);
  addLine(lines, "withheld", "Withholding computed", calc.withheld);
  if (calc.au) {
    addLine(lines, "au:fundPayment", "Fund payment", calc.au.fundPayment);
    addLine(lines, "au:costBaseNet", "AMIT cost base net amount", calc.au.costBaseNet);
  }
  if (calc.sg) {
    addLine(lines, "sg:taxableSpecifiedIncome", "Taxable specified income", calc.components.find((c) => c.key === "taxableDistributed")?.amount ?? 0);
    addLine(lines, "sg:trusteeTax", "Trustee tax", calc.sg.trusteeTax);
  }
  addLine(lines, "tb:result", tb.bookToTax.resultLabel, tb.bookToTax.result);
  addLine(lines, "tb:checks", "Checks count", calc.checks.length);
  return lines;
}

function snapshotInputs(fund: Fund, tb: TbView): CalcSnapshotInput[] {
  const fundInputs = Object.entries(fund.inputs as unknown as Record<string, number>).map(([key, value]) => ({ ref: `input:${key}`, label: inputLabel(key), value }));
  const tbInputs = Object.entries(tb.derivedInputs as unknown as Record<string, number>).map(([key, value]) => ({ ref: `tb:${key}`, label: `TB-derived ${inputLabel(key)}`, value }));
  const allocation =
    fund.market === "AU"
      ? [
          {
            ref: "expenseAllocation",
            label: "Expense allocation policy",
            value:
              (fund.expenseAllocation ?? { method: "pro-rata" }).method === "custom"
                ? JSON.stringify((fund.expenseAllocation ?? { method: "pro-rata" }))
                : (fund.expenseAllocation ?? { method: "pro-rata" }).method,
          },
        ]
      : [];
  return [...fundInputs, ...tbInputs, ...allocation, { ref: "unitsOnIssue", label: "Units on issue", value: fund.unitsOnIssue }, { ref: "whtRemitted", label: "Withholding remitted", value: fund.whtRemitted }];
}

export function buildCalcVersion(data: AppData, fund: Fund, ctx: Ctx, trigger: CalcVersionTrigger, label: string, reason: string | null): CalcVersion {
  const calc = calcFor(data, fund, ctx.now);
  const tb = moduleFor(fund.market).tbView(data, fund, ctx.now);
  return {
    id: nextSequenceId("v", data.versions.map((v) => v.id)),
    fundId: fund.id,
    label,
    at: toLocalDateTime(ctx.now),
    by: ctx.user.name,
    trigger,
    reason,
    inputHash: inputHash(data, fund.id),
    snapshot: snapshotLines(calc, tb),
    inputs: snapshotInputs(fund, tb),
  };
}

export function lastSignOffVersion(data: AppData, fundId: FundId): CalcVersion | null {
  return data.versions
    .filter((v) => v.fundId === fundId && v.trigger === "sign-off")
    .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)))
    .at(-1) ?? null;
}

export function versionDiff(data: AppData, a: CalcVersion, b: CalcVersion | "current", now: Date): VersionDiff {
  const fund = fundOf(data, a.fundId);
  const current = b === "current" ? buildCalcVersion(data, fund, { now, user: { id: "system", name: "Current", title: "", organisation: "", role: "finance", funds: "all" } }, "manual", "Current", null) : b;
  const refs = [...new Set([...a.snapshot.map((l) => l.ref), ...current.snapshot.map((l) => l.ref)])];
  const aLines = new Map(a.snapshot.map((l) => [l.ref, l]));
  const bLines = new Map(current.snapshot.map((l) => [l.ref, l]));
  const inputRefs = [...new Set([...a.inputs.map((i) => i.ref), ...current.inputs.map((i) => i.ref)])];
  const aInputs = new Map(a.inputs.map((i) => [i.ref, i]));
  const bInputs = new Map(current.inputs.map((i) => [i.ref, i]));
  const signOff = lastSignOffVersion(data, a.fundId);
  const currentHash = inputHash(data, a.fundId);
  return {
    lines: refs.map((ref) => {
      const left = aLines.get(ref);
      const right = bLines.get(ref);
      const then = left?.amount ?? null;
      const nowAmount = right?.amount ?? null;
      return { ref, label: right?.label ?? left?.label ?? ref, then, now: nowAmount, change: (nowAmount ?? 0) - (then ?? 0) };
    }),
    inputs: inputRefs
      .map((ref) => {
        const left = aInputs.get(ref);
        const right = bInputs.get(ref);
        return { ref, label: right?.label ?? left?.label ?? ref, then: left?.value ?? null, now: right?.value ?? null };
      })
      .filter((row) => row.then !== row.now),
    hashEqual: a.inputHash === current.inputHash,
    stale: signOff !== null && signOff.inputHash !== currentHash,
  };
}
