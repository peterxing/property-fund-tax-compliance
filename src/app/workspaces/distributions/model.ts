// What the Distributions workspace shows, as plain strings and numbers: the key figures, the components table, the amount boxes and
// the messages around them. No React in here, so Node tests can import it.
import { centsPerUnit, money, pct, perUnit, ratePct } from "../../../domain/format.ts";
// The trustee rate and the payout threshold belong to the engine's REIT rules, so they are read back from it instead of repeated here.
import { trusteePosition } from "../../../domain/sg/withholding.ts";
import type {
  Action,
  AuFund,
  AuInputs,
  Cents,
  ComponentLine,
  Currency,
  DestinationDef,
  Fund,
  FundCalc,
  Market,
  SgFund,
  SgInputs,
  WorkflowView,
} from "../../../domain/types.ts";
import { parseMoneyDraft, type ParseResult } from "../../ui/inputParsing.ts";

/** How the table writes an amount of nothing. */
export const NIL = "\u2013";
/** Cents per unit in the table: four decimal places, as in the reference. */
export const PER_UNIT_DECIMALS = 4;

/** Amounts are shown to the whole dollar; nothing at all is a dash rather than "A$0". Negative amounts keep the typographic minus. */
export function amountText(cents: Cents, currency: Currency): string {
  return cents === 0 ? NIL : money(cents, currency);
}

