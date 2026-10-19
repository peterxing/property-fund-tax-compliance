// OWNER: Data & calendar agent (v3 G7). Bulk fund import from the Data page ("entity-import-funds").
import type { ActionResult, AppData, AuFund, Ctx, Fund, SgFund } from "../types.ts";
import type { EntityAction } from "./types.ts";
import { appendAudit, type AuditDraft } from "../core/audit.ts";
import { MAX_PEOPLE_AND_FUNDS } from "../core/schema.ts";
import { can } from "../permissions.ts";
import { cleanEntityText, periodLabel, slugFor, validateCommonFund, zeroAdjustments } from "./reducer.ts";

const fail = (reason: string): ActionResult => ({ ok: false, reason });

function namesEqual(a: string, b: string): boolean {
  return cleanEntityText(a).toLowerCase() === cleanEntityText(b).toLowerCase();
}

function buildFund(draft: Extract<EntityAction, { type: "entity-import-funds" }>["rows"][number], id: string): Fund {
  const base = {
    id,
    name: cleanEntityText(draft.name),
    sector: cleanEntityText(draft.sector),
    listed: draft.listed === true,
    periodLabel: periodLabel(draft.market, draft.periodStart, draft.periodEnd),
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    unitsOnIssue: draft.unitsOnIssue,
    status: "Preparing" as const,
    whtRemitted: null,
    governance: draft.governance,
  };
  return draft.market === "AU"
    ? ({
        ...base,
        market: "AU",
        regime: "AMIT",
        currency: "AUD",
        inputs: { cashDistribution: 0, ausOtherIncome: 0, ncmi: 0, excludedNcmi: 0, cleanBuilding: 0, interest: 0, discountGainTarp: 0, otherGainTarp: 0, foreignIncome: 0 },
      } satisfies AuFund)
    : ({
        ...base,
        market: "SG",
        regime: "S-REIT",
        currency: "SGD",
        assessmentYear: draft.assessmentYear!,
        inputs: { taxableSpecifiedIncome: 0, taxableDistributed: 0, taxExemptDistribution: 0, capitalDistribution: 0 },
      } satisfies SgFund);
}

export function importFunds(data: AppData, action: Extract<EntityAction, { type: "entity-import-funds" }>, ctx: Ctx): ActionResult {
  if (!can(ctx.user, "manage-access", undefined, "no-agent")) return fail("You don't have permission to import funds");
  if (!Array.isArray(action.rows) || action.rows.length === 0) return fail("The import has no funds");
  if (action.rows.length > 200) return fail("A fund import can have up to 200 rows");
  if (data.funds.length + action.rows.length > MAX_PEOPLE_AND_FUNDS) return fail("The portfolio already has the maximum number of funds");

  for (let i = 0; i < action.rows.length; i++) {
    const draft = action.rows[i]!;
    const problem = validateCommonFund(draft);
    if (problem) return fail(`Line ${i + 2}: ${problem}`);
    const name = cleanEntityText(draft.name);
    if (data.funds.some((fund) => namesEqual(fund.name, name))) return fail(`Line ${i + 2}: fund name ${name} already exists`);
    if (action.rows.some((row, index) => index < i && namesEqual(row.name, name))) return fail(`Line ${i + 2}: fund name ${name} appears more than once`);
  }

  let ids = data.funds.map((fund) => fund.id);
  const funds: Fund[] = [];
  const unitCostBase = { ...data.unitCostBase };
  const taxAdjustments = { ...data.taxAdjustments };
  const sgLedger = { ...data.sgLedger };
  const audits: AuditDraft[] = [];
  for (const draft of action.rows) {
    const id = slugFor(cleanEntityText(draft.name), ids);
    ids = [...ids, id];
    const fund = buildFund(draft, id);
    funds.push(fund);
    unitCostBase[id] = { unitPrice: 1, priceBasis: "NAV per unit", opening: {} };
    taxAdjustments[id] = zeroAdjustments(data, fund.market);
    if (fund.market === "SG") sgLedger[id] = { exempt: 0, capital: 0, afterTax: 0 };
    audits.push({ fundId: id, action: "Fund imported", detail: `${fund.name} · ${fund.periodLabel}` });
  }

  return {
    ok: true,
    data: {
      ...data,
      funds: [...data.funds, ...funds],
      unitCostBase,
      taxAdjustments,
      sgLedger,
      audit: appendAudit(data, ctx, audits),
    },
  };
}
