import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "../../../src/domain/actions.ts";
import { appDataProblem } from "../../../src/domain/core/schema.ts";
import { ptaxProviders } from "../../../src/domain/ptax/providers.ts";
import { dutiesView, propertyTaxView } from "../../../src/domain/ptax/index.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import type { AppData, Ctx, User } from "../../../src/domain/types.ts";

const NOW = new Date(2026, 9, 12, 9, 0, 0);

function ctx(data: AppData, userId = "a-moreno"): Ctx {
  const user = data.users.find((candidate) => candidate.id === userId);
  assert.ok(user, `user ${userId} exists`);
  return { now: NOW, user };
}

function profile(data: AppData, propertyId: string) {
  const found = data.propertyProfiles.find((candidate) => candidate.propertyId === propertyId);
  assert.ok(found, `${propertyId} profile exists`);
  return found;
}

function user(data: AppData, id: string): User {
  const found = data.users.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
}

test("seed has one exact property-tax profile for every property and passes the persisted schema", () => {
  const data = seedData();
  assert.equal(data.propertyProfiles.length, 28);
  assert.deepEqual(data.propertyProfiles.map((entry) => entry.propertyId).sort(), data.properties.map((entry) => entry.id).sort());
  assert.equal(appDataProblem(data), null);

  const harbourline = profile(data, "harbourline-harbourline-tower");
  assert.equal(harbourline.auState, "NSW");
  assert.equal(harbourline.sgAnnualValue, null);
  assert.equal(harbourline.purchasePrice, data.properties.find((property) => property.id === harbourline.propertyId)?.cost);

  const telok = profile(data, "telok-ayer-telok-ayer-tower");
  assert.equal(telok.auState, null);
  assert.equal(telok.sgUsage, "NON_RESIDENTIAL_OR_VACANT");
  assert.ok((telok.sgAnnualValue ?? 0) > 0);
});

test("annual tax view computes AU NSW/VIC/QLD and SG golden values, and flags unmodelled states without a guessed amount", () => {
  const data = seedData();
  const harbourline = propertyTaxView(data, "harbourline", { now: NOW });
  // NSW trust land tax, 2026 assessment: total NSW taxable land value A$485,871,588.
  // Revenue NSW general schedule in engine: A$88,036 + 2% over A$6,571,000 = A$9,674,047.76, then allocated to the only NSW holding.
  assert.equal(harbourline.rows.find((row) => row.propertyId === "harbourline-harbourline-tower")?.total, 967404776);
  // VIC trust land tax, 2026 assessment: A$18,355,819 land value. SRO trust scale in engine -> A$4,816,441.94.
  assert.equal(harbourline.rows.find((row) => row.propertyId === "harbourline-collins-quarter")?.total, 481644194);
  assert.equal(harbourline.rows.find((row) => row.propertyId === "harbourline-riverside-place")?.total, 595500042);
  assert.equal(harbourline.totals.total, 2044549012);

  const wattle = propertyTaxView(data, "wattle", { now: NOW });
  const sa = wattle.rows.find((row) => row.propertyId === "wattle-lakeside-marketplace");
  // RevenueSA 2025-26 general rates (Wattle is a listed public unit trust): A$32,005 + A$2.40 per A$100 or part above A$3,116,000.
  assert.equal(sa?.status, "modelled");
  assert.equal(sa?.total, 662_876_020);

  const tasData = seedData();
  const lakeside = tasData.propertyProfiles.find((entry) => entry.propertyId === "wattle-lakeside-marketplace")!;
  Object.assign(lakeside, { auState: "TAS" });
  const tas = propertyTaxView(tasData, "wattle", { now: NOW }).rows.find((row) => row.propertyId === "wattle-lakeside-marketplace");
  assert.equal(tas?.status, "not-modelled");
  assert.equal(tas?.total, 0);
  assert.match(tas?.basis ?? "", /Tasmania/);

  const telok = propertyTaxView(data, "telok-ayer", { now: NOW });
  // IRAS non-residential rate is 10% of annual value: S$13,755,721.473 -> S$13,755,721.47.
  assert.equal(telok.rows.find((row) => row.propertyId === "telok-ayer-telok-ayer-tower")?.total, 1375572147);
  // Same 10% rule: S$84,875,728.23 annual value -> S$8,487,572.82.
  assert.equal(telok.rows.find((row) => row.propertyId === "telok-ayer-cecil-exchange")?.total, 848757282);
});

