/**
 * Mapping from Spectora's header row to the fields this importer models.
 *
 * Headers are matched on a normalised form rather than byte-exactly, because
 * the parenthetical hints Spectora appends are documentation, not identity:
 *
 *   "Order (w/i item)"                                   -> order
 *   "Answer Type (boolean, checkbox, date, number, ...)" -> answer type
 *   "Category (-1: Low, 0: Med, 1: High)"                -> category
 *
 * A future export that drops or reworks a hint still maps correctly. A header
 * that matches nothing is kept verbatim in `extra` and reported as an issue.
 */

export type CanonicalField =
  | "sectionName"
  | "itemName"
  | "commentName"
  | "commentText"
  | "commentType"
  | "category"
  | "choiceOptions"
  | "unitOptions"
  | "recommendation"
  | "orderInItem"
  | "answerType";

/** Lowercase, drop parenthetical hints, collapse whitespace. */
export function normaliseHeader(header: string): string {
  return header
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const FIELD_BY_NORMALISED: Record<string, CanonicalField> = {
  "section name": "sectionName",
  "item name": "itemName",
  "comment name": "commentName",
  "comment text": "commentText",
  "comment type": "commentType",
  category: "category",
  "multiple choice options": "choiceOptions",
  "unit type options": "unitOptions",
  recommendation: "recommendation",
  order: "orderInItem",
  "answer type": "answerType",
};

/**
 * Columns Spectora exports that this importer stores but does not model as
 * first-class fields. They live in `comments.extra` keyed by their exact
 * header. Listing them here keeps them out of the "unknown column" warning:
 * they are known, just not promoted to columns for this MVP.
 */
const KNOWN_UNMODELLED = new Set([
  "default value",
  "default value 2",
  "default unit type",
  "default location",
  "default estimate min",
  "default estimate max",
  "locked",
  "simple format",
  "disable photos",
  "uses",
  "last modified",
]);

const PHOTO_HEADER = /^default photo \d+( caption)?$/;

export function isKnownUnmodelled(header: string): boolean {
  const n = normaliseHeader(header);
  return KNOWN_UNMODELLED.has(n) || PHOTO_HEADER.test(n);
}

export function isPhotoHeader(header: string): boolean {
  return PHOTO_HEADER.test(normaliseHeader(header));
}

/** Without these three there is no hierarchy to build. */
export const REQUIRED_FIELDS: CanonicalField[] = ["sectionName", "itemName", "commentName"];

export interface HeaderMap {
  /** Exact header text for each column index. */
  headers: string[];
  /** Column index for each canonical field that was found. */
  index: Partial<Record<CanonicalField, number>>;
  /** Column indexes whose header matched no canonical field. */
  extraColumns: number[];
  /** Column indexes whose header matched nothing this importer has ever seen. */
  unknownColumns: number[];
}

export function mapHeaders(headerRow: (string | null)[]): HeaderMap {
  const headers = headerRow.map((h) => h ?? "");
  const index: Partial<Record<CanonicalField, number>> = {};
  const extraColumns: number[] = [];
  const unknownColumns: number[] = [];

  headers.forEach((header, i) => {
    if (header.trim() === "") return;
    const field = FIELD_BY_NORMALISED[normaliseHeader(header)];
    if (field !== undefined && index[field] === undefined) {
      index[field] = i;
      return;
    }
    // A duplicated canonical header falls through to `extra` rather than
    // overwriting the first one.
    extraColumns.push(i);
    if (!isKnownUnmodelled(header) && field === undefined) unknownColumns.push(i);
  });

  return { headers, index, extraColumns, unknownColumns };
}
