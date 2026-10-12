# Singapore corporate income tax engine (retrieved 2026-10-09)

## Covered modules
- `cit.ts`: 17% headline rate, PTE/SUTE, YA2024-YA2026 rebates, IRAS-style whole-dollar rounding, Pillar Two info flag, and a warning where no rebate has been verified for the YA.
- `capitalAllowances.ts`: sections 19/19A/19B, IBA, LIA, section 14N renovation/refurbishment, balancing adjustments.
- `taxComputation.ts`: statement-of-taxable-income flow from mapped TB to chargeable income, exemptions, rebate and tax payable.
- `allocation.ts`: shared-expense allocation across taxable / exempt / non-taxable / foreign streams.
- `returns.ts`: Form C-S (Lite) / C logic, ECI waiver / due dates, basis-period helper, form-style summary.
- `returns.ts`: Form C-S (Lite) / C logic, Form UT handling for section 43(2) REIT / transparent trust filings, ECI waiver / due dates, basis-period helper, form-style summary.
- `mappingSuggestions.ts`: regex / keyword COA mapping dictionary for Singapore property-sector ledgers.

## Key rule parameters
- Headline corporate income tax rate: **17%**.
- Partial tax exemption from YA2020 onward: **75% of first S$10,000 + 50% of next S$190,000**.
- Maximum PTE amount from YA2020 onward: **S$102,500**.
- Maximum PTE amount before YA2020: **S$152,500**.
- Start-up tax exemption from YA2020 onward: **75% of first S$100,000 + 50% of next S$100,000**.
- Maximum SUTE amount from YA2020 onward: **S$125,000**.
- Maximum SUTE amount before YA2020: **S$200,000**.
- SUTE is not applied to **investment holding companies** or companies undertaking **property development for sale, investment, or both**.
- Current modelled rebate data:
  - **YA2024-YA2026**: **50%** rebate, **cap S$40,000**, less any IRAS cash grant where applicable.
- Where no verified rebate entry exists for **YA >= 2024** (for example YA2027 unless updated from a primary source), the engine emits `CIT.REBATE_NOT_VERIFIED`.
- ECI waiver: revenue **≤ S$5 million** and ECI before exempt amount is **nil**.
- Section 14N R&R cap: **S$300,000** per relevant 3-year period; 1-year write-off modelled where IRAS currently allows it.
- Low-value asset cap: **S$30,000 per YA**, per asset **≤ S$5,000** (caller should tag qualifying assets to the right regime).

## Important modelling notes
- The code follows current IRAS pages that now refer to **section 14N** rather than legacy **section 14Q**.
- REIT tax-transparency is **not** applied here. `taxComputation.ts` exposes base entity-level outputs and adds an info finding for downstream REIT distribution logic.
- Where `taxComputation.ts` is used for a **REIT trustee** base-case computation, the trustee is modelled at the prevailing corporate tax rate **without** PTE, SUTE or CIT rebate.
- Manual adjustment type `FURTHER_DEDUCTION` is applied **after the normal add-back / deduction clean-up but before capital allowances**, because it represents an extra tax deduction beyond the accounting expense already recorded. Approved donations remain separate and are deducted later against statutory income.
- `taxComputation.ts` now returns both scalar `donationsCf` and per-vintage `donationCarryForwards`, after FIFO utilisation, excluding expired donation vintages and carrying any current-year unused approved-donation deduction as the current YA vintage.
- Foreign tax credit, group relief and loss carry-back are **not** modelled inside the main tax computation.
- Pillar Two / Domestic Top-up Tax is **informational only**.
- Hire-purchase mechanics, section 24 transfer elections, and enhanced section 19B / EIS cases should be reviewed manually.
- `returns.ts` produces a **form-style summary only** and deliberately does not invent IRAS XML/API field names.

## Assumptions
- Whole-dollar chargeable-income / tax rounding follows the current IRAS corporate calculator pattern and published filing guidance.
- YA2024 and YA2025 rebate cash-grant mechanics are modelled consistently with the current IRAS rebate table wording; no separate primary-source YA2027 rebate announcement was verified on 2026-10-09.
- For section 43(2) REIT trustee filing flows, `returns.ts` returns **Form UT** with YA due date **15 April** and no ECI requirement, based on the IRAS REIT e-Tax Guide (Twelfth Edition, 4 Dec 2025).
- Expense-allocation bases are configurable product policy choices; IRAS does not prescribe one universal apportionment formula for these fact patterns.
