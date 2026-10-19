# Singapore corporate income tax and badges of trade

This document covers the **Corporate income tax** and **Badges of trade** calculators, plus the Singapore income-tax flow used by tax computations, returns, allocation and REIT trustee base-case outputs. The code is in `src/engine/cit.ts`, `taxComputation.ts`, `allocation.ts`, `returns.ts` and `badgesOfTrade.ts`. Money is stored as integer cents; CIT inputs are rounded to whole dollars at the steps described below.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Corporate income tax | Calculator `sg-cit`; tax computation summaries | Income Tax Act and IRAS corporate tax rate, rebate, exemption and tax computation guidance | `src/engine/cit.ts`, `src/engine/taxComputation.ts` | B |
| Returns, ECI and basis periods | Tax computation/return summaries | IRAS Form C-S / C-S (Lite) / C and ECI guidance; REIT e-Tax Guide for Form UT | `src/engine/returns.ts` | C |
| Expense allocation | Tax computation support | IRAS tax-computation and foreign-income guidance | `src/engine/allocation.ts` | C |
| Badges of trade | Calculator `sg-badges` | IRAS gains from sale of property, shares and financial instruments guidance | `src/engine/badgesOfTrade.ts` | D |
| Identifier checks | Shared validators | ACRA/Bizfile, ICA, IRAS and PDPC references | `src/engine/identifiers.ts` | D; see [RULE-REGISTER](RULE-REGISTER.md#rule-sg-identifiers-uen-formats) |

## Corporate income tax

### What it computes

The engine computes Singapore corporate income tax on normal chargeable income and optional concessionary income slices. It applies partial tax exemption (PTE) or start-up tax exemption (SUTE), the 17% headline rate, YA 2024 to YA 2026 rebates, tax set-offs, tax deducted at source and informational findings.

### Legal basis

The rule entries cite IRAS' corporate income tax rate, rebates and exemption schemes page and the basic guide to corporate income tax. See [rule `cit.rate-and-exemptions.2022-plus`](RULE-REGISTER.md#rule-sg-cit-rate-and-exemptions-2022-plus), [rule `cit.rebates.2024-2026`](RULE-REGISTER.md#rule-sg-cit-rebates-2024-2026), [rule `cit.pillar-two.info.2025-plus`](RULE-REGISTER.md#rule-sg-cit-pillar-two-info-2025-plus) and [rule `cit.reit-trustee-prevailing-rate.2025-plus`](RULE-REGISTER.md#rule-sg-cit-reit-trustee-prevailing-rate-2025-plus).

### Inputs

| Input | Source in app | Units / default |
| --- | --- | --- |
| Year of Assessment | Corporate income tax calculator | Integer YA; calculator default YA 2026 |
| Normal chargeable income | Calculator or `taxComputation.ts` | Integer cents before exemption |
| Use start-up exemption | Calculator checkbox or a SUTE profile | Boolean/profile |
| Active company with local employee | Calculator checkbox | Drives cash-grant note and rebate offset logic |
| Tax set-offs / tax deducted at source | Calculator or API input | Integer cents |
| Pillar Two in scope | Entity profile | Finding only; no top-up tax calculation |

### Method

1. Reject YA outside 2000 to 2100.
2. Pick the 17% headline rate for modelled YAs.
3. Decide whether SUTE applies. If a profile is supplied, the code checks first three YAs, Singapore incorporation/residence, investment holding, property development, shareholder count and shareholder profile. If no profile is supplied, a boolean can force SUTE on or off.
4. Round normal chargeable income to the nearest whole dollar (`roundToDollar`, half away from zero).
5. Compute exemption on whole-dollar income. Each band slice is multiplied by its exemption percentage and rounded to whole dollars. The total exemption is capped.
6. Taxable normal income equals rounded income less exemption, floored at zero.
7. Tax before rebate is taxable normal income × 17%, rounded half away from zero to cents. Concessionary income slices, if supplied, are each rounded to whole dollars then multiplied by their own basis-point rate.
8. Deduct non-negative tax set-offs.
9. For YA 2024 to YA 2026, calculate a 50% rebate capped at S$40,000. If the company qualifies for the S$2,000 cash grant, the grant reduces the rebate deducted in this engine because IRAS handles the grant separately.
10. Deduct non-negative tax deducted at source. Tax payable is floored at zero.
11. If YA is at least 2024 and no rebate row exists, the engine adds warning `CIT.REBATE_NOT_VERIFIED`.

### Corporate income tax rates and thresholds

| Row | Applies | Rate / threshold | Code rule |
| --- | --- | --- | --- |
| CIT-HEADLINE | From YA 2022 | 17% headline corporate tax rate | `cit.rate-and-exemptions.2022-plus` |
| PTE-2020+ first band | YA 2020 onward | 75% of first S$10,000 | `cit.rate-and-exemptions.2022-plus` |
| PTE-2020+ second band | YA 2020 onward | 50% of next S$190,000 | `cit.rate-and-exemptions.2022-plus` |
| PTE-2020+ cap | YA 2020 onward | Maximum exemption S$102,500.00 | `cit.rate-and-exemptions.2022-plus` |
| PTE-pre-2020 first band | YA 2019 and earlier in code | 75% of first S$10,000 | `cit.rate-and-exemptions.2022-plus` |
| PTE-pre-2020 second band | YA 2019 and earlier in code | 50% of next S$290,000 | `cit.rate-and-exemptions.2022-plus` |
| PTE-pre-2020 cap | YA 2019 and earlier in code | Maximum exemption S$152,500.00 | `cit.rate-and-exemptions.2022-plus` |
| SUTE-2020+ first band | YA 2020 onward | 75% of first S$100,000 | `cit.rate-and-exemptions.2022-plus` |
| SUTE-2020+ second band | YA 2020 onward | 50% of next S$100,000 | `cit.rate-and-exemptions.2022-plus` |
| SUTE-2020+ cap | YA 2020 onward | Maximum exemption S$125,000.00 | `cit.rate-and-exemptions.2022-plus` |
| SUTE-pre-2020 first band | YA 2019 and earlier in code | 100% of first S$100,000 | `cit.rate-and-exemptions.2022-plus` |
| SUTE-pre-2020 second band | YA 2019 and earlier in code | 50% of next S$200,000 | `cit.rate-and-exemptions.2022-plus` |
| SUTE-pre-2020 cap | YA 2019 and earlier in code | Maximum exemption S$200,000.00 | `cit.rate-and-exemptions.2022-plus` |
| Rebate YA2024 | YA 2024 | 50% of tax before rebate, cap S$40,000.00, cash grant S$2,000.00 where active-company and local-employee tests pass | `cit.rebates.2024-2026` |
| Rebate YA2025 | YA 2025 | 50% of tax before rebate, cap S$40,000.00, cash grant S$2,000.00 where active-company and local-employee tests pass | `cit.rebates.2024-2026` |
| Rebate YA2026 | YA 2026 | 50% of tax before rebate, cap S$40,000.00, cash grant S$2,000.00 where active-company and local-employee tests pass | `cit.rebates.2024-2026` |

### Worked examples

#### Example CIT-1: YA 2026 PTE and rebate

| Input | Value |
| --- | --- |
| YA | 2026 |
| Normal chargeable income | S$500,000.00 |
| Exemption scheme | PTE |
| Active company with local employee | Yes |

Steps: round income to S$500,000.00. PTE is S$7,500.00 plus S$95,000.00 = S$102,500.00. Chargeable income after exemption is S$397,500.00. Tax before rebate is 17% = S$67,575.00. The 50% rebate is S$33,787.50, then the S$2,000.00 cash grant is handled separately and the engine deducts S$31,787.50. Tax payable is S$35,787.50, displayed in the calculator as S$35,788.

#### Example PTE-1: YA 2027 PTE with no verified rebate

| Input | Value |
| --- | --- |
| YA | 2027 |
| Normal chargeable income | S$100,000.00 |
| Exemption scheme | PTE |

Steps: PTE is S$7,500.00 plus S$45,000.00 = S$52,500.00. Chargeable income after exemption is S$47,500.00. Tax before rebate is S$8,075.00. No YA 2027 rebate row is verified, so rebate is S$0.00 and tax payable is S$8,075.00. The engine emits `CIT.REBATE_NOT_VERIFIED`.

### Edge cases

* Negative income is floored to zero before exemption.
* Non-company entities get the 17% rate but no PTE, SUTE or CIT rebate.
* SUTE is denied for investment holding or property development activities when a profile is supplied.
* Pillar Two / Domestic Top-up Tax is only an informational finding.
* Foreign tax credits, group relief and loss carry-back are not modelled in the main tax computation.

### Evidence

Pinned by `test/engine/cit.test.ts` tests "PTE from YA 2020 onward matches independent band calculations", "PTE before YA 2020 matches independent band calculations", "SUTE from YA 2020 onward matches independent band calculations", "YA 2026 rebate cap and cash grant use cents-scaled limits" and "whole-dollar rounding follows IRAS-style computation inputs". Independent evidence is in `test/engine/independent-verification.test.ts` test "Corporate tax - partial exemption and start-up exemption against hand calculations (IRAS CIT page)". This document is checked by `test/docs/sg-income-tax.test.ts`.

### Confidence

B — independently verified. The engine cites primary IRAS pages and the exemption/rebate mechanics are re-derived in engine and independent verification tests. No official IRAS calculator transcript is embedded as a worked example in this document.

### Assumptions and limitations

The code's current YA 2024 and YA 2025 cash-grant handling follows the current IRAS rebate-table structure. The engine does not embed detailed foreign tax credit, group relief, carry-back, tax treaty or Pillar Two computations.

## Tax computation, allocation and returns

### What it computes

`taxComputation.ts` starts from mapped trial-balance lines, computes accounting profit, add-backs, non-taxable/exempt income deductions, capital allowance utilisation, losses, donations, exemptions and CIT. `allocation.ts` allocates shared expenses across taxable, exempt, non-taxable and foreign streams. `returns.ts` selects Form C-S (Lite), Form C-S, Form C, Form UT or non-company handling, estimates ECI filing, and creates form-style summaries.

### Income tax computation rates and thresholds

| Row | Applies | Threshold / method | Code rule |
| --- | --- | --- | --- |
| Form C-S Lite revenue cap | Company return selection | Annual revenue ≤ S$200,000.00 | `returns.forms-and-eci.2022-plus` |
| Form C-S revenue cap | Company return selection and ECI waiver | Annual revenue ≤ S$5,000,000.00 | `returns.forms-and-eci.2022-plus` |
| Company return due date | Ordinary company return | 30 November of the YA | `returns.forms-and-eci.2022-plus` |
| REIT trustee Form UT due date | Section 43(2) REIT trustee | 15 April of the YA | `cit.reit-trustee-prevailing-rate.2025-plus` |
| ECI due date | Ordinary company ECI | 3 months from FYE | `returns.forms-and-eci.2022-plus` |
| ECI waiver | Ordinary company ECI | Annual revenue ≤ S$5,000,000.00 and ECI before exemption is nil | `returns.forms-and-eci.2022-plus` |
| Approved donation multiplier | Tax computation | Current-year approved donation × 2.5 | `tax-computation.preparing-tax-computation.2022-plus` |
| Donation carry-forward life | Tax computation | Drop donation vintages more than 5 YAs old | `tax-computation.preparing-tax-computation.2022-plus` |

### Evidence

Pinned by `test/engine/taxComputation.test.ts`, `test/engine/allocation.test.ts` and `test/engine/returns.test.ts`. Relevant test names include "end-to-end computation for a property company", "manual CURRENT_YEAR_APPROVED_DONATION reduces chargeable income using the 250% factor", "gross-revenue allocation disallows the exempt / foreign portion", "return-form selection distinguishes Form C-S Lite, Form C-S and Form C at the stated revenue thresholds" and "ECI waiver and REIT-specific exception are recognised at the S$5 million threshold".

### Confidence

C for return and ECI mechanics: primary-source thresholds are implemented and covered by engine unit tests, but no independent verifier test re-derives the return-form and ECI method. C for configurable expense allocation, because the allocation basis is an app policy rather than a single statutory formula.

## Identifier checks

### What it computes

The shared validators in `src/engine/identifiers.ts` check Singapore UEN, GST registration number, NRIC/FIN-style taxpayer identifiers and email-format inputs. These are validation-only helpers used to flag malformed identifiers; they do not query ACRA, ICA, IRAS, PDPC or any other registry.

### Legal basis

The rule entry [identifier formats](RULE-REGISTER.md#rule-sg-identifiers-uen-formats) cites ACRA/Bizfile, ICA, IRAS and PDPC references. The code encodes format patterns and check characters where implemented.

### Inputs

Identifiers are supplied as text from fund, entity, holder or contact records.

### Method

The engine normalises text where required, applies the coded pattern or checksum for the identifier type, and returns validation findings. It never infers an identifier and never treats a syntactically valid identifier as proof that the entity exists.

### Evidence

Pinned by `test/engine/identifiers.test.ts` for accepted and rejected identifier formats. This document records the row because identifier validation appears in shared Singapore workflows, but it is not a tax calculation.

### Confidence

D — validation support only. The helper is a workflow guardrail, not authoritative registry verification.

## Badges of trade

### What it computes

The **Badges of trade** calculator asks for qualitative leanings on eight IRAS-style factors and converts them into a transparent score. It is only an indicator of likely capital, inconclusive or likely trading treatment; it is not a legal determination.

### Legal basis

The rule entries cite IRAS guidance on gains from sale of property, shares and financial instruments. See [rule `badges-of-trade.iras.factors`](RULE-REGISTER.md#rule-sg-badges-of-trade-iras-factors) and [rule `badges-of-trade.scoring.assumption`](RULE-REGISTER.md#rule-sg-badges-of-trade-scoring-assumption).

### Inputs

Each factor is selected as strongly capital, capital, neutral, trading or strongly trading. The app labels are purpose or motive, frequency, holding period, supplementary work, circumstances of sale, financing, organisation, and connection with trade.

### Method

1. Convert each selected lean to a score: strongly capital −2, capital −1, neutral 0, trading +1, strongly trading +2.
2. Multiply by the factor weight.
3. Sum all supplied contributions.
4. Outcome is likely capital if total score is ≤ −8, likely trading if total score is ≥ 8, otherwise inconclusive.
5. If fewer than three factors are supplied, the engine warns that the result is fragile.

### Badges scoring table

| Factor | Weight | Strongly capital | Capital | Neutral | Trading | Strongly trading |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Purpose or motive at acquisition | 4 | -8 | -4 | 0 | 4 | 8 |
| Frequency or repetition of similar transactions | 3 | -6 | -3 | 0 | 3 | 6 |
| Length of ownership before sale | 3 | -6 | -3 | 0 | 3 | 6 |
| Enhancement, subdivision or marketing work | 2 | -4 | -2 | 0 | 2 | 4 |
| Circumstances leading to sale | 2 | -4 | -2 | 0 | 2 | 4 |
| Financing pattern and pressure to repay | 2 | -4 | -2 | 0 | 2 | 4 |
| Business-like organisation around the transaction | 2 | -4 | -2 | 0 | 2 | 4 |
| Connection with taxpayer's existing trade | 2 | -4 | -2 | 0 | 2 | 4 |
| Likely capital threshold | n/a | total score ≤ -8 |  |  |  |  |
| Likely trading threshold | n/a |  |  |  |  | total score ≥ 8 |

### Worked examples

#### Example BOT-1: trading indicator

| Factor | Lean | Score |
| --- | --- | ---: |
| Purpose or motive at acquisition | Strongly trading | 8 |
| Frequency or repetition | Trading | 3 |
| Holding period | Trading | 3 |
| Supplementary work | Trading | 2 |
| Circumstances of sale | Trading | 2 |

Total score is 18. Because 18 is at least 8, the result is `LIKELY_TRADING`. The calculator displays `LIKELY TRADING` and keeps the warning that the output is a decision-support heuristic only.

### Edge cases

* Missing factors are ignored; they do not score zero unless the app explicitly supplies neutral.
* Fewer than three supplied factors produce warning `BADGES_OF_TRADE.SPARSE_FACT_PATTERN`.
* The weights and thresholds are assumptions. IRAS does not publish a numeric badges-of-trade score.

### Evidence

Pinned by `test/engine/badgesOfTrade.test.ts` tests "assessBadgesOfTrade can lean clearly capital", "assessBadgesOfTrade can lean clearly trading", "assessBadgesOfTrade warns when too few factors are supplied" and "badges-of-trade factor catalogue covers all supported keys and five lean options". This document is checked by `test/docs/sg-income-tax.test.ts`.

### Confidence

D — assumption or simplification. The factors are sourced to IRAS, but the numerical weights and cut-offs are a transparent workflow model.

### Assumptions and limitations

The result does not determine whether a gain is taxable. Reviewers must retain contemporaneous evidence of purpose, financing, development work, marketing, sale circumstances, accounting treatment and tax opinions.

## Sources

* IRAS, "Corporate Income Tax Rate, Rebates & Tax Exemption Schemes" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
* IRAS, "Basic Guide to Corporate Income Tax for Companies" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
* IRAS, "Preparing a Tax Computation" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
* IRAS, "Overview of Form C-S/ Form C-S (Lite)/ Form C" and "Estimated Chargeable Income (ECI) Filing" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
* IRAS, "Income Tax Treatment of REITs and Approved Sub-Trusts (Twelfth Edition)" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
* IRAS, "Sale of property, shares and financial instruments gains" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
