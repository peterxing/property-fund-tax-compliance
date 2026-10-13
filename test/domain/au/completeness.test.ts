// Completeness of the documents built from the trust components. Whatever the inputs, every attributed component with an amount shows up
// exactly once in the working papers, the fund payment notices and the member statements, and their totals tie to FundCalc.
// Each property runs for every AU fund as seeded, after each input is raised, cleared or left alone on its own (on a modified copy of the
// data), and on random inputs from a fixed seed, so a failure can be reproduced.
import assert from "node:assert/strict";
import { test } from "node:test";
import { auModule } from "../../../src/domain/au/index.ts";
import { facts } from "../../../src/domain/au/returns.ts";
import { auNoticeAmounts } from "../../../src/domain/core/notices.ts";
import type { AppData, AuFund, AuInputs, AuInvestorView, Cents, ComponentLine, DocBlock, DocModel, FundCalc } from "../../../src/domain/types.ts";
import { AU_IDS, auFund, centsOfText, ctxFor, dollarsOf, freshData, near, NOW, sum } from "./helpers.ts";

type Kv = Extract<DocBlock, { kind: "kv" }>;
type Table = Extract<DocBlock, { kind: "table" }>;
type KvRow = Kv["rows"][number];

const INPUT_KEYS = Object.keys(auFund(freshData(), "harbourline").inputs) as Array<keyof AuInputs>;

/** The attributed components, and the ones that are fund payments (the discounted gain counts twice: itself and the AMIT CGT gross-up amount). */
const ATTRIBUTED = ["ausOtherIncome", "ncmi", "excludedNcmi", "cleanBuilding", "interest", "discountGainTarp", "otherGainTarp", "foreignIncome"] as const;
const FUND_PAYMENT = ["ausOtherIncome", "ncmi", "excludedNcmi", "cleanBuilding", "discountGainTarp", "cgtConcessionTarp", "otherGainTarp"] as const;

// ------------------------------------------------------------------------------------------------ the scenarios
interface Scenario {
  name: string;
  data: AppData;
  fund: AuFund;
  calc: FundCalc;
}

function scenario(name: string, id: string, edit: (inputs: AuInputs) => void): Scenario {
  const data = freshData();
  const fund = auFund(data, id);
  edit(fund.inputs);
  return { name: `${id}: ${name}`, data, fund, calc: auModule.fundCalc(data, fund, NOW) };
}

