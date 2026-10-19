# AU capital allowances

This document covers the Australian figures shown in the Assets & allowances workspace for AU funds and the calculators **Division 40 depreciation**, **Division 43 capital works** and **Borrowing costs**. It documents the code in `src/engine/au/depreciation.ts`, `src/engine/au/capitalWorks.ts`, `src/engine/au/borrowingCosts.ts`, the AU asset register in `src/domain/assets`, and calculator wiring in `src/app/workspaces/calculators/model.ts`. Money is integer cents; rate percentages are basis points unless stated otherwise.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Division 40 decline in value | Assets & allowances register and schedule; Division 40 calculator | ITAA 1997 Div 40, ss 40-25, 40-70, 40-75, 40-285 | `src/engine/au/depreciation.ts` | A — ATO photocopier example reproduced |
| Low-value pool | Assets & allowances register pool row and schedule | ITAA 1997 Subdiv 40-E; ATO low-value pool guide | `computeDepreciationSchedule` | B — independently verified pool rates and register behaviour |
| Balancing adjustments | Assets & allowances disposal rows | ITAA 1997 s40-285 | `computeDepreciation` | B — independently verified in domain and v3 verifier tests |
| Division 43 capital works | Assets & allowances register and schedule; Division 43 calculator | ITAA 1997 Div 43, ss 43-10, 43-20, 43-25, 43-145 | `src/engine/au/capitalWorks.ts` | B — independently verified against ATO Appendix 3 rates |
| Borrowing costs | Assets & allowances schedule; Borrowing costs calculator | ITAA 1997 s25-25 | `src/engine/au/borrowingCosts.ts` | A — ATO Peter example reproduced |
| Section 40-880 business capital expenditure | Engine only; no current calculator | ITAA 1997 s40-880 | `computeBlackholeExpenditureSchedule` | B — independent verifier re-derived 20% over five years |

The asset register uses the fund `periodEnd` year as the AU income year ending 30 June. A substituted accounting period fund such as Coastline (30 September period end) still feeds income year `2026` into these AU engines, so the register shows the year ending 30 June 2026.

## Division 40 plant and equipment

### What it computes

The engine calculates one annual decline-in-value line for ordinary plant, or a multi-year schedule for ordinary plant, low-value pool assets and small-business pool assets. The Assets & allowances register displays opening written-down value, base deduction, balancing adjustment income or deduction, net deduction and closing written-down value. The Division 40 calculator exposes one generic asset and returns the yearly schedule.

### Legal basis

