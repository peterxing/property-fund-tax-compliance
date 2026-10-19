// OWNER: Assets & allowances agent (F3). Public selectors and view models for this feature.
import { computeBorrowingExpenseSchedule } from "../../engine/au/borrowingCosts.ts";
import { computeCapitalWorksDeduction, computeCapitalWorksSchedule, type CapitalWorksAssetInput } from "../../engine/au/capitalWorks.ts";
import { computeDepreciation, computeDepreciationSchedule, type DepreciatingAssetInput } from "../../engine/au/depreciation.ts";
import { computeCapitalAllowances, type CapitalAssetRecord, type RenovationAllowanceRecord } from "../../engine/capitalAllowances.ts";
import { dateLabel, money, slug } from "../format.ts";
import type { AppData, Cents, Ctx, DocModel, Fund, FundId } from "../types.ts";
import type {
  AssetKind,
  AssetKindTotal,
  AssetRegisterRow,
  AssetRegisterView,
  AssetScheduleLine,
  AuBorrowingCostAsset,
  AuDiv40Asset,
  AuDiv43Asset,
  FixedAsset,
  RegisterTrialBalanceComparison,
  SgPlantAsset,
  SgRenovationAsset,
} from "./types.ts";
export type * from "./types.ts";

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  AU_DIV40: "Division 40 plant",
  AU_DIV43: "Division 43 capital works",
  SG_PLANT: "Singapore capital allowances",
  SG_RR: "Singapore s14N renovation & refurbishment",
  AU_BORROWING: "Borrowing costs",
};

function incomeYear(fund: Fund): number {
  return Number(fund.periodEnd.slice(0, 4));
}

function sgYear(fund: Fund): number {
  return fund.market === "SG" ? fund.assessmentYear : incomeYear(fund);
}

function fye(fund: Fund): { month: number; day: number } {
  return { month: Number(fund.periodEnd.slice(5, 7)), day: Number(fund.periodEnd.slice(8, 10)) };
}

function div40Input(asset: AuDiv40Asset): DepreciatingAssetInput {
  return {
    id: asset.id,
    label: asset.description,
    assetClassId: asset.assetClassId,
    cost: asset.cost,
    startDate: asset.startDate,
    method: asset.method,
    effectiveLifeYears: asset.effectiveLifeYears,
    taxableUseBps: asset.taxableUseBps,
    terminationDate: asset.disposalDate,
    terminationValue: asset.disposalProceeds,
    poolMethod: asset.poolMethod,
  };
}

function div43Input(asset: AuDiv43Asset): CapitalWorksAssetInput {
  return {
    id: asset.id,
    label: asset.description,
    buildingType: asset.buildingType,
    constructionStartDate: asset.constructionStartDate,
    constructionCompleteDate: asset.constructionCompleteDate,
    firstIncomeUseDate: asset.firstIncomeUseDate,
    acquisitionDate: asset.startDate,
    disposalDate: asset.disposalDate,
    constructionExpenditure: asset.constructionExpenditure,
    priorDivision43Claims: asset.priorDivision43Claims,
    taxableUseBps: asset.taxableUseBps,
    notes: asset.notes ? [asset.notes] : undefined,
  };
}

function sgInput(asset: SgPlantAsset): CapitalAssetRecord {
  return {
    id: asset.id,
    label: asset.description,
    regime: asset.regime,
    cost: asset.cost,
    acquisitionDate: asset.startDate,
    disposalDate: asset.disposalDate,
    disposalProceeds: asset.disposalProceeds,
    claimStartYa: asset.claimStartYa,
    prescribedWorkingLifeYears: asset.prescribedWorkingLifeYears,
    electedWorkingLifeYears: asset.electedWorkingLifeYears,
    claimInitialAllowance: asset.claimInitialAllowance,
  };
}

function sgRenovationInput(asset: SgRenovationAsset): RenovationAllowanceRecord {
  return {
    id: asset.id,
    label: asset.description,
    cost: asset.cost,
    incurredDate: asset.startDate,
    claimMode: asset.claimMode,
  };
}

function emptyRow(asset: FixedAsset, propertyName: string, note: string): AssetRegisterRow {
  return {
    id: asset.id,
    fundId: asset.fundId,
    propertyId: asset.propertyId,
    propertyName,
    kind: asset.kind,
    kindLabel: ASSET_KIND_LABEL[asset.kind],
    description: asset.description,
    cost: asset.cost,
    startDate: asset.startDate,
    basis: "Review required",
    openingWrittenDownValue: 0,
    baseDeduction: 0,
    balancingAdjustmentIncome: 0,
    balancingAdjustmentDeduction: 0,
    deduction: 0,
    closingWrittenDownValue: 0,
    disposalDate: asset.disposalDate ?? null,
    disposalProceeds: asset.disposalProceeds ?? null,
    note,
    source: "asset",
  };
}