/** mulberry32: a small seeded generator. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scenariosFor(id: string, seed: number): Scenario[] {
  const out = [scenario("as seeded", id, () => {})];
  for (const key of INPUT_KEYS) {
    out.push(scenario(`${key} raised by A$32,109.87`, id, (i) => void (i[key] += 3_210_987)));
    out.push(scenario(`${key} cleared`, id, (i) => void (i[key] = 0)));
    out.push(scenario(`only ${key}`, id, (i) => INPUT_KEYS.forEach((k) => void (i[k] = k === key ? 123_456_789 : 0))));
  }
  out.push(scenario("every input cleared", id, (i) => INPUT_KEYS.forEach((k) => void (i[k] = 0))));
  const next = random(seed);
  for (let n = 1; n <= 8; n++) {
    out.push(scenario(`random inputs #${n}`, id, (i) => INPUT_KEYS.forEach((k) => void (i[k] = next() < 0.35 ? 0 : Math.round(next() * 4_000_000_000)))));
  }
  return out;
}

const SCENARIOS = new Map<string, Scenario[]>(AU_IDS.map((id, n) => [id, scenariosFor(id, 20_260_930 + n)]));

// ------------------------------------------------------------------------------------------------ reading documents
function kvBlock(doc: DocModel, title: string): KvRow[] {
  const found = doc.blocks.find((b): b is Kv => b.kind === "kv" && b.title === title);
  assert.ok(found, `${doc.title}: block "${title}"`);
  return found.rows;
}

const allKvRows = (doc: DocModel): KvRow[] => doc.blocks.flatMap((b) => (b.kind === "kv" ? b.rows : []));

function tableOf(doc: DocModel): Table {
  const found = doc.blocks.find((b): b is Table => b.kind === "table");
  assert.ok(found, `${doc.title}: the table`);
  return found;
}

const paragraphs = (doc: DocModel): string[] => doc.blocks.flatMap((b) => (b.kind === "paragraph" ? [b.text] : []));

function valueOf(rows: readonly KvRow[], label: string, where: string): string {
  const hits = rows.filter((r) => r.label === label);
  assert.equal(hits.length, 1, `${where}: "${label}" appears exactly once`);
  return hits[0].value;
}

const withoutDash = (text: string): Cents => (text === "—" ? 0 : centsOfText(text));

function investorOf(s: Scenario, noticeId?: string): AuInvestorView {
  const view = auModule.investorView(s.data, s.fund, s.calc, ctxFor(s.data), noticeId);
  assert.equal(view.market, "AU");
  return view as AuInvestorView;
}

const amountOf = (calc: FundCalc, key: string): Cents => calc.components.find((c) => c.key === key)?.amount ?? 0;
const lineOf = (calc: FundCalc, key: string): ComponentLine => {
  const found = calc.components.find((c) => c.key === key);
  assert.ok(found, `component ${key}`);
  return found;
};

// ------------------------------------------------------------------------------------------------ the properties
test("the sweep covers every input the funds carry", () => {
  assert.deepEqual([...INPUT_KEYS].sort(), ["ausOtherIncome", "cashDistribution", "cleanBuilding", "discountGainTarp", "excludedNcmi", "foreignIncome", "interest", "ncmi", "otherGainTarp"]);
  for (const id of AU_IDS) assert.equal(SCENARIOS.get(id)?.length, 1 + INPUT_KEYS.length * 3 + 1 + 8, id);
});

/** FundCalc itself: each attributed component carries its input, and every component is allocated or reported as units missing from the register. */
function checkCalc(s: Scenario): void {
  const i = s.fund.inputs;
  for (const key of ATTRIBUTED) {
    assert.equal(lineOf(s.calc, key).amount, i[key], `${s.name}: ${key} carries its input`);
    assert.equal(lineOf(s.calc, key).attributed, true, `${s.name}: ${key} is attributed`);
  }
  assert.equal(lineOf(s.calc, "cgtConcessionTarp").amount, i.discountGainTarp, `${s.name}: the AMIT CGT gross-up amount equals the discount`);
  assert.deepEqual(
    s.calc.components.filter((c) => !c.attributed).map((c) => c.key),
    ["cgtConcessionTarp", "taxDeferred"],
    `${s.name}: only the gross-up amount and the non-attributable amount are not attributed`,
  );
  for (const c of s.calc.components) {
    const allocated = sum(s.calc.holders.map((h) => h.lines.find((l) => l.key === c.key)?.amount ?? 0));
    assert.equal(allocated + c.unallocated, c.amount, `${s.name}: ${c.key} is allocated to the register or left unallocated`);
  }
  const attributed = sum(s.calc.components.filter((c) => c.attributed).map((c) => c.amount));
  assert.equal(facts(s.calc).attributed, attributed, `${s.name}: FundCalc's attributed total`);
  assert.equal(facts(s.calc).fundPayment, sum(FUND_PAYMENT.map((k) => amountOf(s.calc, k))), `${s.name}: FundCalc's fund payment`);
  assert.equal(s.calc.withheld, sum(s.calc.holders.map((h) => h.withheld)), `${s.name}: withheld by holder`);
  assert.equal(s.calc.withheld, sum(s.calc.components.map((c) => c.withheld)), `${s.name}: withheld by component`);
  for (const h of s.calc.holders) assert.equal(h.withheld, sum(h.withholdingParts.map((p) => p.amount)), `${s.name}: ${h.holder.id} withholding by label`);
}

for (const id of AU_IDS) {
  test(`${id}: FundCalc carries every input and allocates every component, whatever the inputs`, () => {
    for (const s of SCENARIOS.get(id) ?? []) checkCalc(s);
  });
}

