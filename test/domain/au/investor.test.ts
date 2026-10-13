import assert from "node:assert/strict";
import { test } from "node:test";
import { aiirDueDate } from "../../../src/domain/au/investor.ts";
import { auModule } from "../../../src/domain/au/index.ts";
import type { AppData, AuHolder, AuInvestorView, DocBlock } from "../../../src/domain/types.ts";
import { AU_IDS, allStrings, auFund, calcFor, ctxFor, freshData, nearDollars, NOW, sum, usd } from "./helpers.ts";

function investor(data: AppData, id: string, userId = "a-moreno", selectedNoticeId?: string | null): AuInvestorView {
  const fund = auFund(data, id);
  const calc = auModule.fundCalc(data, fund, NOW);
  const view = auModule.investorView(data, fund, calc, ctxFor(data, userId), selectedNoticeId);
  assert.equal(view.market, "AU");
  return view as AuInvestorView;
}

type Table = Extract<DocBlock, { kind: "table" }>;
const noticeTable = (view: AuInvestorView): Table => {
  const table = view.noticeDoc?.blocks.find((b): b is Table => b.kind === "table");
  assert.ok(table, "the notice has its table");
  return table;
};

// ------------------------------------------------------------------------------------------------ notices
test("the notice list runs oldest first and marks only unpublished notices as drafts", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const view = investor(data, id);
    assert.ok(view.notices.length >= 2, id);
    assert.deepEqual(
      view.notices.map((n) => n.paymentDate),
      view.notices.map((n) => n.paymentDate).sort(),
      `${id}: oldest first`,
    );
    for (const n of view.notices) {
      assert.equal(n.locked, n.publishedOn !== null, `${id} ${n.id}: a published notice is locked`);
      assert.equal(n.isCurrentYearDraft, !n.locked);
      assert.ok(n.id.startsWith(`${id}-`));
    }
  }
  assert.deepEqual(
    investor(data, "coastline").notices,
    [
      { id: "coastline-2025-12-31", label: "Quarter ended 31 Dec 2025", paymentDate: "2026-02-13", cash: 518_000_000, publishedOn: "2026-02-06", locked: true, isCurrentYearDraft: false },
      { id: "coastline-2026-03-31", label: "Quarter ended 31 Mar 2026", paymentDate: "2026-05-15", cash: 521_400_000, publishedOn: "2026-05-08", locked: true, isCurrentYearDraft: false },
      { id: "coastline-2026-06-30", label: "Quarter ended 30 Jun 2026", paymentDate: "2026-08-14", cash: 529_000_000, publishedOn: "2026-08-07", locked: true, isCurrentYearDraft: false },
      { id: "coastline-2026-09-30", label: "Quarter ended 30 Sep 2026", paymentDate: "2026-11-13", cash: 536_400_000, publishedOn: null, locked: false, isCurrentYearDraft: true },
    ],
  );
  assert.equal(investor(data, "southbank").notices.length, 2);
  for (const id of ["harbourline", "wattle", "kurrajong"]) assert.equal(investor(data, id).notices.length, 4, id);
});

test("the draft notice is selected by default, otherwise the latest; an explicit choice is honoured", () => {
  const data = freshData();
  assert.equal(investor(data, "coastline").selectedNoticeId, "coastline-2026-09-30");
  for (const id of ["harbourline", "southbank", "wattle", "kurrajong"]) assert.equal(investor(data, id).selectedNoticeId, `${id}-2026-06-30`, id);

  const first = investor(data, "kurrajong", "a-moreno", "kurrajong-2025-09-30");
  assert.equal(first.selectedNoticeId, "kurrajong-2025-09-30");
  assert.equal(first.noticeDoc?.fileName, "kurrajong-stapled-property-trust-fund-payment-notice-quarter-ended-30-sep-2025.pdf");
  assert.equal(first.noticeDoc?.meta?.find((m) => m.label === "Distribution")?.value, "Quarter ended 30 Sep 2025");

  assert.equal(investor(data, "kurrajong", "a-moreno", "no-such-notice").selectedNoticeId, "kurrajong-2026-06-30", "an unknown id falls back to the default");
  assert.equal(investor(data, "kurrajong", "a-moreno", null).selectedNoticeId, "kurrajong-2026-06-30");
  assert.equal(investor(data, "coastline", "a-moreno", "coastline-2026-03-31").selectedNoticeId, "coastline-2026-03-31");
});

