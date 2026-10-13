// The Singapore rules table: the reference app's wording, with the rates, thresholds and dates read back from the engine.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mulBps } from "../../../src/engine/money.ts";
import { RULES, computeReitTax, determineReitInvestorTax, reitFormUtDueDate } from "../../../src/engine/reitTax.ts";
import type { ReitInvestorClass } from "../../../src/engine/reitTax.ts";
import { sgModule } from "../../../src/domain/sg/index.ts";
import { freshData, SG_IDS, sgFund } from "./helpers.ts";

const ROWS = [
  ["Individuals (not through a partnership, trade or business)", "Exempt — paid gross", "ITA 1947 s13(1)(zh)"],
  [
    "Qualifying unitholders (Singapore companies, branches, bodies of persons, international organisations, REIT ETFs)",
    "Paid gross — taxed at own rate",
    "ITA 1947 s45G does not apply",
  ],
  ["Qualifying non-resident non-individuals", "10% final, distributions to 31 Dec 2030", "ITA 1947 s45G(1)(a)"],
  ["Qualifying non-resident funds", "10% final, 1 Jul 2019 – 31 Dec 2030", "ITA 1947 s45G; s13D, s13U, s13V (s13OA from 1 Jan 2025)"],
  ["Other unitholders", "17% (prevailing corporate rate), not final", "ITA 1947 s45G(1)(b)"],
  ["Tax transparency condition", "At least 90% of taxable specified income distributed in the year", "ITA 1947 s43(2A); IRAS e-Tax Guide ¶5.3"],
  ["Undistributed specified income", "Taxed at the trustee at 17%", "IRAS e-Tax Guide ¶6.1"],
  [
    "Failing the 90% distribution condition",
    "If the 90% same-year distribution condition is not met, tax transparency does not apply and the full taxable specified income is taxed at the trustee (IRAS e-Tax Guide paras 5.3, 18.5; ITA s43(2)); distributions out of income already taxed at the trustee are not taxed again (para 8.4), so no s45G withholding applies to them. This demo shows the reference app's simpler figures (trustee tax on retained income only, withholding on the whole distribution); see the worst-case figure on the Checks tab.",
    "ITA 1947 s43(2); IRAS e-Tax Guide ¶5.3, ¶8.4, ¶18.5 (worded for the COVID-19 extended period); engine rule reit-tax.transparency-and-distribution.2022-plus (finding REIT.TRANSPARENCY.FAIL)",
  ],
  ["Tax-exempt income and capital gains distributions", "Not taxable to unitholders", "ITA 1947 s35(15)"],
  [
    "Return of capital",
    "Unit holders should reduce their cost of units by the amount of return of capital. For traders, the reduced cost is used for trading gains; if the return of capital exceeds the cost, the excess is taxable as trading income and the proceeds of all later sales of the remaining units are fully taxable.",
    "ITA 1947 s35(15C); IRAS e-Tax Guide ¶8.8",
  ],
  ["Withholding tax on distributions", "Filed and paid by the 15th of the second month after the date of payment", "ITA 1947 s45, s45G"],
  [
    "Unitholder declarations",
    "Form A (unitholders) or Form B (depository agents) before each distribution; without one, tax is deducted",
    "IRAS e-Tax Guide ¶12–13 (¶12.2(b))",
  ],
  [
    "Declaration cut-off and tax notice timing",
    "The record date and the declaration cut-off are set by the manager, not by IRAS (the dates in this demo are sample data). IRAS requires Form A, or Form B from depository agents, before every distribution; it sets no number of days after the record date for the declarations and no date for the tax notice. Announcing the notice before the record date is market practice.",
    "IRAS e-Tax Guide ¶13.1 (Form A prior to every distribution); the Guide sets no cut-off date and no notice date",
  ],
  ["Form UT", "Filed with audited accounts and tax computation by 15 April", "IRAS e-Tax Guide ¶16.1"],
];

const rulesFor = (id: string) => {
  const data = freshData();
  return sgModule.rules(sgFund(data, id));
};

