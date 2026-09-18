/**
 * Parser tests against the real committed Spectora export.
 *
 * These are the checks that would catch a regression in preservation. The
 * expected numbers come from inspecting the actual file, not from whatever the
 * parser happened to produce.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";

import {
  buildImportPreview,
  decodeEntities,
  parseGrid,
  sniff,
  SpectoraImportError,
  InMemorySheetReader,
  type ImportIssue,
} from "@/lib/spectora";
import type { ImportPreview } from "@/lib/spectora";

const SAMPLE = path.join(process.cwd(), "sample-data", "InterNACHI Residential -2026-09-17.xls");

let preview: ImportPreview;

beforeAll(async () => {
  const bytes = new Uint8Array(await readFile(SAMPLE));
  preview = await buildImportPreview(bytes, "InterNACHI Residential -2026-09-17.xls");
}, 60_000);

const allComments = () =>
  preview.template.sections.flatMap((s) => s.items.flatMap((i) => i.comments));

describe("file identification", () => {
  it("recognises the Spectora .xls as an OOXML workbook, ignoring the extension", async () => {
    const bytes = new Uint8Array(await readFile(SAMPLE));
    expect(sniff(bytes)).toBe("ooxml");
  });

  it("rejects a legacy binary .xls with an actionable message", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await expect(buildImportPreview(ole, "old.xls")).rejects.toMatchObject({
      code: "legacy_xls",
    });
  });

  it("rejects a file that is not a spreadsheet at all", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    await expect(buildImportPreview(pdf, "brief.pdf")).rejects.toBeInstanceOf(SpectoraImportError);
  });

  it("rejects an empty file", async () => {
    await expect(buildImportPreview(new Uint8Array(), "empty.xls")).rejects.toMatchObject({
      code: "empty_file",
    });
  });
});

describe("counts", () => {
  it("imports every data row as exactly one comment", () => {
    expect(preview.counts.sourceRows).toBe(392);
    expect(preview.counts.comments).toBe(392);
  });

  it("finds 13 sections and 69 items", () => {
    expect(preview.counts.sections).toBe(13);
    expect(preview.counts.items).toBe(69);
  });
});

describe("hierarchy and ordering", () => {
  it("keeps sections in first-appearance order", () => {
    expect(preview.template.sections.map((s) => s.name).slice(0, 4)).toEqual([
      "Inspection Details",
      "Exterior",
      "Roof",
      "Basement, Foundation, Crawlspace & Structure",
    ]);
  });

  it("scopes items to their section, so eight different 'General' items coexist", () => {
    const generals = preview.template.sections.filter((s) =>
      s.items.some((i) => i.name === "General"),
    );
    expect(generals.length).toBe(8);
  });

  it("orders comments by physical row, not by the unreliable Order column", () => {
    const rows = allComments().map((c) => c.sourceRow);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(new Set(rows).size).toBe(rows.length);
  });

  it("preserves the two comments that share Order 0 inside one item", () => {
    const item = preview.template.sections
      .find((s) => s.name === "Exterior")!
      .items.find((i) => i.name === "Exterior Doors")!;
    const zeroes = item.comments.filter((c) => c.orderInItem === 0);
    // Both carry Order 0. Row order decides, and row order is what the file says.
    expect(zeroes.map((c) => c.name)).toEqual([
      "Door Does Not Close or Latch",
      "Exterior Entry Door",
    ]);
    expect(zeroes[0].sourceRow).toBeLessThan(zeroes[1].sourceRow);
  });

  it("keeps the duplicated comment name under Fireplace > Damper Doors", () => {
    const item = preview.template.sections
      .find((s) => s.name === "Fireplace")!
      .items.find((i) => i.name === "Damper Doors")!;
    const dupes = item.comments.filter((c) => c.name === "Damper Inoperable");
    expect(dupes.length).toBe(2);
    expect(dupes[0].position).not.toBe(dupes[1].position);
  });
});

describe("text preservation", () => {
  it("decodes entities in section and item names but keeps the raw form", () => {
    const section = preview.template.sections.find((s) => s.nameRaw.includes("&amp;"))!;
    expect(section.nameRaw).toContain("&amp;");
    expect(section.name).toContain(" & ");
    expect(section.name).not.toContain("&amp;");
  });

  it("does not trim trailing spaces from comment names", () => {
    const withSpace = allComments().filter((c) => c.name !== c.name.trim());
    expect(withSpace.length).toBe(11);
    expect(new Set(withSpace.map((c) => c.name)).size).toBe(6);
    expect(withSpace.map((c) => c.name)).toContain("Temperature ");
  });

  it("stores comment text byte for byte, including nbsp and CRLF", () => {
    const bodies = allComments().map((c) => c.bodyHtml).filter(Boolean) as string[];
    expect(bodies.length).toBe(309);
    expect(bodies.some((b) => b.includes(" "))).toBe(true);
    expect(bodies.some((b) => b.includes("\r\n"))).toBe(true);
  });

  it("preserves anchors with their href and target intact", () => {
    const withLink = allComments().find((c) => c.bodyHtml?.includes("familyhandyman"))!;
    expect(withLink.bodyHtml).toContain('target="_blank"');
    expect(withLink.bodyHtml).toContain(
      'href="http://www.familyhandyman.com/doors/repair/fix-sagging-or-sticking-doors/view-all"',
    );
  });

  it("does not decode entities inside comment HTML", () => {
    const withAmp = allComments().filter((c) => c.bodyHtml?.includes("&amp;"));
    expect(withAmp.length).toBeGreaterThan(0);
  });
});

describe("answer options", () => {
  it("splits on comma without treating quotes as CSV delimiters", () => {
    const pipe = allComments().find((c) => c.choiceOptions.some((o) => o.includes('1 1/2')))!;
    expect(pipe.choiceOptions).toEqual(['1 1/2"', '2"', "Unknown", "Drain not present"]);
  });

  it("keeps bare ampersands in option labels", () => {
    const labels = allComments().flatMap((c) => c.choiceOptions);
    expect(labels).toContain("Knob & Tube");
    expect(labels).toContain("Bradford & White");
  });

  it("reads unit options for numeric answers", () => {
    const temp = allComments().find((c) => c.unitOptions.length === 2)!;
    expect(temp.unitOptions).toEqual(["Fahrenheit (F)", "Celsius (C)"]);
  });
});

describe("unsupported and missing content", () => {
  const find = (code: string): ImportIssue[] => preview.issues.filter((i) => i.code === code);

  it("reports the video embed Spectora dropped as missing from the export", () => {
    const lost = find("lost_video_embed");
    expect(lost.length).toBe(1);
    expect(lost[0].origin).toBe("missing");
    expect(lost[0].sourceRow).toBeGreaterThan(1);
    expect(lost[0].rawValue).toContain("youtube-embed-wrapper");
  });

  it("reports unmodelled columns that carry data, as unsupported not missing", () => {
    const issue = find("unmodelled_fields_preserved")[0];
    expect(issue.origin).toBe("unsupported");
    expect(issue.message).toContain("Uses");
  });

  it("preserves unmodelled source values on the comment itself", () => {
    const c = allComments()[0];
    expect(c.extra["Default Estimate Min"]).toBe("10");
    expect(c.extra["Default Estimate Max"]).toBe("1000");
    expect(c.extra["Last Modified"]).toMatch(/^\d{2}\/\d{2}\/\d{4}/);
  });

  it("raises no errors on the sample file", () => {
    expect(preview.issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("works beyond the sample file", () => {
  const grid = (rows: (string | null)[][]) => ({ sheetName: "Sheet1", rows });

  it("imports a minimal three-column export", () => {
    const result = parseGrid(
      grid([
        ["Section Name", "Item Name", "Comment Name"],
        ["Roof", "Coverings", "Missing shingle"],
        ["Roof", "Coverings", "Moss"],
        ["Attic", "Insulation", "Thin"],
      ]),
      "tiny.xlsx",
    );
    expect(result.counts).toMatchObject({ sections: 2, items: 2, comments: 3 });
    expect(result.issues.some((i) => i.code === "column_absent")).toBe(true);
  });

  it("tolerates reordered columns and different parenthetical hints", () => {
    const result = parseGrid(
      grid([
        ["Comment Name", "Order (within item)", "Item Name", "Section Name", "Comment Text"],
        ["Cracked", "3", "Walls", "Interior", "<p>Crack noted.</p>"],
      ]),
      "reordered.xlsx",
    );
    const c = result.template.sections[0].items[0].comments[0];
    expect(result.template.sections[0].name).toBe("Interior");
    expect(c.orderInItem).toBe(3);
    expect(c.bodyHtml).toBe("<p>Crack noted.</p>");
  });

  it("carries a blank Section or Item forward and says that it did", () => {
    const result = parseGrid(
      grid([
        ["Section Name", "Item Name", "Comment Name"],
        ["Roof", "Coverings", "Missing shingle"],
        [null, null, "Moss"],
      ]),
      "grouped.xlsx",
    );
    expect(result.counts.comments).toBe(2);
    expect(result.template.sections).toHaveLength(1);
    expect(result.issues.some((i) => i.code === "hierarchy_carried_forward")).toBe(true);
  });

  it("merges a section that appears in two separate blocks and flags it", () => {
    const result = parseGrid(
      grid([
        ["Section Name", "Item Name", "Comment Name"],
        ["Roof", "Coverings", "A"],
        ["Attic", "Insulation", "B"],
        ["Roof", "Coverings", "C"],
      ]),
      "split.xlsx",
    );
    expect(result.counts.sections).toBe(2);
    expect(result.template.sections[0].items[0].comments.map((c) => c.name)).toEqual(["A", "C"]);
    expect(result.issues.some((i) => i.code === "non_contiguous_section")).toBe(true);
  });

  it("keeps an unknown column and flags it rather than dropping it", () => {
    const result = parseGrid(
      grid([
        ["Section Name", "Item Name", "Comment Name", "Inspector Nickname"],
        ["Roof", "Coverings", "Missing shingle", "shingle-gate"],
      ]),
      "future.xlsx",
    );
    const issue = result.issues.find((i) => i.code === "unknown_column")!;
    expect(issue.origin).toBe("unsupported");
    expect(issue.sourceColumn).toBe("Inspector Nickname");
    expect(result.template.sections[0].items[0].comments[0].extra["Inspector Nickname"]).toBe(
      "shingle-gate",
    );
  });

  it("flags an unrecognised comment type but still imports the row", () => {
    const result = parseGrid(
      grid([
        ["Section Name", "Item Name", "Comment Name", "Comment Type (info, limit, defect)"],
        ["Roof", "Coverings", "Odd", "catastrophe"],
      ]),
      "odd.xlsx",
    );
    expect(result.counts.comments).toBe(1);
    expect(result.template.sections[0].items[0].comments[0].commentType).toBe("catastrophe");
    expect(result.issues.some((i) => i.code === "unexpected_comment_type")).toBe(true);
  });

  it("refuses a spreadsheet with no recognisable hierarchy columns", async () => {
    const reader = new InMemorySheetReader(
      grid([
        ["Date", "Client", "Fee"],
        ["2026-01-01", "Someone", "450"],
      ]),
    );
    await expect(buildImportPreview(new Uint8Array([1]), "invoices.xlsx", reader)).rejects.toMatchObject({
      code: "missing_required_columns",
    });
  });

  it("reports a row it cannot place instead of silently skipping it", () => {
    const result = parseGrid(
      grid([
        ["Section Name", "Item Name", "Comment Name"],
        [null, null, "Orphan with no parent"],
        ["Roof", "Coverings", "Fine"],
      ]),
      "orphan.xlsx",
    );
    expect(result.counts.comments).toBe(1);
    const issue = result.issues.find((i) => i.code === "row_without_hierarchy")!;
    expect(issue.severity).toBe("error");
    expect(issue.sourceRow).toBe(2);
    expect(issue.rawValue).toContain("Orphan");
  });
});

describe("decodeEntities", () => {
  it("decodes in a single pass so double-escaped text is not over-decoded", () => {
    expect(decodeEntities("Roof &amp; Attic")).toBe("Roof & Attic");
    expect(decodeEntities("&amp;lt;p&amp;gt;")).toBe("&lt;p&gt;");
    expect(decodeEntities("&#8217;")).toBe("’");
    expect(decodeEntities("&#x27;")).toBe("'");
    expect(decodeEntities("&notarealentity;")).toBe("&notarealentity;");
  });
});
