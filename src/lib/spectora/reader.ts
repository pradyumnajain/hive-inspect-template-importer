import ExcelJS from "exceljs";
import type { CellCorrection, RawGrid, SheetReader } from "./types";
import { SpectoraImportError } from "./types";
import { assertReadable } from "./sniff";
import { decodeXmlOnce, firstWorksheetXml, readCellTexts } from "./entity-fix";

/**
 * Turn one exceljs cell into a string, or null when the cell holds nothing.
 *
 * Whitespace is never trimmed. Six comment names in the real template have a
 * trailing space ("Temperature ", "Corrosion "). Trimming would be a silent
 * edit to customer data, which is exactly what this importer must not do.
 */
function cellToString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    // rich text runs
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((run) => run.text ?? "").join("");
    }
    // hyperlink cell
    if (typeof v.text === "string") return v.text;
    // formula cell: keep the computed result, which is what the export shows
    if ("result" in v) {
      const result = v.result;
      if (result === null || result === undefined) return null;
      if (typeof result === "object") return null;
      return String(result);
    }
    if (typeof v.error === "string") return v.error;
  }
  return String(value);
}

/**
 * Reads OOXML workbooks with exceljs.
 *
 * Nothing outside this file imports exceljs. Swapping in another library means
 * writing one more class that satisfies `SheetReader`.
 */
export class ExcelJsSheetReader implements SheetReader {
  async read(data: Uint8Array): Promise<RawGrid> {
    assertReadable(data);

    const workbook = new ExcelJS.Workbook();
    try {
      // exceljs wants a Node Buffer / ArrayBuffer
      await workbook.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    } catch (cause) {
      throw new SpectoraImportError(
        "unreadable_workbook",
        "The workbook could not be opened. It may be corrupt or password protected.",
        cause instanceof Error ? cause.message : undefined,
      );
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new SpectoraImportError("no_sheets", "The workbook contains no worksheets.");
    }

    const width = Math.max(sheet.actualColumnCount ?? 0, sheet.columnCount ?? 0);
    const height = Math.max(sheet.actualRowCount ?? 0, sheet.rowCount ?? 0);

    const rows: (string | null)[][] = [];
    for (let r = 1; r <= height; r += 1) {
      const row = sheet.getRow(r);
      const out: (string | null)[] = [];
      for (let c = 1; c <= width; c += 1) {
        out.push(cellToString(row.getCell(c).value));
      }
      rows.push(out);
    }

    const { corrections, auditError } = await correctEntities(data, rows);
    return { sheetName: sheet.name, rows, corrections, auditError };
  }
}

/**
 * Put back any value exceljs decoded one time too many.
 *
 * See `entity-fix.ts` for why this is necessary. Only cells whose correctly
 * decoded text differs from what exceljs returned are touched, so this is a
 * no-op on a workbook without double-encoded entities.
 */
async function correctEntities(
  data: Uint8Array,
  rows: (string | null)[][],
): Promise<{ corrections: CellCorrection[]; auditError?: string }> {
  let xml: string | null;
  try {
    xml = await firstWorksheetXml(data);
  } catch (cause) {
    return {
      corrections: [],
      auditError: cause instanceof Error ? cause.message : "worksheet XML could not be read",
    };
  }
  if (xml === null) return { corrections: [], auditError: "no worksheet XML found in the workbook" };

  const corrections: CellCorrection[] = [];
  for (const cell of readCellTexts(xml)) {
    const row = rows[cell.row - 1];
    if (!row || cell.column >= row.length) continue;
    const current = row[cell.column];
    // Only strings are at risk, and only when the correct value differs.
    if (typeof current !== "string" || current === cell.value) continue;
    // Guard against touching cells exceljs formatted deliberately (dates,
    // numbers): require that the two differ purely by entity decoding.
    if (decodeXmlOnce(cell.value) !== current) continue;

    corrections.push({
      ref: cell.ref,
      sourceRow: cell.row,
      column: cell.column,
      from: current,
      to: cell.value,
      reason: "XML entity decoded twice by the spreadsheet library",
    });
    row[cell.column] = cell.value;
  }
  return { corrections };
}

/**
 * Reader used by tests and by any caller that already has a grid.
 * Keeps parser tests independent of exceljs and of file IO.
 */
export class InMemorySheetReader implements SheetReader {
  constructor(private readonly grid: RawGrid) {}
  async read(): Promise<RawGrid> {
    return this.grid;
  }
}