// ---------------------------------------------------------------------------------------------- the working papers
/** Where each attributed component is shown in the papers (the discounted gain is shown grossed up, less the discount, and in the net capital gain). */
const PAPERS_LABEL: Record<string, string> = {
  ausOtherIncome: "Australian income — other",
  cleanBuilding: "Clean building MIT income",
  interest: "Interest",
  foreignIncome: "Foreign income",
  ncmi: "NCMI",
  excludedNcmi: "Excluded from NCMI — transitional",
  otherGainTarp: "TARP capital gains — other method",
  discountGainTarp: "TARP capital gains — discount method (gross)",
};

function checkPapers(s: Scenario): void {
  const { fund, calc } = s;
  const i = fund.inputs;
  const papers = auModule.returnView(s.data, fund, calc, ctxFor(s.data)).papers;
  const where = `${s.name} — working papers`;
  const shows = (text: string, cents: Cents, what: string): void => near(dollarsOf(text), cents / 100, 0.5, `${where}: ${what}`);

  const assessable = kvBlock(papers, "Trust components — assessable income other than capital gains");
  const gains = kvBlock(papers, "Trust components — capital gains");
  const rows = allKvRows(papers);

  // The rows are the reference's, with the clean building and foreign income rows only when the fund has some.
  assert.deepEqual(
    assessable.map((r) => r.label),
    [
      "Australian income — other",
      ...(i.cleanBuilding !== 0 ? ["Clean building MIT income"] : []),
      "Interest",
      ...(i.foreignIncome !== 0 ? ["Foreign income"] : []),
      "Assessable income other than capital gains",
      "NCMI",
      "Excluded from NCMI — transitional",
      "NCMI and excluded from NCMI",
      "Total assessable income excluding capital gains",
    ],
    `${where}: assessable income rows`,
  );
  assert.deepEqual(
    gains.map((r) => r.label),
    ["TARP capital gains — discount method (gross)", "Less: CGT discount", "TARP capital gains — other method", "Net capital gain"],
    `${where}: capital gains rows`,
  );

  // (b) every attributed component with an amount is a row, once, with its amount.
  for (const line of calc.components.filter((c) => c.attributed && c.amount !== 0)) {
    const label = PAPERS_LABEL[line.key];
    assert.ok(label, `${where}: where ${line.key} is shown`);
    const shown = valueOf(rows, label, where);
    shows(shown, line.key === "discountGainTarp" ? line.amount + amountOf(calc, "cgtConcessionTarp") : line.amount, `${line.key} as ${label}`);
  }
  // A fund without clean building MIT income or foreign income has no row for it.
  for (const key of ["cleanBuilding", "foreignIncome"] as const) {
    if (i[key] === 0) assert.ok(!rows.some((r) => r.label === PAPERS_LABEL[key]), `${where}: no ${key} row when there is none`);
  }

  // (a) the totals are the sums of the attributed components in FundCalc.
  const concession = amountOf(calc, "cgtConcessionTarp");
  const ordinary = i.ausOtherIncome + i.cleanBuilding + i.interest + i.foreignIncome;
  const total = valueOf(assessable, "Total assessable income excluding capital gains", where);
  const net = valueOf(gains, "Net capital gain", where);
  shows(valueOf(assessable, "Assessable income other than capital gains", where), ordinary, "assessable income other than capital gains");
  shows(valueOf(assessable, "NCMI and excluded from NCMI", where), i.ncmi + i.excludedNcmi, "NCMI and excluded from NCMI");
  shows(total, ordinary + i.ncmi + i.excludedNcmi, "total assessable income excluding capital gains");
  shows(valueOf(gains, "TARP capital gains — discount method (gross)", where), i.discountGainTarp + concession, "discount method gains, grossed up");
  shows(valueOf(gains, "Less: CGT discount", where), -concession, "the CGT discount");
  shows(net, i.discountGainTarp + i.otherGainTarp, "net capital gain");
  const attributed = sum(calc.components.filter((c) => c.attributed).map((c) => c.amount));
  near(dollarsOf(total) + dollarsOf(net), attributed / 100, 1, `${where}: total assessable income plus the net capital gain is the sum of the attributed components`);

  // (c) fund payment and withholding are FundCalc's.
  const withholding = kvBlock(papers, "Withholding obligations");
  const byLabel = new Map<string, Cents>();
  for (const h of calc.holders) for (const p of h.withholdingParts) byLabel.set(p.label, (byLabel.get(p.label) ?? 0) + p.amount);
  const labels = [...byLabel.keys()].sort();
  assert.deepEqual(withholding.map((r) => r.label), ["Fund payments", ...labels, "Total withheld", "Remitted to the ATO"], `${where}: withholding rows`);
  shows(valueOf(withholding, "Fund payments", where), facts(calc).fundPayment, "fund payments");
  shows(valueOf(withholding, "Fund payments", where), i.ausOtherIncome + i.ncmi + i.excludedNcmi + i.cleanBuilding + 2 * i.discountGainTarp + i.otherGainTarp, "fund payments from the inputs");
  for (const label of labels) shows(valueOf(withholding, label, where), byLabel.get(label) ?? 0, label);
  shows(valueOf(withholding, "Total withheld", where), calc.withheld, "total withheld");
  const remitted = valueOf(withholding, "Remitted to the ATO", where);
  if (fund.whtRemitted === null) assert.equal(remitted, "Not yet remitted", where);
  else shows(remitted, fund.whtRemitted, "remitted to the ATO");
  shows(valueOf(kvBlock(papers, "Key financial information"), "Distributions to unitholders", where), calc.cash, "distributions to unitholders");

  // The trustee's exposure is the attributed amounts on units missing from the register.
  const unreported = sum(calc.components.filter((c) => c.attributed).map((c) => c.unallocated));
  const heading = papers.blocks.findIndex((b) => b.kind === "heading" && b.text === "Trustee liabilities");
  assert.ok(heading >= 0, `${where}: the trustee liabilities heading`);
  const liability = papers.blocks[heading + 1];
  if (calc.unallocatedUnits > 0 && unreported > 0) {
    assert.equal(liability.kind, "kv", where);
    if (liability.kind === "kv") shows(valueOf(liability.rows, "Determined trust components not reflected in member components", where), unreported, "trust components not attributed to a member");
  } else {
    assert.equal(liability.kind, "paragraph", where);
  }
}

