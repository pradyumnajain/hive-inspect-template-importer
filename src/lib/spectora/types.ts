/**
 * Types shared across the Spectora import pipeline.
 *
 * The pipeline is deliberately free of React, Next and Supabase imports so it
 * can be exercised by tests against the real sample file with no database and
 * no browser.
 */

/** One cell whose value the reader had to correct before the parser saw it. */
export interface CellCorrection {
  ref: string;
  sourceRow: number;
  column: number;
  from: string;
  to: string;
  reason: string;
}

/** A worksheet reduced to raw strings. Row 0 is the header row. */
export interface RawGrid {
  sheetName: string;
  /** `null` means the cell was absent or empty. Whitespace is NOT trimmed. */
  rows: (string | null)[][];
  /**
   * Cells the reader repaired, currently only exceljs's double-decoding of
   * XML entities. Reported to the user so no correction is invisible.
   */
  corrections?: CellCorrection[];
  /** Set when the correction pass could not run, so the gap is still visible. */
  auditError?: string;
}

/**
 * The only thing the pipeline needs from a spreadsheet library.
 *
 * exceljs sits behind this so it can be swapped (for SheetJS, for a streaming
 * reader, for a fixture in tests) without touching parse, validate or fidelity.
 */
export interface SheetReader {
  read(data: Uint8Array): Promise<RawGrid>;
}

export type IssueSeverity = "info" | "warning" | "error";

/**
 * Where a problem comes from. This is the distinction the brief asks for.
 *
 * - `missing`     A. the information is absent from the Spectora export itself.
 *                 Nothing the importer can do; the customer should know.
 * - `unsupported` B. the information IS in the export but this importer does
 *                 not model it as a first-class field. It is still stored in
 *                 `extra` and reported, never discarded.
 * - `source`      the export is internally odd (unexpected enum value,
 *                 non-contiguous block, blank required cell).
 */
export type IssueOrigin = "missing" | "unsupported" | "source";

export interface ImportIssue {
  severity: IssueSeverity;
  origin: IssueOrigin;
  /** Stable machine code, e.g. `unknown_column`, `lost_video_embed`. */
  code: string;
  message: string;
  /** 1-based spreadsheet row. Row 1 is the header. */
  sourceRow?: number;
  /** Exact source header text, so a finding can be traced to a cell. */
  sourceColumn?: string;
  rawValue?: string;
}

export interface ParsedComment {
  nameRaw: string;
  name: string;
  bodyHtml: string | null;
  commentType: string | null;
  category: number | null;
  answerType: string | null;
  recommendation: string | null;
  /** 0-based, from physical row order. The authoritative sort key. */
  position: number;
  /** Raw Spectora "Order (w/i item)". Unreliable for sorting, kept as data. */
  orderInItem: number | null;
  sourceRow: number;
  choiceOptions: string[];
  unitOptions: string[];
  /** Unmodelled source columns, keyed by their exact header text. */
  extra: Record<string, string>;
}

export interface ParsedItem {
  nameRaw: string;
  name: string;
  position: number;
  sourceRow: number;
  comments: ParsedComment[];
}

export interface ParsedSection {
  nameRaw: string;
  name: string;
  position: number;
  sourceRow: number;
  items: ParsedItem[];
}

export interface ParsedTemplate {
  name: string;
  sourceFilename: string | null;
  sections: ParsedSection[];
}

export interface ParseResult {
  template: ParsedTemplate;
  issues: ImportIssue[];
  /** Headers as they literally appeared, in order. */
  sourceHeaders: string[];
  counts: {
    sourceRows: number;
    sections: number;
    items: number;
    comments: number;
  };
}

/** Thrown when the file cannot be read at all. Carries a user-facing message. */
export class SpectoraImportError extends Error {
  readonly code: string;
  readonly hint?: string;

  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.name = "SpectoraImportError";
    this.code = code;
    this.hint = hint;
  }
}