function assetRows(data: AppData, fund: Fund): { rows: AssetRegisterRow[]; warnings: string[] } {
  const year = incomeYear(fund);
  const ya = sgYear(fund);
  const properties = new Map(data.properties.map((p) => [p.id, p]));
  const assets = data.assets.filter((a) => a.fundId === fund.id);
  const warnings: string[] = [];
  const rows: AssetRegisterRow[] = [];
  let div40Lines = new Map<string, ReturnType<typeof computeDepreciationSchedule>["assetLines"][number]>();
  let lowValuePoolLine: ReturnType<typeof computeDepreciationSchedule>["assetLines"][number] | undefined;

  if (fund.market === "AU") {
    const div40Assets = assets.filter((a): a is AuDiv40Asset => a.kind === "AU_DIV40");
    if (div40Assets.length) {
      try {
        const schedule = computeDepreciationSchedule({ fromIncomeYear: year, toIncomeYear: year, assets: div40Assets.map(div40Input) });
        warnings.push(...schedule.findings.map((f) => f.message));
        div40Lines = new Map(schedule.assetLines.filter((line) => line.incomeYear === year && line.assetId !== "LOW_VALUE_POOL").map((line) => [line.assetId, line]));
        lowValuePoolLine = schedule.assetLines.find((line) => line.incomeYear === year && line.assetId === "LOW_VALUE_POOL");
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  for (const asset of assets) {
    const propertyName = asset.propertyId ? (properties.get(asset.propertyId)?.name ?? "Unknown property") : "Fund level";
    try {
      if (asset.kind === "AU_DIV40") {
        const line = asset.poolMethod === "LOW_VALUE_POOL" ? undefined : div40Lines.get(asset.id);
        rows.push({
          ...emptyRow(asset, propertyName, ""),
          kindLabel: asset.poolMethod === "LOW_VALUE_POOL" ? "Division 40 low-value pool asset" : ASSET_KIND_LABEL.AU_DIV40,
          basis: asset.poolMethod === "LOW_VALUE_POOL" ? "Subdivision 40-E ITAA 1997" : "Div 40 ITAA 1997 · s40-25; s40-285",
          openingWrittenDownValue: line?.openingAdjustableValue ?? 0,
          baseDeduction: line?.deductionAllowed ?? 0,
          balancingAdjustmentIncome: line?.balancingAdjustmentIncome ?? 0,
          balancingAdjustmentDeduction: line?.balancingAdjustmentDeduction ?? 0,
          deduction: line ? line.deductionAllowed + line.balancingAdjustmentDeduction - line.balancingAdjustmentIncome : 0,
          closingWrittenDownValue: line?.closingAdjustableValue ?? 0,
          note: asset.poolMethod === "LOW_VALUE_POOL" ? "Allocated to the low-value pool; the pool line carries the year's deduction." : (line?.note ?? null),
        });
      } else if (asset.kind === "AU_DIV43") {
        const result = computeCapitalWorksDeduction({ incomeYear: year, asset: div43Input(asset) });
        warnings.push(...result.findings.map((f) => f.message));
        rows.push({
          ...emptyRow(asset, propertyName, ""),
          basis: "Div 43 ITAA 1997 · s43-10",
          openingWrittenDownValue: result.line.openingUndeductedConstructionExpenditure,
          baseDeduction: result.line.deduction,
          deduction: result.line.deduction,
          closingWrittenDownValue: result.line.closingUndeductedConstructionExpenditure,
          note: `${result.line.rateBps / 100}% · ${result.line.daysClaimed} days`,
        });
      } else if (asset.kind === "AU_BORROWING") {
        const result = computeBorrowingExpenseSchedule({ amount: asset.cost, incurredDate: asset.startDate, loanEndDate: asset.loanEndDate, taxableUseBps: asset.taxableUseBps });
        const line = result.lines.find((l) => l.incomeYear === year);
        rows.push({
          ...emptyRow(asset, propertyName, ""),
          basis: "s25-25 ITAA 1997",
          openingWrittenDownValue: line?.openingUnclaimedAmount ?? 0,
          baseDeduction: line?.deduction ?? 0,
          deduction: line?.deduction ?? 0,
          closingWrittenDownValue: line?.closingUnclaimedAmount ?? 0,
          note: line ? `${line.relevantDays} relevant days` : null,
        });
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      rows.push(emptyRow(asset, propertyName, "Calculation failed; review the asset inputs."));
    }
  }

  if (lowValuePoolLine) {
    rows.push({
      id: "LOW_VALUE_POOL",
      fundId: fund.id,
      propertyId: null,
      propertyName: "Fund level",
      kind: "AU_DIV40",
      kindLabel: "Division 40 low-value pool",
      description: "Low-value pool",
      cost: 0,
      startDate: fund.periodStart,
      basis: "Subdivision 40-E ITAA 1997 · 18.75% additions / 37.5% opening pool",
      openingWrittenDownValue: lowValuePoolLine.openingAdjustableValue,
      baseDeduction: lowValuePoolLine.deductionAllowed,
      balancingAdjustmentIncome: lowValuePoolLine.balancingAdjustmentIncome,
      balancingAdjustmentDeduction: lowValuePoolLine.balancingAdjustmentDeduction,
      deduction: lowValuePoolLine.deductionAllowed + lowValuePoolLine.balancingAdjustmentDeduction - lowValuePoolLine.balancingAdjustmentIncome,
      closingWrittenDownValue: lowValuePoolLine.closingAdjustableValue,
      disposalDate: null,
      disposalProceeds: null,
      note: lowValuePoolLine.note ?? "Pooled assets use 18.75% in the allocation year and 37.5% of opening pool balances after that.",
      source: "pool",
    });
  }

  if (fund.market === "SG") {
    const sgAssets = assets.filter((a): a is SgPlantAsset => a.kind === "SG_PLANT");
    const rrAssets = assets.filter((a): a is SgRenovationAsset => a.kind === "SG_RR");
    try {
      const { month, day } = fye(fund);
      const result = computeCapitalAllowances({ fromYa: ya, toYa: ya, financialYearEndMonth: month, financialYearEndDay: day, assets: sgAssets.map(sgInput), renovationExpenditures: rrAssets.map(sgRenovationInput), entityKind: "REIT" });
      warnings.push(...result.findings.map((f) => f.message));
      for (const asset of [...sgAssets, ...rrAssets]) {
        const propertyName = asset.propertyId ? (properties.get(asset.propertyId)?.name ?? "Unknown property") : "Fund level";
        const line = result.assetLines.find((l) => l.assetId === asset.id && l.ya === ya);
        rows.push({
          ...emptyRow(asset, propertyName, ""),
          basis: asset.kind === "SG_RR" ? "Income Tax Act · s14N" : `Income Tax Act · ${asset.regime}`,
          openingWrittenDownValue: line?.openingTaxWrittenDownValue ?? 0,
          baseDeduction: line?.allowanceClaimed ?? 0,
          balancingAdjustmentIncome: line?.balancingCharge ?? 0,
          balancingAdjustmentDeduction: line?.balancingAllowance ?? 0,
          deduction: line ? line.allowanceClaimed + line.balancingAllowance - line.balancingCharge : 0,
          closingWrittenDownValue: line?.closingTaxWrittenDownValue ?? 0,
          note: asset.kind === "SG_RR" ? (line?.note ? `${line.note}; S$300,000 cap per 3-year period` : "Section 14N cap: S$300,000 per 3-year period") : (line?.note ?? null),
        });
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      for (const asset of [...sgAssets, ...rrAssets]) rows.push(emptyRow(asset, asset.propertyId ? (properties.get(asset.propertyId)?.name ?? "Unknown property") : "Fund level", "Calculation failed; review the asset inputs."));
    }
  }

  return { rows, warnings };
}

function totals(rows: readonly AssetRegisterRow[]): AssetKindTotal[] {
  const order: AssetKind[] = ["AU_DIV40", "AU_DIV43", "SG_PLANT", "SG_RR", "AU_BORROWING"];
  return order
    .map((kind) => {
      const own = rows.filter((row) => row.kind === kind);
      return {
        kind,
        label: ASSET_KIND_LABEL[kind],
        deduction: own.reduce((sum, row) => sum + row.deduction, 0),
        closingWrittenDownValue: own.reduce((sum, row) => sum + row.closingWrittenDownValue, 0),
        count: own.length,
      };
    })
    .filter((row) => row.count > 0);
}

export function registerVsTrialBalance(data: AppData, fundId: FundId, ctx?: Ctx): RegisterTrialBalanceComparison[] {
  const fund = data.funds.find((f) => f.id === fundId);
  if (!fund) throw new Error(`Unknown fund: ${fundId}`);
  const rows = assetRows(data, fund).rows;
  const totalByKind = totals(rows);
  const amount = (kind: AssetKind): Cents => totalByKind.find((t) => t.kind === kind)?.deduction ?? 0;
  const adjustments = data.taxAdjustments[fund.id] ?? {};
  const make = (key: RegisterTrialBalanceComparison["key"], label: string, register: Cents): RegisterTrialBalanceComparison => {
    const trialBalance = adjustments[key] ?? 0;
    return { key, label, register, trialBalance, difference: register - trialBalance, agrees: register === trialBalance };
  };
  void ctx;
  return fund.market === "AU"
    ? [make("div40", "Tax depreciation — Div 40", amount("AU_DIV40")), make("div43", "Capital works — Div 43", amount("AU_DIV43"))]
    : [make("capitalAllowances", "Capital allowances and s14N deductions", amount("SG_PLANT") + amount("SG_RR"))];
}

function scheduleLines(data: AppData, fund: Fund): AssetScheduleLine[] {
  const assets = data.assets.filter((a) => a.fundId === fund.id);
  const lines: AssetScheduleLine[] = [];
  if (fund.market === "AU") {
    const from = incomeYear(fund);
    const to = from + 9;
    const div40 = assets.filter((a): a is AuDiv40Asset => a.kind === "AU_DIV40").map(div40Input);
    const div43 = assets.filter((a): a is AuDiv43Asset => a.kind === "AU_DIV43").map(div43Input);
    const borrowing = assets.filter((a): a is AuBorrowingCostAsset => a.kind === "AU_BORROWING");
    if (div40.length) {
      const schedule = computeDepreciationSchedule({ fromIncomeYear: from, toIncomeYear: to, assets: div40 });
      for (const s of schedule.summaries) lines.push({ year: String(s.incomeYear), kind: "AU_DIV40", label: "Division 40 plant", baseDeduction: s.totalDeclineInValueDeduction, balancingAdjustmentIncome: s.totalBalancingAdjustmentIncome, balancingAdjustmentDeduction: s.totalBalancingAdjustmentDeduction, deduction: s.totalDeclineInValueDeduction + s.totalBalancingAdjustmentDeduction - s.totalBalancingAdjustmentIncome });
    }
    if (div43.length) {
      const schedule = computeCapitalWorksSchedule({ fromIncomeYear: from, toIncomeYear: to, assets: div43 });
      for (const s of schedule.summaries) lines.push({ year: String(s.incomeYear), kind: "AU_DIV43", label: "Division 43 capital works", baseDeduction: s.totalDeduction, balancingAdjustmentIncome: 0, balancingAdjustmentDeduction: 0, deduction: s.totalDeduction });
    }
    if (borrowing.length) {
      const byYear = new Map<number, Cents>();
      for (const asset of borrowing) {
        const schedule = computeBorrowingExpenseSchedule({ amount: asset.cost, incurredDate: asset.startDate, loanEndDate: asset.loanEndDate, taxableUseBps: asset.taxableUseBps });
        for (const line of schedule.lines) {
          if (line.incomeYear < from || line.incomeYear > to) continue;
          byYear.set(line.incomeYear, (byYear.get(line.incomeYear) ?? 0) + line.deduction);
        }
      }
      for (const [year, deduction] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
        lines.push({ year: String(year), kind: "AU_BORROWING", label: "Borrowing costs", baseDeduction: deduction, balancingAdjustmentIncome: 0, balancingAdjustmentDeduction: 0, deduction });
      }
    }
  } else {
    const from = sgYear(fund);
    const { month, day } = fye(fund);
    const sgAssets = assets.filter((a): a is SgPlantAsset => a.kind === "SG_PLANT").map(sgInput);
    const rrAssets = assets.filter((a): a is SgRenovationAsset => a.kind === "SG_RR").map(sgRenovationInput);
    const schedule = computeCapitalAllowances({ fromYa: from, toYa: from + 9, financialYearEndMonth: month, financialYearEndDay: day, assets: sgAssets, renovationExpenditures: rrAssets, entityKind: "REIT" });
    for (const s of schedule.yaSummaries) {
      const allowanceDeduction = s.capitalAllowances + s.section19bAllowances + s.industrialBuildingAllowance + s.liaAllowance + s.balancingAllowance - s.balancingCharge;
      lines.push({ year: `YA${s.ya}`, kind: "SG_PLANT", label: "Singapore capital allowances", baseDeduction: s.capitalAllowances + s.section19bAllowances + s.industrialBuildingAllowance + s.liaAllowance, balancingAdjustmentIncome: s.balancingCharge, balancingAdjustmentDeduction: s.balancingAllowance, deduction: allowanceDeduction });
      if (s.section14nDeduction !== 0) lines.push({ year: `YA${s.ya}`, kind: "SG_RR", label: "Section 14N renovation & refurbishment", baseDeduction: s.section14nDeduction, balancingAdjustmentIncome: 0, balancingAdjustmentDeduction: 0, deduction: s.section14nDeduction });
    }
  }
  return lines.sort((a, b) => a.year.localeCompare(b.year) || a.kind.localeCompare(b.kind));
}

function csvModel(fund: Fund, rows: readonly AssetRegisterRow[]) {
  return {
    fileName: `${slug(fund.name)}-asset-register.csv`,
    columns: ["Property", "Kind", "Description", "Cost", "Start date", "Basis", "Opening WDV", "Base deduction", "Balancing income / charge", "Balancing deduction / allowance", "Net deduction", "Closing WDV", "Disposal date", "Disposal proceeds"],
    rows: rows.map((r) => [r.propertyName, r.kindLabel, r.description, r.cost / 100, r.startDate, r.basis, r.openingWrittenDownValue / 100, r.baseDeduction / 100, r.balancingAdjustmentIncome / 100, r.balancingAdjustmentDeduction / 100, r.deduction / 100, r.closingWrittenDownValue / 100, r.disposalDate ?? "", r.disposalProceeds === null ? "" : r.disposalProceeds / 100]),
  };
}

function docModel(fund: Fund, rows: readonly AssetRegisterRow[], schedule: readonly AssetScheduleLine[]): DocModel {
  const currency = fund.currency;
  return {
    fileName: `${slug(fund.name)}-asset-allowance-schedule.pdf`,
    title: "Asset allowance schedule",
    subtitle: fund.name,
    meta: [
      { label: "Period", value: fund.periodLabel },
      { label: "Basis", value: fund.market === "AU" ? "Division 40, Division 43 and s25-25 calculations from the engine" : "Singapore capital allowance calculations from the engine" },
    ],
    blocks: [
      {
        kind: "table",
        title: "This period",
        columns: [
          { key: "asset", label: "Asset" },
          { key: "kind", label: "Kind" },
          { key: "basis", label: "Basis" },
          { key: "base", label: "Base deduction", align: "right" },
          { key: "balancing", label: "Balancing adjustment", align: "right" },
          { key: "deduction", label: "Net deduction", align: "right" },
          { key: "closing", label: "Closing WDV", align: "right" },
        ],
        rows: rows.map((r) => ({ asset: r.description, kind: r.kindLabel, basis: r.basis, base: money(r.baseDeduction, currency, 2), balancing: money(r.balancingAdjustmentDeduction - r.balancingAdjustmentIncome, currency, 2), deduction: money(r.deduction, currency, 2), closing: money(r.closingWrittenDownValue, currency, 2) })),
      },
      {
        kind: "table",
        title: "Future schedule",
        columns: [
          { key: "year", label: "Year" },
          { key: "kind", label: "Kind" },
          { key: "base", label: "Base deduction", align: "right" },
          { key: "balancing", label: "Balancing adjustment", align: "right" },
          { key: "deduction", label: "Net deduction", align: "right" },
        ],
        rows: schedule.map((r) => ({ year: r.year, kind: r.label, base: money(r.baseDeduction, currency, 2), balancing: money(r.balancingAdjustmentDeduction - r.balancingAdjustmentIncome, currency, 2), deduction: money(r.deduction, currency, 2) })),
      },
    ],
    footnotes: ["Demonstration only. No tax adviser has reviewed these rules or seeded facts.", "Amounts are calculated in cents; return labels may require statutory rounding."],
  };
}

export function assetRegisterView(data: AppData, fundId: FundId, ctx?: Ctx): AssetRegisterView {
  const fund = data.funds.find((f) => f.id === fundId);
  if (!fund) throw new Error(`Unknown fund: ${fundId}`);
  const computed = assetRows(data, fund);
  const schedule = scheduleLines(data, fund);
  void ctx;
  return {
    fundId,
    market: fund.market,
    rows: computed.rows.sort((a, b) => a.propertyName.localeCompare(b.propertyName) || a.kind.localeCompare(b.kind) || a.description.localeCompare(b.description)),
    totals: totals(computed.rows),
    comparisons: registerVsTrialBalance(data, fundId),
    schedule,
    csv: csvModel(fund, computed.rows),
    scheduleDoc: docModel(fund, computed.rows, schedule),
    warnings: computed.warnings,
  };
}