for (const id of AU_IDS) {
  test(`${id}: the working papers show every attributed component once and their totals tie to FundCalc, whatever the inputs`, () => {
    for (const s of SCENARIOS.get(id) ?? []) checkPapers(s);
  });
}

// ---------------------------------------------------------------------------------------------- the fund payment notices
const NOTICE_ROWS = [
  "Fund payment — other",
  "Fund payment — NCMI",
  "Fund payment — excluded from NCMI (transitional)",
  "Fund payment — clean building MIT income",
  "Total fund payment",
  "Interest",
];

function checkNotices(s: Scenario): void {
  const { fund, calc } = s;
  const i = fund.inputs;
  const where = `${s.name} — notices`;
  const notices = s.data.auNotices.filter((n) => n.fundId === fund.id).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  const base = investorOf(s);
  assert.deepEqual(base.notices.map((n) => n.id), notices.map((n) => n.id), `${where}: every notice is listed, oldest first`);

  // What the year's inputs notify: the discounted gain counts twice, foreign income is not notified (no Australian withholding).
  const year = { other: i.ausOtherIncome + 2 * i.discountGainTarp + i.otherGainTarp, ncmi: i.ncmi, excludedNcmi: i.excludedNcmi, clean: i.cleanBuilding, interest: i.interest };
  assert.equal(
    sum(Object.values(year)),
    facts(calc).attributed - i.foreignIncome + i.discountGainTarp,
    `${where}: every attributed component but foreign income is notified, the discounted gain with its gross-up`,
  );
  assert.equal(year.other + year.ncmi + year.excludedNcmi + year.clean, facts(calc).fundPayment, `${where}: the year's fund payment is FundCalc's`);

  const amounts = new Map(notices.map((n) => [n.id, auNoticeAmounts(fund, s.data.auNotices, n)]));
  for (const n of notices) {
    const got = amounts.get(n.id);
    assert.ok(got);
    if (n.notified !== null) assert.deepEqual(got, n.notified, `${where}: ${n.id} notifies its snapshot`);
    else {
      // An unpublished final notice is estimated as the balance of the year.
      assert.ok(n.final, `${where}: ${n.id} is a final notice`);
      for (const key of Object.keys(year) as Array<keyof typeof year>) {
        const earlier = sum(notices.filter((x) => x.id !== n.id).map((x) => amounts.get(x.id)?.[key] ?? 0));
        assert.equal(got[key], Math.max(0, year[key] - earlier), `${where}: ${n.id} estimates ${key} as the balance of the year`);
      }
    }
  }

  // The notices against the year: the year's components, the published notices and the difference, line by line.
  const published = (key: keyof typeof year): Cents => sum(notices.filter((n) => n.publishedOn !== null).map((n) => amounts.get(n.id)?.[key] ?? 0));
  const lines: Array<[string, keyof typeof year]> = [
    ["Fund payment — other", "other"],
    ["Fund payment — NCMI", "ncmi"],
    ["Fund payment — excluded from NCMI (transitional)", "excludedNcmi"],
    ["Fund payment — clean building MIT income", "clean"],
    ["Interest", "interest"],
  ];
  const expectedVsYear = lines.map(([label, key]) => ({ label, published: published(key), year: year[key], difference: year[key] - published(key) }));
  const fundPayment = (pick: (key: keyof typeof year) => Cents): Cents => pick("other") + pick("ncmi") + pick("excludedNcmi") + pick("clean");
  expectedVsYear.push({
    label: "Total fund payment",
    published: fundPayment(published),
    year: fundPayment((k) => year[k]),
    difference: fundPayment((k) => year[k]) - fundPayment(published),
  });
  assert.deepEqual(base.vsYear, expectedVsYear, `${where}: notices against the year`);

  // Each notice: every notified line once, the fund payment adds up, the cash is the notice's.
  for (const n of notices) {
    const view = investorOf(s, n.id);
    const doc = view.noticeDoc;
    assert.ok(doc, `${where}: ${n.id} has a document`);
    assert.equal(view.selectedNoticeId, n.id);
    const table = tableOf(doc);
    assert.deepEqual(table.rows.map((r) => r.component), NOTICE_ROWS, `${where}: ${n.id} rows`);
    const notified = amounts.get(n.id);
    assert.ok(notified);
    const cents = (label: string): Cents => centsOfText(table.rows.find((r) => r.component === label)?.amount ?? "");
    for (const [label, key] of lines) assert.equal(cents(label), notified[key], `${where}: ${n.id} ${label}`);
    assert.equal(cents("Total fund payment"), notified.other + notified.ncmi + notified.excludedNcmi + notified.clean, `${where}: ${n.id} total fund payment`);
    assert.equal(centsOfText(table.totalRow?.amount ?? ""), n.cash, `${where}: ${n.id} cash distribution paid`);
    const text = paragraphs(doc);
    assert.ok(text.includes(`Includes a fund payment from a clean building MIT: ${notified.clean > 0 ? "Yes" : "No"}.`), `${where}: ${n.id} clean building statement`);
    assert.equal(
      text.some((t) => t.startsWith("Discounted capital gains on taxable Australian property are grossed up")),
      i.discountGainTarp > 0,
      `${where}: ${n.id} gross-up note`,
    );
  }

  // The AIIR reports the attributed components of the register.
  const aiir = base.aiir;
  assert.equal(aiir.totals.attributed, sum(calc.components.filter((c) => c.attributed).map((c) => c.amount - c.unallocated)), `${where}: AIIR attributed total`);
  assert.equal(aiir.totals.withheld, calc.withheld, `${where}: AIIR withholding total`);
}

