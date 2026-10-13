// Export entry points used by the UI. OWNER: exports agent. Signatures are a CONTRACT (the UI imports only from this file).
// Heavy renderers (pdfkit, the XLSX writer) are loaded lazily inside these functions so the main bundle stays small.
import type { CsvModel, DocModel, WorkbookModel } from "../../domain/types.ts";
import { csvText } from "./csv.ts";
import { saveBlob } from "./download.ts";
import type { PdfDocumentCtor } from "./pdf.ts";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function failure(what: string, error: unknown): Error {
  const reason = error instanceof Error && error.message !== "" ? error.message : String(error);
  return new Error(`Could not create the ${what}: ${reason}`, { cause: error });
}

// esbuild exposes pdfkit's CommonJS export as `default`; unwrap defensively in case a bundler nests it once more.
function pdfConstructor(loaded: unknown): PdfDocumentCtor {
  let candidate = loaded;
  for (let depth = 0; depth < 3 && candidate && typeof candidate !== "function"; depth++) {
    candidate = (candidate as { default?: unknown }).default;
  }
  if (typeof candidate !== "function") throw new Error("the PDF library did not load");
  return candidate as PdfDocumentCtor;
}

/** Saves a UTF-8 CSV (with BOM) to the user's downloads. */
export function downloadCsv(model: CsvModel): void {
  try {
    saveBlob(model.fileName, new Blob([csvText(model)], { type: "text/csv;charset=utf-8" }));
  } catch (error) {
    throw failure("CSV file", error);
  }
}

/** Builds an .xlsx workbook and saves it. Rejects with a readable Error if it cannot be built. */
export async function downloadXlsx(model: WorkbookModel): Promise<void> {
  try {
    const { buildXlsx } = await import("./xlsx.ts");
    saveBlob(model.fileName, new Blob([buildXlsx(model)], { type: XLSX_MIME }));
  } catch (error) {
    throw failure("workbook", error);
  }
}

/** Renders the document to a PDF (A4) and saves it. Lazy-loads pdfkit on first use. */
export async function downloadPdf(doc: DocModel): Promise<void> {
  try {
    const [{ renderPdf }, pdfkit] = await Promise.all([import("./pdf.ts"), import("pdfkit/js/pdfkit.standalone.js")]);
    const bytes = await renderPdf(doc, { PDFDocument: pdfConstructor(pdfkit) });
    saveBlob(doc.fileName, new Blob([bytes], { type: "application/pdf" }));
  } catch (error) {
    throw failure("PDF", error);
  }
}
