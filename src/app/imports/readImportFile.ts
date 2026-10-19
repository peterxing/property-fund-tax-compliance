import { xlsxToCsv } from "./xlsx.ts";

export interface ImportFileRead {
  text: string;
  note?: string;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export async function readImportFile(file: File): Promise<ImportFileRead> {
  const ext = extension(file.name);
  if (ext === "xlsx" || file.type === XLSX_MIME) {
    const csv = await xlsxToCsv(new Uint8Array(await file.arrayBuffer()));
    return { text: csv.text, note: `Read the first sheet: ${csv.sheetName}.` };
  }
  return { text: await file.text() };
}
