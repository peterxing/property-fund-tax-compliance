// Layout checks for the PDF tests: where text may sit on an A4 page rendered by exports/pdf.ts, and the geometry of its footer and
// running title. Widths come from pdfkit's own Helvetica metrics, so a run that would spill over a margin or touch its neighbour fails.
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { PDF_FOOTER_NOTE } from "../../../src/app/exports/pdf.ts";
import type { ParsedPdf, PdfPage, TextRun } from "./pdf-reader.ts";

export const PAGE = { width: 595.28, height: 841.89 } as const;
export const MARGIN = 48;
export const CONTENT_LEFT = MARGIN;
export const CONTENT_RIGHT = PAGE.width - MARGIN;
export const CONTENT_BOTTOM = PAGE.height - MARGIN;

// Helvetica and Helvetica-Bold: ascender 718, descender 207 per 1000 em. A run's glyph box is baseline - ascent .. baseline + descent.
const ASCENT = 0.718;
const DESCENT = 0.207;
const EPS = 0.02;

const FOOTER_BASELINE = CONTENT_BOTTOM + 12 + ASCENT * 8;
const RUNNING_BASELINE = 26 + ASCENT * 8;

const meter = new PDFDocument({ margin: 0 });

export const runWidth = (run: TextRun): number => meter.font(run.bold ? "Helvetica-Bold" : "Helvetica").fontSize(run.size).widthOfString(run.text);
export const runTop = (run: TextRun): number => run.baseline - ASCENT * run.size;
export const runBottom = (run: TextRun): number => run.baseline + DESCENT * run.size;

export type Zone = "running-header" | "body" | "footer";

/** The running title sits above the top margin and the footer below the bottom margin; everything else is body content. */
export const zoneOf = (run: TextRun): Zone => (run.baseline < MARGIN ? "running-header" : run.baseline > CONTENT_BOTTOM ? "footer" : "body");

export const bodyRuns = (page: PdfPage): TextRun[] => page.runs.filter((run) => zoneOf(run) === "body");

interface Placed {
  run: TextRun;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const place = (run: TextRun): Placed => ({ run, left: run.x, right: run.x + runWidth(run), top: runTop(run), bottom: runBottom(run) });

/**
 * Asserts the layout rules for every page: text inside the 48 pt margins, nothing overlapping, a footer ("Demonstration document" on
 * the left, "Page i of n" on the right edge) on every page, and the running title on every page but the first.
 */
export function assertPageLayout(pdf: ParsedPdf, label = "document"): void {
  const count = pdf.pages.length;
  assert.equal(pdf.declaredPageCount, count, `${label}: /Count matches the pages in the tree`);
  pdf.pages.forEach((page, index) => {
    const where = `${label}, page ${index + 1}`;
    assert.ok(Math.abs(page.width - PAGE.width) < 0.01 && Math.abs(page.height - PAGE.height) < 0.01, `${where}: A4 portrait`);
    const placed = page.runs.map(place);

    for (const p of placed) {
      const what = `${where}: ${JSON.stringify(p.run.text.slice(0, 40))}`;
      assert.ok(p.run.text !== "", `${what}: no empty runs`);
      assert.ok(p.left >= CONTENT_LEFT - EPS, `${what} starts inside the left margin (x=${p.left.toFixed(2)})`);
      assert.ok(p.right <= CONTENT_RIGHT + EPS, `${what} ends inside the right margin (right=${p.right.toFixed(2)})`);
      const zone = zoneOf(p.run);
      if (zone === "body") {
        assert.ok(p.top >= MARGIN - EPS, `${what} starts below the top margin (top=${p.top.toFixed(2)})`);
        assert.ok(p.bottom <= CONTENT_BOTTOM + EPS, `${what} ends above the bottom margin (bottom=${p.bottom.toFixed(2)})`);
      } else if (zone === "footer") {
        assert.ok(Math.abs(p.run.baseline - FOOTER_BASELINE) < EPS && p.run.size === 8, `${what}: footer position`);
        assert.ok(p.bottom <= PAGE.height, `${what}: footer is on the page`);
      } else {
        assert.ok(index > 0, `${what}: the running title is not on the first page`);
        assert.ok(Math.abs(p.run.baseline - RUNNING_BASELINE) < EPS && p.run.size === 8, `${what}: running title position`);
      }
    }

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const overlap = a.left < b.right - EPS && b.left < a.right - EPS && a.top < b.bottom - EPS && b.top < a.bottom - EPS;
        assert.ok(!overlap, `${where}: ${JSON.stringify(a.run.text.slice(0, 30))} overlaps ${JSON.stringify(b.run.text.slice(0, 30))}`);
      }
    }

    const footers = page.runs.filter((run) => zoneOf(run) === "footer");
    const note = footers.filter((run) => run.text === PDF_FOOTER_NOTE);
    const label2 = footers.filter((run) => run.text === `Page ${index + 1} of ${count}`);
    assert.equal(footers.length, 2, `${where}: exactly two footer runs`);
    assert.equal(note.length, 1, `${where}: footer note`);
    assert.equal(label2.length, 1, `${where}: "Page ${index + 1} of ${count}"`);
    assert.ok(Math.abs(note[0].x - CONTENT_LEFT) < EPS, `${where}: footer note is at the left margin`);
    assert.ok(Math.abs(label2[0].x + runWidth(label2[0]) - CONTENT_RIGHT) < 0.05, `${where}: page label ends at the right margin`);
  });
}
