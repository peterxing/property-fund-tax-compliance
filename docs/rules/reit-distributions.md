# Singapore REIT distributions engine (retrieved 2026-10-09)

## Covered modules
- `reitTax.ts`: tax-transparency threshold, trustee-level tax, investor-class withholding treatment, declaration requirements, Form UT / S45 timing helpers.
- `distribution.ts`: payout policy, DPU calculation, unitholder allocation, annual tax-statement data, withholding reconciliation, scenario modelling.

## Key parameters and dates
- Tax-transparency condition: distribute at least **90%** of taxable specified income in the same year.
- Trustee tax rate default modelled: **17%** (overrideable input).
- Concessionary withholding rates:
  - qualifying non-resident non-individuals: **10% final WHT** from **2005-02-18** to **2030-12-31**
  - qualifying non-resident funds under **sections 13D / 13U / 13V**: **10% final WHT** from **2019-07-01** to **2030-12-31**
  - qualifying non-resident funds under **section 13OA**: **10% final WHT** from **2025-01-01** to **2030-12-31**
- REIT ETF transparency treatment for distributions is modelled through **2030-12-31**.
- Co-location / co-working space income is treated as specified income from **2025-07-01**.
- Form UT filing deadline helper: **15 April** with audited accounts and tax computation; the guide also states **no ECI filing is required**.
- Withholding remittance helper: **15th of the second month from payment**.

## Investor classes modelled
- Individuals.
- Singapore companies.
- Singapore branches.
- Singapore-incorporated / registered bodies of persons (including charities / statutory bodies covered by the guide wording).
- Exempt international organisations.
- REIT ETFs with transparency treatment.
- Qualifying non-resident non-individuals.
- Qualifying non-resident funds.
- Other non-resident non-individuals.

## Distribution mechanics modelled
- Composition split:
  - tax-transparent taxable income
  - income taxed at trustee level
  - tax-exempt income
  - return of capital
- Optional rollover income adjustments can be fed into the next period's specified-income pool.
- Per-holder allocation uses deterministic largest-remainder cents allocation so totals reconcile exactly.
- Withholding is applied only to the tax-transparent taxable component.
- Return of capital is surfaced in the statement output so downstream UI / workflow can reduce cost base; excess over cost can become taxable for revenue-account holders.

## Important assumptions / cautions
- The engine conservatively treats a failure of the **90%** threshold as a failure of transparency for the period's specified income. Review edge cases with tax counsel if a different legal interpretation is intended.
- Form A (**Declaration for Singapore Tax Purposes**) and Form B (**Declaration by Depository Agents**) are treated as the practical gate to zero-deduction or concessionary treatment for non-individual holders. Missing status confirmation therefore defaults to withholding in the engine, reflecting paragraph 12.2(b).
- The engine does not compute each investor's personal or corporate downstream tax return; it only classifies the REIT-distribution tax treatment and deduction-at-source outcome.
