# Singapore capital allowances and section 14N

This document covers the **Capital allowances** calculator and the Singapore side of the **Assets & allowances** workspace. The code is in `src/engine/capitalAllowances.ts` and `src/domain/assets/*.ts`. It computes schedules for plant and machinery, low-value assets, s 19 / s 19A, s 19B, IBA, LIA, s 14N renovation and refurbishment, disposals and balancing adjustments.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Sections 19 and 19A plant and machinery | Calculator `sg-capital-allowances`; Assets & allowances | IRAS capital allowances guidance | `src/engine/capitalAllowances.ts` | B for s19A three-year schedule; C for s19 working-life and broader mechanics |
| Low-value asset write-off | Same | IRAS capital allowances guidance | `src/engine/capitalAllowances.ts` | C |
| Section 14N renovation and refurbishment | Same | IRAS business-expense guidance for s 14N | `src/engine/capitalAllowances.ts`, `src/domain/assets/index.ts` | B for the three-year schedule path; C for broader mechanics |
| Section 19B, IBA and LIA | Same | IRAS IPR, IBA and LIA pages | `src/engine/capitalAllowances.ts` | C |

## Sections 19, 19A and balancing adjustments

### What it computes

The engine projects YA-by-YA capital allowances for a list of assets. It rounds cost and disposal proceeds to whole dollars, writes off the rounded amount under the selected regime, and computes balancing allowances or charges on disposal where modelled.

### Legal basis

