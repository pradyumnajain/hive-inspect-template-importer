import {
  mapHeaders,
  isPhotoHeader,
  REQUIRED_FIELDS,
  type CanonicalField,
  type HeaderMap,
} from "./columns";
import { decodeEntities, findEmptyEmbeds } from "./html";
import {
  SpectoraImportError,
  type ImportIssue,
  type ParsedItem,
  type ParsedSection,
  type ParseResult,
  type RawGrid,
} from "./types";

/**
 * Separator for the composite (section, item) key. A control character,
 * because real names contain commas, ampersands, slashes and quotes, so no
 * printable separator is safe.
 */
const KEY_SEP = "\u241F";

const VALID_COMMENT_TYPES = new Set(["info", "limit", "defect"]);
const VALID_ANSWER_TYPES = new Set(["boolean", "checkbox", "date", "number", "range", "text"]);
const VALID_RECOMMENDATIONS = new Set(["pro", "monitor"]);

const isBlank = (v: string | null | undefined): boolean => v === null || v === undefined || v.trim() === "";

/**
 * Split one of Spectora's "comma-separated" columns.
 *
 * Plain split on comma, deliberately NOT a CSV parse. The values are not
 * quoted, and one real option in the sample template is literally `1 1/2"`.
 * A CSV reader would treat that double quote as a delimiter and mangle it.
 *
 * Individual options are trimmed because Spectora writes ", " between them;
 * the surrounding spaces are formatting, not content.
 */