test("only people who may publish see a publish button, and only on an unpublished notice", () => {
  const data = freshData();
  const allowed: Record<string, boolean> = { "a-moreno": true, "r-okafor": true };
  for (const user of data.users) {
    assert.equal(investor(data, "coastline", user.id).canPublishSelected, allowed[user.id] ?? false, `${user.id} on the draft`);
    assert.equal(investor(data, "coastline", user.id, "coastline-2026-06-30").canPublishSelected, false, `${user.id} on a published notice`);
    for (const id of ["harbourline", "southbank", "wattle", "kurrajong"]) assert.equal(investor(data, id, user.id).canPublishSelected, false, `${user.id} on ${id}`);
  }
});

test("the notice for the quarter: table, withholding wording and cents per unit", () => {
  const data = freshData();
  const view = investor(data, "coastline");
  const doc = view.noticeDoc;
  assert.ok(doc);
  assert.equal(doc.title, "Fund payment notice (draft)");
  assert.equal(doc.subtitle, "Coastline Healthcare Property Fund");
  assert.equal(doc.fileName, "coastline-healthcare-property-fund-fund-payment-notice-quarter-ended-30-sep-2026.pdf");
  assert.deepEqual(doc.meta, [
    { label: "Distribution", value: "Quarter ended 30 Sep 2026" },
    { label: "Record date", value: "30 Sep 2026" },
    { label: "Payment date", value: "13 Nov 2026" },
    { label: "Income year", value: "Year ended 30 Sep 2026" },
  ]);
  const table = noticeTable(view);
  assert.equal(table.title, "Components of the payment for non-resident withholding");
  assert.deepEqual(
    table.columns.map((c) => [c.key, c.label, c.align]),
    [
      ["component", "Component", undefined],
      ["withholding", "Withholding", undefined],
      ["centsPerUnit", "Cents per unit", "right"],
      ["amount", "Amount", "right"],
    ],
  );
  assert.deepEqual(
    table.rows.map((r) => [r.component, r.withholding, r.centsPerUnit, r.amount]),
    [
      ["Fund payment — other", "15% EOI · 30% non-EOI", "1.356008", "A$4,324,852.42"],
      ["Fund payment — NCMI", "30%", "0.000000", "A$0.00"],
      ["Fund payment — excluded from NCMI (transitional)", "15% EOI · 30% non-EOI", "0.000000", "A$0.00"],
      ["Fund payment — clean building MIT income", "10% EOI · 30% non-EOI", "0.000000", "A$0.00"],
      ["Total fund payment", "", "1.356008", "A$4,324,852.42"],
      ["Interest", "10% interest withholding", "0.016964", "A$54,103.82"],
    ],
  );
  assert.deepEqual(table.totalRow, { component: "Cash distribution paid", withholding: "", centsPerUnit: "1.681821", amount: "A$5,364,000.00" });
  const text = doc.blocks.flatMap((b) => (b.kind === "paragraph" ? [b.text] : []));
  assert.ok(text.includes("Attribution managed investment trust · withholding MIT"));
  assert.ok(text.includes("Includes a fund payment from a clean building MIT: No."));
  assert.ok(text.includes("Full-year amounts are in the AMIT member annual statement."));
  assert.ok(text.some((t) => t.startsWith("Given for non-resident withholding on fund payments (Subdivisions 12-H and 12A-B of Schedule 1")));
});

