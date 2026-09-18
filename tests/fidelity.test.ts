/**
 * Tests for the Import Fidelity Report.
 *
 * Two things matter here. The report must pass on the real export, and it must
 * actually fail when preservation breaks. A validator that always says "pass"
 * is worse than no validator, so several cases deliberately corrupt the data
 * and assert the report notices.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { buildFidelityReport, buildImportPreview, parseGrid, type ImportPreview } from "@/lib/spectora";
import type { RawGrid } from "@/lib/spectora";

const SAMPLE = path.join(process.cwd(), "sample-data", "InterNACHI Residential -2026-09-17.xls");

let preview: ImportPreview;

beforeAll(async () => {
  const bytes = new Uint8Array(await readFile(SAMPLE));
  preview = await buildImportPreview(bytes, "InterNACHI Residential -2026-09-17.xls");
}, 60_000);

const grid = (rows: (string | null)[][]): RawGrid => ({ sheetName: "Sheet1", rows });

const HEADER = [
  "Section Name",
  "Item Name",
  "Comment Name",
  "Comment Text",
  "Multiple Choice Options (comma-separated)",
  "Uses",
];

describe("fidelity on the real export", () => {
  it("passes every check", () => {
    const failed = preview.fidelity.checks.filter((c) => c.status === "fail");
    expect(failed.map((c) => `${c.id}: ${JSON.stringify(c.discrepancies[0])}`)).toEqual([]);
    expect(preview.fidelity.passed).toBe(preview.fidelity.total);
  });

  it("compares a meaningful number of values, not zero", () => {
    expect(preview.fidelity.valuesCompared).toBeGreaterThan(3000);
    expect(preview.fidelity.valuesMatched).toBe(preview.fidelity.valuesCompared);
  });

  it("covers every dimension the customer cares about", () => {
    expect(preview.fidelity.checks.map((c) => c.id).sort()).toEqual(
      [
        "comment_text",
        "comments",
        "extra_fields",
        "hierarchy",
        "html",
        "items",
        "options",
        "ordering",
        "rows",
        "sections",
        "source_fields",
      ].sort(),
    );
  });

  it("confirms the 86 links and their targets survived", () => {
    const html = preview.fidelity.checks.find((c) => c.id === "html")!;
    expect(html.compared).toBe(198);
    expect(html.status).toBe("pass");
  });
});

describe("the report fails when preservation breaks", () => {
  const source = grid([
    HEADER,
    ["Roof", "Coverings", "Missing shingle", "<p>Gone &amp; lost</p>", "Yes, No", "0"],
    ["Roof", "Coverings", "Moss", "<p>Green</p>", "", "0"],
  ]);

  const baseline = () => parseGrid(source, "t.xlsx");

  it("passes when nothing was touched", () => {
    const report = buildFidelityReport(source, baseline());
    expect(report.passed).toBe(report.total);
  });

  it("catches rewritten comment text and names the source cell", () => {
    const result = baseline();
    result.template.sections[0].items[0].comments[0].bodyHtml = "<p>Gone & lost</p>";
    const report = buildFidelityReport(source, result);
    const check = report.checks.find((c) => c.id === "comment_text")!;
    expect(check.status).toBe("fail");
    expect(check.discrepancies[0].sourceRow).toBe(2);
    expect(check.discrepancies[0].sourceColumn).toBe("Comment Text");
  });

  it("catches a dropped comment", () => {
    const result = baseline();
    result.template.sections[0].items[0].comments.pop();
    const report = buildFidelityReport(source, result);
    expect(report.checks.find((c) => c.id === "rows")!.status).toBe("fail");
    expect(report.checks.find((c) => c.id === "rows")!.discrepancyCount).toBe(1);
  });

  it("catches reordered comments", () => {
    const result = baseline();
    result.template.sections[0].items[0].comments.reverse();
    const report = buildFidelityReport(source, result);
    expect(report.checks.find((c) => c.id === "ordering")!.status).toBe("fail");
  });

  it("catches a renamed section", () => {
    const result = baseline();
    result.template.sections[0].nameRaw = "Rooof";
    const report = buildFidelityReport(source, result);
    expect(report.checks.find((c) => c.id === "sections")!.status).toBe("fail");
  });

  it("catches a lost multiple choice option", () => {
    const result = baseline();
    result.template.sections[0].items[0].comments[0].choiceOptions = ["Yes"];
    const report = buildFidelityReport(source, result);
    const check = report.checks.find((c) => c.id === "options")!;
    expect(check.status).toBe("fail");
    expect(check.discrepancies[0].expected).toBe("Yes | No");
    expect(check.discrepancies[0].actual).toBe("Yes");
  });

  it("does not flag a blank Section or Item that was carried forward", () => {
    // The parser inherits a blank hierarchy cell from the row above and says so.
    // The fidelity walk has to inherit the same way, or it reports documented
    // behaviour as data loss.
    const carried = grid([
      HEADER,
      ["Roof", "Coverings", "Missing shingle", "<p>a</p>", "", "0"],
      [null, null, "Moss", "<p>b</p>", "", "0"],
    ]);
    const report = buildFidelityReport(carried, parseGrid(carried, "carried.xlsx"));
    expect(report.checks.find((c) => c.id === "hierarchy")!.status).toBe("pass");
    expect(report.passed).toBe(report.total);
  });

  it("catches a dropped unsupported column value", () => {
    const result = baseline();
    delete result.template.sections[0].items[0].comments[0].extra["Uses"];
    const report = buildFidelityReport(source, result);
    const check = report.checks.find((c) => c.id === "extra_fields")!;
    expect(check.status).toBe("fail");
    expect(check.discrepancies[0].sourceColumn).toBe("Uses");
  });
});
