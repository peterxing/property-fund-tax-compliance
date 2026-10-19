# Reference parity

Property Fund Tax Compliance is a static web app for Australian AMITs/MITs and Singapore S-REITs. It was built to be compared side by side with a separate "reference app": a managed-app prototype of the same product idea, used as a comparison target. This repository contains none of the reference app's source code.
This page explains how the two were compared and lists every deliberate difference in one table. No tax adviser has reviewed the rules in this repository.

## Purpose

- Show what this build matches in the reference app, and how that was checked.
- Record each place where it deliberately differs, and why.
- Rule applied throughout: where the reference app and the engine or the cited law disagree, the engine and the law win. One case is handled differently (the Singapore 90% distribution condition): the reference app's figures are displayed and the law is stated beside them.

## How parity was checked

- Rendered pages: the reference app's pages, recorded on 12 October 2026, for nine fictional funds (five Australian, four Singapore) on the five fund workspaces (Distributions, Trial balance, Tax returns, Investor reporting, Cost base & CGT), plus Bulk review, Analytics and Access. Labels, wording, ordering and numbers are compared.
- Deadlines at a fixed date: the deadline rows are computed as at 12 October 2026, 09:00 and equal the reference figures by date, fund and obligation.
- Scenario figures: Harbourline's Australian distribution scenario (A$92,446,000; A$28,913,400 excess; 2.0467 c/unit) and Loyang's Singapore scenario at 85% payout (taxable distribution S$60,554,765; 90% condition "No") equal the reference figures.
- Exact cents against floating point: this build keeps money as integer cents and allocates each component exactly across units. The reference app works in floating-point dollars and shows whole dollars, so each reference cell is compared within A$1 (Australia) or S$1 (Singapore) per displayed cell. The trial balances (both markets) and the Singapore s45G totals are asserted to the cent against the seed data.
- Rates and citations: each rate is traced to the engine and the cited law, and the basis of each Rules tab row was checked against primary sources. One Australian basis was wrong and was fixed; the Singapore s45 statute text could not be read (see "Rates" and "Rules tab: citation check" in each market file).
- Tests: 152 Australian tests (`test/domain/au`) and 155 Singapore tests (`test/domain/sg`), all passing at the time of writing (13 October 2026). Each figure in the market files names the test file that asserts it.

## Market documents

- [Australia (AMIT)](parity/au.md): the Australian comparison, with a section on deferred tax by investor type.
- [Singapore (S-REIT)](parity/sg.md): the Singapore comparison, with a section on the case where the reference app and the law disagree.

Both files use the same layout: Matches the reference; Where the law or the engine wins; Not in the reference; Rounding; Rates; Rules tab: citation check; Found by tests and review; Known gaps. Product-wide limits are in [LIMITATIONS.md](LIMITATIONS.md).

## Beyond the reference

