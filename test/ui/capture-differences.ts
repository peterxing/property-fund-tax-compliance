// Where our pages deliberately say something other than the reference capture. capture-coverage.test.tsx looks every capture string up in
// the text our app renders; a string that is not there must be explained by one entry here, with a one-line reason (and where it is written
// down: docs/parity/au.md, docs/parity/sg.md, docs/PRODUCT.md). An entry that explains nothing any more fails the test, so the list cannot
// outlive the difference. `bug` entries are defects reported to the lead: they stay green until the page is fixed, then the test says so.
import type { Kind } from "./capture.ts";

export interface Difference {
  market: "AU" | "SG";
  /** The workspace pages the difference is on ("Distributions", "Investor reporting", ...). */
  pages: readonly string[];
  /** Fund ids ("portfolio" for Bulk review, Analytics and Access, which the Singapore capture file holds); every fund of the market when left out. */
  funds?: readonly string[];
  kind: Kind;
  /** The capture string as the fixture holds it (any letter case), or a pattern tested against it. */
  token: string | RegExp;
  /** One line: how our page differs and why. */
  reason: string;
  /** A defect found by this test and reported to the lead, not a decision. */
  bug?: true;
}

const DIST = ["Distributions"] as const;
const INVESTOR = ["Investor reporting"] as const;

export const DIFFERENCES: readonly Difference[] = [
  // ------------------------------------------------------------------------------------------------------------------------------ AU
  {
    market: "AU",
    pages: DIST,
    funds: ["harbourline", "wattle", "coastline"],
    kind: "amount",
    token: "A$0",
    reason: "A nil amount is a dash that screen readers say as 'Nil', not 'A$0' (the components table and the Withholding tab).",
  },
  {
    market: "AU",
    pages: DIST,
    funds: ["coastline"],
    kind: "figure",
    token: "0.0000",
    reason: "The c / unit of the nil components, which the table leaves out (docs/PRODUCT.md: zero rows are omitted; the capture lists them).",
  },
  {
    market: "AU",
    pages: DIST,
    funds: ["coastline"],
    kind: "percent",
    token: "50%",
    reason: "Sub-line of the nil 'Discounted capital gains — TARP' row, left out with the other nil rows (docs/PRODUCT.md).",
  },
  {
    market: "AU",
    pages: DIST,
    funds: ["coastline"],
    kind: "date",
    token: "27 Mar 2018",
    reason: "Sub-line of the nil 'Excluded from NCMI — transitional' row, left out with the other nil rows (docs/PRODUCT.md).",
  },
  {
    market: "AU",
    pages: DIST,
    funds: ["coastline"],
    kind: "label",
    token: /^(?:non-EOI · pre|Fund payment · after)$/,
    reason: "Pieces of the sub-lines of the nil transitional and discounted-gain rows, left out with the other nil rows (docs/PRODUCT.md).",
  },
  {
    market: "AU",
    pages: DIST,
    kind: "label",
    token: /\bCGT concession\b/,
    reason: "The doubled discount gain is 'AMIT CGT gross-up amount — TARP', and the Rules cost-base row follows (docs/parity/au.md §1).",
  },
  {
    market: "AU",
    pages: DIST,
    kind: "label",
    token: "Tax deferred",
    reason: "The Sankey's short label for the non-attributable line is 'Cost base excess' (docs/parity/au.md §1).",
  },
  {
    market: "AU",
    pages: DIST,
    kind: "label",
    token: /^(?:for EOI countries; the relief ends 30 June 2026 for non-economic infrastructure|LCR 2020\/2; Income Tax \(Managed Investment Trust Withholding Tax\) Act 2008 s4)$/,
    reason: "The transitional cross-staple Rules row states the 2026 and 2034 dates and cites LCR 2020/2 para 251 and TAA Sch 1 s12-440 (docs/parity/au.md §1, §8).",
  },
  {
    market: "AU",
    pages: INVESTOR,
    funds: ["southbank", "kurrajong"],
    kind: "label",
    token: "RECORD LODGMENT",
    reason: "Where the tax agent records the lodgment, our panel is headed 'Lodgment' (the form that an A. Moreno-type user can fill in is 'Record lodgment').",
  },
  {
    market: "AU",
    pages: INVESTOR,
    funds: ["kurrajong"],
    kind: "amount",
    token: /^A\$(?:1,965,839|40,324,749)$/,
    reason: "Offshore nominee account attributed A$1,965,839.50 and the total A$40,324,749.50, one dollar apart once rounded (docs/parity/au.md §5).",
  },
  {
    market: "AU",
    pages: ["Tax returns"],
    funds: ["harbourline"],
    kind: "amount",
    token: /^A\$(?:6,205,300|55,708,600)$/,
    reason: "BUG: workingPapers (src/domain/au/returns.ts) leaves out the Clean building MIT income component, so assessable income reads A$49,503,300.",
    bug: true,
  },
  {
    market: "AU",
    pages: ["Tax returns"],
    funds: ["harbourline"],
    kind: "label",
    token: "Clean building MIT income",
    reason: "BUG: workingPapers (src/domain/au/returns.ts) has no 'Clean building MIT income' row in the trust components table.",
    bug: true,
  },
  // ------------------------------------------------------------------------------------------------------------------------------ SG
  {
    market: "SG",
    pages: DIST,
    funds: ["loyang", "meranti", "kallang"],
    kind: "amount",
    token: "S$0",
    reason: "A nil amount is a dash that screen readers say as 'Nil', not 'S$0' (the components table and the Withholding tab).",
  },
  {
    market: "SG",
    pages: DIST,
    funds: ["kallang"],
    kind: "figure",
    token: "0.0000",
    reason: "The c / unit of the nil components, which the table leaves out (docs/PRODUCT.md: zero rows are omitted; the capture lists them).",
  },
  {
    market: "SG",
    pages: DIST,
    funds: ["kallang"],
    kind: "label",
    token: /^Not taxable · (?:no withholding|reduces cost of units for traders)$/,
    reason: "Sub-lines of Kallang's nil tax-exempt and capital rows, left out with the other nil rows (docs/PRODUCT.md).",
  },
  {
    market: "SG",
    pages: DIST,
    kind: "label",
    token: "Qualifying unitholders (Singapore companies, branches, bodies of persons, REIT ETFs)",
    reason: "The Rules row adds international organisations to the qualifying unitholders (docs/parity/sg.md §5, Rules rows).",
  },
  {
    market: "SG",
    pages: DIST,
    funds: ["meranti", "kallang"],
    kind: "label",
    token: "Reduces cost of units for traders",
    reason: "The return-of-capital Rules row uses the e-Tax Guide para 8.8 wording (docs/parity/sg.md §1).",
  },
  {
    market: "SG",
    pages: INVESTOR,
    kind: "label",
    token: /^(?:Form A and Form B due|Unitholders other than individuals submit Form A, and depository agents Form B, by)$/,
    reason: "The notice names the manager's declaration cut-off, not a Form A / Form B due date (docs/parity/sg.md §1).",
  },
  {
    market: "SG",
    pages: INVESTOR,
    kind: "amount",
    token: /^S\$(?:14,603,150|27,926,440|13,417,200|7,124,100)$/,
    reason: "The total taxable distribution under the withholding table is at 2 decimals like its rows (S$14,603,150.00); the capture's total has none.",
  },
  {
    market: "SG",
    pages: ["Analytics"],
    funds: ["portfolio"],
    kind: "percent",
    token: "12%",
    reason: "The leakage chart's axis stops at the first step above the largest bar (9%); the capture's runs one step further.",
  },
];