test("the rules table has the reference's title, rows and wording", () => {
  const table = rulesFor("telok-ayer");
  assert.equal(table.title, "Rules applied to S-REITs, per the IRAS e-Tax Guide on REITs (12th edition, 4 Dec 2025).");
  assert.deepEqual(table.rows.map((r) => [r.item, r.treatment, r.basis]), ROWS);
});

test("every Singapore fund shows the same table", () => {
  const first = JSON.stringify(rulesFor("telok-ayer"));
  for (const id of SG_IDS) assert.equal(JSON.stringify(rulesFor(id)), first, id);
});

test("the concession dates in the table are the dates on which the engine changes the rate", () => {
  const rateOn = (cls: ReitInvestorClass, date: string, section?: "13D" | "13OA" | "13U" | "13V") => {
    const r = determineReitInvestorTax({ distributionDate: date, investorClass: cls, declarationStatus: "FORM_A_VALID", fundExemptionSection: section });
    return r.withholdingApplies ? [r.withholdingRateBps, r.finalTax] : [0, false];
  };
  const NRNI: ReitInvestorClass = "QUALIFYING_NON_RESIDENT_NON_INDIVIDUAL";
  const FUND: ReitInvestorClass = "QUALIFYING_NON_RESIDENT_FUND";
  assert.deepEqual(rateOn(NRNI, "2030-12-31"), [1000, true]);
  assert.deepEqual(rateOn(NRNI, "2031-01-01"), [1700, false]);
  assert.deepEqual(rateOn(FUND, "2019-06-30"), [1700, false]);
  assert.deepEqual(rateOn(FUND, "2019-07-01"), [1000, true]);
  assert.deepEqual(rateOn(FUND, "2030-12-31"), [1000, true]);
  assert.deepEqual(rateOn(FUND, "2031-01-01"), [1700, false]);
  assert.deepEqual(rateOn(FUND, "2024-12-31", "13OA"), [1700, false]);
  assert.deepEqual(rateOn(FUND, "2025-01-01", "13OA"), [1000, true]);
  const table = rulesFor("loyang");
  const text = (item: string) => table.rows.find((r) => r.item === item);
  assert.match(text("Qualifying non-resident non-individuals")?.treatment ?? "", /to 31 Dec 2030$/);
  assert.match(text("Qualifying non-resident funds")?.treatment ?? "", /1 Jul 2019 – 31 Dec 2030$/);
  assert.match(text("Qualifying non-resident funds")?.basis ?? "", /s13OA from 1 Jan 2025/);
});

test("the 90% threshold, the trustee rate and the Form UT date are the engine's", () => {
  const income = 1_000_000;
  assert.equal(computeReitTax({ distributionDate: "2026-09-30", taxableSpecifiedIncome: income, taxableSpecifiedIncomeDistributed: 900_000 }).passesTransparencyTest, true);
  assert.equal(computeReitTax({ distributionDate: "2026-09-30", taxableSpecifiedIncome: income, taxableSpecifiedIncomeDistributed: 899_999 }).passesTransparencyTest, false);
  assert.equal(computeReitTax({ distributionDate: "2026-09-30", taxableSpecifiedIncome: income, taxableSpecifiedIncomeDistributed: 0 }).trusteeTaxRateBps, 1700);
  assert.equal(reitFormUtDueDate(2027), "2027-04-15");
  const table = rulesFor("loyang");
  assert.match(table.rows.find((r) => r.item === "Tax transparency condition")?.treatment ?? "", /^At least 90% /);
  assert.match(table.rows.find((r) => r.item === "Undistributed specified income")?.treatment ?? "", /at 17%$/);
  assert.match(table.rows.find((r) => r.item === "Form UT")?.treatment ?? "", /by 15 April$/);
});

