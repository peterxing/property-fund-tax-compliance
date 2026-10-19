# Limitations

Read this before relying on anything the demo shows.

## Not tax advice, and not reviewed by a tax adviser

* The calculations, rates, due dates and rule text come from the shared engine in `src/engine` and are cited to legislation in the **Rules** tab and in `docs/rules/`. **No tax adviser or lawyer has reviewed them.** Rates and thresholds are those the engine encodes for the Australian 2025-26 income year and Singapore Year of Assessment 2027; check the current law and your facts before using any figure.
* **Do not enter real client or investor data.** The site is public and browser storage is not a secure place for it.
* All funds, holders, trial balances and people are **fictional**. They mirror the sample data of the reference app so that the two can be compared side by side.

## It is a demonstration, not a system of record

* **No server.** Data lives in your browser's `localStorage`. Clearing site data, using another browser or device, or private browsing resets or isolates it. Nothing is shared between people.
* **"Working as" is not authentication.** It switches the persona the screens behave as, to show role-based workflow (preparer, reviewer, tax agent, Head of Tax, view only). Anyone who can open the page can switch persona, and anyone can edit the stored data with browser tools. The Access page says so.
* **The audit trail and the calculation versions are records kept in the browser**, not tamper-evident evidence. A version's input hash shows whether the inputs changed since it was saved; it does not prove who changed them.
* **Backups contain everything** (every fund, holder, ledger line and user), which is why only the Head of Tax persona can download or restore one. A restore replaces all data in this browser after validating it.
* Saved data from an older version of the app is not migrated: after an upgrade that changes the data format, the demo starts again from its seed data.
* **No ATO or IRAS connection.** *Record lodgment* (returns, AIIR, BAS, GST F5) and *Record payment* (land tax, property tax, duties) store the reference you type; nothing is submitted or paid. Notices, statements, returns, the BAS worksheet and the IRAS Audit File are working files, not filed documents.

## Scope

* Two markets: Australian AMITs and MITs (AUD) and Singapore S-REITs (SGD). Other regimes, entities and currencies are out of scope.
* **GST and BAS**: quarterly periods only; one GST ledger per fund (no GST groups, branches or partial-period registration). The seeded ledgers are fictional and sized to each fund's trial balance. BAS labels are worked out in whole dollars from the ledger; PAYG instalments, PAYG withholding, FBT and fuel tax credits are not on the BAS here. The IRAS Audit File uses the section and field layout the engine assembled from published descriptions of the IAF (the IRAS field specification itself was not available), carries demo UEN and GST registration numbers, and has not been validated by IRAS; compare it with an IAF from your accounting system first.
* **Land tax and duties**: NSW, Victoria, Queensland, Western Australia and South Australia, for the years the engine models (see **Rules & sources** and `docs/rules/au-duties.md`); Tasmania, the ACT and the Northern Territory, WA and SA landholder duty, and SA contracts before 1 July 2018 are shown as **Not modelled** and left out of totals, never as zero. The land tax treatment of a trust depends on facts the app does not hold (for example whether a unit trust is a fixed trust for a State's purposes); the assumption is shown on the page and can be changed per property. Western Australia's Metropolitan Region Improvement Tax is applied to every WA property as if it were in the Perth metropolitan region. Land tax due dates are a fixed 30 September placeholder for every State. Singapore property tax uses the annual value you enter; it does not estimate annual values.
* **Assets and allowances**: the seeded asset registers are fictional and built so that their deductions equal the seeded trial balance adjustments. Balancing adjustments on disposal, low-value and software pools, and Singapore renovation and refurbishment (s14Q) deductions are outside the register unless the engine models them for the asset kind chosen.
* **Calculators** are indicative: each shows the engine rules it used and their sources, and says so when a case is not modelled.
* **Compare** matches lines by reference and by label similarity; check every match it proposes, especially "within tolerance" and label-only matches. Files you load are read in the browser and never uploaded.
* **Compliance calendar** due dates are the ones the engine and the features model for the funds in the app; they do not include every obligation a fund has (for example payroll, FBT or council rates).
* The unrealised CGT deferred-tax view covers four investor types; it is an indicator, not a provision calculation.
* Trial balance import accepts CSV only (`account,name,current,prior[,category]`), up to 2,000 rows and 1 MB.

## Exports

* PDFs are generated in the browser with standard PDF fonts, so a few typographic characters are substituted (for example the minus sign becomes a hyphen). Layout is for review, not print-perfect statements.
* The Power BI workbook is a plain `.xlsx` with flat tables and no formulas or formatting beyond a header row.

## Browsers

Evergreen browsers only (Chrome and Edge 111+, Firefox 113+, Safari 16.4+): the styles use `oklch()` colours and native `<dialog>`.

## Differences from the reference app

Where the reference app and the engine disagree, the engine and the cited law win. Every such case is listed in [REFERENCE-PARITY.md](./REFERENCE-PARITY.md).
