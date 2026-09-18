/**
 * Import Fidelity Report.
 *
 * The customer problem: someone handing over a template they have tuned for
 * four years cannot eyeball 392 rows across 42 columns to confirm nothing was
 * lost, and a green "Import successful" banner is worth nothing to them.
 *
 * So after parsing we walk the source grid a second time and compare it, cell
 * by cell, against the normalised tree that is about to be written to the
 * database. Every check reports how many values it compared, how many matched,
 * and for anything that did not match, the exact source row and column so the
 * finding can be traced back to the spreadsheet.
 *
 * This validates source -> normalised preservation. It deliberately does not
 * re-export an XLS file and diff bytes; that was cut as too much scope.
 */

import { mapHeaders, type CanonicalField } from "./columns";
import { hrefs, looksLikeHtml, stripTags, tagNames } from "./html";
import { splitOptions } from "./parse";
import type { ParsedComment, ParseResult, RawGrid } from "./types";

export type CheckStatus = "pass" | "fail";

export interface Discrepancy {
  sourceRow?: number;
  sourceColumn?: string;
  expected: string;
  actual: string;
  note?: string;
}

export interface FidelityCheck {
  id: string;
  label: string;
  /** What this check protects, in the customer's terms. */
  description: string;
  status: CheckStatus;
  compared: number;
  matched: number;
  discrepancies: Discrepancy[];
  /** True count before the sample below was truncated. */
  discrepancyCount: number;
}

export interface FidelityReport {
  checks: FidelityCheck[];
  passed: number;
  total: number;
  valuesCompared: number;
  valuesMatched: number;
  generatedAt: string;
}

/**
 * Separator for composite keys and joined comparisons. A control character,
 * because real section and item names contain commas, ampersands, slashes
 * and quotes, and one real choice option is literally `1 1/2"`.
 */
const SEP = "\u241F";

const MAX_SAMPLES = 25;

class CheckBuilder {
  private compared = 0;
  private matched = 0;
  private readonly samples: Discrepancy[] = [];
  private count = 0;

  constructor(
    private readonly id: string,
    private readonly label: string,
    private readonly description: string,
  ) {}

  compare(ok: boolean, d: () => Discrepancy): void {
    this.compared += 1;
    if (ok) {
      this.matched += 1;
      return;
    }
    this.count += 1;
    if (this.samples.length < MAX_SAMPLES) this.samples.push(d());
  }

  build(): FidelityCheck {
    return {
      id: this.id,
      label: this.label,
      description: this.description,
      status: this.count === 0 ? "pass" : "fail",
      compared: this.compared,
      matched: this.matched,
      discrepancies: this.samples,
      discrepancyCount: this.count,
    };
  }
}

const isBlank = (v: string | null | undefined) => v === null || v === undefined || v.trim() === "";
const show = (v: unknown) => (v === null || v === undefined ? "(empty)" : String(v));