for (const id of AU_IDS) {
  test(`${id}: the fund payment notices list every notified component once and tie to the year, whatever the inputs`, () => {
    for (const s of SCENARIOS.get(id) ?? []) checkNotices(s);
  });
}

// ---------------------------------------------------------------------------------------------- the member statements
function checkStatements(s: Scenario): void {
  const { fund, calc } = s;
  const where = `${s.name} — statements`;
  const byLabel = new Map<string, Cents>();
  let fundPayments = 0;
  for (const holder of calc.holders) {
    const who = `${where}: ${holder.holder.id}`;
    const doc = auModule.statementDoc(s.data, fund, calc, holder.holder.id);
    const table = tableOf(doc);
    const cell = (key: string): Cents => holder.lines.find((l) => l.key === key)?.amount ?? 0;
    const shown = holder.lines.filter((l) => l.amount !== 0);

    assert.deepEqual(table.rows.map((r) => r.component), shown.map((l) => l.label), `${who}: every non-zero component, once`);
    shown.forEach((l, k) => {
      assert.equal(centsOfText(table.rows[k].amount), l.amount, `${who}: ${l.label} amount`);
      assert.equal(withoutDash(table.rows[k].withheld), l.withheld, `${who}: ${l.label} withheld`);
      byLabel.set(l.label, (byLabel.get(l.label) ?? 0) + l.amount);
    });
    assert.equal(centsOfText(table.totalRow?.amount ?? ""), sum(shown.map((l) => l.amount)), `${who}: total of the components`);
    assert.equal(centsOfText(table.totalRow?.withheld ?? ""), holder.withheld, `${who}: total withheld`);

    // The cost base arithmetic: cash less the attributed amounts and the AMIT CGT gross-up amount.
    const assessable = sum(ATTRIBUTED.map(cell)) + cell("cgtConcessionTarp");
    const cost = kvBlock(doc, "Cost base");
    assert.equal(centsOfText(cost[0].value), assessable, `${who}: attributed amounts`);
    assert.equal(centsOfText(cost[1].value), holder.cash, `${who}: cash distribution`);
    const net = holder.cash - assessable;
    assert.equal(
      cost[2].label,
      `AMIT cost base net amount — ${net > 0 ? "excess (decreases the cost base)" : net < 0 ? "shortfall (increases the cost base)" : "nil"}`,
      `${who}: cost base label`,
    );
    assert.equal(centsOfText(cost[2].value), Math.abs(net), `${who}: cost base net amount`);

    // The fund payment on the statement is every fund payment component the investor holds.
    const figures = kvBlock(doc, "Amounts for your tax return");
    const fundPayment = sum(FUND_PAYMENT.map(cell));
    assert.equal(centsOfText(figures[0].value), fundPayment, `${who}: managed investment trust fund payments`);
    const interestWithheld = holder.lines.find((l) => l.key === "interest")?.withheld ?? 0;
    assert.equal(centsOfText(figures[1].value), holder.withheld - interestWithheld, `${who}: withheld from fund payments`);
    fundPayments += fundPayment;
  }

  // The register's statements add up to what FundCalc attributes to the register: nothing is dropped or counted twice.
  for (const c of calc.components) assert.equal(byLabel.get(c.label) ?? 0, c.amount - c.unallocated, `${where}: ${c.label} across the statements`);
  const missing = sum(FUND_PAYMENT.map((k) => lineOf(calc, k).unallocated));
  assert.equal(fundPayments, facts(calc).fundPayment - missing, `${where}: fund payments across the statements`);
}

for (const id of AU_IDS) {
  test(`${id}: the member statements show every non-zero component once and add up to FundCalc, whatever the inputs`, () => {
    for (const s of SCENARIOS.get(id) ?? []) checkStatements(s);
  });
}