test("duties view computes Singapore BSD deadlines and a NSW foreign surcharge case", () => {
  const data = seedData();
  const telok = dutiesView(data, "telok-ayer", { now: NOW });
  const tower = telok.rows.find((row) => row.propertyId === "telok-ayer-telok-ayer-tower");
  assert.equal(tower?.baseDuty, 6535750500);
  assert.equal(tower?.surchargeDuty, 0);
  assert.equal(tower?.totalDuty, 6535750500);
  assert.equal(tower?.deadline, "2011-05-30");

  const foreign = seedData();
  Object.assign(profile(foreign, "coastline-northern-beaches-day-surgery"), {
    auForeignPurchaser: true,
    auPropertyKind: "RESIDENTIAL",
    auResidential: true,
    auResidentialShareBps: 10_000,
  });
  const nsw = dutiesView(foreign, "coastline", { now: NOW }).rows.find((row) => row.propertyId === "coastline-northern-beaches-day-surgery");
  assert.equal(nsw?.baseDuty, 644916600);
  assert.equal(nsw?.surchargeDuty, 838667565);
  assert.equal(nsw?.totalDuty, 1483584165);
});

test("ABSD entity case and not-modelled duties are excluded from totals", () => {
  const data = seedData();
  const cecil = profile(data, "telok-ayer-cecil-exchange");
  Object.assign(cecil, { sgStampPropertyKind: "RESIDENTIAL", sgAbsdBuyerKind: "ENTITY" });
  const row = dutiesView(data, "telok-ayer", { now: NOW }).rows.find((candidate) => candidate.propertyId === cecil.propertyId);
  assert.equal(row?.baseDuty, 4976618200);
  assert.equal(row?.surchargeDuty, 24885791100);
  assert.equal(row?.totalDuty, 29862409300);

  const wattle = dutiesView(data, "wattle", { now: NOW });
  assert.equal(wattle.rows.find((candidate) => candidate.propertyId === "wattle-coral-coast-central")?.totalDuty, 3902623350);
  assert.equal(wattle.rows.find((candidate) => candidate.propertyId === "wattle-banksia-plaza")?.totalDuty, 2689949985, "WA general rate on A$522,492,875");
  assert.equal(wattle.rows.find((candidate) => candidate.propertyId === "wattle-lakeside-marketplace")?.status, "not-modelled");
  assert.equal(
    wattle.rows.find((candidate) => candidate.propertyId === "wattle-wattle-grove-shopping-centre")?.basis,
    "New South Wales transfer duty rates for a contract dated 1 Oct 2009 are not in the app (only later contracts are modelled); work it out separately.",
    "the engine's missing-rate error is put into words",
  );
  assert.equal(wattle.totals.totalDuty, 3902623350 + 2689949985, "the unmodelled 2012 SA contract stays out of the total");
});

test("profile reducer enforces edit access, validates fields, ignores workflow locks, and audits successful changes", () => {
  const data = seedData();
  const signedOff = data.funds.find((fund) => fund.id === "harbourline");
  assert.equal(signedOff?.status, "Signed off");

  const readOnly = applyAction(data, { type: "ptax-update-profile", fundId: "harbourline", propertyId: "harbourline-harbourline-tower", patch: { auLandValue: 1 } }, { now: NOW, user: user(data, "m-castillo") });
  assert.equal(readOnly.ok, false);
  assert.match(readOnly.ok ? "" : readOnly.reason, /permission/);

  const invalid = applyAction(data, { type: "ptax-update-profile", fundId: "harbourline", propertyId: "harbourline-harbourline-tower", patch: { auResidentialShareBps: 10_001 } }, ctx(data));
  assert.equal(invalid.ok, false);
  assert.match(invalid.ok ? "" : invalid.reason, /Residential share/);

  const changed = applyAction(data, { type: "ptax-update-profile", fundId: "harbourline", propertyId: "harbourline-harbourline-tower", patch: { auLandValue: 123456700 } }, ctx(data));
  assert.equal(changed.ok, true);
  if (!changed.ok) return;
  assert.equal(profile(changed.data, "harbourline-harbourline-tower").auLandValue, 123456700);
  assert.equal(changed.data.audit.at(-1)?.action, "Property tax profile updated");
  assert.match(changed.data.audit.at(-1)?.detail ?? "", /Harbourline Tower/);
  assert.notEqual(changed.data, data);
  assert.equal(profile(data, "harbourline-harbourline-tower").auLandValue, 48587158824, "input data was not mutated");
  assert.equal(appDataProblem(changed.data), null);
});