test("a published notice is not a draft, shows its own quarter and flags clean building income and grossed-up gains", () => {
  const data = freshData();
  const kurrajong = investor(data, "kurrajong");
  assert.equal(kurrajong.noticeDoc?.title, "Fund payment notice");
  assert.deepEqual(
    noticeTable(kurrajong).rows.map((r) => [r.component, r.centsPerUnit, r.amount]),
    [
      ["Fund payment — other", "0.801190", "A$7,622,517.93"],
      ["Fund payment — NCMI", "0.000000", "A$0.00"],
      ["Fund payment — excluded from NCMI (transitional)", "0.254730", "A$2,423,501.04"],
      ["Fund payment — clean building MIT income", "0.000000", "A$0.00"],
      ["Total fund payment", "1.055920", "A$10,046,018.97"],
      ["Interest", "0.013720", "A$130,528.00"],
    ],
  );
  assert.equal(noticeTable(kurrajong).totalRow?.amount, "A$14,627,000.00");
  const text = (v: AuInvestorView): string[] => v.noticeDoc?.blocks.flatMap((b) => (b.kind === "paragraph" ? [b.text] : [])) ?? [];
  assert.ok(text(kurrajong).includes("Includes a fund payment from a clean building MIT: No."));
  assert.ok(!text(kurrajong).some((t) => t.startsWith("Discounted capital gains")));

  const harbourline = investor(data, "harbourline");
  assert.ok(text(harbourline).includes("Includes a fund payment from a clean building MIT: Yes."));
  assert.ok(text(harbourline).includes("Discounted capital gains on taxable Australian property are grossed up (doubled) in the fund payment, so it can exceed the cash paid."));
  assert.equal(noticeTable(harbourline).rows[3].amount, "A$1,605,191.62");
});

// ------------------------------------------------------------------------------------------------ published against the year
const VS_YEAR: Record<string, Array<[string, number, number, number]>> = {
  harbourline: [
    ["Fund payment — other", 56_142_400, 56_142_400, 0],
    ["Fund payment — NCMI", 0, 0, 0],
    ["Fund payment — excluded from NCMI (transitional)", 0, 0, 0],
    ["Fund payment — clean building MIT income", 6_205_300, 6_205_300, 0],
    ["Interest", 1_184_900, 1_184_900, 0],
    ["Total fund payment", 62_347_700, 62_347_700, 0],
  ],
  southbank: [
    ["Fund payment — other", 31_866_250, 51_626_250, 19_760_000],
    ["Fund payment — NCMI", 0, 0, 0],
    ["Fund payment — excluded from NCMI (transitional)", 0, 0, 0],
    ["Fund payment — clean building MIT income", 0, 0, 0],
    ["Interest", 402_610, 402_610, 0],
    ["Total fund payment", 31_866_250, 51_626_250, 19_760_000],
  ],
  wattle: [
    ["Fund payment — other", 112_315_700, 112_315_700, 0],
    ["Fund payment — NCMI", 0, 0, 0],
    ["Fund payment — excluded from NCMI (transitional)", 0, 0, 0],
    ["Fund payment — clean building MIT income", 0, 0, 0],
    ["Interest", 2_941_800, 2_941_800, 0],
    ["Total fund payment", 112_315_700, 112_315_700, 0],
  ],
  kurrajong: [
    ["Fund payment — other", 30_244_100, 30_244_100, 0],
    ["Fund payment — NCMI", 0, 9_615_800, 9_615_800],
    ["Fund payment — excluded from NCMI (transitional)", 9_615_800, 0, -9_615_800],
    ["Fund payment — clean building MIT income", 0, 0, 0],
    ["Interest", 517_900, 517_900, 0],
    ["Total fund payment", 39_859_900, 39_859_900, 0],
  ],
  coastline: [
    ["Fund payment — other", 12_645_598, 16_970_450, 4_324_852],
    ["Fund payment — NCMI", 0, 0, 0],
    ["Fund payment — excluded from NCMI (transitional)", 0, 0, 0],
    ["Fund payment — clean building MIT income", 0, 0, 0],
    ["Interest", 158_196, 212_300, 54_104],
    ["Total fund payment", 12_645_598, 16_970_450, 4_324_852],
  ],
};

