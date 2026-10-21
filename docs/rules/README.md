# Tax rules and calculations: a guide for reviewers

This folder documents every tax calculation in Property Fund Tax Compliance, so that a tax reviewer (a chartered accountant, tax adviser or auditor in Australia or Singapore) can decide how far each figure can be relied on. For each calculation the documents give:

* **what it computes** and where it appears in the app;
* **the legal basis**: the Act and section, regulation, ruling or official guidance, with links;
* **the method exactly as coded**, including when and how each step is rounded;
* **the rates and thresholds by effective date**, each tied to a rule in the [rule register](RULE-REGISTER.md);
* **worked examples** you can re-perform with a calculator, most of them on the demo funds so you can open the same figures in the [live app](https://peterxing.github.io/property-fund-tax-compliance/);
* **the evidence** that the calculation was tested and independently checked;
* **a confidence grade**, and what is simplified or not modelled.

> **Status.** No tax adviser or lawyer has reviewed these calculations yet. These documents exist so one can. The app is decision support and a demonstration, not tax advice; see [LIMITATIONS.md](../LIMITATIONS.md).

## Contents

<!-- BEGIN GENERATED: document index and confidence summary (npm run docs:rules) -->

### Documents

| Document | Market | Calculations | Worked examples |
| --- | --- | ---: | ---: |
| [Australian AMIT distributions, MIT withholding and cost base](au-amit-distributions.md) | Australia | 7 | 5 |
| [Australian land tax](au-land-tax.md) | Australia | 4 | 10 |
| [Australian transfer duty, landholder duty and foreign purchaser surcharges](au-duties.md) | Australia | 4 | 17 |
| [AU capital allowances](au-capital-allowances.md) | Australia | 6 | 10 |
| [AU CGT](au-cgt.md) | Australia | 3 | 6 |
| [Australian GST and BAS](au-gst.md) | Australia | 4 | 3 |
| [Australian company tax, trust tax and income-tax lodgment dates](au-income-tax.md) | Australia | 3 | 4 |
| [Singapore S-REIT distributions](sg-reit-distributions.md) | Singapore | 5 | 4 |
| [Singapore property tax](sg-property-tax.md) | Singapore | 4 | 4 |
| [Singapore stamp duty](sg-stamp-duty.md) | Singapore | 5 | 8 |
| [Singapore capital allowances and section 14N](sg-capital-allowances.md) | Singapore | 4 | 3 |
| [Singapore corporate income tax and badges of trade](sg-income-tax.md) | Singapore | 5 | 3 |
| [Singapore non-resident withholding tax](sg-withholding-tax.md) | Singapore | 4 | 3 |
| [Singapore GST, F5 returns and IRAS Audit File](sg-gst.md) | Singapore | 5 | 7 |
| **All** | | **63** | **87** |

### Confidence by calculation

Copied from each document's **At a glance** table; the document explains each grade and what a reviewer should confirm. Where a calculation has parts with different grades, **Grade** shows the weakest and **Detail** gives the split.

Across the 63 calculations: **A** 7, **B** 39, **C** 11, **D** 6 (a C/D range counts as D).

| Calculation | Where in the app | Grade | Detail | Document |
| --- | --- | --- | --- | --- |
| Trial balance to AMIT components | Trial balance; Distributions; Tax returns | **B** |  | [au-amit-distributions.md](au-amit-distributions.md) |
| Per-unit and member attribution | Distributions; Investor reporting; AMMA; AIIR | **B** |  | [au-amit-distributions.md](au-amit-distributions.md) |
| MIT withholding and remittance | Distributions; Tax returns; Investor reporting; Calculator `au-mit-withholding` | **B** |  | [au-amit-distributions.md](au-amit-distributions.md) |
| AMIT cost base net amount | Distributions; Investor reporting; Cost base & CGT; Analytics scenario | **B** | A for CBNA formula; B for seeded app roll-forward | [au-amit-distributions.md](au-amit-distributions.md) |
| AMMA, AIIR and working papers | Investor reporting; Tax returns | **B** |  | [au-amit-distributions.md](au-amit-distributions.md) |
| Deadlines and exceptions | Bulk review; Investor reporting; Tax returns | **B** |  | [au-amit-distributions.md](au-amit-distributions.md) |
| Analytics | Analytics; Cost base & CGT | **B** |  | [au-amit-distributions.md](au-amit-distributions.md) |
| Owner-level land tax and surcharges | Property taxes workspace, Annual taxes tab; Land tax calculator | **B** | B overall; A where an official example is reproduced | [au-land-tax.md](au-land-tax.md) |
| Property-row allocation, totals and KPI | Property taxes workspace, Annual taxes tab and exports | **B** |  | [au-land-tax.md](au-land-tax.md) |
| Assessment notices and variance labels | Annual taxes tab assessment controls | **C** |  | [au-land-tax.md](au-land-tax.md) |
| Calculator field mapping | Calculators workspace, **Land tax** | **B** |  | [au-land-tax.md](au-land-tax.md) |
| AU transfer / stamp / conveyance duty | Property taxes → Duties on acquisition; calculator mode **Transfer duty** | **B** | B overall; A for examples that reproduce official examples | [au-duties.md](au-duties.md) |
| Foreign purchaser surcharges | Same rows and calculator output, residential component only | **B** |  | [au-duties.md](au-duties.md) |
| Landholder duty | Calculator mode **Landholder duty** | **B** | B overall; A for the QLD trust-acquisition example | [au-duties.md](au-duties.md) |
| Duties on acquisition workspace totals and KPI | Property taxes workspace | **B** |  | [au-duties.md](au-duties.md) |
| Division 40 decline in value | Assets & allowances register and schedule; Division 40 calculator | **A** | A — ATO photocopier example reproduced | [au-capital-allowances.md](au-capital-allowances.md) |
| Low-value pool | Assets & allowances register pool row and schedule | **B** | B — independently verified pool rates and register behaviour | [au-capital-allowances.md](au-capital-allowances.md) |
| Balancing adjustments | Assets & allowances disposal rows | **B** | B — independently verified in domain and v3 verifier tests | [au-capital-allowances.md](au-capital-allowances.md) |
| Division 43 capital works | Assets & allowances register and schedule; Division 43 calculator | **B** | B — independently verified against ATO Appendix 3 rates | [au-capital-allowances.md](au-capital-allowances.md) |
| Borrowing costs | Assets & allowances schedule; Borrowing costs calculator | **A** | A — ATO Peter example reproduced | [au-capital-allowances.md](au-capital-allowances.md) |
| Section 40-880 business capital expenditure | Engine only; no current calculator | **B** | B — independent verifier re-derived 20% over five years | [au-capital-allowances.md](au-capital-allowances.md) |
| Cost base, reduced cost base, capital gain or loss | CGT on property disposal calculator | **B** | B — independently verified against ATO CGT guide methods | [au-cgt.md](au-cgt.md) |
| Discount, losses and indexation | CGT on property disposal calculator | **B** | B — independent verifier covers discount/default/indexation paths | [au-cgt.md](au-cgt.md) |
| Foreign resident CGT withholding | Foreign resident CGT withholding calculator | **B** | B — independently verified at statutory boundaries | [au-cgt.md](au-cgt.md) |
| GST code to BAS label mapping | GST & BAS workspace ledger and return tabs | **B** |  | [au-gst.md](au-gst.md) |
| BAS builder and due dates | GST & BAS workspace for AU funds | **B** |  | [au-gst.md](au-gst.md) |
| Property GST, margin scheme, going concern and withholding | GST checks and engine helpers | **C** | A for official margin-scheme and GST-at-settlement examples; B/C otherwise | [au-gst.md](au-gst.md) |
| Registration, adjustments, FTL and GIC helpers | Engine helpers; not all are surfaced in the AU BAS page | **B** |  | [au-gst.md](au-gst.md) |
| Company tax and base rate entity test | Calculators → Company tax | **A** |  | [au-income-tax.md](au-income-tax.md) |
| Trust s 95 net income and trustee assessment | Engine only; no current app figure calls it | **B/D** | B/D as stated below | [au-income-tax.md](au-income-tax.md) |
| Income-tax return selection and due dates | Engine; compliance calendar integrations use related return helpers | **B** |  | [au-income-tax.md](au-income-tax.md) |
| Taxable specified income and the 90% transparency condition | Trial balance, Distributions KPIs, Checks, Tax returns, Analytics scenario | **C** | C for displayed retained-only trustee tax and for the engine threshold / worst-case treatment; B for s45G rates and REIT filing dates | [sg-reit-distributions.md](sg-reit-distributions.md) |
| Distribution components and allocation | Distributions table, Statements, Investor reporting notice, Analytics mix | **C** |  | [sg-reit-distributions.md](sg-reit-distributions.md) |
| s45G withholding by unitholder class | Distributions holder lines, Investor reporting s45G filing, Statements, Tax returns, Analytics leakage | **B** |  | [sg-reit-distributions.md](sg-reit-distributions.md) |
| Return of capital and cost base | Cost base & CGT, Statements, Investor reporting notice | **C** |  | [sg-reit-distributions.md](sg-reit-distributions.md) |
| Filings, due dates, checks and bulk review | Investor reporting, Tax returns, Deadlines, Bulk review | **D** | B for dates; C/D for notice cut-off wording | [sg-reit-distributions.md](sg-reit-distributions.md) |
| Owner-occupier residential property tax | Property taxes > Annual taxes; Property tax calculator | **A** |  | [sg-property-tax.md](sg-property-tax.md) |
| Non-owner-occupier residential property tax | Property taxes > Annual taxes; Property tax calculator | **B** |  | [sg-property-tax.md](sg-property-tax.md) |
| Non-residential, vacant land and excluded 10% class | SG fund annual taxes and seeded demo properties | **B** |  | [sg-property-tax.md](sg-property-tax.md) |
| Notices and variance check | Annual taxes row, assessed label, due date, KPI data-needs count | **B** |  | [sg-property-tax.md](sg-property-tax.md) |
| Buyer's Stamp Duty (BSD) | Duties on acquisition; Stamp duty calculator mode BSD + ABSD | **A** |  | [sg-stamp-duty.md](sg-stamp-duty.md) |
| Additional Buyer's Stamp Duty (ABSD) | Duties on acquisition where buyer kind is selected; calculator mode BSD + ABSD | **B** |  | [sg-stamp-duty.md](sg-stamp-duty.md) |
| Seller's Stamp Duty (SSD) | Duties rows where disposal date and price exist; calculator mode SSD | **B** | A for current residential example, B otherwise | [sg-stamp-duty.md](sg-stamp-duty.md) |
| Lease duty | Stamp duty calculator mode Lease duty | **B** |  | [sg-stamp-duty.md](sg-stamp-duty.md) |
| Stamping deadline | Duties on acquisition deadline column and future/missed obligations | **B** |  | [sg-stamp-duty.md](sg-stamp-duty.md) |
| Sections 19 and 19A plant and machinery | Calculator `sg-capital-allowances`; Assets & allowances | **C** | B for s19A three-year schedule; C for s19 working-life and broader mechanics | [sg-capital-allowances.md](sg-capital-allowances.md) |
| Low-value asset write-off | Same | **C** |  | [sg-capital-allowances.md](sg-capital-allowances.md) |
| Section 14N renovation and refurbishment | Same | **C** | B for the three-year schedule path; C for broader mechanics | [sg-capital-allowances.md](sg-capital-allowances.md) |
| Section 19B, IBA and LIA | Same | **C** |  | [sg-capital-allowances.md](sg-capital-allowances.md) |
| Corporate income tax | Calculator `sg-cit`; tax computation summaries | **B** |  | [sg-income-tax.md](sg-income-tax.md) |
| Returns, ECI and basis periods | Tax computation/return summaries | **C** |  | [sg-income-tax.md](sg-income-tax.md) |
| Expense allocation | Tax computation support | **C** |  | [sg-income-tax.md](sg-income-tax.md) |
| Badges of trade | Calculator `sg-badges` | **D** |  | [sg-income-tax.md](sg-income-tax.md) |
| Identifier checks | Shared validators | **D** | D; see [RULE-REGISTER](RULE-REGISTER.md#rule-sg-identifiers-uen-formats) | [sg-income-tax.md](sg-income-tax.md) |
| Domestic WHT rates | Calculator `sg-withholding-tax` | **B** |  | [sg-withholding-tax.md](sg-withholding-tax.md) |
| Service-place rule | Same | **B** |  | [sg-withholding-tax.md](sg-withholding-tax.md) |
| Due date and penalty | Same | **B** | A for the IRAS late-payment example path; B for the due-date rule | [sg-withholding-tax.md](sg-withholding-tax.md) |
| Treaty-rate override | Same | **D** |  | [sg-withholding-tax.md](sg-withholding-tax.md) |
| GST rate and F5 box construction | GST & BAS workspace, Singapore GST F5 periods and return boxes | **B** | B for rate/F5 construction and code-to-box mapping; A for official partial-exemption, registration, penalty and due-date examples | [sg-gst.md](sg-gst.md) |
| Property-industry GST and partial exemption | GST & BAS ledger, checks and F5 Box 7 | **B** | A for partial-exemption examples; B for property classification paths covered by verifier tests | [sg-gst.md](sg-gst.md) |
| GST registration | Calculators, `GST registration and late penalties` | **A** |  | [sg-gst.md](sg-gst.md) |
| Late filing and late payment penalties | Calculators, `GST registration and late penalties` | **A** |  | [sg-gst.md](sg-gst.md) |
| IRAS Audit File export | GST & BAS workspace, Singapore F5 export panel | **D** |  | [sg-gst.md](sg-gst.md) |

<!-- END GENERATED -->

Also in this folder and nearby:

* [RULE-REGISTER.md](RULE-REGISTER.md) lists every rule the engine carries (generated from the code): its id, effective dates, the sources it was read from and the date each was read, and whether it is verified from a primary source, a secondary source only, or an assumption.
* [../parity/au.md](../parity/au.md) and [../parity/sg.md](../parity/sg.md) compare the distribution figures with the reference app the product was modelled on, figure by figure, and explain every difference.

## How the documents are checked

The documents are executable. They cannot drift from the code without a test failing.

1. **Worked examples are recomputed.** Each worked example is a heading `Example <ID>` (for example `Example LT-NSW-1`). A test in [`test/docs`](../../test/docs) runs the same inputs through the engine, asserts the result to the cent, and checks that the document quotes the same figures. A coverage test fails if any example in any document is not pinned by a test, or if two documents use the same id.
2. **Rate tables are checked against the code.** Each rate or threshold table is rendered from the engine's constants (or from probes at the band edges) by the document's test and compared with the table in the document.
3. **The rule register is generated.** [RULE-REGISTER.md](RULE-REGISTER.md) is produced from the engine's rule entries by `npm run docs:rules`; a test fails when it is out of date.
4. **Links are checked.** A test fails if a link between these documents, or to a rule in the register, points at nothing.

The tests run on every push (`npm test`, in GitHub Actions) and before every deployment. To run only the documentation tests:

```
node --disable-warning=ExperimentalWarning --test "test/docs/*.test.ts"
```

## Conventions

These apply to every document unless it says otherwise.

* **Money is held in integer cents.** The engine never uses floating point for money. Rates are integer basis points (1% = 100 bps) unless a document says a module stores decimals.
* **Rounding is explicit.** Multiplying an amount by a rate rounds half away from zero to the nearest cent (`mulBps`, `mulRatio` in `src/engine/money.ts`). Statutory rounding (whole dollars, rounding down, per-$100 blocks for duty) is applied only where the law requires it, and each document says where. Splitting an amount across holders or properties uses the largest-remainder method, so the parts always add back exactly to the total.
* **Displayed amounts** are rounded to whole dollars, half away from zero (`money()` in `src/domain/format.ts`); statements and exports show cents. A worked example gives the exact figure in cents and, where they differ, the figure the app displays.
* **Effective dates are inclusive.** Each rate table row has a from date and, if superseded, a to date. The engine picks the row whose range covers the relevant date (`pickEffective` in `src/engine/rules.ts`). When no row covers it, the engine refuses to calculate and the app shows **Not modelled** or **Not calculated**, never zero, and leaves the amount out of totals.
* **Income years.** An Australian income year runs from 1 July to 30 June and is named for the year it ends ("2025-26" ends on 30 June 2026). Funds with a substituted accounting period keep their own period end for distributions; where a calculation only knows 30 June years, the document says so. A Singapore year of assessment is the calendar year after the basis period (a basis period ending 30 September 2026 belongs to YA 2027).
* **Rule ids.** Every rate, threshold and method has a rule id (for example `au-div43.general-rates.1979-plus`). The id appears in the app's **Rules & sources** workspace, in calculation breakdowns and in the [rule register](RULE-REGISTER.md).

## Confidence grades

Each calculation carries one grade. The grade says what evidence exists, not how sure the authors feel.

| Grade | Meaning | What a reviewer should do |
| --- | --- | --- |
| **A** Reproduces an official example | The calculation reproduces, to the cent, a worked example or calculator result published by the tax authority or set out in the legislation, and a named test does so. The grade covers the paths the example exercises; the document says which. | Spot-check the rates for your period and the facts the example assumes. |
| **B** Independently verified | Rates, thresholds and method were read from primary sources and re-derived by an independent verifier test written separately from the engine, but no official worked example is reproduced. | Re-perform a worked example and confirm the method against the source. |
| **C** Implemented from primary sources | Implemented from cited primary sources and covered by unit tests, without an independent re-derivation. | Check the rates against the sources and re-perform the worked examples. |
| **D** Assumption or simplification | A modelling choice, a simplification of the law, or parity with the reference app where the law is less clear. The document says exactly what to confirm. | Decide whether the assumption holds for the fund's facts. |
| **Not modelled** | The app does not calculate it, shows **Not modelled** or **Not calculated**, and leaves it out of totals. | Calculate it outside the app. |

The rule register's own labels are a different thing: **Verified (primary source)**, **Verified (secondary source only)** and **Assumption** record what the engine's authors read when they wrote each rule. A rule marked verified is still only grade C until an independent test re-derives it.

**Independent verifier tests** were written separately from the engine, from primary sources, without reusing the engine's tables: they live in [`test/verify`](../../test/verify) and in `test/engine/**/independent-*.test.ts`. Where they found a defect, the defect was fixed in the engine and the verifier now passes; their reports are kept next to them.

## How to review

A suggested path for one area (allow half a day to a day per document):

1. Read the conventions above and the document's **At a glance** table.
2. For each calculation, read **Legal basis** and **Method** side by side with the source. Check the rate table against the source for the periods you care about; the rule register links each source and says when it was read.
3. Re-perform at least one worked example with a calculator. Then open the same fund or property in the [live app](https://peterxing.github.io/property-fund-tax-compliance/) and confirm the app shows the same figures.
4. Read **Edge cases** and **Assumptions and limitations**, and decide whether they matter for the funds you look after.
5. Record the outcome in the sign-off table below, or raise an issue.

To test the app on your own facts, use the **Calculators** workspace (every calculator lists the rules it applied) or edit a demo fund: all data stays in your browser.

## Sign-off

Copy this table into the review record. A row is complete when the reviewer has re-performed at least one worked example and checked the rate table for the periods in use.

| Document | Reviewer | Organisation | Date | Periods checked | Outcome | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## Reporting a problem

Open an issue in this repository with the document, the example or rule id, what you expected, what the app shows, and the source you relied on. The app holds no real data, so a public issue is fine.
