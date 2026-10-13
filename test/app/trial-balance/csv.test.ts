import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, tbView } from "../../../src/domain/index.ts";
import { csvText } from "../../../src/app/exports/csv.ts";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  MAX_LISTED_ISSUES,
  checkImportFile,
  contentProblem,
  parseAmountCell,
  parseTbCsv,
} from "../../../src/app/workspaces/trial-balance/csv.ts";
import { planImport, tbExportCsv } from "../../../src/app/workspaces/trial-balance/model.ts";
import { ALL_IDS, NOW, ctxFor, freshData, fundOf } from "./fixtures.ts";

const { AU, SG } = freshData().tbCategories;
const HEADER = "Account,Name,Category,Current,Prior";
const text = (...lines: string[]): string => lines.join("\n");

describe("parseAmountCell", () => {
  it("reads amounts as integer cents", () => {
    const cases: Array<[string, number]> = [
      ["0", 0],
      ["1234", 123400],
      ["1,234", 123400],
      ["1,234.5", 123450],
      ["1,234.56", 123456],
      ["12,345,678.90", 1234567890],
      ["0.5", 50],
      ["0.05", 5],
      ["  42  ", 4200],
    ];
    for (const [cell, cents] of cases) assert.deepEqual(parseAmountCell(cell), { ok: true, cents }, cell);
  });

  it("reads minus signs, brackets and currency markers", () => {
    const cases: Array<[string, number]> = [
      ["-1,234.56", -123456],
      ["\u22121,234.56", -123456],
      ["(1,234.56)", -123456],
      ["( 1,234.56 )", -123456],
      ["A$1,200", 120000],
      ["$1,200.00", 120000],
      ["S$ 1,200", 120000],
      ["AUD 1,200", 120000],
      ["sgd1200", 120000],
      ["-$1,200", -120000],
      ["$-1,200", -120000],
      ["(A$1,200.50)", -120050],
    ];
    for (const [cell, cents] of cases) assert.deepEqual(parseAmountCell(cell), { ok: true, cents }, cell);
  });

  it("never returns negative zero", () => {
    for (const cell of ["-0", "\u22120", "(0.00)", "-0.00"]) {
      const result = parseAmountCell(cell);
      assert.ok(result.ok && Object.is(result.cents, 0), cell);
    }
  });

  it("refuses what it cannot read without guessing", () => {
    const cases: Array<[string, string]> = [
      ["", "empty"],
      ["   ", "empty"],
      ["1,23", "format"],
      ["1.234,56", "format"],
      ["12,34,567", "format"],
      ["1,2345", "format"],
      ["1 234", "format"],
      ["abc", "format"],
      ["=1+1", "format"],
      ["1e5", "format"],
      ["NaN", "format"],
      ["Infinity", "format"],
      ["(1,234", "format"],
      ["1,234)", "format"],
      ["--5", "format"],
      ["-(5)", "format"],
      ["(-5)", "format"],
      ["1.2.3", "format"],
      ["1".repeat(41), "format"],
      ["12.345", "decimals"],
      ["0.001", "decimals"],
      ["9".repeat(30), "large"],
    ];
    for (const [cell, reason] of cases) {
      const result = parseAmountCell(cell);
      assert.equal(result.ok, false, cell);
      assert.equal(result.ok ? null : result.reason, reason, cell);
    }
  });
});

