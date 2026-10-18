// OWNER: Assets & allowances agent (F3). Public selectors and view models for this feature.
import { computeBorrowingExpenseSchedule } from "../../engine/au/borrowingCosts.ts";
import { computeCapitalWorksDeduction, computeCapitalWorksSchedule, type CapitalWorksAssetInput } from "../../engine/au/capitalWorks.ts";
import { computeDepreciation, computeDepreciationSchedule, type DepreciatingAssetInput } from "../../engine/au/depreciation.ts";
import { computeCapitalAllowances, type CapitalAssetRecord } from "../../engine/capitalAllowances.ts";
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
} from "./types.ts";
export type * from "./types.ts";

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  AU_DIV40: "Division 40 plant",
  AU_DIV43: "Division 43 capital works",
  SG_PLANT: "Singapore capital allowances",
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
    deduction: 0,
    closingWrittenDownValue: 0,
    disposalDate: asset.disposalDate ?? null,
    disposalProceeds: asset.disposalProceeds ?? null,
    note,
  };
}

function assetRows(data: AppData, fund: Fund): { rows: AssetRegisterRow[]; warnings: string[] } {
  const year = incomeYear(fund);
  const ya = sgYear(fund);
  const properties = new Map(data.properties.map((p) => [p.id, p]));
  const assets = data.assets.filter((a) => a.fundId === fund.id);
  const warnings: string[] = [];
  const rows: AssetRegisterRow[] = [];

  for (const asset of assets) {
    const propertyName = asset.propertyId ? (properties.get(asset.propertyId)?.name ?? "Unknown property") : "Fund level";
    try {
      if (asset.kind === "AU_DIV40") {
        const result = computeDepreciation({ incomeYear: year, asset: div40Input(asset) });
        warnings.push(...result.findings.map((f) => f.message));
        rows.push({
          ...emptyRow(asset, propertyName, ""),
          basis: "Div 40 ITAA 1997 · s40-25",
          openingWrittenDownValue: result.line.openingAdjustableValue,
          deduction: result.line.deductionAllowed + result.line.balancingAdjustmentDeduction - result.line.balancingAdjustmentIncome,
          closingWrittenDownValue: result.line.closingAdjustableValue,
          note: result.line.note ?? null,
        });
      } else if (asset.kind === "AU_DIV43") {
        const result = computeCapitalWorksDeduction({ incomeYear: year, asset: div43Input(asset) });
        warnings.push(...result.findings.map((f) => f.message));
        rows.push({
          ...emptyRow(asset, propertyName, ""),
          basis: "Div 43 ITAA 1997 · s43-10",
          openingWrittenDownValue: result.line.openingUndeductedConstructionExpenditure,
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

  if (fund.market === "SG") {
    const sgAssets = assets.filter((a): a is SgPlantAsset => a.kind === "SG_PLANT");
    try {
      const { month, day } = fye(fund);
      const result = computeCapitalAllowances({ fromYa: ya, toYa: ya, financialYearEndMonth: month, financialYearEndDay: day, assets: sgAssets.map(sgInput), entityKind: "PROPERTY_FUND" });
      warnings.push(...result.findings.map((f) => f.message));
      for (const asset of sgAssets) {
        const propertyName = asset.propertyId ? (properties.get(asset.propertyId)?.name ?? "Unknown property") : "Fund level";
        const line = result.assetLines.find((l) => l.assetId === asset.id && l.ya === ya);
        rows.push({
          ...emptyRow(asset, propertyName, ""),
          basis: `Income Tax Act · ${asset.regime}`,
          openingWrittenDownValue: line?.openingTaxWrittenDownValue ?? 0,
          deduction: line ? line.allowanceClaimed + line.balancingAllowance - line.balancingCharge : 0,
          closingWrittenDownValue: line?.closingTaxWrittenDownValue ?? 0,
          note: line?.note ?? null,
        });
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      for (const asset of sgAssets) rows.push(emptyRow(asset, asset.propertyId ? (properties.get(asset.propertyId)?.name ?? "Unknown property") : "Fund level", "Calculation failed; review the asset inputs."));
    }
  }

  return { rows, warnings };
}

function totals(rows: readonly AssetRegisterRow[]): AssetKindTotal[] {
  const order: AssetKind[] = ["AU_DIV40", "AU_DIV43", "SG_PLANT", "AU_BORROWING"];
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
    : [make("capitalAllowances", "Capital allowances", amount("SG_PLANT"))];
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
      for (const s of schedule.summaries) lines.push({ year: String(s.incomeYear), kind: "AU_DIV40", label: "Division 40 plant", deduction: s.totalDeclineInValueDeduction + s.totalBalancingAdjustmentDeduction - s.totalBalancingAdjustmentIncome });
    }
    if (div43.length) {
      const schedule = computeCapitalWorksSchedule({ fromIncomeYear: from, toIncomeYear: to, assets: div43 });
      for (const s of schedule.summaries) lines.push({ year: String(s.incomeYear), kind: "AU_DIV43", label: "Division 43 capital works", deduction: s.totalDeduction });
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
        lines.push({ year: String(year), kind: "AU_BORROWING", label: "Borrowing costs", deduction });
      }
    }
  } else {
    const from = sgYear(fund);
    const { month, day } = fye(fund);
    const sgAssets = assets.filter((a): a is SgPlantAsset => a.kind === "SG_PLANT").map(sgInput);
    const schedule = computeCapitalAllowances({ fromYa: from, toYa: from + 9, financialYearEndMonth: month, financialYearEndDay: day, assets: sgAssets, entityKind: "PROPERTY_FUND" });
    for (const s of schedule.yaSummaries) lines.push({ year: `YA${s.ya}`, kind: "SG_PLANT", label: "Singapore capital allowances", deduction: s.totalDeductions - s.totalAdditions });
  }
  return lines.sort((a, b) => a.year.localeCompare(b.year) || a.kind.localeCompare(b.kind));
}

function csvModel(fund: Fund, rows: readonly AssetRegisterRow[]) {
  return {
    fileName: `${slug(fund.name)}-asset-register.csv`,
    columns: ["Property", "Kind", "Description", "Cost", "Start date", "Basis", "Opening WDV", "Deduction", "Closing WDV", "Disposal date", "Disposal proceeds"],
    rows: rows.map((r) => [r.propertyName, r.kindLabel, r.description, r.cost / 100, r.startDate, r.basis, r.openingWrittenDownValue / 100, r.deduction / 100, r.closingWrittenDownValue / 100, r.disposalDate ?? "", r.disposalProceeds === null ? "" : r.disposalProceeds / 100]),
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
          { key: "deduction", label: "Deduction", align: "right" },
          { key: "closing", label: "Closing WDV", align: "right" },
        ],
        rows: rows.map((r) => ({ asset: r.description, kind: r.kindLabel, basis: r.basis, deduction: money(r.deduction, currency, 2), closing: money(r.closingWrittenDownValue, currency, 2) })),
      },
      {
        kind: "table",
        title: "Future schedule",
        columns: [
          { key: "year", label: "Year" },
          { key: "kind", label: "Kind" },
          { key: "deduction", label: "Deduction", align: "right" },
        ],
        rows: schedule.map((r) => ({ year: r.year, kind: r.label, deduction: money(r.deduction, currency, 2) })),
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