The rule entries cite IRAS capital allowance, IBA, LIA and s 19B pages. See [rule `capital-allowances.s19-s19a.2022-plus`](RULE-REGISTER.md#rule-sg-capital-allowances-s19-s19a-2022-plus) and [rule `capital-allowances.iba-lia-s19b.2022-plus`](RULE-REGISTER.md#rule-sg-capital-allowances-iba-lia-s19b-2022-plus).

### Inputs

| Input | Source in app | Units / default |
| --- | --- | --- |
| From YA / To YA | Calculator or workspace period | Integer YA |
| Asset cost | Calculator or asset record | Integer cents, rounded to whole dollars before schedule |
| Acquisition date | Calculator or asset start date | ISO date; mapped to YA using fund FYE |
| Regime | Calculator select or asset class default | `S19_WORKING_LIFE`, `S19A_3Y`, `S19A_2Y`, `S19A_1Y_SPECIFIC`, `S19A_1Y_LOW_VALUE`, `S19B_*`, `IBA`, `LIA` |
| Disposal date / proceeds | Calculator or dispose action | Optional; proceeds rounded to whole dollars |

### Method

1. Derive acquisition YA from acquisition date and the financial year end. If acquisition date is after the FYE day in that calendar year, the claim starts in the following YA.
2. Round asset cost to whole dollars.
3. Apply the selected regime schedule.
4. Defer years listed in `deferYas` for regimes that support a claim index.
5. On disposal, round proceeds to whole dollars. For general s 19 / s 19A / low-value / IBA schedules, balancing charge is `min(proceeds - TWDV, cost - TWDV)` when proceeds exceed TWDV, and balancing allowance is `TWDV - proceeds` when proceeds are below TWDV.
6. Summaries split capital allowances, s 19B, IBA, LIA, s 14N, balancing allowances and balancing charges. `totalDeductions` includes current deductions and balancing allowances; `totalAdditions` includes balancing charges.

### Capital allowance rates and thresholds

| Regime | Method as coded | Threshold / rate | Code rule |
| --- | --- | --- | --- |
| Section 19 working life | 20% initial allowance if not disabled, then remaining cost equally over 6, 12 or 16 years | elected/prescribed life buckets: 6 / 12 / 16 years | `capital-allowances.s19-s19a.2022-plus` |
| Section 19A 3-year write-off | Equal whole-dollar allocation over 3 YAs | 1/3, 1/3, 1/3 | `capital-allowances.s19-s19a.2022-plus` |
| Section 19A 2-year accelerated write-off | Whole-dollar allocation by weights 75 / 25 | allowed acquisition YAs in code: 2021, 2022, 2024; otherwise warning | `capital-allowances.s19-s19a.2022-plus` |
| Section 19A one-year specific | Whole rounded cost in one YA | 100% in one YA | `capital-allowances.s19-s19a.2022-plus` |
| Low-value asset one-year | Whole rounded cost in one YA when within caps | asset cost ≤ S$5,000.00; annual cap S$30,000.00 | `capital-allowances.s19-s19a.2022-plus` |
| Section 19B | Equal whole-dollar allocation over selected term | 5, 10 or 15 years; warning if acquisition YA after 2028 | `capital-allowances.iba-lia-s19b.2022-plus` |
| IBA | 25% initial allowance, remainder over 25 years | 25% IA, 25-year AA schedule | `capital-allowances.iba-lia-s19b.2022-plus` |
| LIA | 25% initial allowance, remainder over 15 years from completion if GPR met | 25% IA, 15-year AA schedule | `capital-allowances.iba-lia-s19b.2022-plus` |

### Worked examples

#### Example CA-1: s 19A 3-year asset disposed below TWDV

| Input | Value |
| --- | --- |
| Financial year end | 30 June |
| Acquisition date | 2025-07-01 |
| Cost | S$900,000.00 |
| Regime | `S19A_3Y` |
| Disposal date | 2028-06-30 |
| Disposal proceeds | S$100,000.00 |

The acquisition maps to YA 2027. The rounded cost is S$900,000.00 and the 3-year schedule allocates S$300,000.00 each year. YA 2027 allowance is S$300,000.00 and closing TWDV is S$600,000.00. YA 2028 allowance is S$300,000.00 and closing TWDV is S$300,000.00. Disposal maps to YA 2029 before the third allowance is claimed, so the engine compares S$300,000.00 TWDV with S$100,000.00 proceeds and gives a S$200,000.00 balancing allowance.

#### Example CA-2: low-value asset limit

| Input | Value |
| --- | --- |
| Financial year end | 30 June |
| Acquisition date | 2025-06-30 |
| Asset A | S$30,000.00 tagged `S19A_1Y_LOW_VALUE` |
| Asset B | S$5,000.00 tagged `S19A_1Y_LOW_VALUE` |

Both assets map to YA 2026. Asset A exceeds the per-asset low-value limit of S$5,000.00, so it is not claimed under this regime and warning `CA.LOW_VALUE_ASSET.LIMIT` is emitted. Asset B is claimed in full. YA 2026 total low-value allowance is S$5,000.00.

### Edge cases

* `toYa` before `fromYa` throws.
* Negative asset cost throws.
* Cost and proceeds are rounded to whole dollars before schedules and disposals.
* Section 19B disposals do not give balancing allowances in this engine; proceeds above TWDV can give balancing charge.
* LIA without completion date emits a warning and no schedule.
* IBA disposal balancing is modelled with the same residue-vs-proceeds pattern as the general schedule because the IRAS page did not give a worked disposal formula in the code's source notes.

### Evidence

Pinned by `test/engine/capitalAllowances.test.ts` tests "section 19A three-year write-off spreads cost evenly by YA", "low-value asset rules respect the S$5,000 per-asset limit and S$30,000 annual cap", "balancing allowance arises on disposal when proceeds are below TWDV" and "capital-allowance catalogues expose selectable regimes and asset classes". The Assets workspace is pinned by `test/domain/assets/assets.test.ts` tests "hand checked Singapore s19A one-year asset", "hand checked Singapore s19A three-year asset", "hand checked Singapore s19 working-life asset", "asset register surfaces low-value pool and s14N records in totals and schedules". Independent verifier evidence is in `test/verify/assets/asset-register-verifier.test.ts` tests "single SG s19A three-year asset schedule writes off one-third in each of the first three YAs" and "single Singapore s14N R&R item is independently spread over 3 YAs". This document is checked by `test/docs/sg-capital-allowances.test.ts`.

### Confidence

B for the independently verified SG s19A three-year schedule path (`test/verify/assets/asset-register-verifier.test.ts`: "single SG s19A three-year asset schedule writes off one-third in each of the first three YAs"). C for s19 working-life, low-value asset caps, s19B, IBA, LIA and broader balancing-adjustment mechanics until an independent verifier test re-derives those paths.

### Assumptions and limitations

Hire-purchase mechanics, section 24 transfer elections, complex s 19B / EIS enhanced claims and LIA approval tests are not modelled in detail. Users should pass reviewed totals for those cases.

## Section 14N renovation and refurbishment

### What it computes

The engine computes qualifying renovation and refurbishment deductions over one YA or three consecutive YAs. The Assets workspace sends Singapore renovation assets as `renovationExpenditures` and labels schedule rows as "Section 14N renovation & refurbishment".

### Legal basis

The rule entry cites IRAS business-expense guidance for section 14N. See [rule `capital-allowances.s14n.2022-plus`](RULE-REGISTER.md#rule-sg-capital-allowances-s14n-2022-plus).

### Inputs

| Input | Source in app | Units |
| --- | --- | --- |
| Cost | SG_RR asset record | Integer cents, rounded to whole dollars |
| Incurred date | SG_RR start date | ISO date mapped to YA using FYE |
| Claim mode | SG_RR claim mode | `THREE_YEAR` or `ONE_YEAR`; default is one-year from YA 2025 onward, otherwise three-year |
| Structural / employee residence flags | Engine input only | If true, item is ignored |
| Designer or professional fees | Engine input only | Deducted before cap in code for certain cases |

### Method

1. Derive incurred YA using the fund FYE.
2. Deny and warn for investment holding companies, structural works or employee residences.
3. Round cost to whole dollars.
4. If designer/professional fees are present, deduct them from qualifying cost when the code conditions are met.
5. Apply the S$300,000.00 cap for the relevant three-year period. From incurred YA 2025, windows are 2025-2027, 2028-2030 and so on. Before YA 2025, the caller's `s14nRollingWindowStartYa` is used or defaults to the later of YA 2022 and incurred YA.
6. If one-year mode is allowed for the incurred YA, claim all allowed cost in one YA. One-year mode is allowed for YA 2021, YA 2022, YA 2024 and YA 2025 onward. Otherwise, spread the allowed cost over three YAs by whole-dollar largest-remainder allocation.

### Section 14N rates and thresholds

| Row | Applies | Rate / threshold | Code rule |
| --- | --- | --- | --- |
| R14N cap | Each relevant three-year period | S$300,000.00 | `capital-allowances.s14n.2022-plus` |
| R14N three-year mode | Default before YA 2025 unless one-year selected and allowed | Equal whole-dollar allocation over 3 consecutive YAs | `capital-allowances.s14n.2022-plus` |
| R14N one-year mode | YA 2021, YA 2022, YA 2024 and YA 2025 onward | 100% in incurred YA | `capital-allowances.s14n.2022-plus` |
| R14N investment holding | Investment holding company / PROPERTY_FUND in code | Deduction denied with warning `CA.S14N.INVESTMENT_HOLDING` | `capital-allowances.s14n.2022-plus` |
| R14N non-qualifying flags | Structural works or employee residence | Deduction denied with warning `CA.S14N.NON_QUALIFYING` | `capital-allowances.s14n.2022-plus` |

### Worked examples

#### Example R14N-1: cap and three-year spread

| Input | Value |
| --- | --- |
| Financial year end | 31 December |
| Incurred date | 2025-03-01 |
| Cost | S$360,000.00 |
| Claim mode | Three-year |

The incurred date maps to YA 2026. The relevant window starts YA 2025 and has a S$300,000.00 cap. The engine caps the S$360,000.00 cost to S$300,000.00 and emits `CA.S14N.CAP`. The three-year allocation is S$100,000.00 in YA 2026, S$100,000.00 in YA 2027 and S$100,000.00 in YA 2028.

### Edge cases

* The default claim mode is one-year for incurred YA 2025 onward.
* A requested one-year claim in an unallowed YA is converted to three-year spread and warning `CA.S14N.ONE_YEAR_NOT_ALLOWED` is emitted.
* The engine does not decide whether a project is structurally excluded; users must tag exclusions correctly.

### Evidence

Pinned by `test/engine/capitalAllowances.test.ts` tests "section 14N one-year deduction is available from YA 2025 onward", "section 14N cap is S$300,000 per relevant window" and "section 14N is denied for investment holding companies". Domain coverage is in `test/domain/assets/assets.test.ts` tests "hand checked Singapore s14N renovation and refurbishment over three YAs", "hand checked Singapore s14N cap limits a 3-year window" and "asset reducer validates low-value pool eligibility and section 14N records". Independent verifier evidence is in `test/verify/assets/asset-register-verifier.test.ts` test "single Singapore s14N R&R item is independently spread over 3 YAs".

### Confidence

B for the independently verified s14N three-year schedule path (`test/verify/assets/asset-register-verifier.test.ts`: "single Singapore s14N R&R item is independently spread over 3 YAs"). C for one-year mode, caps, denials and broader section 14N mechanics until an independent verifier test re-derives those paths. No official IRAS worked example is reproduced here.

### Assumptions and limitations

The code follows the current IRAS naming of section 14N and notes that older IRAS materials may mention section 14Q. Approval and fact-heavy exclusion judgements remain reviewer responsibilities.

## Sources

* IRAS, "Capital Allowances" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
* IRAS, "Tax Treatment of Business Expenses (M-R)" — cited by code for s 14N, retrieved by code 2026-10-09, read for this document 2026-10-19.
* IRAS, "Industrial Building Allowance (IBA)", "Land Intensification Allowance (LIA)" and "Writing-Down Allowances for Intellectual Property Rights (IPRs)" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
