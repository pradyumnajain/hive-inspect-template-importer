/**
 * Print the parse summary and fidelity report for a Spectora export.
 * Useful for checking a new file without opening the app:
 *
 *   npx tsx scripts/report.mts "sample-data/InterNACHI Residential -2026-09-17.xls"
 */
import { readFile } from "node:fs/promises";
import { buildImportPreview, SpectoraImportError } from "../src/lib/spectora/index.js";

const file = process.argv[2] ?? "sample-data/InterNACHI Residential -2026-09-17.xls";

try {
  const preview = await buildImportPreview(new Uint8Array(await readFile(file)), file.split("/").pop()!);

  console.log(`file      ${file}`);
  console.log(`sheet     ${preview.grid.sheetName}`);
  console.log(`columns   ${preview.sourceHeaders.filter((h) => h !== "").length}`);
  console.log(
    `counts    ${preview.counts.sourceRows} rows -> ${preview.counts.sections} sections, ` +
      `${preview.counts.items} items, ${preview.counts.comments} comments`,
  );
  console.log(`repairs   ${preview.grid.corrections?.length ?? 0} cells`);

  console.log("\nFIDELITY");
  for (const c of preview.fidelity.checks) {
    const mark = c.status === "pass" ? "ok  " : "FAIL";
    console.log(`  ${mark} ${c.id.padEnd(14)} ${String(c.matched).padStart(5)}/${String(c.compared).padEnd(5)} ${c.label}`);
    for (const d of c.discrepancies.slice(0, 3)) {
      console.log(`         row ${d.sourceRow ?? "-"} ${d.sourceColumn ?? ""}: ${d.expected} -> ${d.actual}`);
    }
  }
  console.log(`  ${preview.fidelity.passed}/${preview.fidelity.total} checks, ` +
    `${preview.fidelity.valuesMatched}/${preview.fidelity.valuesCompared} values matched`);

  console.log("\nISSUES");
  for (const i of preview.issues) {
    console.log(`  [${i.severity}/${i.origin}] ${i.code}${i.sourceRow ? ` row ${i.sourceRow}` : ""}`);
    console.log(`      ${i.message}`);
  }
  if (preview.issues.length === 0) console.log("  none");
} catch (error) {
  if (error instanceof SpectoraImportError) {
    console.error(`REFUSED (${error.code}): ${error.message}`);
    if (error.hint) console.error(`HINT: ${error.hint}`);
    process.exit(1);
  }
  throw error;
}
