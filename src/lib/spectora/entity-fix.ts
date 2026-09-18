/**
 * Repair exceljs's double-decoding of XML entities.
 *
 * THE PROBLEM
 *
 * Spectora writes section and item names HTML-escaped. In the worksheet XML
 * that escaping is then XML-escaped again, so cell A93 of the sample export
 * literally reads:
 *
 *     <c r="A93" t="str"><v>Basement, Foundation, Crawlspace &amp;amp; Structure</v></c>
 *
 * Decoding that XML once gives the true cell value:
 *
 *     Basement, Foundation, Crawlspace &amp; Structure
 *
 * exceljs 4.4.0 decodes it twice and returns `... & Structure`. The rendered
 * result happens to look right, but the stored value is no longer what the
 * export contained, and a comment body that deliberately showed escaped markup
 * (`&amp;lt;p&amp;gt;`) would silently turn into live markup.
 *
 * Rewriting customer content without saying so is the one thing this importer
 * must not do, so rather than tolerate it we read the worksheet XML, decode it
 * exactly once, and put the correct value back.
 *
 * SCOPE
 *
 * This only ever overrides a cell when the correctly decoded value differs
 * from what exceljs produced, and only for plain string cells. Everything
 * else is left to exceljs. If exceljs is fixed upstream, or a different
 * SheetReader is swapped in, this pass quietly becomes a no-op.
 */

import JSZip from "jszip";

const XML_NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decode XML character references exactly once. */
export function decodeXmlOnce(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return XML_NAMED[body] ?? match;
  });
}

/** "AP" -> 41 (0-based). */
export function columnToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export interface CellText {
  /** 1-based spreadsheet row. */
  row: number;
  /** 0-based column index. */
  column: number;
  ref: string;
  /** Correct value: the XML text decoded exactly once. */
  value: string;
}

/**
 * Pull every plain string cell out of one worksheet XML document.
 *
 * Shared-string cells (`t="s"`) are skipped: their `<v>` holds an index, not
 * text, and this pass has nothing to correct in them.
 */
export function readCellTexts(xml: string): CellText[] {
  const out: CellText[] = [];
  const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;

  for (const cell of xml.matchAll(cellRe)) {
    const attrs = cell[1];
    const body = cell[2];

    const refMatch = /\br="([A-Z]+)(\d+)"/.exec(attrs);
    if (!refMatch) continue;
    const typeMatch = /\bt="([^"]+)"/.exec(attrs);
    const type = typeMatch?.[1];
    if (type === "s") continue;

    let raw: string | undefined;
    if (type === "inlineStr") {
      const parts = Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map((m) => m[1]);
      if (parts.length > 0) raw = parts.join("");
    } else {
      raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
    }
    if (raw === undefined) continue;

    out.push({
      row: Number.parseInt(refMatch[2], 10),
      column: columnToIndex(refMatch[1]),
      ref: `${refMatch[1]}${refMatch[2]}`,
      value: decodeXmlOnce(raw),
    });
  }
  return out;
}

/** Worksheet XML for the workbook's first sheet, or null if it cannot be found. */
export async function firstWorksheetXml(data: Uint8Array): Promise<string | null> {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => {
      const num = (s: string) => Number.parseInt(/(\d+)\.xml$/.exec(s)![1], 10);
      return num(a) - num(b);
    });
  if (names.length === 0) return null;
  return zip.file(names[0])!.async("string");
}