Parity covers the eight workspaces the reference app has. The ten platform workspaces (GST & BAS, Property taxes, Assets & allowances, Compare, Tax due diligence, Compliance calendar, Risk register, Calculators, Rules & sources with its Fund settings tab, Data) and the governance additions (calculation versions, a reason to reopen, manual adjustments, the prior-year column, the expense allocation policy) have no counterpart there, so there is nothing to compare them with. They are described in [PRODUCT.md](PRODUCT.md#beyond-the-reference-platform-workspaces) and checked instead by independent tests under `test/verify/` that recompute their figures from the cited rules (for example every BAS label and GST F5 box from the ledger, and each State and Territory's land tax and duty from the revenue office tables and the legislation) rather than from this build's output.

## Differences at a glance

Each row is a deliberate difference. AU is Australia and SG is Singapore; the evidence for each row is in the matching file under "Market documents".

| Item | Reference app | This build | Why / citation |
| --- | --- | --- | --- |
| AU, SG: arithmetic | Floating-point dollars, shown to the whole dollar | Integer cents; each component allocated exactly across units; reconciliations compare exact cents | One cent over is a variance (`calc.test.ts`) |
| AU, SG: per-holder cents | One figure per displayed cell | Each holder rounded to the cent. AU: Kurrajong's Offshore nominee account A$1,965,839.50 against A$1,965,839. SG: a holder's tax can differ by up to half a cent | Within the A$1 / S$1 tolerance; fund-level sums are exact (`investor.test.ts`, `invariants.test.ts`, `calc.test.ts`) |
| AU: CGT discount holding test | Held 12 months or more gets the discount | Discount only after the first anniversary of acquisition; no seed property is on the boundary | Engine `computeCgt`; ITAA 1997 s115-25 |
| AU: AMMA statements overdue | Due date compared with the current time | Calendar dates: open on the due day, overdue from the next day | A period "within 3 months" includes its last day (ITAA 1997 s276-455(1)) |
| AU: AMMA due date for month-end year ends | Coastline's statements due 31 Dec 2026 (30 September year end) | Same date, after an engine fix (the engine had returned 30 Dec 2026). A 30 April year end now gives 31 Jul and a February year end 31 May | ITAA 1997 s276-455(1); Acts Interpretation Act 1901 s36(1) item 6, s2G(2) |
| AU: label of the doubled discount-gain component | "CGT concession amount — TARP" | "AMIT CGT gross-up amount — TARP"; figures, treatment text and keys unchanged | ATO AMMA statement and SDS 2024 guidance notes: the AMMA-statement term is "AMIT CGT gross up amount", "CGT concession amount" is the non-AMIT (SDS) term |
| AU: short label of the non-attributable line (Sankey) | "Tax deferred" | "Cost base excess"; the long label stays "Other non-attributable amounts" | Same ATO guidance notes (the AMMA-statement term) |
| AU: Rules row, cross-staple rent excluded from NCMI | Relief "ends 30 June 2026 for non-economic infrastructure" | Both end dates: before 1 July 2026 (non-economic) and before 1 July 2034 (economic infrastructure) | LCR 2020/2 para 251; TAA 1953 Sch 1 s12-440 |
| AU: build-to-rent Rules row | Not among the reference's twelve rows | A thirteenth row for year ends on or after 1 January 2025; informational | Engine `BTR_WITHHOLDING_RATES`; ATO, Build to rent development tax incentives |
| AU: what-if cash input | Joins typed digits into a wrong amount | Read as a money amount; the reference's input bug is not reproduced | `analytics.test.ts`; `test/app/analytics/scenario.test.ts` |
| AU: scenario per-unit cents for a shortfall | Only an excess is shown (Harbourline 2.0467) | Signed to 4 dp; a shortfall is negative (Southbank −0.7040) | Design choice; the reference pages have no shortfall case |
| AU: deductions above a rent stream's income | The stream is floored at nil and the excess is not attributed | The excess is set against the remaining rent, interest and foreign income, then TARP gains, pro rata; only what is left is the trust's tax loss. No seeded fund has an excess, so no figure moves | ATO, "Calculating AMIT income – trust components" (no trust component below nil; remaining deductions apportioned on a reasonable basis); `expense-allocation.test.ts` |
| AU: member annual statement and AIIR CSV | Statement named, content not on the reference pages; CSV "a working file with every tax character" | Own statement layout; 19-column AIIR CSV | ATO AMIT member annual statement guidance; `statements.test.ts`, `investor.test.ts` |
| SG: rates by holder class | One fixed table: 10% final for non-resident non-individuals and funds, 17% not final without a declaration, on any date | Read from the engine by payment date; 10% only inside its window (non-individuals 18 Feb 2005 to 31 Dec 2030; funds 1 Jul 2019 to 31 Dec 2030); Rules text built from the same windows | e-Tax Guide ¶7.1 to 7.2, Annex 2. Every seed payment is inside the window, so no figure moves |
| SG: declaration cut-off wording | Notice date labelled "Form A and Form B due" (record date plus seven days) | Same date, labelled "Declaration cut-off set by the manager", with text that IRAS requires Form A, and Form B where it applies, before every distribution | e-Tax Guide ¶13.1(a): Form A is submitted before every distribution; the cut-off date is the manager's, not IRAS's |
| SG: tax notice timing wording | Checks and Deadlines row tie the tax notice to the record date | Same ids, titles and dates; details add that announcing the notice before the record date is market practice, not an IRAS rule | The Guide has no rule on a tax notice or its date |
| SG: return-of-capital footnote | Short footnote; Rules row "Reduces cost of units for traders" | Longer footnote and Rules row in the Guide's wording | ITA s35(15C); e-Tax Guide ¶8.8, footnote 33 |
| SG: trustee tax when the 90% condition fails | 17% of retained income only (Kallang S$1,068,620) | The same figures are displayed, as the reference's simplification. The law taxes all the taxable specified income at the trustee when the condition fails; the payout exception gives that worst case (Kallang S$7,124,105) and a Rules row states the rule | e-Tax Guide ¶18.5, ¶5.3, ¶6.1, ¶10.4, ¶8.4; ITA s43(2) |
| SG: s45G withholding when the 90% condition fails | Withheld on the whole taxable distribution (Kallang S$837,081.75) | Same figures. The exception says no s45G withholding would apply to income taxed at the trustee, so S$837,082 would fall away | e-Tax Guide ¶8.4 |
| SG: disposal loss in the book-to-tax reconciliation | "Less: accounting gain on disposal" even for a loss | "Add: accounting loss on disposal" when the result is a loss | Same add-back as fair value and straight-line rent; no seed has a loss (`tb.test.ts`) |
| SG: unknown trial balance category id | Only "unmapped" is flagged | An id missing from the market's category table is treated as unmapped | `tb.test.ts` |
| SG: DRAFT marker on the notice | Badge between the title and the fund name | First block, after the fund name | `DocModel` has no badge slot (`investor.test.ts`) |
| SG: cost base above cost | Floored at nil, excess shown | Floored at nil; excess in an "Excess over cost base" units-CSV column and a footnote sentence | No seeded holder is over cost (`costbase.test.ts`) |
| SG: CSV amounts | Text with two decimals | Plain numbers | Numbers stay numeric (`src/app/exports/csv.ts`) |
| SG: Statements tab | Not on the reference pages | A unitholder statement for each holder | Design addition (`statements.test.ts`) |
| SG: scenario input handling | A payout percentage; only Loyang at 85% was checked | Default is the fund's current payout; a value outside 0 to 100 is held to the range; a missing or non-finite value falls back to the default | Design choice (`analytics.test.ts`) |
| SG: Rules tab rows | Twelve rows | Fourteen: adds failing the 90% condition, and declaration cut-off and tax notice timing | Design additions (`rules.test.ts`); see [sg.md](parity/sg.md) |
| SG: cases the reference pages do not show | Not shown | A fund with no notice record falls back to its period end and cannot be published; withholding counts as done when nothing was withheld; return readiness and the narrative gain extra items | Design additions (`investor.test.ts`, `deadlines.test.ts`, `returns.test.ts`, `calc.test.ts`) |

Unmapped trial balance accounts follow the reference app ("Needs a tax category", "Excluded until mapped"); that is a match, not a difference. Known gaps are not deliberate differences and are listed at the end of each market file.