test("profile reducer rejects over-posted identity and payment fields that could overwrite another fund", () => {
  const data = seedData();
  const beforeHarbourline = structuredClone(profile(data, "harbourline-harbourline-tower"));
  const beforeCoastline = structuredClone(profile(data, "coastline-coastline-private-hospital"));
  const result = applyAction(
    data,
    {
      type: "ptax-update-profile",
      fundId: "coastline",
      propertyId: "coastline-coastline-private-hospital",
      patch: {
        propertyId: "harbourline-harbourline-tower",
        fundId: "harbourline",
        auLandValue: 1,
        payments: [],
      },
    } as never,
    ctx(data, "r-okafor"),
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /propertyId|fundId|payments/);
  assert.deepEqual(profile(data, "harbourline-harbourline-tower"), beforeHarbourline);
  assert.deepEqual(profile(data, "coastline-coastline-private-hospital"), beforeCoastline);
});

test("payment reducer records and removes payments, enforces no-access/view-only, audits, and keeps schema valid", () => {
  const data = seedData();
  const noAccess = applyAction(data, { type: "ptax-record-payment", fundId: "harbourline", propertyId: "harbourline-harbourline-tower", kind: "annual-tax", period: "land-tax-2026", amount: 100, date: "2026-10-12", reference: "x" }, ctx(data, "s-lim"));
  assert.equal(noAccess.ok, false);
  assert.match(noAccess.ok ? "" : noAccess.reason, /access/);

  const viewOnly = applyAction(data, { type: "ptax-record-payment", fundId: "harbourline", propertyId: "harbourline-harbourline-tower", kind: "annual-tax", period: "land-tax-2026", amount: 100, date: "2026-10-12", reference: "x" }, ctx(data, "m-castillo"));
  assert.equal(viewOnly.ok, false);
  assert.match(viewOnly.ok ? "" : viewOnly.reason, /permission/);

  const recorded = applyAction(data, { type: "ptax-record-payment", fundId: "wattle", propertyId: "wattle-wattle-grove-shopping-centre", kind: "annual-tax", period: "land-tax-2026", amount: 886126601, date: "2026-10-12", reference: "LT-886" }, ctx(data));
  assert.equal(recorded.ok, true);
  if (!recorded.ok) return;
  assert.equal(appDataProblem(recorded.data), null);
  const payment = profile(recorded.data, "wattle-wattle-grove-shopping-centre").payments.find((entry) => entry.reference === "LT-886");
  assert.ok(payment);
  assert.equal(recorded.data.audit.at(-1)?.action, "Property tax payment recorded");
  assert.match(recorded.data.audit.at(-1)?.detail ?? "", /Wattle Grove Shopping Centre/);
  assert.equal(propertyTaxView(recorded.data, "wattle", { now: NOW }).rows.find((row) => row.propertyId === "wattle-wattle-grove-shopping-centre")?.paid, true);

  const removed = applyAction(recorded.data, { type: "ptax-unrecord-payment", fundId: "wattle", propertyId: "wattle-wattle-grove-shopping-centre", paymentId: payment.id }, ctx(recorded.data));
  assert.equal(removed.ok, true);
  if (removed.ok) assert.equal(appDataProblem(removed.data), null);
});

test("providers emit risks, compare sources and missed SG duty-deadline risks at 12 Oct 2026", () => {
  const data = seedData();
  const wattle = data.funds.find((fund) => fund.id === "wattle")!;
  const risks = ptaxProviders.risks?.(data, wattle, NOW) ?? [];
  assert.ok(risks.some((risk) => risk.title.includes("Wattle Grove Shopping Centre: payment overdue") && risk.area === "Land tax"));
  assert.ok(!risks.some((risk) => risk.title.includes("Lakeside Marketplace") && risk.area === "Land tax"), "SA land tax is modelled and paid");
  assert.ok(risks.some((risk) => risk.title === "Lakeside Marketplace: duty not calculated" && risk.severity === "note" && /21 May 2012/.test(risk.detail)), "its 2012 duty predates the modelled SA rates");

  const telok = data.funds.find((fund) => fund.id === "telok-ayer")!;
  const sgRisks = ptaxProviders.risks?.(data, telok, NOW) ?? [];
  assert.ok(sgRisks.some((risk) => risk.title.includes("Cecil Exchange: payment overdue")));

  const sources = ptaxProviders.compareSources?.(data, telok, NOW) ?? [];
  assert.deepEqual(sources.map((source) => source.id), ["ptax-annual", "ptax-duties"]);
  assert.equal(sources[0]?.lines.length, 3);
  assert.equal(sources[1]?.lines[0]?.amount, 6535750500);

  const deadlines = ptaxProviders.deadlines?.(data, wattle, NOW) ?? [];
  assert.ok(deadlines.some((deadline) => deadline.obligation.includes("Wattle Grove") && deadline.status === "overdue"));
  assert.ok(deadlines.some((deadline) => deadline.obligation.includes("Coral Coast") && deadline.status === "done"));
});
