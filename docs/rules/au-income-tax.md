# Australian income-tax engine rules (retrieved 2026-10-10)

## Covered modules
- `src/engine/au/dates.ts`
- `src/engine/au/taxonomy.ts`
- `src/engine/au/mappingSuggestions.ts`
- `src/engine/au/trustTax.ts`
- `src/engine/au/companyTax.ts`
- `src/engine/au/returns.ts`

## Key verified facts
| Topic | Verified rule | Source |
| --- | --- | --- |
| Company tax rate | Base rate entities pay **25%** and others **30%** in 2025–26. | https://www.ato.gov.au/tax-rates-and-codes/company-tax-rates/tax-rates-2025-26 |
| Base rate entity test | From 2017–18 onward, the lower rate moved from **27.5% / <$25m** (2017–18) to **27.5% / <$50m** (2018–19 to 2019–20), **26% / <$50m** (2020–21), and **25% / <$50m** from 2021–22 onward. The passive-income limb is **80% or less** and rent, interest, dividends and net capital gains are passive. | https://www.ato.gov.au/tax-rates-and-codes/company-tax-rate-changes |
| AMIT return | Lodging the AMIT return is taken to make the irrevocable AMIT choice; 30 June AMITs lodge by **31 October**. | https://www.ato.gov.au/forms-and-instructions/attribution-managed-investment-trust-tax-return-instructions-2026/how-to-lodge-your-amit-tax-return-and-pay |
| Company return | Company return due dates are driven by legislative instrument; the ATO points ordinary taxpayers to income-tax due dates and registered agents to the lodgment program. | https://www.ato.gov.au/forms-and-instructions/company-tax-return-2026-instructions/how-to-lodge-your-company-tax-return-and-pay |
| Trust net income | Division 6 section 95 defines trust net income as assessable income less allowable deductions, calculated as if the trustee were a resident taxpayer. | https://www.ato.gov.au/law/view/document?DocID=PAC/19360027/95 |
| Trust no-present-entitlement tax | Sections **99** and **99A** govern trustee assessment when no beneficiary is presently entitled. | https://www.ato.gov.au/law/view/document?DocID=PAC/19360027/99 and https://www.ato.gov.au/law/view/document?DocID=PAC/19360027/99A |
| Foreign resident rates | 2025–26 and 2024–25 foreign-resident individual rates start at **30%** to $135,000. | https://www.ato.gov.au/tax-rates-and-codes/tax-rates-foreign-residents |
| Resident rates | 2025–26 resident rates are **0 / 16% / 30% / 37% / 45%**. | https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents |
| Trustee Medicare levy | ITAA 1936 **s 251S(1)(c)** applies the Medicare levy where a trustee is assessed and liable under **s 99** or **s 99A**; the ATO resident-rates page states the levy is **2%**. | https://www.ato.gov.au/law/view/document?DocID=PAC/19360027/251S and https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents |
| SAP lodgment | SAP trusts lodge by the **last day of the fourth month** after year end; SAP companies lodge by the **15th day of the seventh month** and pay by the **first day of the sixth month**. | https://www.ato.gov.au/tax-and-super-professionals/for-tax-professionals/prepare-and-lodge/registered-agent-lodgment-program/due-dates-for-tax-returns-by-client-type/substituted-accounting-periods |
| Trust-loss review | Trust losses are restricted by Schedule 2F tests that vary by trust type; capital losses are excluded from the trust-loss provisions. | https://www.ato.gov.au/businesses-and-organisations/trusts/trust-income-losses-and-capital-gains/trust-loss-provisions/about-trust-loss-provisions |
| Company loss review | A company that fails continuity of majority ownership may still use losses if the business continuity test is satisfied. | https://www.ato.gov.au/forms-and-instructions/losses-schedule-2026-instructions/instructions-to-complete-the-losses-schedule-2026/part-b-ownership-and-business-continuity-test |

## Important differences from common belief
- Investment-property rent is **passive income** for the base rate entity test, so many property-holding companies do **not** qualify for 25%.
- A company with passive income at **exactly 80%** still satisfies the passive-income limb; the fail point is **more than 80%**.
- AMITs do **not** use the ordinary trust return while they remain eligible and electing; they lodge the dedicated **AMIT tax return**.

## Assumptions and limitations
- `trustTax.ts` now adds Medicare levy to sections 99 and 99A, but still treats the section 99A special-rate percentage by analogy to the published top resident marginal rate because that percentage was not separately sourced in the cited primary text.
- Foreign-resident beneficiary trustee tax is only modelled for **individual-rate** cases; other beneficiary classes are flagged.
- MIT withholding, AMMA statements, unders/overs, franking-credit offsets, beneficiary tax offsets, and GST/state-tax interactions are handled in other modules or left for review.
- The mapping dictionary is a platform rule-set informed by Australian property ledgers; it is intentionally conservative and keeps unknown captions at low confidence.
- `returns.ts` shows the statutory due date only; it does **not** apply a weekend/public-holiday rollover to the next business day.