export function buildFidelityReport(grid: RawGrid, result: ParseResult): FidelityReport {
  const headerRowIndex = findHeaderRowIndex(grid, result);
  const map = mapHeaders(grid.rows[headerRowIndex]);

  const sectionCol = mapHeaders(grid.rows[headerRowIndex]).index.sectionName;
  const itemCol = mapHeaders(grid.rows[headerRowIndex]).index.itemName;

  /**
   * Walk the source rows the same way the parser did, including carrying a
   * blank Section or Item forward from the row above. Comparing against the
   * literal blank cell would report the parser's documented behaviour as data
   * loss, which is the opposite of useful.
   */
  const sourceRows: {
    row: (string | null)[];
    sourceRow: number;
    section: string | null;
    item: string | null;
    inherited: boolean;
  }[] = [];
  let lastSection: string | null = null;
  let lastItem: string | null = null;

  for (let r = headerRowIndex + 1; r < grid.rows.length; r += 1) {
    const row = grid.rows[r];
    if (row.every(isBlank)) continue;

    const rawSection = sectionCol === undefined ? null : (row[sectionCol] ?? null);
    const rawItem = itemCol === undefined ? null : (row[itemCol] ?? null);
    const inherited = (isBlank(rawSection) && lastSection !== null) || (isBlank(rawItem) && lastItem !== null);
    const section: string | null = isBlank(rawSection) ? lastSection : rawSection;
    const item: string | null = isBlank(rawItem) ? lastItem : rawItem;
    if (section !== null) lastSection = section;
    if (item !== null) lastItem = item;

    sourceRows.push({ row, sourceRow: r + 1, section, item, inherited });
  }

  // Flatten the parsed tree in traversal order, carrying each comment's parents.
  const flat: { comment: ParsedComment; sectionRaw: string; itemRaw: string }[] = [];
  for (const section of result.template.sections) {
    for (const item of section.items) {
      for (const comment of item.comments) {
        flat.push({ comment, sectionRaw: section.nameRaw, itemRaw: item.nameRaw });
      }
    }
  }
  const byRow = new Map(flat.map((f) => [f.comment.sourceRow, f]));

  const cellOf = (row: (string | null)[], field: CanonicalField): string | null => {
    const i = map.index[field];
    return i === undefined ? null : (row[i] ?? null);
  };
  const headerOf = (field: CanonicalField): string | undefined => {
    const i = map.index[field];
    return i === undefined ? undefined : map.headers[i];
  };

  const checks: FidelityCheck[] = [];

  // ---------------------------------------------------------------- rows
  const rowsCheck = new CheckBuilder(
    "rows",
    "Every source row imported",
    "Each non-empty row in the spreadsheet became exactly one comment.",
  );
  for (const { sourceRow, row } of sourceRows) {
    rowsCheck.compare(byRow.has(sourceRow), () => ({
      sourceRow,
      expected: "1 comment",
      actual: "0 comments",
      note: row.filter((v) => !isBlank(v)).join(" | ").slice(0, 160),
    }));
  }
  checks.push(rowsCheck.build());

  // ------------------------------------------------------------ sections
  const sectionsCheck = new CheckBuilder(
    "sections",
    "Sections preserved",
    "Every distinct section in the file exists, with the same name and in the same order.",
  );
  const sourceSections = distinctInOrder(sourceRows.map(({ section }) => section));
  const parsedSections = result.template.sections.map((s) => s.nameRaw);
  compareSequences(sectionsCheck, sourceSections, parsedSections, headerOf("sectionName"));
  checks.push(sectionsCheck.build());

  // --------------------------------------------------------------- items
  const itemsCheck = new CheckBuilder(
    "items",
    "Items preserved",
    "Every distinct item exists under the right section, with the same name and order.",
  );
  const sourceItems = distinctInOrder(
    sourceRows.map(({ section, item }) => (section === null || item === null ? null : `${section}${SEP}${item}`)),
  );
  const parsedItems: string[] = [];
  for (const s of result.template.sections) {
    for (const i of s.items) parsedItems.push(`${s.nameRaw}${SEP}${i.nameRaw}`);
  }
  compareSequences(
    itemsCheck,
    sourceItems,
    parsedItems,
    headerOf("itemName"),
    (v) => v.replace(SEP, " > "),
  );
  checks.push(itemsCheck.build());

  // ------------------------------------------------------------ comments
  const commentsCheck = new CheckBuilder(
    "comments",
    "Comment names preserved",
    "Every comment kept its name exactly, including repeats and trailing spaces.",
  );
  for (const { row, sourceRow } of sourceRows) {
    const expected = cellOf(row, "commentName") ?? "";
    const actual = byRow.get(sourceRow)?.comment.nameRaw ?? null;
    commentsCheck.compare(actual === expected, () => ({
      sourceRow,
      sourceColumn: headerOf("commentName"),
      expected: show(expected),
      actual: show(actual),
    }));
  }
  checks.push(commentsCheck.build());

  // ----------------------------------------------------------- hierarchy
  const hierarchyCheck = new CheckBuilder(
    "hierarchy",
    "Hierarchy preserved",
    "Each comment sits under the section and item its source row named.",
  );
  for (const { sourceRow, section, item, inherited } of sourceRows) {
    const found = byRow.get(sourceRow);
    if (!found) continue;
    const expected = `${section} > ${item}`;
    const actual = `${found.sectionRaw} > ${found.itemRaw}`;
    hierarchyCheck.compare(expected === actual, () => ({
      sourceRow,
      sourceColumn: headerOf("sectionName"),
      expected,
      actual,
      note: inherited ? "inherited from the row above" : undefined,
    }));
  }
  checks.push(hierarchyCheck.build());

  // ------------------------------------------------------------ ordering
  const orderingCheck = new CheckBuilder(
    "ordering",
    "Physical order preserved",
    "Comments read back in the same order as the spreadsheet rows, which is the order the inspector arranged them in.",
  );
  const expectedOrder = sourceRows.map((s) => s.sourceRow).filter((n) => byRow.has(n));
  const actualOrder = flat.map((f) => f.comment.sourceRow);
  for (let i = 0; i < Math.max(expectedOrder.length, actualOrder.length); i += 1) {
    const e = expectedOrder[i];
    const a = actualOrder[i];
    orderingCheck.compare(e === a, () => ({
      sourceRow: e ?? a,
      expected: `position ${i} holds source row ${show(e)}`,
      actual: `position ${i} holds source row ${show(a)}`,
    }));
  }
  checks.push(orderingCheck.build());

  // -------------------------------------------------------- comment text
  const textCheck = new CheckBuilder(
    "comment_text",
    "Comment text preserved",
    "Comment Text was stored byte for byte, including line endings and non-breaking spaces.",
  );
  for (const { row, sourceRow } of sourceRows) {
    const raw = cellOf(row, "commentText");
    const expected = isBlank(raw) ? null : raw;
    const actual = byRow.get(sourceRow)?.comment.bodyHtml ?? null;
    textCheck.compare(expected === actual, () => ({
      sourceRow,
      sourceColumn: headerOf("commentText"),
      expected: show(expected).slice(0, 200),
      actual: show(actual).slice(0, 200),
    }));
  }
  checks.push(textCheck.build());

  // ----------------------------------------------------------------- html
  const htmlCheck = new CheckBuilder(
    "html",
    "Formatting and links preserved",
    "For comments containing markup, the tags, link targets and wording all survived unchanged.",
  );
  for (const { row, sourceRow } of sourceRows) {
    const raw = cellOf(row, "commentText");
    if (isBlank(raw) || !looksLikeHtml(raw!)) continue;
    const actual = byRow.get(sourceRow)?.comment.bodyHtml ?? "";
    const same =
      tagNames(raw!).join(",") === tagNames(actual).join(",") &&
      hrefs(raw!).join("|") === hrefs(actual).join("|") &&
      stripTags(raw!) === stripTags(actual);
    htmlCheck.compare(same, () => ({
      sourceRow,
      sourceColumn: headerOf("commentText"),
      expected: `${tagNames(raw!).length} tags, ${hrefs(raw!).length} links`,
      actual: `${tagNames(actual).length} tags, ${hrefs(actual).length} links`,
    }));
  }
  checks.push(htmlCheck.build());

  // -------------------------------------------------------------- options
  const optionsCheck = new CheckBuilder(
    "options",
    "Answer options preserved",
    "Multiple choice and unit options kept every entry, in order, including ones containing quotes or ampersands.",
  );
  for (const { row, sourceRow } of sourceRows) {
    const found = byRow.get(sourceRow);
    if (!found) continue;
    for (const [field, parsed] of [
      ["choiceOptions", found.comment.choiceOptions],
      ["unitOptions", found.comment.unitOptions],
    ] as [CanonicalField, string[]][]) {
      const raw = cellOf(row, field);
      const expected = isBlank(raw) ? [] : splitOptions(raw!);
      if (expected.length === 0 && parsed.length === 0) continue;
      optionsCheck.compare(expected.join(SEP) === parsed.join(SEP), () => ({
        sourceRow,
        sourceColumn: headerOf(field),
        expected: expected.join(" | "),
        actual: parsed.join(" | "),
      }));
    }
  }
  checks.push(optionsCheck.build());

  // ------------------------------------------------------- source fields
  const fieldsCheck = new CheckBuilder(
    "source_fields",
    "Key source fields preserved",
    "Comment type, severity, answer type, recommendation and the original Order value all match the spreadsheet.",
  );
  for (const { row, sourceRow } of sourceRows) {
    const found = byRow.get(sourceRow);
    if (!found) continue;
    const c = found.comment;
    const pairs: [CanonicalField, string | null, string | null][] = [
      ["commentType", trimOrNull(cellOf(row, "commentType")), c.commentType],
      ["answerType", trimOrNull(cellOf(row, "answerType")), c.answerType],
      ["recommendation", trimOrNull(cellOf(row, "recommendation")), c.recommendation],
      ["category", trimOrNull(cellOf(row, "category")), c.category === null ? null : String(c.category)],
      ["orderInItem", trimOrNull(cellOf(row, "orderInItem")), c.orderInItem === null ? null : String(c.orderInItem)],
    ];
    for (const [field, expected, actual] of pairs) {
      fieldsCheck.compare(expected === actual, () => ({
        sourceRow,
        sourceColumn: headerOf(field),
        expected: show(expected),
        actual: show(actual),
      }));
    }
  }
  checks.push(fieldsCheck.build());

  // ------------------------------------------------------ unmodelled cells
  const extraCheck = new CheckBuilder(
    "extra_fields",
    "Unsupported columns retained",
    "Columns this app has no editor for (photo defaults, estimates, flags, anything unrecognised) were still stored with their comment.",
  );
  for (const { row, sourceRow } of sourceRows) {
    const found = byRow.get(sourceRow);
    if (!found) continue;
    for (const col of map.extraColumns) {
      const value = row[col];
      if (isBlank(value)) continue;
      const header = map.headers[col];
      const actual = found.comment.extra[header];
      extraCheck.compare(actual === value, () => ({
        sourceRow,
        sourceColumn: header,
        expected: show(value).slice(0, 120),
        actual: show(actual).slice(0, 120),
      }));
    }
  }
  checks.push(extraCheck.build());

  const valuesCompared = checks.reduce((n, c) => n + c.compared, 0);
  const valuesMatched = checks.reduce((n, c) => n + c.matched, 0);

  return {
    checks,
    passed: checks.filter((c) => c.status === "pass").length,
    total: checks.length,
    valuesCompared,
    valuesMatched,
    generatedAt: new Date().toISOString(),
  };
}

function trimOrNull(v: string | null): string | null {
  if (v === null || v.trim() === "") return null;
  return v.trim();
}

function distinctInOrder(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (v === null || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function compareSequences(
  check: CheckBuilder,
  expected: string[],
  actual: string[],
  sourceColumn: string | undefined,
  label: (v: string) => string = (v) => v,
): void {
  for (let i = 0; i < Math.max(expected.length, actual.length); i += 1) {
    const e = expected[i];
    const a = actual[i];
    check.compare(e === a, () => ({
      sourceColumn,
      expected: e === undefined ? "(nothing)" : label(e),
      actual: a === undefined ? "(nothing)" : label(a),
      note: `position ${i}`,
    }));
  }
}

/** Re-derive the header row the parser used, so both walks agree. */
function findHeaderRowIndex(grid: RawGrid, result: ParseResult): number {
  const target = result.sourceHeaders.join(SEP);
  for (let r = 0; r < Math.min(5, grid.rows.length); r += 1) {
    if (grid.rows[r].map((c) => c ?? "").join(SEP) === target) return r;
  }
  return 0;
}
