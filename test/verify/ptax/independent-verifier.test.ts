import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "../../../src/domain/actions.ts";
import { persistedProblem } from "../../../src/domain/core/schema.ts";
import { AU_LAND_TAX_ASSUMPTION, dutiesView, propertyTaxView } from "../../../src/domain/ptax/index.ts";
import { ptaxProviders } from "../../../src/domain/ptax/providers.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import type { AppData, Fund, User } from "../../../src/domain/types.ts";

const NOW = new Date(2026, 9, 12, 9, 0, 0);

function mulBps(cents: number, bps: number): number {
  return Number((BigInt(cents) * BigInt(bps) * 2n + 10_000n) / 20_000n);
}

function floorDollar(cents: number): number {
  return Math.floor(cents / 100) * 100;
}

function property(data: AppData, id: string) {
  const found = data.properties.find((entry) => entry.id === id);
  assert.ok(found, `${id} property exists`);
  return found;
}

function profile(data: AppData, propertyId: string) {
  const found = data.propertyProfiles.find((entry) => entry.propertyId === propertyId);
  assert.ok(found, `${propertyId} profile exists`);
  return found;
}

function fund(data: AppData, id: string): Fund {
  const found = data.funds.find((entry) => entry.id === id);
  assert.ok(found, `${id} fund exists`);
  return found;
}

function user(data: AppData, id: string): User {
  const found = data.users.find((entry) => entry.id === id);
  assert.ok(found, `${id} user exists`);
  return found;
}

