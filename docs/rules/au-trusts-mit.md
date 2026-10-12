# AU trusts, MIT withholding and AMIT rules

Retrieved: 2026-10-10.

## Verified rules modelled

| Topic | Effective dates used | Engine treatment | Primary sources |
| --- | --- | --- | --- |
| Resident TFN/ABN withholding on unit trust and AMIT payments | 2014-07-01 to 2017-06-30 = 49%; 2017-07-01 onward = 47% | Applied where a resident investor has not quoted a TFN or ABN and no exemption applies. No TFN withholding where the payment is only tax-deferred / return of capital. | ATO withholding from investment income; ATO resident tax rates; AMMA/SDS guidance notes (ss 12-140 and 12-145 references) |
| MIT fund payment rates | 2008-07-01 onward | Ordinary fund payments: 22.5%, 15%, 7.5%, then 15% for information-exchange countries; 30% for non-EOI countries. Clean building MIT concession: 10% from 2012-07-01. | ATO MIT fund payment overview; ATO MIT withholding rules; FRL exchange-of-information regulation update |
| NCMI and BTR fund-payment rates | NCMI reflected in 2024 AMMA/SDS guide; BTR concessional rate from 2025-01-01 | NCMI amounts withheld at 30%. Eligible build-to-rent fund payments for information-exchange-country residents withheld at 15%. | ATO AMMA/SDS guidance notes; ATO build-to-rent development tax incentives; FRL BTR affordability instruments |
| Fund payment notices / website disclosure | Current | Notice content includes the part of the payment that would have been subject to withholding, clean-building status and the relevant income year. Due at or before payment; website disclosure retained for 5 continuous years. | ATO MIT fund payment overview; ATO withholding for MITs |
| AIIR and BAS reporting | Current | AIIR due 31 October generally; MIT fund-payment withholding data due within 6 months and 14 days after year end. Monthly BAS = 21st next month; quarterly BAS = 28th after quarter end. | ATO AIIR due-date page; ATO PAYG withholding page for small and medium withholders; ATO BAS due dates |
| AMIT attribution and statements | 2016 onward | Trust components retained by character and attributed on a fair and reasonable basis. AMMA due within 3 months after year end; effective reissue window generally 4 years. | ATO AMIT attribution pages; ATO AMIT reporting requirements; ATO AMMA/SDS instructions |
| AMIT unders / overs and CBNA | 2016 onward | Discovery-year adjustments supported. CBNA increases cost base where attributed assessable and NANE income exceeds cash and offsets, decreases it in the reverse case, with CGT event E10 once cost base is exhausted. | ATO unders and overs page; ATO cost base adjustments page |

## Statement content modelled

- AMMA: member class, due date, share-of-net-income style summary items, character-level attributed components, tax offsets, gross cash distribution, foreign-resident withholding credit, TFN credit, and AMIT cost base net amount split into excess (decrease) and shortfall (increase).
- Non-AMIT SDS-style statement: character-level components, gross and net cash, franking credit offset, TFN credit, foreign-resident withholding credit, and net capital gain summary.
- Fund payment notice: structured notice content only, not a PDF.

## Limitations / assumptions

- The trust tax computation is an external input. These modules do not determine whether a capital gain is taxable Australian property; they consume the supplied MIT fund-payment breakdown.
- Foreign pension and sovereign member classes are treated conservatively as ordinary foreign funds for MIT fund-payment withholding unless separate verified relief is established outside the engine.
- The time-weighted AMIT option is an engine policy choice based on the ATO’s fair-and-reasonable attribution examples; a record-date approach also remains available where the trust constitution supports it.
- Expense allocation helper uses direct tracing first and then gross-income apportionment for shared expenses. If a more specific tax allocation basis is required, the platform should override the helper.
