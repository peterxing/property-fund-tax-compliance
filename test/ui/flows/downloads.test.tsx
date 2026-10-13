// Flow 8: downloads. Every download button hands the browser one whole file: CSVs open in Excel (byte order mark, the expected header, CRLF records),
// PDFs are complete documents that carry the figures the page shows, the Power BI workbook is a sound .xlsx package that holds only the funds the
// persona may see. The stubbed URL.createObjectURL (test/ui/env.ts) keeps the Blob behind each click.
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/ui/flows/downloads.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mountApp, type MountedApp } from "../harness.tsx";
import { oracle } from "../oracle.ts";
import { announced, personaSelect } from "../shell.ts";
import { expectWholePdf, parseCsv, pdfPages, pdfText, workbookSheets, workbookText } from "./files.ts";
import { dataOf, download, openTab, rowStarting, type Received } from "./support.ts";

const COASTLINE = "Coastline Healthcare Property Fund";
const KALLANG = "Kallang Riverside Retail REIT";
const SLUG = { coastline: "coastline-healthcare-property-fund", kallang: "kallang-riverside-retail-reit" } as const;
const slugOf = (text: string): string => text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Clicks a download button the way a person does and checks what the page does around it. */
async function getFile(app: MountedApp, name: string, index = 0): Promise<Received> {
  const button = app.allByRole("button", name)[index];
  assert.ok(button, `the page has a "${name}" button (number ${index})`);
  assert.notEqual(button.getAttribute("aria-disabled"), "true", `"${name}" is available`);
  const file = await download(app, button);
  assert.equal(announced(app), "Download started.", `the click is announced`);
  assert.equal(app.$$(".dl__error").length, 0, "no error beside the button");
  assert.equal(document.querySelectorAll("a[download]").length, 0, "the temporary link is taken out of the page again");
  return file;
}

/** A CSV the way Excel wants it; returns the records under the header. */
function csvOf(file: Received, fileName: string, header: string[]): string[][] {
  assert.equal(file.fileName, fileName);
  assert.equal(file.type, "text/csv;charset=utf-8");
  assert.deepEqual(Array.from(file.bytes.subarray(0, 3)), [0xef, 0xbb, 0xbf], "starts with the UTF-8 byte order mark");
  assert.doesNotMatch(file.text, /(?<!\r)\n/, "every record ends with CRLF");
  const records = parseCsv(file.text);
  assert.deepEqual(records[0], header, `${fileName}: the header`);
  for (const [index, record] of records.entries()) assert.equal(record.length, header.length, `${fileName}: record ${index} has ${header.length} fields`);
  return records.slice(1);
}

/** A PDF that is whole, has the pages said, and returns the words on them. */
function pdfOf(file: Received, fileName: string, pages: number): string {
  assert.equal(file.fileName, fileName);
  assert.equal(file.type, "application/pdf");
  expectWholePdf(file.bytes, fileName);
  assert.equal(pdfPages(file.bytes), pages, `${fileName}: pages`);
  const text = pdfText(file.bytes);
  assert.ok(text.includes(`Page ${pages} of ${pages}`), `${fileName}: the last page says "Page ${pages} of ${pages}"`);
  assert.ok(text.includes("Demonstration document — not tax advice"), `${fileName}: carries the demonstration notice`);
  return text;
}

const expectText = (text: string, lines: string[], what: string): void =>
  assert.deepEqual(
    lines.filter((line) => !text.includes(line)),
    [],
    `${what}: the document does not say`,
  );

const figures = (text: string): string[] => Array.from(text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d{4,}/g), (match) => match[0].replace(/,/g, ""));

/** Every figure in the document is a figure the page shows, to the dollar: the file and the screen are made from the same numbers. */
function expectFiguresOnPage(documentText: string, pageText: string, what: string): void {
  const onPage = figures(pageText);
  const exact = new Set(onPage);
  const rounded = new Set(onPage.map((figure) => String(Math.round(Number(figure)))));
  const missing = figures(documentText).filter((figure) => !exact.has(figure) && !rounded.has(String(Math.round(Number(figure)))));
  assert.deepEqual(Array.from(new Set(missing)), [], `${what}: every figure in the document is on the page`);
}

