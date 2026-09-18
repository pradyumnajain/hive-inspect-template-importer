/**
 * Import the committed sample export into the configured database.
 *
 * The deployed app is expected to open on an already-imported template, so
 * this is what puts it there:
 *
 *   npm run seed
 *
 * Safe to re-run: it skips seeding if a template with the same source filename
 * already exists, unless you pass --force to import another copy.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildImportPreview } from "../src/lib/spectora/index.js";
import { listTemplates, saveImport } from "../src/lib/db/templates.js";
import { isConfigured } from "../src/lib/db/client.js";

const SAMPLE = path.join(process.cwd(), "sample-data", "InterNACHI Residential -2026-09-17.xls");
const force = process.argv.includes("--force");

if (!isConfigured()) {
  console.error(
    "Supabase environment variables are missing. Copy .env.example to .env.local and fill it in,\n" +
      "then run: npm run seed",
  );
  process.exit(1);
}

const filename = path.basename(SAMPLE);
const existing = await listTemplates();
const already = existing.find((t) => t.source_filename === filename);

if (already && !force) {
  console.log(`Already seeded: "${already.name}" (${already.id}). Pass --force to import another copy.`);
  process.exit(0);
}

const preview = await buildImportPreview(new Uint8Array(await readFile(SAMPLE)), filename);
const { templateId } = await saveImport(preview, preview.fidelity);

console.log(
  `Seeded "${preview.template.name}": ${preview.counts.sections} sections, ` +
    `${preview.counts.items} items, ${preview.counts.comments} comments.`,
);
console.log(
  `Fidelity ${preview.fidelity.passed}/${preview.fidelity.total} checks, ` +
    `${preview.fidelity.valuesMatched}/${preview.fidelity.valuesCompared} values matched.`,
);
console.log(`Issues: ${preview.issues.length}`);
console.log(`Open /templates/${templateId}`);
