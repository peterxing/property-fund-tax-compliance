// Filing and notice deadlines for the Singapore funds. The dates come from the notice record and the engine's REIT filing rules.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reitFormUtDueDate, reitWithholdingDueDate } from "../../../src/engine/reitTax.ts";
import { sgModule } from "../../../src/domain/sg/index.ts";
import type { AppData, DeadlineRow } from "../../../src/domain/types.ts";
import { freshData, NOW, SG_IDS, sgFund } from "./helpers.ts";

function rowsFor(data: AppData, id: string, now: Date = NOW): DeadlineRow[] {
  const fund = sgFund(data, id);
  return sgModule.deadlines(data, fund, sgModule.fundCalc(data, fund, now), now);
}

const NOTICE = "Distribution tax notice";
const S45G = "Withholding tax (s45G)";
const FORM_UT = "Form UT";

test("every fund has a notice, a withholding and a Form UT obligation, in that order", () => {
  const data = freshData();
  for (const id of SG_IDS) {
    const fund = sgFund(data, id);
    const rows = rowsFor(data, id);
    assert.deepEqual(rows.map((r) => r.obligation), [NOTICE, S45G, FORM_UT], id);
    for (const row of rows) {
      assert.equal(row.fundId, id);
      assert.equal(row.fundName, fund.name);
      assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test("the dates are the notice's record date, the s45G due date from the payment date and the Form UT due date", () => {
  const data = freshData();
  for (const id of SG_IDS) {
    const fund = sgFund(data, id);
    const notice = data.sgNotices.find((n) => n.fundId === id);
    assert.ok(notice, id);
    const [noticeRow, whtRow, utRow] = rowsFor(data, id);
    assert.equal(noticeRow.date, notice.recordDate, id);
    assert.equal(whtRow.date, reitWithholdingDueDate(notice.paymentDate), id);
    assert.equal(utRow.date, reitFormUtDueDate(fund.assessmentYear), id);
    assert.equal(utRow.date, "2027-04-15", id);
  }
});

test("the open obligations on 12 Oct 2026 match the reference app", () => {
  const data = freshData();
  const open: string[] = [];
  for (const id of SG_IDS) for (const r of rowsFor(data, id)) if (r.status !== "done") open.push(`${r.date} ${r.fundId} ${r.obligation}`);
  assert.deepEqual(open.sort(), [
    "2026-11-05 meranti Distribution tax notice",
    "2026-11-06 telok-ayer Distribution tax notice",
    "2026-11-09 kallang Distribution tax notice",
    "2027-01-15 kallang Withholding tax (s45G)",
    "2027-01-15 meranti Withholding tax (s45G)",
    "2027-01-15 telok-ayer Withholding tax (s45G)",
    "2027-04-15 kallang Form UT",
    "2027-04-15 loyang Form UT",
    "2027-04-15 meranti Form UT",
    "2027-04-15 telok-ayer Form UT",
  ]);
  for (const id of SG_IDS) for (const r of rowsFor(data, id)) assert.notEqual(r.status, "overdue", `${id} ${r.obligation}`);
});

test("Loyang's notice is published and its withholding is remitted, so only Form UT is open", () => {
  const rows = rowsFor(freshData(), "loyang");
  assert.deepEqual(rows.map((r) => [r.date, r.obligation, r.status]), [
    ["2026-08-07", NOTICE, "done"],
    ["2026-10-15", S45G, "done"],
    ["2027-04-15", FORM_UT, "open"],
  ]);
});

test("the s45G date is the 15th of the second month after payment", () => {
  const data = freshData();
  assert.equal(rowsFor(data, "telok-ayer")[1].date, "2027-01-15");
  assert.equal(rowsFor(data, "loyang")[1].date, "2026-10-15");
  data.sgNotices.find((n) => n.fundId === "telok-ayer")!.paymentDate = "2026-12-31";
  assert.equal(rowsFor(data, "telok-ayer")[1].date, "2027-02-15");
});

test("an obligation turns overdue the day after its date, and not before", () => {
  const data = freshData();
  const noticeStatus = (day: Date) => rowsFor(data, "kallang", day)[0].status;
  assert.equal(noticeStatus(new Date(2026, 10, 8, 23, 59)), "open");
  assert.equal(noticeStatus(new Date(2026, 10, 9, 0, 0)), "open", "due today is still open");
  assert.equal(noticeStatus(new Date(2026, 10, 10, 0, 0)), "overdue");
  // Form UT and the withholding follow the same rule.
  assert.equal(rowsFor(data, "kallang", new Date(2027, 0, 15, 12))[1].status, "open");
  assert.equal(rowsFor(data, "kallang", new Date(2027, 0, 16, 12))[1].status, "overdue");
  assert.equal(rowsFor(data, "kallang", new Date(2027, 3, 15, 12))[2].status, "open");
  assert.equal(rowsFor(data, "kallang", new Date(2027, 3, 16, 12))[2].status, "overdue");
});

test("a done obligation stays done however late the date", () => {
  const data = freshData();
  const rows = rowsFor(data, "loyang", new Date(2030, 0, 1));
  assert.deepEqual(rows.map((r) => r.status), ["done", "done", "overdue"]);
});

test("publishing the notice completes the notice obligation", () => {
  const data = freshData();
  assert.equal(rowsFor(data, "telok-ayer")[0].status, "open");
  data.sgNotices.find((n) => n.fundId === "telok-ayer")!.publishedOn = "2026-10-12";
  assert.equal(rowsFor(data, "telok-ayer")[0].status, "done");
});

test("remitting the withholding completes the s45G obligation", () => {
  const data = freshData();
  const fund = sgFund(data, "telok-ayer");
  assert.equal(rowsFor(data, "telok-ayer")[1].status, "open");
  fund.whtRemitted = 87_618_900 + 99_301_420;
  assert.equal(rowsFor(data, "telok-ayer")[1].status, "done");
  // A remittance that doesn't match is still a remittance; the reconciliation check is what flags it.
  fund.whtRemitted = 1;
  assert.equal(rowsFor(data, "telok-ayer")[1].status, "done");
});

test("when nothing is withheld there is no s45G obligation to leave open", () => {
  const data = freshData();
  for (const h of data.holders) if (h.fundId === "telok-ayer" && "sgClass" in h) h.sgClass = "individual";
  assert.equal(sgFund(data, "telok-ayer").whtRemitted, null);
  assert.equal(rowsFor(data, "telok-ayer")[1].status, "done");
});

test("lodging Form UT completes the Form UT obligation, for that fund only", () => {
  const data = freshData();
  data.lodgments.push({ fundId: "meranti", kind: "form-ut", reference: "IRAS ack 100200300", date: "2027-04-01", actor: "S. Lim" });
  assert.equal(rowsFor(data, "meranti")[2].status, "done");
  assert.equal(rowsFor(data, "kallang")[2].status, "open");
  // An AIIR or a return lodged against the fund is not a Form UT.
  data.lodgments.push({ fundId: "kallang", kind: "return", reference: "x", date: "2027-04-01", actor: "S. Lim" });
  assert.equal(rowsFor(data, "kallang")[2].status, "open");
});

test("a fund with no notice record falls back on the period end instead of failing", () => {
  const data = freshData();
  data.sgNotices = data.sgNotices.filter((n) => n.fundId !== "kallang");
  const fund = sgFund(data, "kallang");
  const rows = rowsFor(data, "kallang");
  assert.equal(rows[0].date, fund.periodEnd);
  assert.equal(rows[0].status, "overdue", "the period ended on 30 Sep and nothing has been published");
  assert.equal(rows[1].date, reitWithholdingDueDate(fund.periodEnd));
  assert.equal(rows[2].date, "2027-04-15");
});

test("deadlines don't change the data and rejects a fund from another market", () => {
  const data = freshData();
  const before = JSON.stringify(data);
  rowsFor(data, "loyang");
  assert.equal(JSON.stringify(data), before);
  const au = data.funds.find((f) => f.market === "AU");
  assert.ok(au);
  const calc = sgModule.fundCalc(data, sgFund(data, "loyang"), NOW);
  assert.throws(() => sgModule.deadlines(data, au, calc, NOW), /Singapore module/);
});
