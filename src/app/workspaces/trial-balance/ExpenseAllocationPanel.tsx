import { useMemo } from "react";
import { tbView } from "../../../domain/index.ts";
import type { AppData, AuExpenseAllocation, AuFund, Fund } from "../../../domain/types.ts";
import { pct } from "../../../domain/format.ts";
import { useAppData, useCtx, useDispatch } from "../../state.tsx";
import { Field, NumberInput, Panel, Select, TableScroll, useAnnounce } from "../../ui/index.ts";
import { componentLines, moneyExact } from "./model.ts";

const CUSTOM_STREAMS = [
  ["other", "Australian income — other"],
  ["ncmi", "Non-concessional MIT income"],
  ["transitional", "Excluded from NCMI — transitional"],
  ["clean", "Clean building MIT income"],
] as const;

type Stream = (typeof CUSTOM_STREAMS)[number][0];

const DEFAULT_CUSTOM: Record<Stream, number> = { other: 10_000, ncmi: 0, transitional: 0, clean: 0 };

function isAuFund(fund: Fund): fund is AuFund {
  return fund.market === "AU";
}

function policyOf(fund: AuFund): AuExpenseAllocation {
  return fund.expenseAllocation ?? { method: "pro-rata" };
}

export function allocationLabel(allocation: AuExpenseAllocation | undefined): string {
  const policy = allocation ?? { method: "pro-rata" };
  if (policy.method === "pro-rata") return "Pro-rata by gross rent";
  if (policy.method === "other-income") return "All deductions against Australian income — other";
  const part = (key: Stream) => `${CUSTOM_STREAMS.find(([id]) => id === key)![1]} ${pct(policy.sharesBps[key] / 100, 2)}`;
  return `Custom · ${part("other")}; ${part("ncmi")}; ${part("transitional")}; ${part("clean")}`;
}

function customShares(policy: AuExpenseAllocation): Record<Stream, number> {
  return policy.method === "custom" ? { ...policy.sharesBps } : { ...DEFAULT_CUSTOM };
}

function rebalance(shares: Record<Stream, number>, key: Stream, nextValue: number): Record<Stream, number> {
  const next = { ...shares, [key]: Math.max(0, Math.min(10_000, Math.round(nextValue))) };
  let total = next.other + next.ncmi + next.transitional + next.clean;
  if (total > 10_000) {
    let excess = total - 10_000;
    for (const candidate of CUSTOM_STREAMS.map(([id]) => id).filter((id) => id !== key)) {
      const take = Math.min(next[candidate], excess);
      next[candidate] -= take;
      excess -= take;
      if (excess === 0) break;
    }
    if (excess > 0) next[key] -= excess;
  } else if (total < 10_000) {
    const fill = CUSTOM_STREAMS.map(([id]) => id).find((id) => id !== key) ?? key;
    next[fill] += 10_000 - total;
  }
  total = next.other + next.ncmi + next.transitional + next.clean;
  if (total !== 10_000) next.other += 10_000 - total;
  return next;
}

function dataWithAllocation(data: AppData, fund: AuFund, allocation: AuExpenseAllocation): AppData {
  return { ...data, funds: data.funds.map((candidate) => (candidate.id === fund.id ? { ...fund, expenseAllocation: allocation } : candidate)) };
}

export interface ExpenseAllocationPanelProps {
  fund: Fund;
  canEdit: boolean;
  lockNote: string | null;
}

export function ExpenseAllocationPanel({ fund, canEdit, lockNote }: ExpenseAllocationPanelProps) {
  const data = useAppData();
  const ctx = useCtx();
  const dispatch = useDispatch();
  const announce = useAnnounce();
  if (!isAuFund(fund)) return null;
  const allocation = policyOf(fund);
  const shares = customShares(allocation);
  const preview = useMemo(() => tbView(dataWithAllocation(data, fund, allocation), fund.id, ctx.now), [data, fund, allocation, ctx.now]);
  const lines = componentLines(preview.components);

  const save = (next: AuExpenseAllocation): void => {
    const result = dispatch({ type: "entity-set-expense-allocation", fundId: fund.id, allocation: next });
    if (result.ok) announce(`${fund.name}: expense allocation set to ${allocationLabel(next)}.`);
  };

  return (
    <Panel title="Expense allocation policy" padded={false}>
      <div className="tb-policy">
        <p>
          ATO guidance expects expenses directly relevant to a class of income to be set against it. Shared deductions use a reasonable basis; this policy applies deductible expenses, Division 40 and Division 43 before the trial balance derives the distribution components.
        </p>
        {canEdit ? (
          <div className="tb-policy__controls">
            <Field label="Method" hint="Pro-rata is the default and keeps the seeded trial balances unchanged.">
              <Select value={allocation.method} onValueChange={(method) => save(method === "custom" ? { method: "custom", sharesBps: shares } : { method: method as "pro-rata" | "other-income" })}>
                <option value="pro-rata">Pro-rata by gross rent</option>
                <option value="other-income">All deductions against Australian income — other</option>
                <option value="custom">Custom percentages</option>
              </Select>
            </Field>
            {allocation.method === "custom" ? (
              <div className="tb-policy__shares">
                {CUSTOM_STREAMS.map(([key, label]) => (
                  <Field key={key} label={`${label} (%)`}>
                    <NumberInput value={shares[key] / 100} min={0} max={100} decimals={2} suffix="%" onCommit={(value) => value !== null && save({ method: "custom", sharesBps: rebalance(shares, key, value * 100) })} />
                  </Field>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="tb-hint">{lockNote ?? "View only for your role."}</p>
        )}
        <p className="tb-hint">
          Current policy: {allocationLabel(allocation)}. No stream goes below nil: deductions above a stream's gross income are set against the remaining rent, interest and foreign income, then the TARP capital gains, pro rata. Anything still left is the trust's tax loss, carried forward and shown in the book-to-tax bridge.
        </p>
      </div>
      {lines.length > 0 ? (
        <TableScroll label="Expense allocation preview">
          <table className="dt dt--dense tb-table">
            <caption>Live preview of trial-balance components after this policy</caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col" className="num">
                  Preview
                </th>
                <th scope="col" className="num">
                  Distribution
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <th scope="row">{line.label}</th>
                  <td className="num">{moneyExact(line.trialBalance, fund.currency)}</td>
                  <td className="num">{moneyExact(line.distribution, fund.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        <p className="tb-note">No rental components are available to preview.</p>
      )}
    </Panel>
  );
}