describe("checkImportFile", () => {
  it("accepts a CSV or text file up to 1 MB", () => {
    for (const name of ["trial-balance.csv", "trial balance.TXT", "export.tsv", "no-extension", "tb.2026.csv"]) {
      assert.equal(checkImportFile({ name, size: 1000 }), null, name);
    }
    assert.equal(checkImportFile({ name: "tb.csv", size: MAX_IMPORT_BYTES }), null);
  });

  it("refuses an empty file and one over the limit, with the size", () => {
    assert.equal(checkImportFile({ name: "tb.csv", size: 0 }), "The file is empty.");
    assert.equal(checkImportFile({ name: "tb.csv", size: MAX_IMPORT_BYTES + 1 }), "The file is 1.01 MB. The limit is 1 MB.");
    assert.equal(checkImportFile({ name: "tb.csv", size: 3.4 * MAX_IMPORT_BYTES }), "The file is 3.4 MB. The limit is 1 MB.");
  });

  it("refuses files that are plainly not CSV by their extension", () => {
    for (const name of ["ledger.xlsx", "ledger.XLS", "scan.pdf", "tb.zip", "page.html", "data.json", "logo.png", "tb.docx", "tb.csv.exe"]) {
      const message = checkImportFile({ name, size: 1000 });
      assert.match(message ?? "", /not a CSV file/, name);
    }
    assert.match(checkImportFile({ name: "Ledger.XLSX", size: 10 }) ?? "", /^That is a \.xlsx file/);
  });
});

describe("contentProblem", () => {
  it("lets ordinary CSV text through, including tabs, line breaks and non-ASCII text", () => {
    assert.equal(contentProblem(text(HEADER, "4000,Rent \u2014 Caf\u00e9\t,,1,2")), null);
    assert.equal(contentProblem("a,b\r\n1,2\r\n"), null);
  });

  it("refuses text over 1 MB, measured in bytes", () => {
    assert.equal(contentProblem("a".repeat(MAX_IMPORT_BYTES)), null);
    assert.equal(contentProblem("a".repeat(MAX_IMPORT_BYTES + 1)), "The text is 1.01 MB. The limit is 1 MB.");
    assert.equal(contentProblem("\u00e9".repeat(400_000)), null);
    assert.match(contentProblem("\u00e9".repeat(600_000)) ?? "", /is 1\.15 MB/);
  });

  it("refuses binary data, PDFs and web pages", () => {
    const notText = "This file isn't a CSV text file";
    assert.ok(contentProblem("PK\u0003\u0004\u0000\u0000binary")?.startsWith(notText));
    assert.ok(contentProblem("a,b\u0007\n1,2")?.startsWith(notText));
    assert.ok(contentProblem("%PDF-1.7\n1 0 obj")?.startsWith(notText));
    assert.ok(contentProblem("\ufffd\ufffd\ufffd,\ufffd\ufffd")?.startsWith(notText));
    for (const page of ["<!DOCTYPE html><html></html>", "  <html lang=en>", '<?xml version="1.0"?><Workbook/>', "<table><tr><td>1</td></tr></table>", "<script>alert(1)</script>"]) {
      assert.match(contentProblem(page) ?? "", /web page or XML/, page);
    }
  });
});