const A = (amount: number): string => `A$${amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const S = (amount: number): string => `S$${amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TB_HEADER = ["Account", "Name", "Tax category", "Treatment", "Current", "Prior", "Change"];
const PROPERTIES_HEADER = ["Property", "Location", "Acquired", "Cost", "Improvements", "Capital works claimed", "Tax cost base", "Valuation", "Unrealised gain", "Held 12 months"];
const AIIR_HEADER = [
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
];

describe("Distributions: the statement PDF", () => {
  it("Australia: is the AMMA statement of the holder chosen, with the figures on the page", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "a-moreno" });
    await openTab(app, /^Statements/);
    const holder = app.byLabel("Holder") as HTMLSelectElement;
    assert.equal(holder.value, "h-cl-3", "Kestrel Pension Plan is the first holder with withholding");

    const kestrel = pdfOf(await getFile(app, "Download PDF"), `${SLUG.coastline}-amma-kestrel-pension-plan.pdf`, 1);
    expectText(
      kestrel,
      [
        "AMIT member annual statement",
        COASTLINE,
        "Member: Kestrel Pension Plan",
        "Country: Canada",
        "Tax status: Foreign resident — EOI country",
        "Units held: 47,841,000",
        "Income year ended: 30 Sep 2026",
        "Statement due: 31 Dec 2026",
        "Australian income — other A$2,545,567.50 15% A$381,835.13",
        "Australian interest A$31,845.00 10% A$3,184.50",
        "Total A$3,157,200.00 A$385,019.63",
        "Cash distribution received A$3,157,200.00",
        "AMIT cost base net amount — excess (decreases the cost base) A$414,067.50",
      ],
      "the Kestrel statement",
    );
    expectFiguresOnPage(kestrel, app.flat(), "the Kestrel statement");

    await app.select(holder, "h-cl-2");
    const banksia = pdfOf(await getFile(app, "Download PDF"), `${SLUG.coastline}-amma-banksia-super-fund.pdf`, 1);
    expectText(banksia, [COASTLINE, "Member: Banksia Super Fund", "Country: Australia", "Tax status: Australian resident", "Units held: 63,788,000", A(4_209_600)], "the Banksia statement");
    assert.ok(!banksia.includes("Kestrel"), "and nothing of the other holder");
    expectFiguresOnPage(banksia, app.flat(), "the Banksia statement");
    await app.unmount();
  });

  it("Singapore: is the unitholder statement of the holder chosen, with the tax deducted and the net paid", async () => {
    const app = await mountApp({ hash: "#/?fund=kallang", user: "a-moreno" });
    await openTab(app, /^Statements/);
    const holder = app.byLabel("Holder") as HTMLSelectElement;
    const first = pdfOf(await getFile(app, "Download PDF"), `${SLUG.kallang}-unitholder-statement-nordfjell-sovereign-holdings.pdf`, 1);
    expectText(
      first,
      [
        "Unitholder distribution statement",
        KALLANG,
        "Unitholder: Nordfjell Sovereign Holdings",
        "Country: Norway",
        "Tax status: Qualifying non-resident non-individual",
        "Units held: 510,414,000",
        "Distribution period: 1 Jul – 30 Sep 2026",
        "Payment date: 30 Nov 2026",
        "Year of assessment: YA2027",
        "Taxable income distribution S$5,343,075.00 10% final",
        "Tax deducted at 10% (final) (S$534,307.50)",
        "Net cash paid S$4,808,767.50",
      ],
      "the Nordfjell statement",
    );
    expectFiguresOnPage(first, app.flat(), "the Nordfjell statement");

    const other = Array.from(holder.options).find((option) => option.value !== holder.value)!;
    await app.select(holder, other.value);
    const name = other.textContent!.split(" · ")[0]!;
    const second = pdfOf(await getFile(app, "Download PDF"), `${SLUG.kallang}-unitholder-statement-${slugOf(name)}.pdf`, 1);
    assert.ok(second.includes(`Unitholder: ${name}`), `the second statement is for ${name}`);
    assert.ok(!second.includes("Nordfjell"), "and nothing of the first");
    await app.unmount();
  });
});

