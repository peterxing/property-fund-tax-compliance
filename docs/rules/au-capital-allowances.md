# AU capital allowances

This module set covers four Australian allowance streams used by the property stack:

- `capitalWorks.ts` models Division 43 building and structural-improvement deductions.
- `depreciation.ts` models Division 40 plant, decline in value, balancing adjustments, low-value pools, and the small-business simplified-depreciation branch.
- `borrowingCosts.ts` models section 25-25 borrowing expenses and section 40-880 five-year blackhole deductions.

## Key modelling choices

- All money is integer cents and rates are integer basis points.
- Division 43 uses effective-dated 2.5% and 4% tables, actual qualifying days in the year, and a remaining-construction-expenditure approach capped by prior claims.
- Division 40 uses actual days held in the numerator and a fixed 365-day denominator, even in leap years.
- Catalogue effective-life defaults only apply from the stated ATO column date for that asset class; if an asset predates that date, the calculator warns and expects a reviewed life to be entered explicitly.
- The section 40-27 second-hand residential restriction is modelled as a denied deduction, while adjustable value tracking still continues.
- Borrowing expenses of $100 or less are deducted immediately; otherwise the schedule follows the statutory remaining-expenditure / remaining-loan-period formula.
- Section 40-880 is spread over five income years using an exact cents allocation that always sums to the input.

## Important limitations

- Complex quasi-ownership, destruction, rollover, and specialised intangible-asset rules are out of scope.
- The small-business instant asset write-off remains effective-dated data, but ordinary property funds should not be assumed to satisfy the turnover and simplified-depreciation entry tests.
- Asset-class defaults are not universal historical lives: they are loaded only for assets acquired on or after the stated ATO table date (for example, 1 January 2003 for lifts, 1 July 2003 for air-conditioning, 1 July 2004 for security controls, and 1 July 2019 for most other loaded defaults).
- Division 43 inputs should come from reviewed construction-cost records or a quantity surveyor split where plant / land components must be separated.