describe("parseTbCsv: reading a file", () => {
  it("reads the account, name, category and both balances, in file order", () => {
    const result = parseTbCsv(
      text(HEADER, '4000,Rental income,rent,"-1,200.50",-1000', "5000,Property expenses,Deductible expense,300,(250.25)"),
      AU,
    );
    assert.equal(result.ok, true);
    assert.equal(result.fatal, null);
    assert.deepEqual(result.rows, [
      { account: "4000", name: "Rental income", category: "rent", current: -120050, prior: -100000 },
      { account: "5000", name: "Property expenses", category: "deductible-expense", current: 30000, prior: -25025 },
    ]);
    assert.deepEqual(result.columns, ["account", "name", "category", "current", "prior"]);
    assert.deepEqual([result.errorCount, result.warningCount, result.delimiter], [0, 0, ","]);
  });

  it("reads a BOM and CRLF, LF or CR line ends the same way", () => {
    const rows = [HEADER, "4000,Rent,rent,1,2", "5000,Fees,,3,4"];
    const expected = parseTbCsv(rows.join("\n"), AU);
    assert.equal(expected.ok, true);
    assert.equal(expected.rows.length, 2);
    assert.deepEqual(parseTbCsv(`\ufeff${rows.join("\r\n")}\r\n`, AU).rows, expected.rows);
    assert.deepEqual(parseTbCsv(rows.join("\r"), AU).rows, expected.rows);
  });

  it("reads quoted values with commas, doubled quotes and line breaks", () => {
    const result = parseTbCsv(
      text(HEADER, '4000,"Rent, ""Level 3"" & car park",rent,1,2', '5000,"Fees\nand charges",,3,4', "6000,After,,5,6"),
      AU,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.rows.map((r) => r.name),
      ['Rent, "Level 3" & car park', "Fees and charges", "After"],
    );
  });

  it("counts lines in the file, not records, so an error points at the right line", () => {
    const result = parseTbCsv(text(HEADER, '4000,"Two\nline name",rent,1,2', "", "5000,Bad,,oops,0"), AU);
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]?.line, 5);
    assert.match(result.errors[0]?.message ?? "", /current amount "oops"/);
  });

  it("detects tab and semicolon separated text, such as pasted spreadsheet cells", () => {
    const tabs = parseTbCsv("Account\tName\tCurrent\tPrior\n4000\tRent, parking\t1,234.50\t(2,000)", AU);
    assert.equal(tabs.ok, true);
    assert.equal(tabs.delimiter, "\t");
    assert.deepEqual(tabs.rows, [{ account: "4000", name: "Rent, parking", current: 123450, prior: -200000 }]);
    const semicolons = parseTbCsv("Account;Name;Current;Prior\n4000;Rent, parking;1234.50;0", AU);
    assert.equal(semicolons.ok, true);
    assert.equal(semicolons.delimiter, ";");
    assert.equal(semicolons.rows[0]?.name, "Rent, parking");
    assert.equal(semicolons.rows[0]?.current, 123450);
  });

  it("does not guess at a decimal comma", () => {
    const result = parseTbCsv("Account;Name;Current;Prior\n4000;Rent;1234,50;0", AU);
    assert.equal(result.ok, false);
    assert.match(result.errors[0]?.message ?? "", /"1234,50" is not a valid amount/);
  });

  it("skips blank lines and allows trailing empty cells", () => {
    const result = parseTbCsv(text(HEADER, "", "4000,Rent,rent,1,2,,", "", "", "5000,Fees,,x,2"), AU);
    assert.deepEqual(result.rows.map((r) => r.account), ["4000"]);
    assert.equal(result.errors[0]?.line, 6);
  });

  it("rejects a row with more values than the header and says why", () => {
    const result = parseTbCsv(text(HEADER, "4000,Rent, car park,rent,1,2"), AU);
    assert.equal(result.ok, false);
    assert.match(result.errors[0]?.message ?? "", /has 6 values but the header has 5\. Put any value that contains a comma in quotes\./);
    assert.equal(result.errors[0]?.line, 2);
  });

  it("keeps text that looks like a formula or markup exactly as written (it is only ever shown as text)", () => {
    const result = parseTbCsv(text(HEADER, '4000,"=HYPERLINK(""http://example.test"",""x"")",,1,2', "5000,<img src=x onerror=alert(1)>,,1,2"), AU);
    assert.equal(result.ok, true);
    assert.equal(result.rows[0]?.name, '=HYPERLINK("http://example.test","x")');
    assert.equal(result.rows[1]?.name, "<img src=x onerror=alert(1)>");
  });
});