describe("Trial balance: the CSV", () => {
  it("is every account of the fund, as Excel opens it, in both markets, and follows a change made on the page", async () => {
    const app = await mountApp({ hash: "#/trial-balance?fund=coastline", user: "a-moreno" });
    const check = async (fundId: "coastline" | "kallang", market: "AU" | "SG"): Promise<string[][]> => {
      await app.navigate(`#/trial-balance?fund=${fundId}`);
      const file = await getFile(app, "Download CSV");
      const records = csvOf(file, `${SLUG[fundId]}-trial-balance.csv`, TB_HEADER);
      const data = dataOf(app);
      const rows = data.tbRows.filter((row) => row.fundId === fundId).sort((a, b) => a.account.localeCompare(b.account, "en", { numeric: true }));
      assert.deepEqual(
        records.map((record) => [record[0], record[1], record[4], record[5], record[6]]),
        rows.map((row) => [row.account, row.name, String(row.current / 100), String(row.prior / 100), String((row.current - row.prior) / 100)]),
        `${fundId}: one record per account, amounts in whole currency units`,
      );
      for (const [index, row] of rows.entries()) {
        const category = data.tbCategories[market].find((def) => def.id === row.category);
        assert.equal(records[index]![2], category ? category.label : "Needs a tax category", `${row.account}: the category`);
        if (category) assert.equal(records[index]![3], category.treatment, `${row.account}: the treatment`);
      }
      expectFiguresOnPage(records.map((record) => record.join(" | ")).join("\n"), app.flat(), `${fundId}'s CSV`);
      return records;
    };

    const before = await check("coastline", "AU");
    assert.deepEqual(before.find((record) => record[0] === "4510")?.slice(2, 3), ["Needs a tax category"], "4510 is unmapped to begin with");
    await check("kallang", "SG");

    await app.navigate("#/trial-balance?fund=coastline");
    await app.select(app.byLabel(/^Tax category for 4510 /), "Rental and property income");
    const after = await check("coastline", "AU");
    assert.equal(after.find((record) => record[0] === "4510")![2], "Rental and property income", "the change made on the page is in the file");
    assert.equal(after.length, before.length, "no account is added or lost");
    await app.unmount();
  });
});

describe("Tax returns: the working papers PDF", () => {
  it("Australia: is the AMIT return and schedule; Singapore: is Form UT; each carries the page's figures", async () => {
    const app = await mountApp({ hash: "#/tax-returns?fund=coastline", user: "a-moreno" });
    const amit = pdfOf(await getFile(app, "Download PDF"), `${SLUG.coastline}-amit-return-working-papers.pdf`, 2);
    expectText(
      amit,
      [
        "AMIT tax return and schedule — working papers",
        COASTLINE,
        "Income year ended 30 Sep 2026",
        "Lodged electronically with the ATO through Standard Business Reporting",
        "Australian income — other A$16,970,450",
        "Interest A$212,300",
        "Foreign income A$1,104,800",
        "Total assessable income excluding capital gains A$18,287,550",
        "Fund payment withholding at 15% A$381,835",
        "Interest withholding at 10% A$4,246",
        "Total withheld A$640,638",
        "Remitted to the ATO Not yet remitted",
        "Distributions to unitholders A$21,048,000",
        "Page 1 of 2",
      ],
      "the AMIT working papers",
    );
    expectFiguresOnPage(amit, app.flat(), "the AMIT working papers");

    await app.navigate("#/tax-returns?fund=kallang");
    const formUt = pdfOf(await getFile(app, "Download PDF"), `${SLUG.kallang}-form-ut-ya2027-working-papers.pdf`, 2);
    expectText(
      formUt,
      [
        "Form UT YA2027 — working papers",
        KALLANG,
        "Distribution period 1 Jul – 30 Sep 2026",
        "File with audited accounts and the tax computation by 15 Apr 2027",
        "Taxable specified income S$41,906,500",
        "Distributed to unitholders S$35,620,500",
        "Taxable payout 85.0%",
        "Undistributed specified income S$6,286,000",
        "Tax at 17% S$1,068,620",
        "Tax deducted at 10% (final) S$534,308",
        "Total tax deducted S$837,082",
        "Distributions tracking schedule",
        "Page 2 of 2",
      ],
      "the Form UT working papers",
    );
    expectFiguresOnPage(formUt, app.flat(), "the Form UT working papers");
    await app.unmount();
  });
});