The rule entry is [Division 40 decline in value formulas and balancing adjustments](RULE-REGISTER.md#rule-au-au-div40-general-formulas-2001-plus). Second-hand residential denial is [rule `au-div40.second-hand-residential.2017-plus`](RULE-REGISTER.md#rule-au-au-div40-second-hand-residential-2017-plus). Catalogue lives are [rule `au-div40.property-asset-lives.2026`](RULE-REGISTER.md#rule-au-au-div40-property-asset-lives-2026). Low-value pool and simplified depreciation are [rule `au-div40.pools-and-small-business.2026`](RULE-REGISTER.md#rule-au-au-div40-pools-and-small-business-2026).

### Inputs

| App field or source | Engine field | Units and defaults |
| --- | --- | --- |
| Asset cost | `cost` | Integer cents; must be non-negative. |
| Start date | `startDate` | ISO date; determines income year and the 150% / 200% diminishing-value multiplier. |
| Method | `method` | `DIMINISHING_VALUE` or `PRIME_COST`. |
| Asset class | `assetClassId` | Looks up a default effective life where the class has one. |
| Effective life (years) | `effectiveLifeYears` | Optional if the catalogue class has a default; must be positive. |
| Taxable use (%) | `taxableUseBps` | Basis points; default 10,000 = 100%. Applied after raw decline is rounded. |
| Disposal date / proceeds | `terminationDate`, `terminationValue` | Optional; missing proceeds default to zero at a balancing-adjustment event. |
| Pool selection | `poolMethod` | `NONE`, `LOW_VALUE_POOL` or `SMALL_BUSINESS_POOL`. Pool assets must be run through the schedule. |
| Residential second-hand flags | `residentialAccommodationUse`, `secondHand`, `entityTypeForResidentialRestriction`, exception flags | Used only for s40-27 denial. |

### Method

1. Determine the AU income year as 1 July to 30 June from the asset dates. The module does not accept a substituted year end.
2. Opening adjustable value is the cost less raw decline in prior years. Prior-year decline uses the same method and ignores taxable-use apportionment when reducing adjustable value.
3. Days held are the inclusive overlap from start date to termination date, or to 30 June if not terminated. The numerator uses actual days, including 366 in a leap income year. The denominator is always 365.
4. Diminishing value raw decline is `roundHalfAwayFromZero(opening adjustable value × days held / 365 × multiplier / round(effective life × 100))`, where multiplier is 150 for assets started before 10 May 2006 and 200 for assets started on or after that date. The result is capped at opening adjustable value.
5. Prime cost raw decline is `roundHalfAwayFromZero(cost × days held / 365 × 1,000 / round(effective life × 1,000))`, capped at opening adjustable value.
6. Deduction allowed is raw decline multiplied by taxable-use basis points and rounded to cents. If the s40-27 second-hand residential restriction applies, deduction allowed is zero but adjustable value still falls by raw decline.
7. A balancing-adjustment event occurs when `terminationDate` is in the income year. The engine compares termination value with adjustable value after current-year raw decline. A positive difference is balancing adjustment income; a negative difference is a balancing adjustment deduction. Both are multiplied by taxable-use basis points and rounded. Closing adjustable value becomes zero.
8. The register's net deduction is `deductionAllowed + balancingAdjustmentDeduction - balancingAdjustmentIncome`.

### Division 40 method constants

| Setting | Code value | Source rule |
| --- | --- | --- |
| Diminishing value multiplier before 10 May 2006 | 150% | `au-div40.general-formulas.2001-plus` |
| Diminishing value multiplier from 10 May 2006 | 200% | `au-div40.general-formulas.2001-plus` |
| Prime cost rate numerator | 100% | `au-div40.general-formulas.2001-plus` |
| Day denominator for both methods | 365 | `au-div40.general-formulas.2001-plus` |
| Default taxable use | 100% | code default `FULL_USE = 10,000` |
| Low-value pool first-year addition rate | 18.75% | `au-div40.pools-and-small-business.2026` |
| Low-value pool opening-balance rate | 37.5% | `au-div40.pools-and-small-business.2026` |
| Low-cost asset allocation threshold | cost is less than A$1,000.00 | code condition `asset.cost < 100_000` |

### Division 40 asset class defaults

| Asset class | Default applies from | Effective life used by code |
| --- | --- | --- |
| Lifts - electric | 2003-01-01 | 30 years |
| Lifts - hydraulic | 2003-01-01 | 30 years |
| Escalators | 2003-01-01 | 20 years |
| HVAC packaged unit | 2003-07-01 | 15 years |
| HVAC mini split system | 2003-07-01 | 10 years |
| Fire indicator panel | 2019-07-01 | 12 years |
| Smoke or heat alarm | 2019-07-01 | 6 years |
| Security system controls | 2004-07-01 | 5 years |
| Carpet | 2019-07-01 | 8 years |
| Internal blinds | 2019-07-01 | 10 years |
| Hot-water system | 2019-07-01 | 12 years |
| Intercom system | 2019-07-01 | 10 years |
| Home automation control asset | 2019-07-01 | 10 years |
| Freestanding furniture | 2019-07-01 | 13.333333333333334 years |
| PABX / communications system | 2019-07-01 | 7 years |
| Other IT / electronic equipment | 2019-07-01 | user supplied |
| Other plant and equipment | 2019-07-01 | user supplied |

### Low-value pool method

Low-value pool assets are not calculated as individual deductions. In each schedule year the engine adds taxable-use-adjusted current-year low-cost additions to one pool balance. It deducts 37.5% of the opening pool balance plus 18.75% of current-year additions, both rounded to cents. Termination proceeds, adjusted for taxable use, reduce the pool after the deduction. If terminations exceed the balance before terminations, the excess is balancing adjustment income for the pool. No pool balancing deduction is produced.

### Worked examples

#### Example DIV40-1: ATO photocopier diminishing value and prime cost

Source: ATO Depreciating assets guide 2025, photocopier examples. Inputs are cost A$1,500.00, start date 2024-07-01, full-year 2025 income year, 5-year effective life, 100% taxable use.

| Method | Engine formula | Result |
| --- | --- | --- |
| Diminishing value | A$1,500.00 × 365 / 365 × 200% / 5 | decline in value A$600.00; closing adjustable value A$900.00 |
| Prime cost | A$1,500.00 × 365 / 365 × 100% / 5 | decline in value A$300.00; closing adjustable value A$1,200.00 |

The app displays whole dollars in the calculator schedule: A$600 and A$300.

#### Example DIV40-2: Leap-year denominator stays 365

A carpet asset costs A$8,000.00, starts on 2023-07-01 and uses the loaded 8-year prime-cost life. The 2024 income year has 366 days held. The code still divides by 365: `A$8,000.00 × 366 / 365 × 100% / 8 = A$1,002.74`. Closing adjustable value is A$6,997.26.

#### Example LVP-1: Low-value pool first two years

A low-cost controller costs A$800.00, starts on 2025-07-01 and is allocated to the low-value pool.

| Income year | Opening pool | Deduction | Closing pool |
| --- | ---: | ---: | ---: |
| 2026 | A$0.00 | A$800.00 × 18.75% = A$150.00 | A$650.00 |
| 2027 | A$650.00 | A$650.00 × 37.5% = A$243.75 | A$406.25 |

#### Example BAL-1: Disposal above adjustable value

A prime-cost plant asset costs A$100,000.00, has a 10-year life, starts on 2025-07-01, and is disposed of on 2026-06-30 for A$95,000.00. Current-year decline is A$10,000.00. Adjustable value before the balancing adjustment is A$90,000.00. The termination value exceeds adjustable value by A$5,000.00, so the engine reports a A$10,000.00 deduction allowed, A$5,000.00 balancing adjustment income, and closing adjustable value A$0.00. The register net deduction is A$5,000.00.

#### Example DIV40-3: Harbourline demo asset register

In the live app open Harbourline in Assets & allowances. The seeded `HVAC plant replacement` asset has cost A$519,538.88, starts on 2025-07-01, uses prime cost with a one-year seeded life, and therefore claims A$519,538.88 for 2026 with closing written-down value A$0.00. The Harbourline register total for `Tax depreciation — Div 40` is A$1,855,496.00 and agrees to the seeded trial-balance adjustment.

### Edge cases

Zero cost or zero days held produces zero decline. Negative cost, invalid taxable-use percentages, non-positive effective life and termination before start throw validation errors; the calculator catches these and displays an input error. Assets with no catalogue life require a user-supplied life. Second-hand residential denial creates warnings and gives zero deduction but still tracks adjustable value and disposal findings. The simplified-depreciation branch exists in the engine, but ordinary property funds should not assume they satisfy the small-business turnover and election tests.

### Evidence

`test/engine/au/depreciation.test.ts` covers prime cost, leap-year denominator, s40-27 denial and grandfathering, small-business instant asset write-off and catalogue defaults. `test/engine/au/independent-allowances-cgt.test.ts` includes `Div 40 - ATO photocopier examples reproduce the published diminishing value and prime cost amounts`. `test/domain/assets/assets.test.ts` hand-checks prime cost, part-year diminishing value, balancing adjustments and low-value pools. `test/verify/assets/asset-register-verifier.test.ts` independently checks the seeded register, 10-year Division 40 schedules and low-value pool rates. `test/verify/v3/v-app-domain.test.ts` checks disposal and low-value-pool display. `test/docs/au-capital-allowances.test.ts` recomputes each worked example and quoted table.

### Confidence

Grade A for the core Division 40 formula because `test/engine/au/independent-allowances-cgt.test.ts` ("Div 40 - ATO photocopier examples reproduce the published diminishing value and prime cost amounts") and this document's test reproduce the ATO photocopier diminishing-value and prime-cost examples. Low-value pool and balancing adjustments are grade B: they are independently verified against the coded formulas and cited ATO guidance, but no official numerical pool/disposal example is reproduced in this document.

### Assumptions and limitations

The module does not model specialised intangible rules, software pools, luxury car limits, rollovers, quasi-ownership, private-use balancing reductions beyond the taxable-use percentage, or return-label whole-dollar rounding. The asset register's dispose dialog defaults disposal proceeds to zero unless the user enters proceeds, so a missing value can create a balancing deduction. Unit-holder AMIT cost-base adjustments belong in [AU AMIT distributions](au-amit-distributions.md), not this asset register calculation.

## Division 43 capital works

### What it computes

The engine calculates annual Division 43 deductions for buildings, structural improvements and build-to-rent assets. The Assets & allowances register shows opening undeducted construction expenditure, base deduction and closing undeducted construction expenditure. The Division 43 calculator projects a schedule for one building.

### Legal basis

Core rates and commencement-date tests are [rule `au-div43.general-rates.1979-plus`](RULE-REGISTER.md#rule-au-au-div43-general-rates-1979-plus). Build-to-rent is [rule `au-div43.build-to-rent.2025-plus`](RULE-REGISTER.md#rule-au-au-div43-build-to-rent-2025-plus). The cost-base interaction is [rule `au-div43.cost-base.2000-plus`](RULE-REGISTER.md#rule-au-au-div43-cost-base-2000-plus).

### Inputs

| App field or source | Engine field | Units and defaults |
| --- | --- | --- |
| Building type | `buildingType` | Residential, commercial, industrial, traveller accommodation, structural improvement or build-to-rent. Calculator exposes commercial, residential, industrial and structural improvement. |
| Construction start date | `constructionStartDate` | Selects the rate row. |
| Construction complete date | `constructionCompleteDate` | Claim cannot start before completion. |
| First income use date | `firstIncomeUseDate` | Optional; claim start is at least this date. |
| Acquisition date | `acquisitionDate` | Optional in calculator; asset register passes the asset start date. Claim start is at least this date. |
| Construction expenditure | `constructionExpenditure` | Integer cents; excludes land and Division 40 plant. |
| Prior Division 43 claims | `priorDivision43Claims` | Optional cents; reduces opening undeducted construction expenditure. |
| Taxable use (%) | `taxableUseBps` | Basis points; default 100%. |
| Disposal date | `disposalDate` | Ends claim days; there is no Division 43 sale balancing adjustment. |
| Build-to-rent active dates | `buildToRentActiveFromDate`, `buildToRentActiveToDate` | Required for BTR; claim start is at least 2025-01-01 and the active-from date. |

### Method

1. Validate ISO dates and non-negative construction expenditure. Prior claims cannot exceed construction expenditure.
2. Select the rate by `buildingType` and `constructionStartDate`.
3. Claim start date is the latest of construction complete date, first income use date, acquisition date, and for BTR the later of 2025-01-01 and the BTR active-from date.
4. Deduction period end is claim start plus 40 years for a 2.5% rate or 25 years for a 4% rate, minus one day.
5. For each prior income year since claim start, recompute claimable days and reduce the opening undeducted construction expenditure by that year's allowed deduction. This loop uses construction expenditure as the base each year, not the opening undeducted balance, and caps current-year deduction at the remaining undeducted amount.
6. Current-year raw deduction is `roundHalfAwayFromZero(roundHalfAwayFromZero(construction expenditure × rate bps / 10,000) × days claimed / days in income year)`. Taxable use is then applied and rounded. Leap years use 366 days in the denominator.
7. Closing undeducted construction expenditure is opening less the current deduction. On sale the engine stops claim days at disposal date, but does not create a balancing adjustment. The CGT engine must receive claimed Division 43 deductions as a cost-base reduction.

### Division 43 rate table

| Building type | Construction start dates | Rate | Deduction period | Rule |
| --- | --- | ---: | ---: | --- |
| Residential rental building | From 1985-07-18 | 2.5% | 40 years | `au-div43.general-rates.1979-plus` |
| Commercial / other non-residential building | From 1979-08-22 | 2.5% | 40 years | `au-div43.general-rates.1979-plus` |
| Industrial building | 1979-08-22 to 1984-08-21 | 2.5% | 40 years | `au-div43.general-rates.1979-plus` |
| Industrial building | 1984-08-22 to 1987-09-15 | 4% | 25 years | `au-div43.general-rates.1979-plus` |
| Industrial building | 1987-09-16 to 1992-02-26 | 2.5% | 40 years | `au-div43.general-rates.1979-plus` |
| Industrial building | From 1992-02-27 | 4% | 25 years | `au-div43.general-rates.1979-plus` |
| Traveller accommodation building | 1979-08-22 to 1984-08-21 | 2.5% | 40 years | `au-div43.general-rates.1979-plus` |
| Traveller accommodation building | 1984-08-22 to 1987-09-15 | 4% | 25 years | `au-div43.general-rates.1979-plus` |
| Traveller accommodation building | 1987-09-16 to 1992-02-26 | 2.5% | 40 years | `au-div43.general-rates.1979-plus` |
| Traveller accommodation building | From 1992-02-27 | 4% | 25 years | `au-div43.general-rates.1979-plus` |
| Structural improvement | From 1992-02-27 | 2.5% | 40 years | `au-div43.general-rates.1979-plus` |
| Build-to-rent development | From 2023-05-10, active from 2025-01-01 or later | 4% | 25 years | `au-div43.build-to-rent.2025-plus` |

### Worked examples

#### Example DIV43-1: Commercial capital works at 2.5%

A commercial structure has construction expenditure A$4,000,000.00, construction start 2024-07-01, completion 2025-06-30, first income use and acquisition on 2025-07-01. For the 2026 income year the code claims 365 / 365 days at 2.5%: `A$4,000,000.00 × 2.5% = A$100,000.00`. Closing undeducted construction expenditure is A$3,900,000.00.

#### Example DIV43-2: Build-to-rent 4% rate

A BTR tower has construction expenditure A$100,000.00, construction started on the coded boundary 2023-05-10, was complete and acquired on 2025-01-01, and is active for BTR from 2025-01-01. For 2026 it claims 365 / 365 days at 4%, giving A$4,000.00.

#### Example DIV43-3: Harbourline demo capital works

In the live app, Harbourline's `Base building structure` seed asset has construction expenditure A$53,563,723.20 and a 2026 commercial Division 43 deduction at 2.5%. The register shows base deduction A$1,339,093.08 and closing undeducted construction expenditure A$52,224,630.12. Harbourline's `Capital works — Div 43` register total is A$3,719,703.00 and agrees to the seeded trial-balance adjustment.

### Edge cases

Dates before the modelled start for the selected building type throw through `requireEffective`; calculator validation catches malformed dates before the engine runs. Residential construction before 1985-07-18 and BTR construction before 2023-05-10 produce findings, but the current rate selection already requires an effective row. BTR requires an active-from date. Division 43 amounts should be based on reviewed construction records or quantity-surveyor apportionment, not purchase price.

### Evidence

`test/engine/au/capitalWorks.test.ts` covers residential 2.5%, BTR 4%, industrial historical 2.5%, schedules and validation. `test/engine/au/independent-allowances-cgt.test.ts` independently verifies ATO Appendix 3 2.5% and historical industrial-rate behaviour. `test/domain/assets/assets.test.ts` hand-checks 2.5% commercial and 4% industrial assets. `test/verify/assets/asset-register-verifier.test.ts` checks a 10-year Division 43 schedule. `test/docs/au-capital-allowances.test.ts` recomputes the examples and table rows.

### Confidence

Grade B. The rates and methods are from primary sources and independently re-derived in verifier tests. This document does not reproduce a numbered official Division 43 worked example with the same dollar figures; it reproduces the statutory/ATO Appendix 3 rate outcomes with constructed inputs.

### Assumptions and limitations

The engine models core building types, BTR opt-in dates and day apportionment. It does not model quasi-ownership, R&D carve-outs, destruction deductions, environmental protection works, or whether a BTR project satisfies every 15-year compliance condition. It assumes the construction expenditure input has already excluded land, landscaping, demolition, site preparation and Division 40 plant.

## Borrowing costs and section 40-880

### What it computes

The Borrowing costs calculator and AU asset register spread s25-25 borrowing costs over the shorter of five years and the loan period. The same source file also exposes a section 40-880 blackhole expenditure schedule for eligible business-related capital expenditure, but there is no current calculator for that function.

### Legal basis

Borrowing expenses are [rule `au-borrowing-expenses.25-25`](RULE-REGISTER.md#rule-au-au-borrowing-expenses-25-25). Section 40-880 is [rule `au-blackhole-expenditure.40-880`](RULE-REGISTER.md#rule-au-au-blackhole-expenditure-40-880).

### Inputs

| App field or source | Engine field | Units and defaults |
| --- | --- | --- |
| Borrowing costs | `amount` | Integer cents; non-negative. |
| Incurred date | `incurredDate` | Used as the loan start if `loanStartDate` is absent. |
| Loan start date | `loanStartDate` | Optional engine field; calculator does not expose it. |
| Loan end date | `loanEndDate` | Must not be before loan start. |
| Taxable use (%) | `taxableUseBps` | Basis points; default 100%; applied before the schedule and rounded. |

### Method

1. Deductible amount is `amount × taxableUseBps / 10,000`, rounded to cents.
2. If the deductible amount is A$100.00 or less, the engine deducts it immediately in the first income year.
3. Otherwise the amortisation end date is the earlier of the loan end date and the day before the fifth anniversary of the loan start date. A five-year period from 2024-07-03 ends on 2029-07-02 and has 1,826 days because it includes leap day 2028.
4. For each income year, relevant days are the inclusive overlap of the loan/amortisation period and the income year.
5. For non-final years, deduction is `opening unclaimed amount × relevant days / remaining loan days`, rounded to cents. Remaining loan days run from the start of that year (or the loan start in the first year) through the amortisation end date. The final year deducts the remaining cents exactly.
6. Section 40-880 uses `allocate(amount × taxableUseBps / 10,000, [1,1,1,1,1])`, so five yearly deductions always add back to the input exactly.

### Borrowing cost thresholds and rates

| Calculation | Code value | Rule |
| --- | --- | --- |
| Immediate deduction threshold | Deductible amount is A$100.00 or less | `au-borrowing-expenses.25-25` |
| Spreading period | Shorter of five years and actual loan period | `au-borrowing-expenses.25-25` |
| Day-count denominator | Actual remaining loan days | `au-borrowing-expenses.25-25` |
| Section 40-880 allocation | 20% in the incurred year and each of the next four income years | `au-blackhole-expenditure.40-880` |

### Worked examples

#### Example BORR-1: ATO Peter borrowing-expense example

Source: ATO borrowing expenses page, Peter example. Borrowing expenses are A$1,600.00, incurred on 2024-07-03, loan start 2024-07-03, loan end 2049-07-02. The engine spreads over the first five years because that is shorter than the loan term.

| Income year | Opening unclaimed | Relevant days / remaining days | Deduction | Closing unclaimed |
| --- | ---: | ---: | ---: | ---: |
| 2025 | A$1,600.00 | 363 / 1,826 | A$318.07 | A$1,281.93 |
| 2026 | A$1,281.93 | 365 / 1,463 | A$319.83 | A$962.10 |
| 2027 | A$962.10 | 365 / 1,098 | A$319.82 | A$642.28 |
| 2028 | A$642.28 | 366 / 733 | A$320.70 | A$321.58 |
| 2029 | A$321.58 | 365 / 367 | A$319.83 | A$1.75 |
| 2030 | A$1.75 | 2 / 2 | A$1.75 | A$0.00 |

The first year matches the ATO figure A$318.07 and the final year is A$1.75.

#### Example BORR-2: Section 40-880 straight-line allocation

Eligible business-related capital expenditure of A$5,000.00 incurred on 2024-08-01 is allocated in five equal income-year amounts: 2025 A$1,000.00, 2026 A$1,000.00, 2027 A$1,000.00, 2028 A$1,000.00 and 2029 A$1,000.00.

### Edge cases

A zero amount produces a zero immediate deduction. A loan end before loan start throws a validation error. Taxable use below 100% reduces the amount before the immediate-deduction threshold is tested. The calculator does not expose early repayment as a separate action; users model it by setting the loan end date.

### Evidence

`test/engine/au/borrowingCosts.test.ts` covers immediate deduction, day-based spreading, 40-880 allocation and validation. `test/engine/au/independent-allowances-cgt.test.ts` reproduces ATO's Peter example and verifies s40-880. `test/domain/assets/assets.test.ts` and `test/verify/assets/asset-register-verifier.test.ts` verify borrowing-cost rows in the Assets & allowances 10-year schedule. `test/docs/au-capital-allowances.test.ts` recomputes the examples.

### Confidence

Grade A for s25-25 because `test/engine/au/independent-allowances-cgt.test.ts` reproduces the Peter ATO worked example to the cent and this document's test pins it. Section 40-880 is grade B because it is independently verified against the primary statutory 20% rule, but it is not a displayed calculator.

### Assumptions and limitations

The engine assumes the borrowing expense is otherwise deductible and that taxable use is already reviewed. It does not classify loan costs, handle refinancing fact patterns separately, or lodge any return labels.

## Sources

| Source | Code cites it? | Read date |
| --- | --- | --- |
| ATO legal database, ITAA 1997 ss 40-25, 40-27, 40-70, 40-75, 40-285 | Yes, via Division 40 rule entries | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO Depreciating assets guide 2025, working out decline in value | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO Depreciating assets guide 2024, low-value pools | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO rental properties 2026, residential rental property asset tables | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO legal database, ITAA 1997 Div 43 and ss 43-20, 43-25, 43-145 | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO Company tax return 2024 instructions, Appendix 3 capital works deductions | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO build-to-rent development tax incentives | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO borrowing expenses page | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO legal database, ITAA 1997 s40-880 | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