test("what was published is set against what the year now says, row by row", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const rows = investor(data, id).vsYear;
    const expected = VS_YEAR[id];
    assert.deepEqual(
      rows.map((r) => r.label),
      expected.map((r) => r[0]),
      `${id} labels`,
    );
    rows.forEach((r, i) => {
      nearDollars(r.published, expected[i][1], `${id} ${r.label} published`);
      nearDollars(r.year, expected[i][2], `${id} ${r.label} year`);
      nearDollars(r.difference, expected[i][3], `${id} ${r.label} difference`);
      assert.equal(r.difference, r.year - r.published, `${id} ${r.label}: difference is year less published`);
    });
  }
});

test("Southbank: the published notices understate the year by A$19.76m and the AIIR shows a A$4.8m cost base shortfall", () => {
  const data = freshData();
  const view = investor(data, "southbank");
  assert.equal(view.vsYear[5].difference, 1_976_000_000);
  assert.equal(view.aiir.totals.costBaseNet, -481_686_000);
});

// ------------------------------------------------------------------------------------------------ notices without a snapshot
test("Coastline's unpublished draft is the only notice with no snapshot, and it carries exactly what the year still lacks", () => {
  const data = freshData();
  assert.deepEqual(
    data.auNotices.filter((n) => n.notified === null).map((n) => n.id),
    ["coastline-2026-09-30"],
  );
  const view = investor(data, "coastline");
  assert.equal(view.selectedNoticeId, "coastline-2026-09-30");
  const rows = noticeTable(view).rows;
  assert.equal(rows[0].amount, "A$4,324,852.42");
  assert.equal(view.vsYear[0].difference, 432_485_242, "the draft's fund payment is the year less the published notices");
  assert.equal(rows[5].amount, "A$54,103.82");
  assert.equal(view.vsYear[4].difference, 5_410_382, "and so is its interest");
});

test("a published final notice that has no snapshot is estimated as the balance of the year, so the comparison closes", () => {
  const data = freshData();
  const notice = data.auNotices.find((n) => n.id === "southbank-2026-06-30");
  assert.ok(notice);
  assert.equal(notice.final, true);
  notice.notified = null;
  const view = investor(data, "southbank");
  assert.equal(view.selectedNoticeId, "southbank-2026-06-30");
  for (const row of view.vsYear) assert.equal(row.difference, 0, row.label);
  const rows = noticeTable(view).rows;
  assert.equal(rows[0].amount, "A$36,021,155.96");
  assert.equal(rows[5].amount, "A$205,449.46");
  assert.ok(!calcFor(data, "southbank").checks.some((c) => c.id === "au-notices-understate"));
});

test("with every snapshot cleared there is no fraction, negative amount or NaN in the comparison or in any notice document", () => {
  const data = freshData();
  for (const notice of data.auNotices) notice.notified = null;
  for (const id of AU_IDS) {
    const first = investor(data, id);
    for (const row of first.vsYear) {
      for (const cents of [row.published, row.year, row.difference]) assert.ok(Number.isInteger(cents), `${id} ${row.label}: ${cents}`);
      assert.ok(row.published >= 0, `${id} ${row.label}: published is not negative`);
    }
    for (const n of first.notices) {
      const text = allStrings(investor(data, id, "a-moreno", n.id).noticeDoc).join("\n");
      assert.ok(!/NaN|undefined|Infinity/.test(text), `${id} ${n.id}`);
    }
  }
});

