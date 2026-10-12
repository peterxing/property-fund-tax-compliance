# Australian GST engine (retrieved 2026-10-10)

## Covered modules
- `src/engine/au/gstCodes.ts`: platform GST code catalogue mapped to BAS labels.
- `src/engine/au/gst.ts`: GST helpers for BAS construction, property classification, margin-scheme calculations, purchaser withholding, apportionment, registration, penalties and GIC.
- `src/engine/au/identifiers.ts`: ABN, ACN and TFN validators/formatters with conservative TFN masking.
- `src/engine/au/calendar.ts`: BAS / annual GST return / PAYG-instalment due dates and reporting-period lists.

## Verified parameters and rules
- GST rate modelled: **10% from 2000-07-01 onward**.
- Current BAS label set verified from ATO pages:
  - **Full reporting:** `G1`, `G2`, `G3`, `G10`, `G11`, `1A`, `1B`
  - **Simpler BAS:** `G1`, `1A`, `1B`
  - The platform keeps **`G4`** as an internal subtotal for input-taxed sales because current ATO BAS guidance no longer shows a standalone G4 field.
  - The engine defaults to **GST-inclusive** BAS-facing amounts for `G1`, `G10` and `G11`, while keeping cent-accurate workings underneath; callers can opt into GST-exclusive presentation where that ATO accounts-method choice is intended.
- GST registration threshold:
  - **$75,000** standard entities
  - **$150,000** non-profits
  - register within **21 days** once current or projected GST turnover reaches the threshold.
- Tax invoice rule:
  - valid tax invoice required for GST-credit claims on purchases **over $82.50 including GST**.
- Input-tax-credit time limit:
  - claim generally expires **4 years after the BAS due date** for the first period in which the credit could have been claimed.
- Margin scheme:
  - GST is **1/11 of the margin**
  - written agreement required **before settlement**
  - consideration method applies after **1 July 2000**
  - valuation method available for eligible pre-`2000-07-01` holdings
  - ATO worked examples report the **margin** at `G1`, not the gross contract price.
- BAS rounding:
  - `reportedLabels` are emitted in **whole dollars with cents ignored** to match the ATO BAS examples and BAS presentation, while internal `labels` remain cent-accurate.
- GST at settlement withholding:
  - generally **1/11 of contract price** for fully taxable supplies
  - **7% of contract price** for eligible margin-scheme supplies
  - **10% of GST-exclusive market value** for low-value associate supplies
  - rounded **down to the nearest whole dollar**
  - excludes, among other things, commercial property, commercial residential premises, substantial-renovation new premises, and qualifying potential residential land bought by a GST-registered purchaser for a creditable purpose.
- Division 129 / change in creditable purpose:
  - no adjustment where acquisition value is **$1,000 GST-exclusive or less**
  - business-finance acquisitions have a **$10,000 GST-exclusive** no-adjustment threshold
  - adjustment periods: **2 / 5 / 10** for `$1,001-$5,000 / $5,001-$499,999 / $500,000+`.
- Failure-to-lodge penalty units:
  - **$330** from `2024-11-07` to `2026-06-30`
  - **$364** from `2026-07-01`
  - one unit per **28 days or part thereof**, max **5 units**, multiplied by **1 / 2 / 5 / 500** for small / medium / large / SGE.
- GIC rows kept from **2024-07-01** onward through **2026-10-01** and applied on a **daily compounding** basis using the ATO-published daily rates.

## Important assumptions / limitations
- Australia does **not** publish a single official ledger tax-code list, so `AU_GST_CODES` is a **platform** catalogue.
- The mixed-supply apportionment helper is a **simple creditable-purpose proxy**, not an ATO-mandated formula.
- `identifiers.ts` uses the standard ABN/ACN/TFN checksum formulas, but only the ABN formula could be tied back to a public ABR page path on the retrieval date; ACN and TFN checksum rules remain flagged as assumptions.
- `gst.ts` does **not** model bespoke partial-credit special methods, margin-scheme disputes, or ATO withholding-variation approvals.
- `calendar.ts` rolls due dates forward for weekends and common national public holidays; callers can supply extra local holidays where required.

## Primary pages opened
- ATO GST BAS guidance and reporting-method pages
- ATO residential / commercial-residential / going-concern / margin-scheme / GST-at-settlement pages
- ATO registration, tax-invoice, GST-credit, penalty-unit, FTL and GIC pages
- ABR web-services page and ABN-format help path