describe("parseTbCsv: columns", () => {
  it("accepts the usual alternative names for the columns", () => {
    const result = parseTbCsv("Account code;Account name;Tax category;Current year;Prior year\n4000;Rent;rent;1;2", AU);
    assert.equal(result.ok, true);
    assert.deepEqual(result.columns, ["account", "name", "category", "current", "prior"]);
    assert.deepEqual(result.rows, [{ account: "4000", name: "Rent", category: "rent", current: 100, prior: 200 }]);
  });

  it("ignores columns it does not know and lists them", () => {
    const result = parseTbCsv("Account,Name,Tax category,Treatment,Current,Prior,Change\n4000,Rent,rent,Assessable,1,2,-1", AU);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ignoredColumns, ["Treatment", "Change"]);
    assert.deepEqual(result.rows[0], { account: "4000", name: "Rent", category: "rent", current: 100, prior: 200 });
  });

  it("names the missing required columns", () => {
    const missingPrior = parseTbCsv("Account,Name,Current\n4000,Rent,1", AU);
    assert.equal(missingPrior.ok, false);
    assert.match(missingPrior.fatal ?? "", /It has no prior column \(found: Account, Name, Current\)\./);
    const missingAll = parseTbCsv("Name,Balance\nRent,1", AU);
    assert.match(missingAll.fatal ?? "", /It has no account, current or prior columns \(found: Name, Balance\)\./);
    assert.deepEqual(missingAll.rows, []);
    assert.equal(missingAll.errors[0]?.line, null);
  });

  it("refuses a column named twice", () => {
    const result = parseTbCsv("Account,Account,Current,Prior\n4000,5000,1,2", AU);
    assert.equal(result.ok, false);
    assert.equal(result.fatal, "The account column appears more than once in the first row.");
  });

  it("uses the account code as the name when the name is blank or the column is missing, and says so for the column", () => {
    const blank = parseTbCsv(text(HEADER, "4000,,rent,1,2"), AU);
    assert.equal(blank.rows[0]?.name, "4000");
    assert.equal(blank.warningCount, 0);
    const none = parseTbCsv("Account,Current,Prior\n4000,1,2", AU);
    assert.equal(none.ok, true);
    assert.equal(none.rows[0]?.name, "4000");
    assert.match(none.warnings[0]?.message ?? "", /no name column/);
    assert.equal(none.warnings[0]?.line, null);
  });
});

describe("parseTbCsv: tax categories", () => {
  it("matches a category by its id or by its label, ignoring case and spacing", () => {
    const result = parseTbCsv(
      text(HEADER, "1,A,rent,1,0", "2,B,Deductible-Expense,1,0", "3,C,  RENTAL   AND PROPERTY INCOME ,1,0", "4,D,Fair value movement,1,0"),
      AU,
    );
    assert.deepEqual(
      result.rows.map((r) => r.category),
      ["rent", "deductible-expense", "rent", "fair-value"],
    );
    assert.equal(result.warningCount, 0);
  });

  it("gives a row with no category cell no category, so it stays unmapped", () => {
    const result = parseTbCsv(text(HEADER, "4000,Rent,,1,2"), AU);
    assert.equal(result.ok, true);
    assert.equal("category" in (result.rows[0] ?? {}), false);
    const noColumn = parseTbCsv("Account,Name,Current,Prior\n4000,Rent,1,2", AU);
    assert.equal("category" in (noColumn.rows[0] ?? {}), false);
    assert.equal(noColumn.warningCount, 0);
  });

  it("warns about a category it does not know and gives the row none", () => {
    const result = parseTbCsv(text(HEADER, "4000,Rent,Stationery,1,2"), AU);
    assert.equal(result.ok, true);
    assert.equal("category" in (result.rows[0] ?? {}), false);
    assert.equal(result.warningCount, 1);
    assert.equal(result.warnings[0]?.line, 2);
    assert.match(result.warnings[0]?.message ?? "", /"Stationery" is not one of this fund's categories/);
  });

  it("reads 'Needs a tax category' and 'unmapped' as an explicit reset, for either market", () => {
    for (const categories of [AU, SG]) {
      const result = parseTbCsv(text(HEADER, "1,A,Needs a tax category,1,0", "2,B,unmapped,1,0"), categories);
      assert.deepEqual(
        result.rows.map((r) => r.category),
        ["unmapped", "unmapped"],
      );
      assert.equal(result.warningCount, 0);
    }
  });

  it("matches against the categories of the market it is given", () => {
    const result = parseTbCsv(text(HEADER, "1,A,Tax-exempt income,1,0", "2,B,Cross-staple rent (NCMI),1,0"), SG);
    assert.equal(result.rows[0]?.category, "exempt-income");
    assert.equal("category" in (result.rows[1] ?? {}), false);
    assert.equal(result.warningCount, 1);
  });
});

describe("parseTbCsv: rows that cannot be read", () => {
  it("lists every bad row with its line and still reads the good ones", () => {
    const result = parseTbCsv(text(HEADER, "4000,Rent,rent,1,2", "5000,Fees,,abc,2", "6000,Tax,,1,", "7000,Ok,,3,4"), AU);
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.errors.map((e) => e.line),
      [3, 4],
    );
    assert.match(result.errors[0]?.message ?? "", /The current amount "abc" is not a valid amount\. Use digits/);
    assert.equal(result.errors[1]?.message, "The prior amount is empty. Enter 0 if the account has no balance.");
    assert.deepEqual(
      result.rows.map((r) => r.account),
      ["4000", "7000"],
    );
  });

  it("names the earlier line when an account appears twice", () => {
    const result = parseTbCsv(text(HEADER, "4000,Rent,rent,1,2", "5000,Fees,,3,4", "  4000 ,Again,,5,6"), AU);
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]?.line, 4);
    assert.equal(result.errors[0]?.message, "Account 4000 is already on line 2. Each account can appear once.");
    assert.deepEqual(
      result.rows.map((r) => r.account),
      ["4000", "5000"],
    );
  });

  it("treats accounts that differ only in letter case as different accounts, as the action does", () => {
    const result = parseTbCsv(text(HEADER, "a100,Lower,,1,2", "A100,Upper,,3,4"), AU);
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 2);
  });

  it("refuses an empty account code and over-long codes and names", () => {
    const result = parseTbCsv(text(HEADER, ",Nothing,,1,2", `${"9".repeat(31)},Long code,,1,2`, `5000,${"n".repeat(121)},,1,2`), AU);
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.errors.map((e) => e.message),
      ["The account code is empty.", "The account code is longer than 30 characters.", "The account name is longer than 120 characters."],
    );
  });

  it("lists at most 50 errors but counts them all", () => {
    const bad = Array.from({ length: 60 }, (_, i) => `A${i},Row ${i},,oops,0`);
    const result = parseTbCsv(text(HEADER, ...bad), AU);
    assert.equal(result.ok, false);
    assert.equal(result.errorCount, 60);
    assert.equal(result.errors.length, MAX_LISTED_ISSUES);
    assert.equal(result.errors[0]?.line, 2);
    assert.equal(result.errors[49]?.line, 51);
    assert.equal(result.rows.length, 0);
  });

  it("reports a quote that is never closed", () => {
    const result = parseTbCsv(text(HEADER, '4000,"Rent,rent,1,2', "5000,Fees,,3,4"), AU);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0]?.line, 2);
    assert.match(result.errors[0]?.message ?? "", /never closed/);
    assert.equal(parseTbCsv('Account,"Name,Current,Prior', AU).fatal, "The quote opened on line 1 is never closed.");
  });
});