// ------------------------------------------------------------------------------------------------ AIIR
// [units, attributed, cash, cost base net amount (+ excess / − shortfall), withheld] in whole dollars, as the reference's AIIR shows them.
const AIIR: Record<string, { lines: Array<[number, number, number, number, number]>; total: [number, number, number, number, number] }> = {
  harbourline: {
    lines: [
      [902_151_600, 38_074_312, 59_036_942, 18_464_387, 0],
      [141_268_000, 5_962_060, 9_244_600, 2_891_340, 0],
      [211_902_000, 8_943_090, 13_866_900, 4_337_010, 1_374_057],
      [141_268_000, 5_962_060, 9_244_600, 2_891_340, 916_038],
      [16_090_400, 679_078, 1_052_958, 329_323, 214_391],
    ],
    total: [1_412_680_000, 59_620_600, 92_446_000, 28_913_400, 2_504_486],
  },
  wattle: {
    lines: [
      [1_515_837_600, 74_772_720, 93_375_360, 10_389_960, 0],
      [252_639_600, 12_462_120, 15_562_560, 1_731_660, 0],
      [210_533_000, 10_385_100, 12_968_800, 1_443_050, 1_714_154],
      [126_319_800, 6_231_060, 7_781_280, 865_830, 1_028_492],
    ],
    total: [2_105_330_000, 103_851_000, 129_688_000, 14_430_500, 2_742_646],
  },
  kurrajong: {
    lines: [
      [570_840_000, 24_226_680, 34_821_600, 10_594_920, 0],
      [95_140_000, 4_037_780, 5_803_600, 1_765_820, 0],
      [142_710_000, 6_056_670, 8_705_400, 2_648_730, 1_120_972],
      [95_140_000, 4_037_780, 5_803_600, 1_765_820, 747_315],
      [46_320_000, 1_965_839, 2_825_549, 859_710, 584_709],
    ],
    total: [950_150_000, 40_324_749, 57_959_749, 17_635_000, 2_452_995],
  },
  coastline: {
    lines: [
      [191_364_000, 10_972_530, 12_628_800, 1_656_270, 0],
      [63_788_000, 3_657_510, 4_209_600, 552_090, 0],
      [47_841_000, 2_743_133, 3_157_200, 414_068, 385_020],
      [15_947_000, 914_378, 1_052_400, 138_023, 255_618],
    ],
    total: [318_940_000, 18_287_550, 21_048_000, 2_760_450, 640_638],
  },
};

test("AIIR investor lines and totals match the reference to the dollar", () => {
  const data = freshData();
  for (const [id, expected] of Object.entries(AIIR)) {
    const { aiir } = investor(data, id);
    assert.equal(aiir.lines.length, expected.lines.length, `${id} lines`);
    aiir.lines.forEach((l, i) => {
      const [units, attributed, cash, costBase, withheld] = expected.lines[i];
      assert.equal(l.units, units, `${id} line ${i + 1} units`);
      nearDollars(l.attributed, attributed, `${id} line ${i + 1} attributed`);
      nearDollars(l.cash, cash, `${id} line ${i + 1} cash`);
      nearDollars(l.costBaseNet, costBase, `${id} line ${i + 1} cost base`);
      nearDollars(l.withheld, withheld, `${id} line ${i + 1} withheld`);
    });
    const t = aiir.totals;
    assert.equal(t.units, expected.total[0], `${id} units`);
    nearDollars(t.attributed, expected.total[1], `${id} total attributed`);
    nearDollars(t.cash, expected.total[2], `${id} total cash`);
    nearDollars(t.costBaseNet, expected.total[3], `${id} total cost base`);
    nearDollars(t.withheld, expected.total[4], `${id} total withheld`);
  }
});

test("Southbank's AIIR carries a cost base shortfall for every investor", () => {
  const { aiir } = investor(freshData(), "southbank");
  assert.deepEqual(
    aiir.lines.map((l) => [l.holder, l.country, l.statusLabel, l.units, usd(l.attributed), usd(l.cash), usd(l.costBaseNet), usd(l.withheld)]),
    [
      ["Banksia Super Fund", "Australia", "Australian resident", 205_264_500, 12_644_658, 14_163_600, -1_445_058, 0],
      ["Eucalypt Industry Super", "Australia", "Australian resident", 136_843_000, 8_429_772, 9_442_400, -963_372, 0],
      ["Kestrel Pension Plan", "Canada", "Foreign resident — EOI country", 171_053_750, 10_537_215, 11_803_000, -1_204_215, 1_946_049.63],
      ["Serangoon Capital Pte Ltd", "Singapore", "Foreign resident — EOI country", 171_053_750, 10_537_215, 11_803_000, -1_204_215, 1_946_049.62],
    ],
  );
  assert.equal(aiir.totals.withheld, 389_209_925);
  assert.ok(aiir.lines.every((l) => l.costBaseNet < 0));
});