test("the row on failing the 90% condition states the law first, cites the Guide and says which figures this demo shows", () => {
  const row = rulesFor("kallang").rows.find((r) => r.item === "Failing the 90% distribution condition");
  assert.ok(row);
  const income = 1_000_000;
  const failed = computeReitTax({ distributionDate: "2026-09-30", taxableSpecifiedIncome: income, taxableSpecifiedIncomeDistributed: 850_000 });
  assert.equal(failed.trusteeTax, mulBps(income, failed.trusteeTaxRateBps), "the engine taxes all of the specified income at the trustee");
  assert.equal(failed.composition.transparentTaxableDistribution, 0, "the engine treats transparency as denied");
  assert.ok(failed.findings.some((f) => f.id === "REIT.TRANSPARENCY.FAIL"));
  assert.ok(row.basis.includes("REIT.TRANSPARENCY.FAIL"));
  const rule = RULES.find((r) => row.basis.includes(r.id));
  assert.ok(rule, "the engine rule named in the basis exists");
  assert.equal(rule.domain, "REIT_TAX");
  assert.match(row.basis, /^ITA 1947 s43\(2\); IRAS e-Tax Guide ¶5\.3, ¶8\.4, ¶18\.5 /);
  assert.ok(!/do not state the consequence/.test(row.basis), "the Guide does state it: paras 18.5 and 8.4");
  assert.ok(
    row.treatment.startsWith(
      "If the 90% same-year distribution condition is not met, tax transparency does not apply and the full taxable specified income is taxed at the trustee (IRAS e-Tax Guide paras 5.3, 18.5; ITA s43(2));",
    ),
  );
  assert.ok(row.treatment.includes("distributions out of income already taxed at the trustee are not taxed again (para 8.4), so no s45G withholding applies to them."));
  assert.ok(
    row.treatment.endsWith(
      "This demo shows the reference app's simpler figures (trustee tax on retained income only, withholding on the whole distribution); see the worst-case figure on the Checks tab.",
    ),
  );
});

test("the return of capital row follows e-Tax Guide para 8.8", () => {
  const row = rulesFor("loyang").rows.find((r) => r.item === "Return of capital");
  assert.ok(row);
  assert.equal(
    row.treatment,
    "Unit holders should reduce their cost of units by the amount of return of capital. For traders, the reduced cost is used for trading gains; if the return of capital exceeds the cost, the excess is taxable as trading income and the proceeds of all later sales of the remaining units are fully taxable.",
  );
  assert.equal(row.basis, "ITA 1947 s35(15C); IRAS e-Tax Guide ¶8.8");
});

test("the declaration cut-off is the manager's: IRAS asks for Form A / Form B before every distribution and sets no cut-off or notice date", () => {
  const rows = rulesFor("loyang").rows;
  const forms = rows.find((r) => r.item === "Unitholder declarations");
  assert.ok(forms);
  assert.match(forms.treatment, /before each distribution/);
  const cutOff = rows.find((r) => r.item === "Declaration cut-off and tax notice timing");
  assert.ok(cutOff);
  assert.ok(rows.indexOf(cutOff) === rows.indexOf(forms) + 1, "it follows the declarations row");
  assert.ok(cutOff.treatment.includes("set by the manager, not by IRAS"));
  assert.ok(cutOff.treatment.includes("IRAS requires Form A, or Form B from depository agents, before every distribution"));
  assert.ok(cutOff.treatment.includes("sets no number of days after the record date for the declarations and no date for the tax notice"));
  assert.ok(cutOff.treatment.endsWith("Announcing the notice before the record date is market practice."));
  assert.match(cutOff.basis, /¶13\.1/);
});

test("a fund whose period ends after the concessions stop still sees the concessions described as they are", () => {
  const data = freshData();
  const fund = sgFund(data, "loyang");
  fund.periodEnd = "2031-03-31";
  const rows = sgModule.rules(fund).rows;
  assert.equal(rows[2].treatment, "10% final, distributions to 31 Dec 2030");
  assert.equal(rows[3].treatment, "10% final, 1 Jul 2019 – 31 Dec 2030");
  assert.equal(rows[4].treatment, "17% (prevailing corporate rate), not final");
});

test("the rules table rejects a fund from another market", () => {
  const data = freshData();
  const au = data.funds.find((f) => f.market === "AU");
  assert.ok(au);
  assert.throws(() => sgModule.rules(au), /Singapore module/);
});