describe("parseTbCsv: limits and unreadable files", () => {
  const many = (count: number): string =>
    text(HEADER, ...Array.from({ length: count }, (_, i) => `${1000 + i},Account ${i},,${i},0`));

  it("reads 2,000 accounts and refuses 2,001", () => {
    const ok = parseTbCsv(many(MAX_IMPORT_ROWS), AU);
    assert.equal(ok.ok, true);
    assert.equal(ok.rows.length, 2000);
    const tooMany = parseTbCsv(many(MAX_IMPORT_ROWS + 1), AU);
    assert.equal(tooMany.ok, false);
    assert.equal(tooMany.fatal, "The file has 2,001 accounts. The limit is 2,000.");
    assert.deepEqual(tooMany.rows, []);
  });

  it("refuses text over 1 MB", () => {
    const result = parseTbCsv(`${HEADER}\n${"x".repeat(MAX_IMPORT_BYTES)}`, AU);
    assert.equal(result.ok, false);
    assert.match(result.fatal ?? "", /^The text is 1\.01 MB\. The limit is 1 MB\.$/);
  });

  it("refuses binary data, a PDF and a web page without reading any rows", () => {
    for (const body of ["PK\u0003\u0004\u0000\u0000x", "%PDF-1.7\n1 0 obj", "<!DOCTYPE html><html><body>Account,Current,Prior</body></html>"]) {
      const result = parseTbCsv(body, AU);
      assert.equal(result.ok, false);
      assert.deepEqual(result.rows, []);
      assert.equal(result.errorCount, 1);
      assert.equal(result.errors[0]?.line, null);
      assert.equal(result.errors[0]?.message, result.fatal);
    }
  });

  it("explains an empty file and a file with a header and no accounts", () => {
    for (const body of ["", "   \n \n", "\ufeff"]) assert.equal(parseTbCsv(body, AU).fatal, "The file is empty.", JSON.stringify(body));
    const headerOnly = parseTbCsv(`${HEADER}\n\n`, AU);
    assert.equal(headerOnly.fatal, "The file has a header row but no accounts.");
    assert.deepEqual(headerOnly.columns, ["account", "name", "category", "current", "prior"]);
  });

  it("is quick on hostile input", () => {
    const started = Date.now();
    parseTbCsv(text(HEADER, `4000,Rent,,${"1,".repeat(5000)}1,2`, `5000,Rent,,${"(".repeat(5000)},1`, `6000,Rent,,${"9".repeat(100_000)},1`), AU);
    parseTbCsv(`${HEADER}\n${'"'.repeat(200_000)}`, AU);
    assert.ok(Date.now() - started < 1500);
  });
});