test("each AIIR line reports the investor's own country and status", () => {
  const data = freshData();
  const lines = investor(data, "harbourline").aiir.lines;
  assert.deepEqual(
    lines.map((l) => [l.holderId, l.holder, l.country, l.statusLabel]),
    [
      ["h-hl-1", "Australian resident unitholders (retail register)", "Australia", "Australian resident"],
      ["h-hl-2", "Banksia Super Fund", "Australia", "Australian resident"],
      ["h-hl-3", "Sakuragawa Life Assurance", "Japan", "Foreign resident — EOI country"],
      ["h-hl-4", "Nordfjell Sovereign Holdings", "Norway", "Foreign resident — EOI country"],
      ["h-hl-5", "Offshore nominee account", "Non-EOI address", "Foreign resident — non-EOI"],
    ],
  );
});

test("AIIR readiness: signed off, every unit on the register, investor totals agree", () => {
  const data = freshData();
  const flat = (id: string): unknown[] => investor(data, id).aiir.items.map((i) => [i.id, i.label, i.done, i.detail]);
  const labels = ["Distribution signed off", "Every unit on the register", "Investor totals agree to the trust components"];
  assert.deepEqual(flat("harbourline"), [
    ["signed-off", labels[0], true, "The AIIR mirrors the locked AMMA statements"],
    ["register", labels[1], true, "1,412,680,000 units reported"],
    ["totals", labels[2], true, "A$59,620,600 attributed"],
  ]);
  assert.deepEqual(flat("kurrajong"), [
    ["signed-off", labels[0], false, "Status: In review"],
    ["register", labels[1], false, "Register holds 950,150,000 of 951,400,000 units"],
    ["totals", labels[2], false, "A$53,051 of attributed amounts isn't reported against an investor"],
  ]);
  assert.deepEqual(flat("coastline"), [
    ["signed-off", labels[0], false, "Status: Preparing"],
    ["register", labels[1], true, "318,940,000 units reported"],
    ["totals", labels[2], true, "A$18,287,550 attributed"],
  ]);
  assert.deepEqual(
    AU_IDS.map((id) => [id, investor(data, id).aiir.ready]),
    [
      ["harbourline", true],
      ["southbank", false],
      ["wattle", true],
      ["kurrajong", false],
      ["coastline", false],
    ],
  );
});

test("AIIR readiness follows sign-off and the register", () => {
  const data = freshData();
  auFund(data, "coastline").status = "Signed off";
  assert.equal(investor(data, "coastline").aiir.ready, true);
  const holder = data.holders.find((h): h is AuHolder => h.id === "h-cl-4" && "auStatus" in h);
  assert.ok(holder);
  holder.units = 0;
  const view = investor(data, "coastline").aiir;
  assert.equal(view.ready, false);
  assert.equal(view.items[1].detail, "Register holds 302,993,000 of 318,940,000 units");
  assert.equal(view.items[2].done, false);
});

test("AIIR and withholding report dates", () => {
  const data = freshData();
  for (const id of ["harbourline", "southbank", "wattle", "kurrajong"]) {
    const { aiir } = investor(data, id);
    assert.equal(aiir.aiirDue, "2026-10-31", id);
    assert.equal(aiir.withholdingReportDue, "2027-01-14", id);
    assert.equal(aiir.note, "Amounts withheld from fund payments that aren't in the AIIR by its due date go in a second AIIR by this date.");
  }
  const { aiir } = investor(data, "coastline");
  assert.equal(aiir.aiirDue, "", "a substituted accounting period has no fixed AIIR date");
  assert.equal(aiir.withholdingReportDue, "2027-04-14");
  assert.equal(
    aiir.note,
    "AIIR due date: confirm with the ATO — substituted accounting period. Amounts withheld from fund payments that aren't in the AIIR by its due date go in a second AIIR by this date.",
  );
  assert.equal(aiirDueDate(auFund(data, "wattle").periodEnd), "2026-10-31");
});

