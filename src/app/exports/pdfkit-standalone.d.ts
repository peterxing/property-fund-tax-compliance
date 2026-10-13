/// <reference types="pdfkit" />
// pdfkit's browser build is a self-contained UMD bundle (its own Buffer, zlib and font metrics). @types/pdfkit declares the module
// without the ".js" suffix, so the explicit file used by index.ts needs this declaration. esbuild exposes the CommonJS export as `default`.
declare module "pdfkit/js/pdfkit.standalone.js" {
  const PDFDocument: PDFKit.PDFDocument;
  export default PDFDocument;
}
