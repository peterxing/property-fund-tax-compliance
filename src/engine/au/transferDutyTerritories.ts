// OWNER: Territories agent (v3 G1). Transfer duty for Tasmania, the ACT and the Northern Territory. transferDuty.ts dispatches TAS, ACT
// and NT here: list a state in TERRITORY_TRANSFER_STATES once its rates are modelled, return its foreign-purchaser surcharge (if any) from
// territorySurchargeRate, and add its cited rules to TERRITORY_TRANSFER_RULES (they join transferDuty.ts RULES).
import type { ISODate } from "../dates.ts";
import type { Cents } from "../money.ts";
import { floorToDollar } from "../money.ts";
import type { RuleEntry } from "../rules.ts";
import { pickEffective, requireEffective } from "../rules.ts";
import type { ComputationLine } from "../types.ts";
import {
  computeScheduledDuty,
  line,
  longDate,
  rateToText,
  type ForeignSurchargeRate,
  type TransferSchedule,
} from "./dutyCommon.ts";
import type { AuState } from "./types.ts";

export type TerritoryState = Extract<AuState, "TAS" | "ACT" | "NT">;

export const TERRITORY_TRANSFER_STATES: readonly TerritoryState[] = ["TAS", "ACT", "NT"];

const TAS_TRANSFER_SCHEDULES: readonly { from: ISODate; to?: ISODate; value: TransferSchedule }[] = [
  {
    from: "2013-10-21",
    value: {
      ruleVersion: "tas.transfer.2013-10-21",
      minimumDuty: 5_000,
      bands: [
        { from: 0, to: 300_000, baseDuty: 0, excessFrom: 0, rateBps: 0, label: "Not more than A$3,000" },
        { from: 300_001, to: 2_500_000, baseDuty: 5_000, excessFrom: 300_000, ratePer100: 175, label: "A$3,001 to A$25,000" },
        { from: 2_500_001, to: 7_500_000, baseDuty: 43_500, excessFrom: 2_500_000, ratePer100: 225, label: "A$25,001 to A$75,000" },
        { from: 7_500_001, to: 20_000_000, baseDuty: 156_000, excessFrom: 7_500_000, ratePer100: 350, label: "A$75,001 to A$200,000" },
        { from: 20_000_001, to: 37_500_000, baseDuty: 593_500, excessFrom: 20_000_000, ratePer100: 400, label: "A$200,001 to A$375,000" },
        { from: 37_500_001, to: 72_500_000, baseDuty: 1_293_500, excessFrom: 37_500_000, ratePer100: 425, label: "A$375,001 to A$725,000" },
        { from: 72_500_001, baseDuty: 2_781_000, excessFrom: 72_500_000, ratePer100: 450, label: "More than A$725,000" },
      ],
    },
  },
];

const TAS_FOREIGN_SURCHARGE_RATES: readonly { from: ISODate; to?: ISODate; value: ForeignSurchargeRate }[] = [
  { from: "2020-04-01", value: { ruleVersion: "tas.surcharge.2020-04-01", rateBps: 800 } },
  { from: "2018-07-01", to: "2020-03-31", value: { ruleVersion: "tas.surcharge.2018-07-01", rateBps: 300 } },
];

const ACT_RESIDENTIAL_TRANSFER_SCHEDULES: readonly { from: ISODate; to?: ISODate; value: TransferSchedule }[] = [
  {
    from: "2022-07-01",
    value: {
      ruleVersion: "act.transfer.residential.2022-07-01",
      minimumDuty: 0,
      bands: [
        { from: 0, to: 20_000_000, baseDuty: 0, excessFrom: 0, rateBps: 120, label: "A$0 to A$200,000" },
        { from: 20_000_001, to: 30_000_000, baseDuty: 240_000, excessFrom: 20_000_000, rateBps: 220, label: "A$200,001 to A$300,000" },
        { from: 30_000_001, to: 50_000_000, baseDuty: 460_000, excessFrom: 30_000_000, rateBps: 340, label: "A$300,001 to A$500,000" },
        { from: 50_000_001, to: 75_000_000, baseDuty: 1_140_000, excessFrom: 50_000_000, rateBps: 432, label: "A$500,001 to A$750,000" },
        { from: 75_000_001, to: 100_000_000, baseDuty: 2_220_000, excessFrom: 75_000_000, rateBps: 590, label: "A$750,001 to A$1,000,000" },
        { from: 100_000_001, to: 145_500_000, baseDuty: 3_695_000, excessFrom: 100_000_000, rateBps: 640, label: "A$1,000,001 to A$1,455,000" },
        { from: 145_500_001, baseDuty: 6_607_000, excessFrom: 145_500_000, rateBps: 454, label: "More than A$1,455,000" },
      ],
    },
  },
];