export function splitOptions(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/** Locate the header row. Usually row 1, but tolerate a title row above it. */
function findHeaderRow(grid: RawGrid): number {
  const limit = Math.min(5, grid.rows.length);
  for (let r = 0; r < limit; r += 1) {
    const map = mapHeaders(grid.rows[r]);
    if (REQUIRED_FIELDS.every((f) => map.index[f] !== undefined)) return r;
  }
  return 0;
}

export function parseGrid(grid: RawGrid, sourceFilename: string | null): ParseResult {
  const issues: ImportIssue[] = [];
  const add = (issue: ImportIssue) => issues.push(issue);

  if (grid.rows.length === 0) {
    throw new SpectoraImportError("empty_sheet", `Worksheet "${grid.sheetName}" has no rows.`);
  }

  const headerRowIndex = findHeaderRow(grid);
  const map = mapHeaders(grid.rows[headerRowIndex]);

  const missingRequired = REQUIRED_FIELDS.filter((f) => map.index[f] === undefined);
  if (missingRequired.length > 0) {
    throw new SpectoraImportError(
      "missing_required_columns",
      `This spreadsheet is missing required columns: ${missingRequired.join(", ")}.`,
      `Found these headers instead: ${map.headers.filter((h) => h.trim() !== "").join(" | ") || "(none)"}. ` +
        `Use Spectora's "Export to spreadsheet -> Export HTML Text" output.`,
    );
  }

  // Anything the reader had to repair before the parser saw it is reported
  // here, so a correction is never invisible even when it is the right call.
  if (grid.auditError) {
    add({
      severity: "info",
      origin: "source",
      code: "entity_audit_skipped",
      message:
        `The worksheet XML could not be re-read to check for double-encoded entities (${grid.auditError}). ` +
        `Text such as "&amp;" may have been decoded one level too far by the spreadsheet library.`,
    });
  }
  if (grid.corrections && grid.corrections.length > 0) {
    const sample = grid.corrections[0];
    add({
      severity: "info",
      origin: "source",
      code: "entities_repaired",
      message:
        `${grid.corrections.length} cell(s) were stored HTML-escaped inside the spreadsheet XML and the ` +
        `spreadsheet library decoded them twice. The original escaping was restored, for example ` +
        `cell ${sample.ref}: "${sample.from}" was corrected to "${sample.to}".`,
      sourceRow: sample.sourceRow,
      rawValue: sample.to,
    });
  }

  if (headerRowIndex > 0) {
    add({
      severity: "info",
      origin: "source",
      code: "header_not_first_row",
      message: `Header row found on spreadsheet row ${headerRowIndex + 1} rather than row 1. Rows above it were ignored.`,
      sourceRow: headerRowIndex + 1,
    });
  }

  // Canonical fields this importer knows about but that this file does not contain.
  const OPTIONAL: CanonicalField[] = [
    "commentText",
    "commentType",
    "category",
    "choiceOptions",
    "unitOptions",
    "recommendation",
    "orderInItem",
    "answerType",
  ];
  for (const field of OPTIONAL) {
    if (map.index[field] === undefined) {
      add({
        severity: "warning",
        origin: "missing",
        code: "column_absent",
        message: `This export has no "${field}" column, so that information could not be imported.`,
        sourceColumn: field,
      });
    }
  }

  for (const col of map.unknownColumns) {
    add({
      severity: "warning",
      origin: "unsupported",
      code: "unknown_column",
      message:
        `Column "${map.headers[col]}" is not one this importer models. Its values are preserved ` +
        `on each comment and can be exported, but they are not editable here.`,
      sourceColumn: map.headers[col],
    });
  }

  const cell = (row: (string | null)[], field: CanonicalField): string | null => {
    const i = map.index[field];
    return i === undefined ? null : (row[i] ?? null);
  };

  const sections: ParsedSection[] = [];
  const sectionByKey = new Map<string, ParsedSection>();
  const itemByKey = new Map<string, ParsedItem>();

  // Spectora repeats Section and Item on every row. Another export of the same
  // shape might leave them blank and rely on the row above. Carry the last
  // value forward so such a file still imports, and say so.
  let lastSection: string | null = null;
  let lastItem: string | null = null;
  let carriedForward = 0;

  const photoColumnsWithData = new Set<string>();
  const unmodelledWithData = new Set<string>();
  let sourceRowCount = 0;
  let commentCount = 0;

  for (let r = headerRowIndex + 1; r < grid.rows.length; r += 1) {
    const row = grid.rows[r];
    const sourceRow = r + 1; // 1-based, matches what the user sees in Excel

    if (row.every(isBlank)) continue;
    sourceRowCount += 1;

    let sectionRaw = cell(row, "sectionName");
    let itemRaw = cell(row, "itemName");
    const commentRaw = cell(row, "commentName");

    if (isBlank(sectionRaw) && lastSection !== null) {
      sectionRaw = lastSection;
      carriedForward += 1;
    }
    if (isBlank(itemRaw) && lastItem !== null) {
      itemRaw = lastItem;
      carriedForward += 1;
    }

    if (isBlank(sectionRaw) || isBlank(itemRaw)) {
      add({
        severity: "error",
        origin: "source",
        code: "row_without_hierarchy",
        message: `Row ${sourceRow} has no Section or Item name and no previous row to inherit from, so it could not be placed. It was not imported.`,
        sourceRow,
        rawValue: row.filter((v) => !isBlank(v)).join(" | ").slice(0, 200),
      });
      continue;
    }

    lastSection = sectionRaw;
    lastItem = itemRaw;

    // Sections and items are keyed by their raw name so a block that appears
    // twice merges rather than becoming two same-named siblings. Spectora's
    // own model has one node per name.
    let section = sectionByKey.get(sectionRaw!);
    if (!section) {
      section = {
        nameRaw: sectionRaw!,
        name: decodeEntities(sectionRaw!),
        position: sections.length,
        sourceRow,
        items: [],
      };
      sections.push(section);
      sectionByKey.set(sectionRaw!, section);
    }

    const itemKey = `${sectionRaw}${KEY_SEP}${itemRaw}`;
    let item = itemByKey.get(itemKey);
    if (!item) {
      item = {
        nameRaw: itemRaw!,
        name: decodeEntities(itemRaw!),
        position: section.items.length,
        sourceRow,
        comments: [],
      };
      section.items.push(item);
      itemByKey.set(itemKey, item);
    }

    const nameRaw = commentRaw ?? "";
    if (isBlank(commentRaw)) {
      add({
        severity: "warning",
        origin: "source",
        code: "comment_without_name",
        message: `Row ${sourceRow} has no Comment Name. It was imported with an empty name so its text is not lost.`,
        sourceRow,
        sourceColumn: map.headers[map.index.commentName!],
      });
    }

    const bodyHtml = cell(row, "commentText");
    const commentTypeRaw = cell(row, "commentType");
    const answerTypeRaw = cell(row, "answerType");
    const recommendationRaw = cell(row, "recommendation");
    const categoryRaw = cell(row, "category");
    const orderRaw = cell(row, "orderInItem");

    if (!isBlank(commentTypeRaw) && !VALID_COMMENT_TYPES.has(commentTypeRaw!.trim().toLowerCase())) {
      add({
        severity: "warning",
        origin: "source",
        code: "unexpected_comment_type",
        message: `Row ${sourceRow} has Comment Type "${commentTypeRaw}", which is not one of info, limit or defect. The value was kept as-is.`,
        sourceRow,
        sourceColumn: map.headers[map.index.commentType!],
        rawValue: commentTypeRaw ?? undefined,
      });
    }

    if (!isBlank(answerTypeRaw) && !VALID_ANSWER_TYPES.has(answerTypeRaw!.trim().toLowerCase())) {
      add({
        severity: "warning",
        origin: "source",
        code: "unexpected_answer_type",
        message: `Row ${sourceRow} has Answer Type "${answerTypeRaw}", which this importer does not recognise. The value was kept as-is.`,
        sourceRow,
        sourceColumn: map.headers[map.index.answerType!],
        rawValue: answerTypeRaw ?? undefined,
      });
    }

    if (!isBlank(recommendationRaw) && !VALID_RECOMMENDATIONS.has(recommendationRaw!.trim().toLowerCase())) {
      add({
        severity: "info",
        origin: "source",
        code: "unexpected_recommendation",
        message: `Row ${sourceRow} has Recommendation "${recommendationRaw}", which is outside the known list. The value was kept as-is.`,
        sourceRow,
        sourceColumn: map.headers[map.index.recommendation!],
        rawValue: recommendationRaw ?? undefined,
      });
    }

    let category: number | null = null;
    if (!isBlank(categoryRaw)) {
      const n = Number.parseInt(categoryRaw!.trim(), 10);
      if (Number.isFinite(n)) {
        category = n;
      } else {
        add({
          severity: "warning",
          origin: "source",
          code: "non_numeric_category",
          message: `Row ${sourceRow} has Category "${categoryRaw}", which is not a number. It was kept with the comment's other source fields.`,
          sourceRow,
          sourceColumn: map.headers[map.index.category!],
          rawValue: categoryRaw ?? undefined,
        });
      }
    }

    let orderInItem: number | null = null;
    if (!isBlank(orderRaw)) {
      const n = Number.parseInt(orderRaw!.trim(), 10);
      if (Number.isFinite(n)) orderInItem = n;
    }

    const choiceRaw = cell(row, "choiceOptions");
    const unitRaw = cell(row, "unitOptions");
    const choiceOptions = isBlank(choiceRaw) ? [] : splitOptions(choiceRaw!);
    const unitOptions = isBlank(unitRaw) ? [] : splitOptions(unitRaw!);

    if (!isBlank(choiceRaw) && /,\s*,/.test(choiceRaw!)) {
      add({
        severity: "info",
        origin: "source",
        code: "empty_choice_option",
        message: `Row ${sourceRow} has an empty entry in its multiple choice list. The blank entry was dropped; the rest were kept.`,
        sourceRow,
        sourceColumn: map.headers[map.index.choiceOptions!],
        rawValue: choiceRaw ?? undefined,
      });
    }

    // Everything else from this row, keyed by the exact source header.
    const extra: Record<string, string> = {};
    for (const col of map.extraColumns) {
      const value = row[col];
      if (isBlank(value)) continue;
      const header = map.headers[col];
      extra[header] = value!;
      if (isPhotoHeader(header)) photoColumnsWithData.add(header);
      else unmodelledWithData.add(header);
    }

    if (bodyHtml) {
      for (const embed of findEmptyEmbeds(bodyHtml)) {
        add({
          severity: "warning",
          origin: "missing",
          code: "lost_video_embed",
          message:
            `Row ${sourceRow} contains an embed placeholder with nothing inside it. Spectora's HTML-text export ` +
            `writes the wrapper but not the video, so the embed is absent from the file and cannot be recovered. ` +
            `The placeholder was preserved exactly.`,
          sourceRow,
          sourceColumn: map.headers[map.index.commentText!],
          rawValue: embed.slice(0, 200),
        });
      }
    }

    item.comments.push({
      nameRaw,
      name: nameRaw,
      bodyHtml: isBlank(bodyHtml) ? null : bodyHtml,
      commentType: isBlank(commentTypeRaw) ? null : commentTypeRaw!.trim(),
      category,
      answerType: isBlank(answerTypeRaw) ? null : answerTypeRaw!.trim(),
      recommendation: isBlank(recommendationRaw) ? null : recommendationRaw!.trim(),
      position: item.comments.length,
      orderInItem,
      sourceRow,
      choiceOptions,
      unitOptions,
      extra,
    });
    commentCount += 1;
  }

  if (carriedForward > 0) {
    add({
      severity: "info",
      origin: "source",
      code: "hierarchy_carried_forward",
      message: `${carriedForward} blank Section or Item cell(s) inherited their value from the row above, the way a grouped spreadsheet reads.`,
    });
  }

  reportNonContiguousBlocks(grid, map, headerRowIndex, add);

  if (unmodelledWithData.size > 0) {
    add({
      severity: "info",
      origin: "unsupported",
      code: "unmodelled_fields_preserved",
      message:
        `${unmodelledWithData.size} source column(s) carry data this MVP does not give a dedicated editor: ` +
        `${[...unmodelledWithData].join(", ")}. Every value is stored against its comment and is not lost.`,
    });
  }

  if (photoColumnsWithData.size > 0) {
    add({
      severity: "warning",
      origin: "unsupported",
      code: "photo_defaults_preserved",
      message:
        `This template sets default photos (${[...photoColumnsWithData].join(", ")}). They are stored with their ` +
        `comments but there is no photo editor in this app, so they cannot be changed here.`,
    });
  }

  if (commentCount === 0) {
    add({
      severity: "error",
      origin: "source",
      code: "no_comments",
      message: "No comment rows were found below the header, so the imported template is empty.",
    });
  }

  const itemTotal = sections.reduce((n, s) => n + s.items.length, 0);

  return {
    template: {
      name: deriveTemplateName(sourceFilename),
      sourceFilename,
      sections,
    },
    issues,
    sourceHeaders: map.headers,
    counts: { sourceRows: sourceRowCount, sections: sections.length, items: itemTotal, comments: commentCount },
  };
}

/**
 * Flag a section or item whose rows are split into separate blocks. Those rows
 * are merged into one node, which is almost certainly right, but the user
 * should be told the file was not in a single run.
 */
function reportNonContiguousBlocks(
  grid: RawGrid,
  map: HeaderMap,
  headerRowIndex: number,
  add: (issue: ImportIssue) => void,
): void {
  const seenSection = new Set<string>();
  const seenItem = new Set<string>();
  let prevSection: string | null = null;
  let prevItem: string | null = null;

  for (let r = headerRowIndex + 1; r < grid.rows.length; r += 1) {
    const row = grid.rows[r];
    if (row.every(isBlank)) continue;
    const s = row[map.index.sectionName!] ?? null;
    const i = row[map.index.itemName!] ?? null;
    if (s === null || i === null) continue;

    if (s !== prevSection) {
      if (seenSection.has(s)) {
        add({
          severity: "info",
          origin: "source",
          code: "non_contiguous_section",
          message: `Section "${s}" appears in more than one block in the spreadsheet. Its rows were merged into a single section, keeping file order.`,
          sourceRow: r + 1,
          rawValue: s,
        });
      }
      seenSection.add(s);
      prevSection = s;
    }
    const key = `${s}${KEY_SEP}${i}`;
    if (key !== prevItem) {
      if (seenItem.has(key)) {
        add({
          severity: "info",
          origin: "source",
          code: "non_contiguous_item",
          message: `Item "${i}" in section "${s}" appears in more than one block. Its rows were merged into a single item, keeping file order.`,
          sourceRow: r + 1,
          rawValue: i,
        });
      }
      seenItem.add(key);
      prevItem = key;
    }
  }
}

/** "InterNACHI Residential -2026-09-17.xls" -> "InterNACHI Residential -2026-09-17" */
export function deriveTemplateName(filename: string | null): string {
  if (!filename) return "Imported template";
  const base = filename.replace(/\.[a-z0-9]+$/i, "").trim();
  return base === "" ? "Imported template" : base;
}