describe("Investor reporting: notices and investor files", () => {
  it("Australia: the notice PDF says draft until it is published; the AIIR CSV agrees with the holder's statement", async () => {
    const app = await mountApp({ hash: "#/?fund=coastline", user: "a-moreno" });
    await openTab(app, /^Statements/);
    const statement = pdfOf(await getFile(app, "Download PDF"), `${SLUG.coastline}-amma-kestrel-pension-plan.pdf`, 1);

    await app.navigate("#/investor-reporting?fund=coastline");
    const draft = pdfOf(await getFile(app, "Download PDF"), `${SLUG.coastline}-fund-payment-notice-quarter-ended-30-sep-2026.pdf`, 1);
    expectText(
      draft,
      [
        "Fund payment notice (draft)",
        COASTLINE,
        "Distribution: Quarter ended 30 Sep 2026",
        "Record date: 30 Sep 2026",
        "Payment date: 13 Nov 2026",
        "Total fund payment 1.356008 A$4,324,852.42",
        "Interest 10% interest withholding 0.016964 A$54,103.82",
        "Cash distribution paid 1.681821 A$5,364,000.00",
      ],
      "the draft notice",
    );
    expectFiguresOnPage(draft, app.flat(), "the notice");

    const data = dataOf(app);
    const records = csvOf(await getFile(app, "Download CSV"), `${SLUG.coastline}-aiir-investor-lines.csv`, AIIR_HEADER);
    const holders = data.holders.filter((holder) => holder.fundId === "coastline");
    assert.deepEqual(
      records.map((record) => record[3]),
      holders.map((holder) => String(holder.units)),
      "one line per holder, in register order",
    );
    const kestrel = records.find((record) => record[0] === "Kestrel Pension Plan")!;
    const column = (name: string): number => Number(kestrel[AIIR_HEADER.indexOf(name)]);
    expectText(
      statement,
      [
        `Units held: ${Number(kestrel[3]).toLocaleString("en-AU")}`,
        `Australian income — other ${A(column("Australian income — other"))}`,
        `Australian interest ${A(column("Australian interest"))}`,
        `Assessable foreign income ${A(column("Assessable foreign income"))}`,
        `Other non-attributable amounts ${A(column("Other non-attributable amounts"))}`,
        `Attributed amounts (assessable) ${A(column("Attributed"))}`,
        `Cash distribution received ${A(column("Cash distribution"))}`,
        `AMIT cost base net amount — excess (decreases the cost base) ${A(column("AMIT cost base net amount"))}`,
        `Total ${A(column("Cash distribution"))} ${A(column("Withheld"))}`,
      ],
      "the Kestrel statement, which the AIIR line must agree with",
    );

    // Published, the title loses "(draft)"; the quarter published earlier was never a draft.
    let published = false;
    await app.act(() => {
      app.store.setUser("r-okafor");
      published = app.store.dispatch({ type: "publish-notice", fundId: "coastline", noticeId: "coastline-2026-09-30" }).ok;
      app.store.setUser("a-moreno");
    });
    assert.ok(published, "the notice can be published");
    const final = pdfOf(await getFile(app, "Download PDF"), `${SLUG.coastline}-fund-payment-notice-quarter-ended-30-sep-2026.pdf`, 1);
    assert.ok(final.startsWith("Fund payment notice Coastline"), `published: "${final.slice(0, 50)}"`);
    assert.ok(!final.includes("(draft)"));
    await app.click(app.byRole("radio", /Quarter ended 30 Jun 2026/));
    const earlier = pdfOf(await getFile(app, "Download PDF"), `${SLUG.coastline}-fund-payment-notice-quarter-ended-30-jun-2026.pdf`, 1);
    assert.ok(earlier.includes("Distribution: Quarter ended 30 Jun 2026") && !earlier.includes("(draft)"), "a published quarter is not a draft");
    await app.unmount();
  });

  it("Singapore: the tax notice says DRAFT until it is announced; the s45G CSV agrees with the holder's statement and the Form UT figures", async () => {
    const app = await mountApp({ hash: "#/?fund=kallang", user: "a-moreno" });
    await openTab(app, /^Statements/);
    const statement = pdfOf(await getFile(app, "Download PDF"), `${SLUG.kallang}-unitholder-statement-nordfjell-sovereign-holdings.pdf`, 1);
    await app.navigate("#/tax-returns?fund=kallang");
    const formUt = pdfOf(await getFile(app, "Download PDF"), `${SLUG.kallang}-form-ut-ya2027-working-papers.pdf`, 2);

    await app.navigate("#/investor-reporting?fund=kallang");
    const draft = pdfOf(await getFile(app, "Download PDF"), `${SLUG.kallang}-distribution-tax-notice.pdf`, 1);
    expectText(
      draft,
      [
        "Distribution tax notice",
        KALLANG,
        "DRAFT",
        "Distribution period: 1 Jul – 30 Sep 2026",
        "Record date: 9 Nov 2026",
        "Declaration cut-off set by the manager: 16 Nov 2026",
        "Payment date: 30 Nov 2026",
        "Year of assessment: YA2027",
        "Taxable income distribution 1.046812 S$35,620,500.00",
        "Total distribution 1.046812 S$35,620,500.00",
        "17% — not final",
      ],
      "the draft tax notice",
    );
    expectFiguresOnPage(draft, app.flat(), "the tax notice");

    const records = csvOf(await getFile(app, "Download CSV"), `${SLUG.kallang}-withholding-tax.csv`, ["Unitholder", "Country", "Class", "Rate", "Final tax", "Taxable distribution", "Tax deducted", "Date of payment", "Due date"]);
    assert.deepEqual(
      records.map((record) => [record[0], record[3], record[4], record[7], record[8]]),
      [
        ["Nordfjell Sovereign Holdings", "10%", "Yes", "2026-11-30", "2027-01-15"],
        ["Nominee accounts without a declaration", "17%", "No", "2026-11-30", "2027-01-15"],
      ],
    );
    const nordfjell = records[0]!;
    expectText(statement, [`Taxable income distribution ${S(Number(nordfjell[5]))} 10% final`, `Tax deducted at 10% (final) (${S(Number(nordfjell[6]))})`], "the Nordfjell statement, which the s45G line must agree with");
    const deducted = records.reduce((sum, record) => sum + Number(record[6]), 0);
    assert.ok(formUt.includes(`Total tax deducted S$${Math.round(deducted).toLocaleString("en-AU")}`), `Form UT's total tax deducted is the s45G CSV's ${deducted}`);

    let announcedOk = false;
    await app.act(() => {
      announcedOk = app.store.dispatch({ type: "publish-notice", fundId: "kallang", noticeId: "kallang-notice" }).ok;
    });
    assert.ok(announcedOk, "the notice can be announced");
    const final = pdfOf(await getFile(app, "Download PDF"), `${SLUG.kallang}-distribution-tax-notice.pdf`, 1);
    assert.ok(!final.includes("DRAFT"), "an announced notice is no draft");
    assert.ok(final.includes("Distribution tax notice") && final.includes(KALLANG));
    await app.unmount();
  });
});