const ACT_COMMERCIAL_TRANSFER_SCHEDULES: readonly { from: ISODate; to?: ISODate; value: TransferSchedule }[] = [
  { from: "2026-07-01", value: commercialActSchedule("act.transfer.commercial.2026-07-01", 210_000_000) },
  { from: "2025-07-01", to: "2026-06-30", value: commercialActSchedule("act.transfer.commercial.2025-07-01", 200_000_000) },
  { from: "2024-07-01", to: "2025-06-30", value: commercialActSchedule("act.transfer.commercial.2024-07-01", 190_000_000) },
  { from: "2023-07-01", to: "2024-06-30", value: commercialActSchedule("act.transfer.commercial.2023-07-01", 180_000_000) },
  { from: "2022-07-01", to: "2023-06-30", value: commercialActSchedule("act.transfer.commercial.2022-07-01", 170_000_000) },
];

function commercialActSchedule(ruleVersion: string, threshold: Cents): TransferSchedule {
  return {
    ruleVersion,
    minimumDuty: 0,
    bands: [
      { from: 0, to: threshold, baseDuty: 0, excessFrom: 0, rateBps: 0, label: `Not more than A$${(threshold / 100).toLocaleString("en-AU")}` },
      { from: threshold + 1, baseDuty: 0, excessFrom: threshold, rateBps: 500, label: `More than A$${(threshold / 100).toLocaleString("en-AU")}` },
    ],
  };
}

function computeTasTransferDuty(date: ISODate, dutiableValue: Cents): { duty: Cents; lines: ComputationLine[]; ruleVersion: string } {
  const schedule = requireEffective(TAS_TRANSFER_SCHEDULES, date, "Tasmanian property transfer duty");
  const band = computeScheduledDuty(schedule, dutiableValue);
  return {
    duty: band.duty,
    lines: [line("AU.TAS.TRANSFER.BASE", `Tasmanian transfer-duty scale (${band.band.label})`, band.duty, rateToText(band.band))],
    ruleVersion: schedule.ruleVersion,
  };
}

function computeActComponentDuty(date: ISODate, value: Cents, kind: "residential" | "commercial"): { duty: Cents; line: ComputationLine; ruleVersion: string } {
  const schedule = kind === "residential"
    ? requireEffective(ACT_RESIDENTIAL_TRANSFER_SCHEDULES, date, "ACT residential conveyance duty")
    : requireEffective(ACT_COMMERCIAL_TRANSFER_SCHEDULES, date, "ACT commercial conveyance duty");
  const band = computeScheduledDuty(schedule, value);
  return {
    duty: band.duty,
    line: line(kind === "residential" ? "AU.ACT.TRANSFER.RESIDENTIAL" : "AU.ACT.TRANSFER.COMMERCIAL", `ACT ${kind} conveyance-duty scale (${band.band.label})`, band.duty, rateToText(band.band)),
    ruleVersion: schedule.ruleVersion,
  };
}

function computeActTransferDuty(date: ISODate, dutiableValue: Cents, residentialValue: Cents): { duty: Cents; lines: ComputationLine[]; ruleVersion: string } {
  const lines: ComputationLine[] = [];
  const ruleVersions = new Set<string>();
  let duty = 0;
  if (residentialValue > 0) {
    const residential = computeActComponentDuty(date, residentialValue, "residential");
    duty += residential.duty;
    lines.push(residential.line);
    ruleVersions.add(residential.ruleVersion);
  }
  const commercialValue = dutiableValue - residentialValue;
  if (commercialValue > 0) {
    const commercial = computeActComponentDuty(date, commercialValue, "commercial");
    duty += commercial.duty;
    lines.push(commercial.line);
    ruleVersions.add(commercial.ruleVersion);
  }
  return { duty, lines, ruleVersion: [...ruleVersions].join("+") };
}

