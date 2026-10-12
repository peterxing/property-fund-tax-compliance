# Singapore GST engine (retrieved 2026-10-09)

## Covered modules
- `gstCodes.ts`: IRAS-published GST tax-code catalog used by the engine and mapped to F5 boxes.
- `gst.ts`: GST rates, F5 builder, partial exemption, property-supply classification, registration / penalty helpers, bad-debt-relief mechanics.
- `iaf.ts`: assumed IRAS Audit File text export and validator.

## Key GST parameters
- Standard GST rate history modelled:
  - **3%** from **1994-04-01** to **2002-12-31**
  - **4%** from **2003-01-01** to **2003-12-31**
  - **5%** from **2004-01-01** to **2007-06-30**
  - **7%** to **2022-12-31**
  - **8%** from **2023-01-01** to **2023-12-31**
  - **9%** from **2024-01-01** onward
- Current F5 implementation covers **Boxes 1 to 21**, including reverse-charge / OVR / IGDS boxes.
- Partial-exemption de minimis test:
  - exempt supplies average **<= S$40,000 per month**; and
  - exempt supplies **<= 5%** of total relevant taxable + exempt supplies.
- De minimis and 5% tests are implemented with exact integer cross-multiplication, so amounts just above the threshold fail even where decimal rounding might otherwise hide the excess.
- Regulation 35 variant:
  - if non-Regulation 33 exempt supplies are **<= 5%** of total relevant supplies, the residual-recovery numerator is **taxable + Reg 33 exempt supplies** and direct Reg 33 input tax is claimable;
  - otherwise the numerator is **taxable supplies only** and direct Reg 33 input tax is not claimable.
- Residual recovery under the standard partial-exemption method is rounded to the **nearest whole percent, half-up**, before applying it to residual input tax.
- Input-tax claim time limit helper: **5 years** from the invoice / import-permit date.
- GST registration threshold: **S$1 million**.
- Prospective registration effective date:
  - before **2025-07-01**: the **31st day after** the forecast date;
  - on/after **2025-07-01**: **2 months after** the forecast date.
- Late filing helper: **S$200 immediately + S$200 per completed month**, capped at **S$10,000**.
- Late payment helper: **5%** first penalty + **2% per month after 60 days**, capped so additional penalties do not exceed **50%** of the unpaid GST.

## Code-table notes
- Current official ASR+ publication uses **TX-ESS / TXRC-ESS / IM-ESS** for Regulation 33 exempt purchases.
- The engine still accepts **TX-E33 / TXRC-E33 / IM-E33** as compatibility aliases.
- Current published purchase codes use **NR** for non-GST-registered suppliers and **TXNA / NA** for specific schemes with no GST charged.

## Property-industry treatment modelled
- Residential sale / lease: **exempt**.
- Commercial / industrial sale / lease: **standard-rated**.
- Mixed-use property: split between **SR** and **ESN33** using a supplied apportionment.
- Agent commissions, property-management fees and service charges: **standard-rated** even when tied to residential property.
- Qualifying transfer of a going concern: treated as **out-of-scope / excluded** when the caller confirms the TOGC condition.
- Imported services: **SRRC** when reverse charge applies, otherwise **OP**.

## Important assumptions
- `iaf.ts` is **assumption-heavy**: no directly verifiable official IRAS IAF field-layout specification was located during implementation. The emitted file is a conservative pipe-delimited text format aligned to reputable secondary descriptions and must be reviewed before real-world use.
- Box 13 defaults to supply-side net amounts unless the caller passes an explicit revenue figure.
- Partial-exemption special methods are supported only through explicit overrides; the engine does not invent an IRAS-approved special method.