describe("Cost base & CGT: two CSVs and a PDF", () => {
  it("Australia: the property and holder files agree with each other, the trial balance and the PDF", async () => {
    const app = await mountApp({ hash: "#/cost-base?fund=coastline", user: "a-moreno" });
    const data = dataOf(app);
    const properties = data.properties.filter((property) => property.fundId === "coastline");

    const rows = csvOf(await getFile(app, "Download CSV", 0), `${SLUG.coastline}-unrealised-cgt-properties.csv`, PROPERTIES_HEADER);
    assert.deepEqual(
      rows.map((row) => [row[0], row[1], row[2], row[3], row[4], row[5], row[7]]),
      properties.map((property) => [property.name, property.location, property.acquired, String(property.cost / 100), String(property.improvements / 100), String(property.capitalWorksClaimed / 100), String(property.valuation / 100)]),
      "one record per property, from the register of properties",
    );
    const valuations = rows.reduce((sum, row) => sum + Number(row[7]), 0);
    assert.equal(valuations * 100, data.tbRows.find((row) => row.fundId === "coastline" && row.account === "1100")!.current, "the valuations add up to the investment properties in the trial balance");

    const pdf = pdfOf(await getFile(app, "Download PDF"), `${SLUG.coastline}-unrealised-cgt-properties.pdf`, 1);
    expectText(
      pdf,
      [
        "Unrealised CGT on properties",
        COASTLINE,
        "valuations at 30 Sep 2026",
        "Coastline Private Hospital — Robina QLD 29 Jan 2018 · Held 12 months — discount applies",
        "Total A$354,869,125 A$423,954,924 A$69,085,799",
        "Net capital gain if sold at valuation A$35,004,633",
        "Foreign investor — EOI country A$10,362,870",
        "Australian company A$20,725,740",
      ],
      "the unrealised CGT PDF",
    );
    expectText(pdf, rows.map((row) => `A$${Number(row[7]).toLocaleString("en-AU")}`), "the PDF's valuations are the CSV's");

    // The page shows the deferred tax of one investor type at a time; the PDF lists every type.
    const select = app.byLabel(/^Deferred tax for/) as HTMLSelectElement;
    let pageText = "";
    for (const option of Array.from(select.options)) {
      await app.select(select, option.value);
      pageText += ` ${app.flat()}`;
    }
    expectFiguresOnPage(pdf, pageText, "the unrealised CGT PDF");

    const holders = csvOf(
      await getFile(app, "Download CSV", 1),
      `${SLUG.coastline}-unit-cost-base.csv`,
      ["Holder", "Tax status", "Units", "Opening cost base", "Adjustment", "Closing cost base", "Cost per unit", "Unit price", "Market value", "Unrealised gain", "CGT event E10 gain"],
    );
    assert.deepEqual(
      holders.map((record) => record[2]),
      data.holders.filter((holder) => holder.fundId === "coastline").map((holder) => String(holder.units)),
      "one record per holder, in register order",
    );
    for (const record of holders) {
      assert.equal(Number(record[3]) + Number(record[4]), Number(record[5]), `${record[0]}: opening plus adjustment is the closing cost base`);
    }
    // Each holder's cost base falls by their AMIT cost base net amount, which the AIIR file also carries.
    await app.navigate("#/investor-reporting?fund=coastline");
    const aiir = csvOf(await getFile(app, "Download CSV"), `${SLUG.coastline}-aiir-investor-lines.csv`, AIIR_HEADER);
    for (const record of holders) {
      const line = aiir.find((candidate) => candidate[0] === record[0])!;
      assert.equal(-Number(record[4]), Number(line[AIIR_HEADER.indexOf("AMIT cost base net amount")]), `${record[0]}: the cost base adjustment is the AMIT cost base net amount`);
    }
    await app.unmount();
  });

  it("Singapore: the same three files, with unrealised gains and no capital gains tax", async () => {
    const app = await mountApp({ hash: "#/cost-base?fund=kallang", user: "a-moreno" });
    const data = dataOf(app);
    const properties = data.properties.filter((property) => property.fundId === "kallang");

    const rows = csvOf(await getFile(app, "Download CSV", 0), `${SLUG.kallang}-unrealised-gains.csv`, PROPERTIES_HEADER);
    assert.deepEqual(
      rows.map((row) => [row[0], row[1], row[2], row[7]]),
      properties.map((property) => [property.name, property.location, property.acquired, String(property.valuation / 100)]),
    );
    assert.equal(
      rows.reduce((sum, row) => sum + Number(row[7]), 0) * 100,
      data.tbRows.find((row) => row.fundId === "kallang" && row.account === "1100")!.current,
      "the valuations add up to the investment properties in the trial balance",
    );

    const pdf = pdfOf(await getFile(app, "Download PDF"), `${SLUG.kallang}-unrealised-gains.pdf`, 1);
    expectText(
      pdf,
      ["Unrealised gains on properties", KALLANG, "valuations at 30 Sep 2026", "Kallang Riverside Mall Kallang Bahru 2 Aug 2010", "Total S$4,764,348,382 S$4,892,269,910 S$127,921,528", "Singapore doesn't tax capital gains."],
      "the unrealised gains PDF",
    );
    expectFiguresOnPage(pdf, app.flat(), "the unrealised gains PDF");

    const holders = csvOf(
      await getFile(app, "Download CSV", 1),
      `${SLUG.kallang}-unit-cost-base.csv`,
      ["Holder", "Units", "Opening cost base", "Adjustment", "Closing cost base", "Cost per unit", "Unit price", "Market value", "Unrealised gain", "Excess over cost base"],
    );
    assert.deepEqual(
      holders.map((record) => record[1]),
      data.holders.filter((holder) => holder.fundId === "kallang").map((holder) => String(holder.units)),
    );
    await app.unmount();
  });
});