test("an AIIR lodgment is shown only where one was recorded", () => {
  const data = freshData();
  assert.deepEqual(investor(data, "wattle").aiir.lodgment, { fundId: "wattle", kind: "aiir", reference: "Receipt 418806117352", date: "2026-10-02", actor: "A. Moreno" });
  for (const id of ["harbourline", "southbank", "kurrajong", "coastline"]) assert.equal(investor(data, id).aiir.lodgment, null, id);
});

test("the AIIR spreadsheet has one row per investor, in dollars, with the components in the reference's order", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const { aiir } = investor(data, id);
    const { csv } = aiir;
    assert.equal(csv.fileName, `${fund.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-aiir-investor-lines.csv`);
    assert.deepEqual(csv.columns, [
      "Investor",
      "Country",
      "Tax status",
      "Units",
      "Australian income — other",
      "Non-concessional MIT income",
      "Excluded from NCMI — transitional",
      "Clean building MIT income",
      "Australian interest",
      "Discounted capital gains — TARP",
      "AMIT CGT gross-up amount — TARP",
      "Other capital gains — TARP",
      "Assessable foreign income",
      "Other non-attributable amounts",
      "Attributed",
      "Cash distribution",
      "AMIT cost base net amount",
      "Fund payment",
      "Withheld",
    ]);
    assert.equal(csv.rows.length, aiir.lines.length);
    csv.rows.forEach((row, i) => {
      const line = aiir.lines[i];
      assert.equal(row.length, csv.columns.length);
      assert.deepEqual(row.slice(0, 3), [line.holder, line.country, line.statusLabel]);
      assert.ok(row.slice(3).every((cell) => typeof cell === "number" && Number.isFinite(cell)), `${id} row ${i + 1}: numeric cells`);
      assert.equal(row[3], line.units);
      assert.equal(row[14], usd(line.attributed));
      assert.equal(row[15], usd(line.cash));
      assert.equal(row[16], usd(line.costBaseNet));
      assert.equal(row[18], usd(line.withheld));
      const attributedParts = [4, 5, 6, 7, 8, 9, 11, 12].map((c) => row[c] as number);
      assert.ok(Math.abs(sum(attributedParts) - (row[14] as number)) <= 0.05, `${id} row ${i + 1}: the attributed components add up to the attributed amount`);
    });
  }
});

test("the AIIR lines add up to their totals and the totals carry through unchanged", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const { aiir } = investor(data, id);
    assert.equal(aiir.totals.units, sum(aiir.lines.map((l) => l.units)));
    assert.equal(aiir.totals.attributed, sum(aiir.lines.map((l) => l.attributed)));
    assert.equal(aiir.totals.cash, sum(aiir.lines.map((l) => l.cash)));
    assert.equal(aiir.totals.costBaseNet, sum(aiir.lines.map((l) => l.costBaseNet)));
    assert.equal(aiir.totals.withheld, sum(aiir.lines.map((l) => l.withheld)));
    for (const l of aiir.lines) assert.equal(l.costBaseNet, l.cash - l.attributed - cgtConcessionOf(data, id, l.holderId), `${id} ${l.holderId}: cost base net is cash less attributed and the AMIT CGT gross-up amount`);
  }
});

function cgtConcessionOf(data: AppData, id: string, holderId: string): number {
  const calc = auModule.fundCalc(data, auFund(data, id), NOW);
  const line = calc.holders.find((h) => h.holder.id === holderId);
  return line?.lines.find((l) => l.key === "cgtConcessionTarp")?.amount ?? 0;
}

test("a fund from another market is refused", () => {
  const data = freshData();
  const sg = data.funds.find((f) => f.market !== "AU");
  assert.ok(sg);
  assert.throws(() => auModule.investorView(data, sg, auModule.fundCalc(data, auFund(data, "wattle"), NOW), ctxFor(data)), /not an Australian fund/);
});