function persistedOk(data: AppData, selectedFundId = "harbourline"): void {
  assert.equal(persistedProblem({ data, ui: { currentUserId: "a-moreno", jurisdiction: "all", selectedFundId } }), null);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function auLandTax(state: "NSW" | "VIC" | "QLD", taxableValue: number): number {
  if (state === "NSW") return 8_803_600 + mulBps(taxableValue - 657_100_000, 200);
  if (state === "VIC") return 3_165_000 + mulBps(taxableValue - 300_000_000, 265);
  return 18_750_000 + mulBps(taxableValue - 1_000_000_000, 275);
}

function qldTransferDuty(value: number): number {
  return 3_802_500 + Math.ceil((value - 100_000_000) / 10_000) * 575;
}

function vicTransferDuty(value: number): number {
  return 11_000_000 + mulBps(value - 200_000_000, 650);
}

function nswPremiumTransferDuty2025(value: number): number {
  return floorDollar(18_666_700 + mulBps(value - 372_100_000, 700));
}

function sgBsdPre2018(value: number): number {
  return floorDollar(180_000 + 360_000 + mulBps(value - 36_000_000, 300));
}

function sgBsdCurrentNonResidential(value: number): number {
  const firstFiveBands = 180_000 + 360_000 + 1_920_000 + 2_000_000 + 7_500_000;
  return floorDollar(firstFiveBands + mulBps(value - 300_000_000, 500));
}

function sgOwnerOccupied2026Private(av: number): number {
  const gross = mulBps(2_800_000, 400) + mulBps(1_000_000, 600) + mulBps(2_500_000, 1000) + mulBps(1_000_000, 1400) + mulBps(1_500_000, 2000);
  const rebate = Math.min(mulBps(gross, 1000), 50_000);
  return gross + mulBps(av - 10_000_000, 2600) - rebate;
}

test("hand recomputation of annual land tax / property tax for seeded AU and SG properties matches the views", () => {
  const data = seedData();

  // Primary-source checks:
  // Revenue NSW, "Land tax thresholds and rates" (last updated 16 Mar 2026): "2024 onwards" general threshold $1,075,000 and premium threshold $6,571,000; special trusts do not receive the threshold.
  // SRO Victoria, "Trusts and land tax": trust surcharge applies to most trusts, but "When the total value ... is $3 million or more, there is no difference between the general and trust surcharge land tax rates."
  // QRO, "Company and trustee land tax rates": trustees use $187,500 plus 2.75 cents for each $1 over $10m at $10m+.
  for (const c of [
    ["harbourline", "harbourline-harbourline-tower", "NSW"],
    ["harbourline", "harbourline-collins-quarter", "VIC"],
    ["harbourline", "harbourline-riverside-place", "QLD"],
    ["coastline", "coastline-northern-beaches-day-surgery", "NSW"],
    ["wattle", "wattle-coral-coast-central", "QLD"],
  ] as const) {
    const row = propertyTaxView(data, c[0], { now: NOW }).rows.find((entry) => entry.propertyId === c[1]);
    const taxableValue = profile(data, c[1]).auLandValue;
    assert.equal(row?.status, "modelled");
    assert.equal(row?.total, auLandTax(c[2], taxableValue ?? 0), c[1]);
  }

  // IRAS, "Property Tax Rates": non-residential property and vacant land are in the 10% class; annual bills are payable by 31 Jan.
  for (const c of [
    ["telok-ayer", "telok-ayer-telok-ayer-tower"],
    ["telok-ayer", "telok-ayer-cecil-exchange"],
    ["loyang", "loyang-loyang-logistics-hub"],
  ] as const) {
    const row = propertyTaxView(data, c[0], { now: NOW }).rows.find((entry) => entry.propertyId === c[1]);
    assert.equal(row?.status, "modelled");
    assert.equal(row?.total, mulBps(profile(data, c[1]).sgAnnualValue ?? 0, 1000), c[1]);
    assert.equal(row?.dueDate, "2026-01-31");
  }
});

test("hand recomputation of acquisition duties for seeded modelled properties matches the duty views", () => {
  const data = seedData();

  // Primary-source checks:
  // Revenue NSW transfer duty 2025/26 historical table: premium residential duty is $186,667 plus 7% above $3,721,000.
  // SRO Victoria current non-PPR duty: more than $2m is $110,000 plus 6.5% over $2m.
  // QRO transfer duty: more than $1m is $38,025 plus $5.75 per $100 or part over $1m.
  // IRAS BSD before 20 Feb 2018: first $180k 1%, next $180k 2%, remainder 3%, rounded down to dollars.
  const checks = [
    ["harbourline", "harbourline-riverside-place", qldTransferDuty],
    ["harbourline", "harbourline-collins-quarter", vicTransferDuty],
    ["coastline", "coastline-northern-beaches-day-surgery", nswPremiumTransferDuty2025],
    ["telok-ayer", "telok-ayer-telok-ayer-tower", sgBsdPre2018],
    ["telok-ayer", "telok-ayer-cecil-exchange", sgBsdPre2018],
    ["loyang", "loyang-loyang-logistics-hub", sgBsdPre2018],
  ] as const;
  for (const [fundId, propertyId, formula] of checks) {
    const row = dutiesView(data, fundId, { now: NOW }).rows.find((entry) => entry.propertyId === propertyId);
    assert.equal(row?.status, "modelled", propertyId);
    assert.equal(row?.baseDuty, formula(property(data, propertyId).cost), propertyId);
  }
});

test("pre-AFAD non-foreign Queensland transfer duty should still be modelled", () => {
  const data = seedData();
  // QRO transfer-duty rates apply from 21 Sep 2012. Coral Coast was acquired on 15 Feb 2016, before AFAD existed, by a non-foreign trust.
  const row = dutiesView(data, "wattle", { now: NOW }).rows.find((entry) => entry.propertyId === "wattle-coral-coast-central");
  assert.equal(row?.status, "modelled");
  assert.equal(row?.baseDuty, qldTransferDuty(property(data, "wattle-coral-coast-central").cost));
});

test("SG current BSD, ABSD for entities/trustees and Singapore execution deadline are represented", () => {
  const data = seedData();
  const p = profile(data, "meranti-meranti-dc2");
  Object.assign(p, {
    purchaseDate: "2026-03-01",
    purchasePrice: 400_000_000,
    sgStampPropertyKind: "NON_RESIDENTIAL",
    sgAbsdBuyerKind: null,
    sgExecutedInSingapore: true,
  });
  let row = dutiesView(data, "meranti", { now: NOW }).rows.find((entry) => entry.propertyId === p.propertyId);
  // IRAS BSD page: on/after 15 Feb 2023 non-residential top marginal rate is 5%; signed-in-Singapore documents are stamped within 14 days after signing.
  assert.equal(row?.baseDuty, sgBsdCurrentNonResidential(400_000_000));
  assert.equal(row?.deadline, "2026-03-15");

  Object.assign(p, { sgStampPropertyKind: "RESIDENTIAL", sgAbsdBuyerKind: "ENTITY" });
  row = dutiesView(data, "meranti", { now: NOW }).rows.find((entry) => entry.propertyId === p.propertyId);
  // IRAS ABSD page: "Entities buying any residential property" are 65% on or after 27 Apr 2023; entity includes trustees for collective investment schemes.
  assert.equal(row?.surchargeDuty, mulBps(400_000_000, 6500));

  Object.assign(p, { sgAbsdBuyerKind: "TRUSTEE" });
  row = dutiesView(data, "meranti", { now: NOW }).rows.find((entry) => entry.propertyId === p.propertyId);
  // IRAS ABSD (Trust): trustee buying residential property is 65% from 9 May 2022 / on or after 27 Apr 2023, with refund only for qualifying identifiable-individual beneficiaries.
  assert.equal(row?.surchargeDuty, mulBps(400_000_000, 6500));
});

test("SG owner-occupied flag should drive owner-occupier residential rates or be removed", () => {
  const data = seedData();
  const p = profile(data, "telok-ayer-telok-ayer-tower");
  Object.assign(p, {
    sgAnnualValue: 10_000_000,
    sgUsage: "NON_OWNER_OCCUPIED_RESIDENTIAL",
    sgOwnerOccupied: true,
    sgStampPropertyKind: "RESIDENTIAL",
  });
  const row = propertyTaxView(data, "telok-ayer", { now: NOW }).rows.find((entry) => entry.propertyId === p.propertyId);
  assert.equal(row?.total, sgOwnerOccupied2026Private(10_000_000));
});

test("missing-data cases are rendered without guessed amounts, excluded from totals, and payment status drives deadlines", () => {
  const data = seedData();
  Object.assign(profile(data, "wattle-lakeside-marketplace"), { auLandValue: null });
  const wattleAnnual = propertyTaxView(data, "wattle", { now: NOW });
  const missing = wattleAnnual.rows.find((row) => row.propertyId === "wattle-lakeside-marketplace");
  assert.equal(missing?.status, "missing-data");
  assert.match(missing?.basis ?? "", /Profile needs taxable land value/);
  assert.equal(wattleAnnual.csv.rows.find((row) => row[0] === "Lakeside Marketplace")?.[5], "Not modelled");
  assert.equal(wattleAnnual.doc.blocks.some((block) => block.kind === "table" && block.rows.some((row) => row.property === "Lakeside Marketplace" && row.total === "Not modelled")), true);
  assert.equal(wattleAnnual.totals.total, wattleAnnual.rows.filter((row) => row.status === "modelled").reduce((sum, row) => sum + row.total, 0));

  const allDeadlines = data.funds.flatMap((entry) => ptaxProviders.deadlines?.(data, entry, NOW) ?? []);
  assert.deepEqual(allDeadlines.filter((row) => row.status === "overdue" && row.obligation.startsWith("Land tax")).map((row) => row.obligation), ["Land tax — Wattle Grove Shopping Centre"]);
  assert.deepEqual(allDeadlines.filter((row) => row.status === "overdue" && row.obligation.startsWith("Property tax")).map((row) => row.obligation), ["Property tax — Cecil Exchange"]);
  assert.equal(allDeadlines.find((row) => row.obligation === "Land tax — Wattle Grove Shopping Centre")?.date, "2026-09-16", "recorded assessment notices override the 30 September estimate");
  assert.match(propertyTaxView(data, "harbourline", { now: NOW }).rows.find((row) => row.propertyId === "harbourline-harbourline-tower")?.dueLabel ?? "", /estimated/, "properties without a notice disclose the placeholder date");

  const paid = applyAction(data, { type: "ptax-record-payment", fundId: "wattle", propertyId: "wattle-wattle-grove-shopping-centre", kind: "annual-tax", period: "land-tax-2026", amount: 1, date: "2026-10-12", reference: "manual verifier" }, { now: NOW, user: user(data, "a-moreno") });
  assert.equal(paid.ok, true);
  if (!paid.ok) return;
  const wattle = fund(paid.data, "wattle");
  assert.equal(ptaxProviders.deadlines?.(paid.data, wattle, NOW).find((row) => row.obligation.includes("Wattle Grove"))?.status, "done");
  persistedOk(paid.data, "wattle");
});

test("reducers enforce permissions, validations, audit text, immutability, and persisted schema after every action", () => {
  let data = deepFreeze(seedData());

  const noAccess = applyAction(data, { type: "ptax-record-payment", fundId: "harbourline", propertyId: "harbourline-harbourline-tower", kind: "annual-tax", period: "land-tax-2026", amount: 100, date: "2026-10-12", reference: "x" }, { now: NOW, user: user(data, "s-lim") });
  assert.equal(noAccess.ok, false);
  assert.match(noAccess.ok ? "" : noAccess.reason, /access/);

  const viewOnly = applyAction(data, { type: "ptax-update-profile", fundId: "harbourline", propertyId: "harbourline-harbourline-tower", patch: { auLandValue: 1 } }, { now: NOW, user: user(data, "m-castillo") });
  assert.equal(viewOnly.ok, false);
  assert.match(viewOnly.ok ? "" : viewOnly.reason, /permission/);

  const invalid = applyAction(data, { type: "ptax-update-profile", fundId: "harbourline", propertyId: "harbourline-harbourline-tower", patch: { purchaseDate: "2026-02-31" } }, { now: NOW, user: user(data, "a-moreno") });
  assert.equal(invalid.ok, false);
  assert.match(invalid.ok ? "" : invalid.reason, /date/);

  const updated = applyAction(data, { type: "ptax-update-profile", fundId: "harbourline", propertyId: "harbourline-harbourline-tower", patch: { auLandValue: 123_456_700 } }, { now: NOW, user: user(data, "a-moreno") });
  assert.equal(updated.ok, true);
  assert.equal(profile(data, "harbourline-harbourline-tower").auLandValue, 48_587_158_824, "deep-frozen input was not mutated");
  assert.match(updated.ok ? updated.data.audit.at(-1)?.detail ?? "" : "", /land value/);
  if (!updated.ok) return;
  persistedOk(updated.data);
  data = deepFreeze(updated.data);

  const reset = applyAction(data, { type: "ptax-reset-profile", fundId: "harbourline", propertyId: "harbourline-harbourline-tower" }, { now: NOW, user: user(data, "a-moreno") });
  assert.equal(reset.ok, true);
  assert.equal(reset.ok ? reset.data.audit.at(-1)?.action : "", "Property tax profile updated");
  if (!reset.ok) return;
  persistedOk(reset.data);
  data = deepFreeze(reset.data);

  const lodgedByAgent = applyAction(data, { type: "ptax-record-payment", fundId: "meranti", propertyId: "meranti-meranti-dc1", kind: "annual-tax", period: "property-tax-2026", amount: 100, date: "2026-10-12", reference: "agent receipt" }, { now: NOW, user: user(data, "s-lim") });
  assert.equal(lodgedByAgent.ok, true);
  assert.equal(lodgedByAgent.ok ? lodgedByAgent.data.audit.at(-1)?.action : "", "Property tax payment recorded");
  if (!lodgedByAgent.ok) return;
  persistedOk(lodgedByAgent.data, "meranti");
  const paymentId = profile(lodgedByAgent.data, "meranti-meranti-dc1").payments.find((payment) => payment.reference === "agent receipt")?.id;
  assert.ok(paymentId);

  const removed = applyAction(deepFreeze(lodgedByAgent.data), { type: "ptax-unrecord-payment", fundId: "meranti", propertyId: "meranti-meranti-dc1", paymentId }, { now: NOW, user: user(lodgedByAgent.data, "s-lim") });
  assert.equal(removed.ok, true);
  assert.equal(removed.ok ? removed.data.audit.at(-1)?.action : "", "Property tax payment removed");
  if (removed.ok) persistedOk(removed.data, "meranti");
});

test("assessment notices drive assessed amounts, variance risks and compare assessed sources", () => {
  const data = seedData();
  const recorded = applyAction(data, { type: "ptax-record-notice", fundId: "wattle", propertyId: "wattle-coral-coast-central", period: "land-tax-2026", assessedAmount: 1, issueDate: "2026-09-01", dueDate: "2026-10-31", reference: "QRO tiny variance" }, { now: NOW, user: user(data, "a-moreno") });
  assert.equal(recorded.ok, true);
  if (!recorded.ok) return;
  const row = propertyTaxView(recorded.data, "wattle", { now: NOW }).rows.find((entry) => entry.propertyId === "wattle-coral-coast-central");
  assert.equal(row?.dueDate, "2026-10-31");
  assert.equal(row?.assessedAmount, 1);
  assert.match(row?.assessedLabel ?? "", /below modelled/);
  assert.ok((ptaxProviders.risks?.(recorded.data, fund(recorded.data, "wattle"), NOW) ?? []).some((risk) => risk.title === "Coral Coast Central: assessed differs from modelled"));
  const sources = ptaxProviders.compareSources?.(recorded.data, fund(recorded.data, "wattle"), NOW) ?? [];
  assert.ok(sources.some((source) => source.id === "ptax-annual-assessed" && source.lines.some((line) => line.ref === "ptax.assessed.wattle-coral-coast-central" && line.amount === 1)));
  persistedOk(recorded.data, "wattle");
});

test("trust treatment note distinguishes listed/fixed AMIT assumptions from trust surcharge cases", () => {
  // NSW: Revenue NSW says fixed trusts are eligible for the threshold, while special trusts do not receive it and foreign-beneficiary trusts can be liable for surcharge land tax on residential land.
  // VIC: SRO says the trust surcharge may not apply to fixed and unit trusts where beneficiaries/unit holders and shares are notified; absentee surcharge is additional where an absentee beneficiary exists.
  // QLD: QRO says companies and trustees use the company/trust schedule; foreign companies/trustees add a 3% surcharge over the threshold.
  assert.match(AU_LAND_TAX_ASSUMPTION, /NSW special-trust no-threshold/);
  assert.match(AU_LAND_TAX_ASSUMPTION, /Review fixed\/unit-trust notifications/);
  assert.match(AU_LAND_TAX_ASSUMPTION, /Queensland uses the company\/trust scale/);
  // SA: RevenueSA assesses listed and widely held public unit trust schemes at the general rates. WA: one scale, plus MRIT in the Perth region.
  assert.match(AU_LAND_TAX_ASSUMPTION, /South Australia uses its trust rates while Trust surcharge applies is Yes/);
  assert.match(AU_LAND_TAX_ASSUMPTION, /Metropolitan Region Improvement Tax/);
});

test("WA and SA land tax and duty for the seeded properties match figures worked out from the published tables", () => {
  const data = seedData();
  const row = <T extends { propertyId: string }>(rows: readonly T[], id: string): T => {
    const found = rows.find((entry) => entry.propertyId === id);
    assert.ok(found, id);
    return found;
  };
  const wattle = propertyTaxView(data, "wattle", { now: NOW }).rows;
  const kurrajong = propertyTaxView(data, "kurrajong", { now: NOW }).rows;

  // Lakeside Marketplace (SA, land A$277,980,749.50). Wattle is listed, so the seed assesses it at RevenueSA's 2025-26 general rates:
  // A$32,005 + A$2.40 for each of the 2,748,648 parts of A$100 above A$3,116,000.
  assert.equal(profile(data, "wattle-lakeside-marketplace").auTrustSurchargeApplies, false);
  const lakeside = row(wattle, "wattle-lakeside-marketplace");
  assert.deepEqual([lakeside.status, lakeside.tax, lakeside.surcharge, lakeside.total], ["modelled", 662_876_020, 0, 662_876_020]);
  assert.equal(lakeside.basisTitle, "South Australia land tax general rates");

  // Banksia Plaza (WA, land A$266,398,217.50): A$186,550 + 2.67% above A$11,000,000, and MRIT of 0.14% above A$300,000.
  const banksia = row(wattle, "wattle-banksia-plaza");
  assert.equal(banksia.tax, 18_655_000 + mulBps(26_639_821_750 - 1_100_000_000, 267));
  assert.equal(banksia.surcharge, mulBps(26_639_821_750 - 30_000_000, 14));
  assert.deepEqual([banksia.tax, banksia.surcharge, banksia.total], [700_568_241, 37_253_750, 737_821_991]);
  assert.equal(banksia.basisTitle, "Western Australia land tax scale; WA Metropolitan Region Improvement Tax");
  assert.match(banksia.basis, /Includes MRIT: Perth metropolitan region/);

  const noMritData = seedData();
  Object.assign(profile(noMritData, "wattle-banksia-plaza"), { auMetropolitanRegion: false });
  const noMrit = row(propertyTaxView(noMritData, "wattle", { now: NOW }).rows, "wattle-banksia-plaza");
  assert.deepEqual([noMrit.tax, noMrit.surcharge, noMrit.total], [700_568_241, 0, 700_568_241]);
  assert.match(noMrit.basis, /No MRIT: outside the metropolitan region/);

  // Fremantle Wharf Offices (WA, land A$118,856,820.50).
  const fremantle = row(kurrajong, "kurrajong-fremantle-wharf-offices");
  assert.deepEqual([fremantle.tax, fremantle.surcharge, fremantle.total], [306_632_711, 16_597_955, 323_230_666]);

  // Duties: WA general rate, A$28,453 + A$5.15 for every A$100 or part above A$725,000.
  const wattleDuties = dutiesView(data, "wattle", { now: NOW }).rows;
  assert.deepEqual([row(wattleDuties, "wattle-banksia-plaza").status, row(wattleDuties, "wattle-banksia-plaza").totalDuty], ["modelled", 2_845_300 + Math.ceil((52_249_287_500 - 72_500_000) / 10_000) * 515]);
  assert.equal(row(wattleDuties, "wattle-banksia-plaza").totalDuty, 2_689_949_985);
  assert.equal(row(dutiesView(data, "kurrajong", { now: NOW }).rows, "kurrajong-fremantle-wharf-offices").totalDuty, 1_407_805_470);
});
