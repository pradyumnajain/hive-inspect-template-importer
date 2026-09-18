/**
 * Spectora import pipeline.
 *
 *   bytes -> sniff -> read -> map headers -> normalise -> validate -> fidelity
 *
 * Nothing here touches React, Next or Supabase, so the whole pipeline runs in
 * a plain test against the committed sample file.
 */

import { buildFidelityReport, type FidelityReport } from "./fidelity";
import { parseGrid } from "./parse";
import { ExcelJsSheetReader } from "./reader";
import type { ParseResult, RawGrid, SheetReader } from "./types";

export interface ImportPreview extends ParseResult {
  grid: RawGrid;
  fidelity: FidelityReport;
}

/**
 * Parse a Spectora export into a preview: the normalised template, every
 * issue worth showing the user, and the fidelity report. Writes nothing.
 */
export async function buildImportPreview(
  data: Uint8Array,
  filename: string | null,
  reader: SheetReader = new ExcelJsSheetReader(),
): Promise<ImportPreview> {
  const grid = await reader.read(data);
  const result = parseGrid(grid, filename);
  const fidelity = buildFidelityReport(grid, result);
  return { ...result, grid, fidelity };
}

export { parseGrid } from "./parse";
export { buildFidelityReport } from "./fidelity";
export { ExcelJsSheetReader, InMemorySheetReader } from "./reader";
export { sniff, assertReadable } from "./sniff";
export { decodeEntities } from "./html";
export { SpectoraImportError } from "./types";
export type {
  ImportIssue,
  IssueOrigin,
  IssueSeverity,
  ParsedComment,
  ParsedItem,
  ParsedSection,
  ParsedTemplate,
  ParseResult,
  RawGrid,
  SheetReader,
} from "./types";
export type { FidelityCheck, FidelityReport, Discrepancy } from "./fidelity";