export function perUnitText(value: number): string {
  return value === 0 ? NIL : perUnit(value, PER_UNIT_DECIMALS);
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

// ---------------------------------------------------------------------------------------------------- key figures
export type KpiTone = "default" | "good" | "warn" | "bad";

export interface KpiModel {
  id: string;
  label: string;
  value: string;
  /** A second figure set beside the value, e.g. "2.0467 c/unit". */
  unit?: string;
  sub: string;
  tone: KpiTone;
}

export const COST_BASE_EXCESS = "Excess — members decrease their cost base";
export const COST_BASE_SHORTFALL = "Shortfall — members increase their cost base";
export const COST_BASE_UNCHANGED = "No adjustment to members' cost base";

export function foreignHoldersText(count: number): string {
  if (count === 0) return "No foreign holders on the register";
  return `${count} foreign ${count === 1 ? "holder" : "holders"} on the register`;
}

function auKpis(fund: AuFund, calc: FundCalc): KpiModel[] {
  const facts = calc.au;
  if (!facts) return [];
  const net = facts.costBaseNet;
  return [
    {
      id: "fund-payment",
      label: "Fund payment",
      value: money(facts.fundPayment, fund.currency),
      sub: "Australian income excluding interest, with TARP gains grossed up",
      tone: "default",
    },
    {
      id: "cost-base-net",
      label: "AMIT cost base net amount",
      // The sign is carried by the line underneath, so the figure itself is the size of the adjustment.
      value: money(Math.abs(net), fund.currency),
      unit: `${perUnit(centsPerUnit(Math.abs(net), fund.unitsOnIssue), PER_UNIT_DECIMALS)} c/unit`,
      sub: net > 0 ? COST_BASE_EXCESS : net < 0 ? COST_BASE_SHORTFALL : COST_BASE_UNCHANGED,
      tone: "default",
    },
    {
      id: "withholding",
      label: "Withholding computed",
      value: money(calc.withheld, fund.currency),
      sub: foreignHoldersText(facts.foreignHolderCount),
      tone: "default",
    },
  ];
}

function sgKpis(fund: SgFund, calc: FundCalc): KpiModel[] {
  const facts = calc.sg;
  if (!facts) return [];
  const position = trusteePosition(fund.periodEnd, fund.inputs.taxableSpecifiedIncome, fund.inputs.taxableDistributed);
  return [
    {
      id: "taxable-specified-income",
      label: "Taxable specified income",
      value: money(fund.inputs.taxableSpecifiedIncome, fund.currency),
      sub: "Per the period's tax computation",
      tone: "default",
    },
    {
      id: "taxable-payout",
      label: "Taxable payout",
      value: facts.payoutRatio === null ? NIL : pct(facts.payoutRatio * 100, 1),
      sub: `Tax transparency needs at least ${pct(position.thresholdPct, 0)} for the year`,
      tone: facts.payoutRatio !== null && !position.passes ? "warn" : "default",
    },
    {
      id: "trustee-tax",
      label: "Trustee tax on retained income",
      value: money(facts.trusteeTax, fund.currency),
      sub: `${ratePct(position.rate)} of ${money(facts.retained, fund.currency)} retained`,
      tone: "default",
    },
  ];
}

/** The three key figures under the table, by market. */
export function kpiModels(fund: Fund, calc: FundCalc): KpiModel[] {
  return fund.market === "AU" ? auKpis(fund, calc) : sgKpis(fund, calc);
}

// ---------------------------------------------------------------------------------------------------- components table
export type DestinationKey = DestinationDef["key"];

export interface TableColumn {
  key: DestinationKey;
  label: string;
}

export interface TableRow {
  key: string;
  label: string;
  /** The line under the label: how the component is treated for withholding. */
  treatment: string;
  attributed: boolean;
  amount: string;
  perUnit: string;
  /** One entry per table column. */
  cells: string[];
}

export interface TotalRow {
  label: string;
  amount: string;
  perUnit: string;
  cells: string[];
}

export interface CashRow {
  label: string;
  note: string;
  amount: string;
  perUnit: string;
}

export interface DistributionTable {
  columns: TableColumn[];
  /** Only the components with something to show. Empty when none has, and the table then says why (see `emptyTableMessage`). */
  rows: TableRow[];
  total: TotalRow;
  /** Australian funds also show the cash paid, under the total; Singapore funds do not. */
  cash: CashRow | null;
}

const DESTINATION_AMOUNT: Record<DestinationKey, (line: ComponentLine) => Cents> = {
  gross: (line) => line.toGross,
  net: (line) => line.toNet,
  withheld: (line) => line.withheld,
  unallocated: (line) => line.unallocated,
};

/** One column per destination, except "Units not on register", which only appears when some of the distribution is going there. */
export function tableColumns(calc: FundCalc): TableColumn[] {
  const hasUnallocated = calc.components.some((line) => line.unallocated !== 0);
  return calc.destinations.filter((d) => d.key !== "unallocated" || hasUnallocated).map((d) => ({ key: d.key, label: d.label }));
}

/** A component earns a row when it has an amount, or (which cannot normally happen) a figure in one of the columns shown. */
function hasFigures(line: ComponentLine, columns: readonly TableColumn[]): boolean {
  return line.amount !== 0 || columns.some((column) => DESTINATION_AMOUNT[column.key](line) !== 0);
}

/**
 * The rows of the "Distribution by tax character" table. Like the reference, it lists only the components that have an amount, in the
 * module's order; the boxes under "Distribution inputs" still cover every input. The total row is the module's total by tax character:
 * every line, including the AMIT CGT gross-up amount and the other non-attributable amounts, as the reference adds them. The lines left
 * out are nil, so the rows shown still add up to it.
 */
export function distributionTable(fund: Fund, calc: FundCalc): DistributionTable {
  const currency = calc.currency;
  const columns = tableColumns(calc);
  const rows = calc.components
    .filter((line) => hasFigures(line, columns))
    .map(
      (line): TableRow => ({
        key: line.key,
        label: line.label,
        treatment: line.treatment,
        attributed: line.attributed,
        amount: amountText(line.amount, currency),
        perUnit: perUnitText(line.centsPerUnit),
        cells: columns.map((column) => amountText(DESTINATION_AMOUNT[column.key](line), currency)),
      }),
    );
  const total: TotalRow = {
    label: calc.market === "AU" ? "Total by tax character" : "Total distribution",
    amount: amountText(calc.characterTotal, currency),
    perUnit: perUnitText(centsPerUnit(calc.characterTotal, fund.unitsOnIssue)),
    cells: columns.map((column) => amountText(sum(calc.components.map(DESTINATION_AMOUNT[column.key])), currency)),
  };
  const cash: CashRow | null =
    calc.market === "AU"
      ? {
          label: "Cash distribution",
          note: "Paid for the income year",
          amount: amountText(calc.cash, currency),
          perUnit: perUnitText(centsPerUnit(calc.cash, fund.unitsOnIssue)),
        }
      : null;
  return { columns, rows, total, cash };
}

// ---------------------------------------------------------------------------------------------------- lock note and empty-state messages
export interface PanelNote {
  kind: "editing" | "locked";
  text: string;
}

export const EDITING_HINT = "Editable — change the amounts under Distribution inputs";

/** The note in the panel header: why the figures are read-only ("Signed off — reopen to edit"), or a hint that they can be edited. */
export function panelNote(workflow: Pick<WorkflowView, "can" | "lockedReason">): PanelNote | null {
  if (workflow.can.edit) return { kind: "editing", text: EDITING_HINT };
  return workflow.lockedReason ? { kind: "locked", text: workflow.lockedReason } : null;
}

export function emptyChartMessage(canEdit: boolean): string {
  const base = "Nothing to chart yet: no distribution amounts have been entered.";
  return canEdit ? `${base} Add them under Distribution inputs.` : base;
}

/** The one row that stands in for the components when every amount is nil, e.g. after a preparer clears the boxes. */
export function emptyTableMessage(canEdit: boolean): string {
  const base = "No amounts yet.";
  return canEdit ? `${base} Enter the distribution inputs below.` : base;
}

// ---------------------------------------------------------------------------------------------------- distribution inputs
export type InputKey = keyof AuInputs | keyof SgInputs;

export interface InputField {
  key: InputKey;
  label: string;
  hint: string;
}

// The labels are the ones the audit trail uses ("Clean building MIT income updated"); a test keeps the two in step.
const AU_FIELDS: readonly InputField[] = [
  { key: "cashDistribution", label: "Cash distribution", hint: "Total cash paid to members for the income year." },
  { key: "ausOtherIncome", label: "Australian income — other", hint: "Australian income that is not interest, NCMI or clean building income." },
  { key: "ncmi", label: "Non-concessional MIT income", hint: "The part of the fund payment that is non-concessional MIT income (NCMI)." },
  {
    key: "excludedNcmi",
    label: "Excluded from NCMI — transitional",
    hint: "Cross-staple rent that the transitional rules keep out of NCMI.",
  },
  { key: "cleanBuilding", label: "Clean building MIT income", hint: "Income from clean building MIT investments." },
  { key: "interest", label: "Australian interest", hint: "Interest in the distribution. It has its own withholding rule, separate from fund payment." },
  {
    key: "discountGainTarp",
    label: "Discounted capital gains — TARP",
    hint: "Gain after the discount. The AMIT CGT gross-up amount equals this figure and is added to it in the fund payment.",
  },
  {
    key: "otherGainTarp",
    label: "Other capital gains — TARP",
    hint: "Gains on taxable Australian real property that get no discount.",
  },
  { key: "foreignIncome", label: "Assessable foreign income", hint: "Income from outside Australia. No Australian withholding applies." },
];

const SG_FIELDS: readonly InputField[] = [
  {
    key: "taxableSpecifiedIncome",
    label: "Taxable specified income",
    hint: "From the period's tax computation. It sets the payout test and the trustee tax on retained income.",
  },
  {
    key: "taxableDistributed",
    label: "Taxable income distribution",
    hint: "Taxable income paid to unitholders. Compared with taxable specified income for the payout test.",
  },
  { key: "taxExemptDistribution", label: "Tax-exempt income distribution", hint: "Tax-exempt income paid to unitholders. No withholding applies." },
  { key: "capitalDistribution", label: "Capital distribution", hint: "A return of capital. Not taxable, and no withholding applies." },
];

export function inputFields(market: Market): readonly InputField[] {
  return market === "AU" ? AU_FIELDS : SG_FIELDS;
}

/** The amount currently saved behind a box. */
export function inputValue(fund: Fund, key: InputKey): Cents {
  const saved: Partial<Record<InputKey, Cents>> = fund.inputs;
  return saved[key] ?? 0;
}

/** What every amount box here accepts: zero or more, never empty, in whole cents. The boxes and the tests share these. */
export const AMOUNT_RULES = { min: 0 as Cents, allowEmpty: false } as const;

/** Text typed into an amount box -> cents, or the message shown under the box. */
export function parseAmount(text: string, currency: Currency): ParseResult<Cents> {
  const parsed = parseMoneyDraft(text, { currency, ...AMOUNT_RULES });
  if (!parsed.ok) return parsed;
  return parsed.value === null ? { ok: false, message: "Enter an amount, for example 1,250,000." } : { ok: true, value: parsed.value };
}

/** The action that saves one committed box, or null when there is nothing to save (the same amount, no amount, or a box this fund lacks). */
export function inputAction(fund: Fund, key: InputKey, cents: Cents | null): Action | null {
  if (cents === null || !inputFields(fund.market).some((field) => field.key === key)) return null;
  if (cents === inputValue(fund, key)) return null;
  const inputs: Partial<AuInputs> | Partial<SgInputs> = { [key]: cents };
  return { type: "update-inputs", fundId: fund.id, inputs };
}

/** What the live region says after a save. */
export function savedMessage(field: InputField): string {
  return `Saved: ${field.label}`;
}

export const INPUTS_INTRO =
  "Each amount saves when you leave the box or press Enter; Escape puts back the saved figure. The chart, table and key figures update straight away.";
