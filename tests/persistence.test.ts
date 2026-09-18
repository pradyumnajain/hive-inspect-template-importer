/**
 * Database tests: real persistence, real editing, real independent copies.
 *
 * These talk to an actual Postgres through PostgREST, so they are opt-in:
 * they only run when RUN_DB_TESTS=1 and the Supabase variables are set. That
 * keeps `npm test` fast and offline by default, and stops the suite from ever
 * writing to someone's production project by accident.
 *
 * To run them:
 *   RUN_DB_TESTS=1 npm test
 *
 * Every template these tests create is deleted afterwards.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildImportPreview } from "@/lib/spectora";
import {
  deleteTemplate,
  duplicateTemplate,
  getLatestImport,
  getTemplate,
  listTemplates,
  renameItem,
  renameSection,
  saveImport,
  updateComment,
  type TemplateDetail,
} from "@/lib/db/templates";

const enabled =
  process.env.RUN_DB_TESTS === "1" &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const SAMPLE = path.join(process.cwd(), "sample-data", "InterNACHI Residential -2026-09-17.xls");

describe.skipIf(!enabled)("persistence", () => {
  const created: string[] = [];
  let templateId: string;
  let loaded: TemplateDetail;

  beforeAll(async () => {
    const bytes = new Uint8Array(await readFile(SAMPLE));
    const preview = await buildImportPreview(bytes, "InterNACHI Residential -2026-09-17.xls");
    const outcome = await saveImport(preview, preview.fidelity, "TEST original");
    templateId = outcome.templateId;
    created.push(templateId);
    loaded = (await getTemplate(templateId))!;
  }, 180_000);

  afterAll(async () => {
    for (const id of created) await deleteTemplate(id).catch(() => {});
  }, 60_000);

  it("stores and reads back the whole hierarchy", () => {
    expect(loaded.sections).toHaveLength(13);
    expect(loaded.sections.reduce((n, s) => n + s.items.length, 0)).toBe(69);
    expect(loaded.sections.reduce((n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0), 0)).toBe(392);
  });

  it("reads back in the original spreadsheet order", () => {
    const rows = loaded.sections.flatMap((s) => s.items.flatMap((i) => i.comments.map((c) => c.source_row!)));
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
  });

  it("keeps the raw and decoded forms of an escaped section name", () => {
    const section = loaded.sections.find((s) => s.name_raw.includes("&amp;"))!;
    expect(section.name_raw).toContain("&amp;");
    expect(section.name).toContain(" & ");
  });

  it("keeps comment HTML byte for byte", async () => {
    const withLink = loaded.sections
      .flatMap((s) => s.items.flatMap((i) => i.comments))
      .find((c) => c.body_html?.includes("familyhandyman"))!;
    expect(withLink.body_html).toContain('target="_blank"');
    expect(withLink.body_html).toContain(" ");
  });

  it("keeps choice options including the one containing a double quote", () => {
    const labels = loaded.sections
      .flatMap((s) => s.items.flatMap((i) => i.comments.flatMap((c) => c.options.map((o) => o.label))));
    expect(labels).toContain('1 1/2"');
    expect(labels).toContain("Knob & Tube");
  });

  it("keeps unsupported source columns in extra", () => {
    const first = loaded.sections[0].items[0].comments[0];
    expect(first.extra["Default Estimate Min"]).toBe("10");
    expect(first.extra["Last Modified"]).toBeDefined();
  });

  it("stores the import run, its fidelity report and its issues", async () => {
    const run = await getLatestImport(templateId);
    expect(run).not.toBeNull();
    expect(run!.stats.fidelity!.passed).toBe(run!.stats.fidelity!.total);
    expect(run!.issues.some((i) => i.code === "lost_video_embed" && i.origin === "missing")).toBe(true);
    expect(run!.issues.some((i) => i.origin === "unsupported")).toBe(true);
  });

  it("persists edits to sections, items and comments across a fresh read", async () => {
    const section = loaded.sections[1];
    const item = section.items[0];
    const comment = item.comments[0];

    await renameSection(section.id, "Exterior (renamed)", templateId);
    await renameItem(item.id, "General (renamed)", templateId);
    await updateComment(comment.id, { name: "Renamed comment", body_html: "<p>Edited body</p>" }, templateId);

    const again = (await getTemplate(templateId))!;
    const s = again.sections.find((x) => x.id === section.id)!;
    expect(s.name).toBe("Exterior (renamed)");
    expect(s.items.find((x) => x.id === item.id)!.name).toBe("General (renamed)");
    const c = s.items.find((x) => x.id === item.id)!.comments.find((x) => x.id === comment.id)!;
    expect(c.name).toBe("Renamed comment");
    expect(c.body_html).toBe("<p>Edited body</p>");

    // the raw import value is untouched by editing
    expect(s.name_raw).toBe(section.name_raw);
  });
});

describe.skipIf(!enabled)("duplication is independent", () => {
  const created: string[] = [];
  let originalId: string;
  let copyId: string;

  beforeAll(async () => {
    const bytes = new Uint8Array(await readFile(SAMPLE));
    const preview = await buildImportPreview(bytes, "InterNACHI Residential -2026-09-17.xls");
    originalId = (await saveImport(preview, preview.fidelity, "TEST copy-source")).templateId;
    created.push(originalId);
    copyId = await duplicateTemplate(originalId, "TEST copy");
    created.push(copyId);
  }, 180_000);

  afterAll(async () => {
    for (const id of created) await deleteTemplate(id).catch(() => {});
  }, 60_000);

  it("copies every level", async () => {
    const original = (await getTemplate(originalId))!;
    const copy = (await getTemplate(copyId))!;
    const count = (t: TemplateDetail) => ({
      sections: t.sections.length,
      items: t.sections.reduce((n, s) => n + s.items.length, 0),
      comments: t.sections.reduce((n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0), 0),
      options: t.sections.reduce(
        (n, s) => n + s.items.reduce((m, i) => m + i.comments.reduce((k, c) => k + c.options.length, 0), 0),
        0,
      ),
    });
    expect(count(copy)).toEqual(count(original));
    expect(copy.duplicated_from).toBe(originalId);
  });

  it("shares no row ids with the original", async () => {
    const original = (await getTemplate(originalId))!;
    const copy = (await getTemplate(copyId))!;
    const ids = (t: TemplateDetail) =>
      new Set([
        ...t.sections.map((s) => s.id),
        ...t.sections.flatMap((s) => s.items.map((i) => i.id)),
        ...t.sections.flatMap((s) => s.items.flatMap((i) => i.comments.map((c) => c.id))),
      ]);
    const a = ids(original);
    const b = ids(copy);
    expect([...b].filter((id) => a.has(id))).toEqual([]);
  });

  it("leaves the original completely unchanged when the copy is edited", async () => {
    const before = (await getTemplate(originalId))!;
    const copy = (await getTemplate(copyId))!;

    const section = copy.sections[0];
    const item = section.items[0];
    const comment = item.comments[0];
    await renameSection(section.id, "COPY ONLY section", copyId);
    await renameItem(item.id, "COPY ONLY item", copyId);
    await updateComment(comment.id, { name: "COPY ONLY comment", body_html: "<p>copy only</p>" }, copyId);

    const after = (await getTemplate(originalId))!;
    expect(JSON.stringify(after.sections)).toBe(JSON.stringify(before.sections));

    const changed = (await getTemplate(copyId))!;
    expect(changed.sections[0].name).toBe("COPY ONLY section");
    expect(changed.sections[0].items[0].name).toBe("COPY ONLY item");
    expect(changed.sections[0].items[0].comments[0].body_html).toBe("<p>copy only</p>");
  });

  it("deleting the copy leaves the original intact", async () => {
    const before = (await getTemplate(originalId))!;
    await deleteTemplate(copyId);
    created.splice(created.indexOf(copyId), 1);

    const after = (await getTemplate(originalId))!;
    expect(after.sections.length).toBe(before.sections.length);
    expect((await listTemplates()).some((t) => t.id === copyId)).toBe(false);
  });
});