describe("Analytics: the Power BI workbook", () => {
  const SHEETS = ["Funds", "Components", "Holders", "Leakage", "Mix", "Deadlines", "Checks", "Workflow"];

  it("holds the funds the persona can see and nothing of the others, agrees with the page, and follows the data", async () => {
    const app = await mountApp({ hash: "#/analytics", user: "l-brennan" });
    const workbook = async (userId: string): Promise<Array<{ name: string; rows: string[][] }>> => {
      await app.select(personaSelect(app), userId);
      const file = await getFile(app, "Download Power BI workbook");
      assert.equal(file.fileName, "property-fund-tax-compliance-portfolio.xlsx");
      assert.equal(file.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      assert.equal(file.bytes.subarray(0, 4).toString("latin1"), "PK\u0003\u0004", "starts with the ZIP signature");
      assert.ok(file.bytes.length > 10_000, `the workbook is not empty (${file.bytes.length} bytes)`);
      const sheets = workbookSheets(file.bytes);
      assert.deepEqual(
        sheets.map((sheet) => sheet.name),
        SHEETS,
      );
      for (const sheet of sheets) assert.ok(sheet.rows.length >= 2, `${sheet.name} has a header and rows`);

      const visible = oracle(userId).funds;
      const column = (sheet: string, name: string): number => sheets.find((candidate) => candidate.name === sheet)!.rows[0]!.indexOf(name);
      const funds = sheets[0]!;
      assert.deepEqual(
        funds.rows.slice(1).map((row) => [row[0], row[column("Funds", "Fund ID")]]),
        visible.map((fund) => [fund.name, fund.id]),
        `${userId}: the Funds sheet is the funds they can see`,
      );
      for (const sheet of sheets) {
        const ids = sheet.rows[0]!.indexOf("Fund ID");
        if (ids < 0) continue;
        const outside = sheet.rows.slice(1).filter((row) => !visible.some((fund) => fund.id === row[ids]));
        assert.deepEqual(outside, [], `${userId}: no row of ${sheet.name} is about a fund they cannot see`);
      }
      const everything = workbookText(file.bytes);
      const hidden = oracle("a-moreno").funds.filter((fund) => !visible.some((candidate) => candidate.id === fund.id));
      for (const fund of hidden) {
        assert.ok(!everything.includes(fund.name) && !everything.includes(fund.id), `${userId}: nothing of ${fund.name} anywhere in the package`);
      }
      return sheets;
    };

    const brennan = await workbook("l-brennan");
    assert.deepEqual(brennan[0]!.rows.slice(1).map((row) => row[2]), ["AU", "AU", "AU", "AU", "AU"]);
    const pillai = await workbook("n-pillai");
    assert.deepEqual(pillai[0]!.rows.slice(1).map((row) => row[2]), ["SG", "SG", "SG", "SG"]);
    const lim = await workbook("s-lim");
    assert.equal(lim[0]!.rows.length - 1, 2, "S. Lim sees two funds");
    const castillo = await workbook("m-castillo");
    assert.equal(castillo[0]!.rows.length - 1, 9, "view-only fund finance can still download, and gets every fund");
    const moreno = await workbook("a-moreno");
    assert.equal(moreno[0]!.rows.length - 1, 9);

    // The leakage sheet and the page's table are the same numbers.
    const leakage = moreno.find((sheet) => sheet.name === "Leakage")!;
    const table = app.byRole("table", "Tax leakage by fund");
    const numeric = (text: string): number => Number(text.replace(/[^\d.-]/g, ""));
    for (const row of leakage.rows.slice(1)) {
      const onPage = rowStarting(table, row[0]!);
      assert.deepEqual(
        [onPage[1], onPage[2], onPage[3], onPage[4]].map(numeric),
        [row[3], row[4], row[5], row[6]].map((value) => Math.round(Number(value))),
        `${row[0]}: distribution, withholding, recoverable and trustee tax`,
      );
      assert.equal(onPage[5], `${Number(row[7]).toFixed(1)}%`, `${row[0]}: total leakage`);
    }

    // The next file is made from the data as it now is.
    const status = (sheets: typeof moreno, id: string): string[] => {
      const workflow = sheets.find((sheet) => sheet.name === "Workflow")!;
      const row = workflow.rows.find((candidate) => candidate[1] === id)!;
      return [row[workflow.rows[0]!.indexOf("Workflow status")]!, row[workflow.rows[0]!.indexOf("Reviewer approval")]!];
    };
    assert.deepEqual(status(moreno, "coastline"), ["Preparing", "Pending"]);
    await app.act(() => {
      app.store.setUser("r-okafor");
      app.store.dispatch({ type: "submit", fundId: "coastline" });
      app.store.setUser("a-moreno");
    });
    const after = await workbook("a-moreno");
    assert.deepEqual(status(after, "coastline"), ["In review", "Pending"], "Coastline was submitted: the workbook says so");
    assert.deepEqual(status(after, "kallang"), status(moreno, "kallang"), "the other funds are as they were");
    await app.unmount();
  });
});

describe("the same file whoever asks", () => {
  // What a fund workspace offers for download: page, tab to open first, button, which one of that name.
  const SPECS: Array<{ page: string; tab?: RegExp; button: string; index?: number }> = [
    { page: "#/?fund=@", tab: /^Statements/, button: "Download PDF" },
    { page: "#/trial-balance?fund=@", button: "Download CSV" },
    { page: "#/tax-returns?fund=@", button: "Download PDF" },
    { page: "#/investor-reporting?fund=@", button: "Download PDF" },
    { page: "#/investor-reporting?fund=@", button: "Download CSV" },
    { page: "#/cost-base?fund=@", button: "Download CSV", index: 0 },
    { page: "#/cost-base?fund=@", button: "Download PDF" },
    { page: "#/cost-base?fund=@", button: "Download CSV", index: 1 },
  ];

  /** Everything the fund's pages hand over, as [name, content]: CSV text, or the words of a PDF. */
  async function collect(app: MountedApp, fundId: string): Promise<Array<[string, string]>> {
    const files: Array<[string, string]> = [];
    for (const spec of SPECS) {
      await app.navigate(spec.page.replace("@", fundId));
      if (spec.tab) await openTab(app, spec.tab);
      const file = await getFile(app, spec.button, spec.index ?? 0);
      files.push([file.fileName, file.fileName.endsWith(".pdf") ? pdfText(file.bytes) : file.text]);
    }
    return files;
  }

  it("a view-only persona, the preparer and the Head of Tax get identical files for the same fund", async () => {
    const reference = new Map<string, Array<[string, string]>>();
    for (const [userId, fundId] of [
      ["a-moreno", "coastline"],
      ["a-moreno", "kallang"],
      ["m-castillo", "coastline"],
      ["m-castillo", "kallang"],
      ["r-okafor", "coastline"],
      ["w-l-teo", "kallang"],
    ] as const) {
      const app = await mountApp({ hash: `#/?fund=${fundId}`, user: userId });
      const files = await collect(app, fundId);
      assert.equal(files.length, SPECS.length, `${userId}: every button gave a file`);
      const known = reference.get(fundId);
      if (known) assert.deepEqual(files, known, `${userId} gets the files the Head of Tax gets for ${fundId}`);
      else reference.set(fundId, files);
      await app.unmount();
    }
  });
});