function computeNtTransferDuty(date: ISODate, dutiableValue: Cents): { duty: Cents; lines: ComputationLine[]; ruleVersion: string } {
  if (date < "2022-07-01") throw new RangeError(`Northern Territory stamp duty is modelled for contracts from 1 July 2022; this contract is dated ${longDate(date)}.`);
  let duty: Cents;
  let label: string;
  let note: string;
  if (dutiableValue <= 52_500_000) {
    const v = dutiableValue / 100_000;
    duty = floorToDollar(Math.round(((0.06571441 * v * v) + (15 * v)) * 100));
    label = "NT V-squared conveyance formula";
    note = "Duty = (0.06571441 x V squared) + 15V, where V is the dutiable value divided by 1,000.";
  } else if (dutiableValue < 300_000_000) {
    duty = floorToDollar(Math.round(dutiableValue * 0.0495));
    label = "NT 4.95% conveyance rate";
    note = "4.95% of dutiable value for values above A$525,000 and below A$3,000,000.";
  } else if (dutiableValue < 500_000_000) {
    duty = floorToDollar(Math.round(dutiableValue * 0.0575));
    label = "NT 5.75% conveyance rate";
    note = "5.75% of dutiable value for values of A$3,000,000 or more and below A$5,000,000.";
  } else {
    duty = floorToDollar(Math.round(dutiableValue * 0.0595));
    label = "NT 5.95% conveyance rate";
    note = "5.95% of dutiable value for values of A$5,000,000 or more.";
  }
  return {
    duty,
    lines: [line("AU.NT.TRANSFER.BASE", label, duty, note)],
    ruleVersion: "nt.transfer.2022-07-01",
  };
}

export function computeTerritoryTransferDuty(
  state: TerritoryState,
  date: ISODate,
  dutiableValue: Cents,
  residentialValue: Cents,
): { duty: Cents; lines: ComputationLine[]; ruleVersion: string } {
  if (state === "TAS") return computeTasTransferDuty(date, dutiableValue);
  if (state === "ACT") return computeActTransferDuty(date, dutiableValue, residentialValue);
  if (state === "NT") return computeNtTransferDuty(date, dutiableValue);
  throw new RangeError(`Transfer duty is not modelled for ${state}.`);
}

export function territorySurchargeRate(state: TerritoryState, date: ISODate): ForeignSurchargeRate | undefined {
  if (state === "TAS") return pickEffective(TAS_FOREIGN_SURCHARGE_RATES, date);
  return undefined;
}