describe("the exported file reads back", () => {
  for (const id of ALL_IDS) {
    it(`${id}: Download CSV parses with no errors, warnings or changes`, () => {
      const data = freshData();
      const view = tbView(data, id, NOW);
      const csv = csvText(tbExportCsv(fundOf(data, id).name, view));
      const parsed = parseTbCsv(csv, view.categories);
      assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
      assert.equal(parsed.warningCount, 0);
      assert.deepEqual(parsed.ignoredColumns, ["Treatment", "Change"]);
      assert.deepEqual(
        parsed.rows.map((r) => [r.account, r.name, r.current, r.prior]),
        view.rows.map((r) => [r.account, r.name, r.current, r.prior]),
      );
      for (const [i, row] of parsed.rows.entries()) {
        const original = view.rows[i];
        assert.equal(row.category ?? "unmapped", original?.category === "unmapped" ? "unmapped" : original?.category, `${id} ${row.account}`);
      }
    });
  }

  for (const id of ["coastline", "telok-ayer", "kallang"]) {
    it(`${id}: importing the exported file through the import-tb action changes nothing`, () => {
      const data = freshData();
      const fund = fundOf(data, id);
      const before = tbView(data, id, NOW);
      const parsed = parseTbCsv(csvText(tbExportCsv(fund.name, before)), before.categories);
      const plan = planImport(parsed.rows, data.tbRows.filter((r) => r.fundId === id), before.categories, fund.market);
      assert.equal(plan.dropped, 0);
      assert.equal(plan.added, 0);
      const result = applyAction(data, { type: "import-tb", fundId: id, rows: plan.rows }, ctxFor(data, "a-moreno"));
      assert.ok(result.ok, result.ok ? "" : result.reason);
      if (!result.ok) return;
      assert.deepEqual(tbView(result.data, id, NOW).rows, before.rows);
    });
  }

  it("an import replaces the fund's trial balance with the file's accounts", () => {
    const data = freshData();
    const before = tbView(data, "coastline", NOW);
    const parsed = parseTbCsv(
      text(HEADER, "4000,Rent,rent,-100,-90", "5000,Fees,Deductible expense,60,50", "9999,New account,,40,40"),
      before.categories,
    );
    const plan = planImport(parsed.rows, data.tbRows.filter((r) => r.fundId === "coastline"), before.categories, "AU");
    const result = applyAction(data, { type: "import-tb", fundId: "coastline", rows: plan.rows }, ctxFor(data, "a-moreno"));
    assert.ok(result.ok);
    if (!result.ok) return;
    const after = tbView(result.data, "coastline", NOW);
    assert.deepEqual(
      after.rows.map((r) => [r.account, r.name, r.category, r.current, r.prior]),
      [
        ["4000", "Rent", "rent", -10000, -9000],
        ["5000", "Fees", "deductible-expense", 6000, 5000],
        ["9999", "New account", "unmapped", 4000, 4000],
      ],
    );
    assert.equal(after.balanced, true);
    assert.equal(after.allMapped, false);
  });
});