export const TERRITORY_TRANSFER_RULES: RuleEntry[] = [
  {
    id: "au-transfer-duty.tas.general.2013-10-21",
    domain: "AU_TRANSFER_DUTY",
    title: "Tasmania property transfer duty rates",
    summary: "Tasmania's general property transfer duty scale runs from A$50 up to A$3,000 to A$27,810 plus A$4.50 for every A$100 or part above A$725,000.",
    effectiveFrom: "2013-10-21",
    confidence: "VERIFIED",
    sources: [
      { title: "State Revenue Office Tasmania | Rates of duty", url: "https://www.sro.tas.gov.au/property-transfer-duties/rates-of-duty", retrieved: "2026-10-19", publisher: "State Revenue Office Tasmania" },
    ],
  },
  {
    id: "au-transfer-duty.tas.foreign.2020-04-01",
    domain: "AU_TRANSFER_DUTY",
    title: "Tasmania foreign investor duty surcharge",
    summary: "Foreign persons acquiring Tasmanian residential property pay FIDS at 8% from 1 April 2020. The earlier 3% residential rate from 1 July 2018 is retained for historical contracts.",
    effectiveFrom: "2018-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "State Revenue Office Tasmania | Rates of surcharge", url: "https://www.sro.tas.gov.au/property-transfer-duties/foreign-investor-duty-surcharge/rates-of-surcharge", retrieved: "2026-10-19", publisher: "State Revenue Office Tasmania" },
    ],
    notes: "The published 1.5% surcharge on primary-production property is outside this investor/commercial calculator because the property-kind input distinguishes residential and non-residential only.",
  },
  {
    id: "au-transfer-duty.act.residential.2022-07-01",
    domain: "AU_TRANSFER_DUTY",
    title: "ACT non-commercial conveyance duty rates",
    summary: "ACT non-commercial conveyance duty for investor/residential property is modelled from the Revenue Office calculator data from 1 July 2022: 1.2% to A$200,000, then 2.2%, 3.4%, 4.32%, 5.9%, 6.4% and 4.54% above A$1.455m.",
    effectiveFrom: "2022-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "ACT Revenue Office | Conveyance duty calculator API 2026-27", url: "https://www.revenue.act.gov.au/site-configuration/calculators/apis/conveyance-duty-2026-27", retrieved: "2026-10-19", publisher: "ACT Revenue Office" },
      { title: "ACT Revenue Office | About conveyance duty", url: "https://www.revenue.act.gov.au/rates-and-property-charges/conveyance-duty-stamp-duty/about-conveyance-duty-stamp-duty", retrieved: "2026-10-19", publisher: "ACT Revenue Office" },
    ],
  },
  {
    id: "au-transfer-duty.act.commercial.2022-07-01",
    domain: "AU_TRANSFER_DUTY",
    title: "ACT commercial conveyance duty phase-out",
    summary: "ACT commercial conveyance duty is nil below the annual threshold and 5% above it. Thresholds are A$1.7m for 2022-23, A$1.8m for 2023-24, A$1.9m for 2024-25, A$2.0m for 2025-26 and A$2.1m for 2026-27.",
    effectiveFrom: "2022-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "ACT Revenue Office | Conveyance duty calculator API 2026-27", url: "https://www.revenue.act.gov.au/site-configuration/calculators/apis/conveyance-duty-2026-27", retrieved: "2026-10-19", publisher: "ACT Revenue Office" },
      { title: "ACT Revenue Office | About conveyance duty", url: "https://www.revenue.act.gov.au/rates-and-property-charges/conveyance-duty-stamp-duty/about-conveyance-duty-stamp-duty", retrieved: "2026-10-19", publisher: "ACT Revenue Office" },
    ],
  },
  {
    id: "au-transfer-duty.act.foreign.nil",
    domain: "AU_TRANSFER_DUTY",
    title: "ACT has no foreign purchaser duty surcharge",
    summary: "ACT conveyance duty is modelled without a foreign-purchaser surcharge; the ACT Revenue Office conveyance-duty guidance and calculator tables publish no separate foreign purchaser surcharge.",
    effectiveFrom: "2022-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "ACT Revenue Office | About conveyance duty", url: "https://www.revenue.act.gov.au/rates-and-property-charges/conveyance-duty-stamp-duty/about-conveyance-duty-stamp-duty", retrieved: "2026-10-19", publisher: "ACT Revenue Office" },
      { title: "ACT Revenue Office | Conveyance duty calculator API 2026-27", url: "https://www.revenue.act.gov.au/site-configuration/calculators/apis/conveyance-duty-2026-27", retrieved: "2026-10-19", publisher: "ACT Revenue Office" },
    ],
  },
  {
    id: "au-transfer-duty.nt.general.2022-07-01",
    domain: "AU_TRANSFER_DUTY",
    title: "Northern Territory stamp duty on land",
    summary: "NT stamp duty on land uses the V-squared formula up to A$525,000, then 4.95% above A$525,000 and below A$3m, 5.75% from A$3m and below A$5m, and 5.95% from A$5m.",
    effectiveFrom: "2022-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "Stamp Duty Act 1978 (NT), Schedule 1, clause 1(2)", url: "https://legislation.nt.gov.au/en/Legislation/STAMP-DUTY-ACT-1978", retrieved: "2026-10-19", publisher: "Northern Territory Legislation" },
      { title: "Northern Territory Government | Examples of duty and rates", url: "https://nt.gov.au/employ/money-and-taxes/taxes-royalties-and-grants/stamp-duty/examples-of-duty-and-rates", retrieved: "2026-10-19", publisher: "Northern Territory Government" },
      { title: "NT Department of Treasury and Finance | Stamp duty", url: "https://treasury.nt.gov.au/dtf/territory-revenue-office/stamp-duty", retrieved: "2026-10-19", publisher: "Department of Treasury and Finance, Northern Territory" },
    ],
    notes: "Formula and rate bands checked against Schedule 1, clause 1(2) of the Stamp Duty Act 1978 (NT). Duty is shown in whole dollars, as the Territory Revenue Office calculator reports it.",
  },
  {
    id: "au-transfer-duty.nt.foreign.nil",
    domain: "AU_TRANSFER_DUTY",
    title: "Northern Territory has no foreign purchaser duty surcharge",
    summary: "NT stamp duty is modelled without a foreign-purchaser surcharge because the Territory Revenue Office stamp-duty guidance publishes no separate foreign purchaser surcharge.",
    effectiveFrom: "2022-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "NT Department of Treasury and Finance | Stamp duty", url: "https://treasury.nt.gov.au/dtf/territory-revenue-office/stamp-duty", retrieved: "2026-10-19", publisher: "Department of Treasury and Finance, Northern Territory" },
    ],
  },
];
