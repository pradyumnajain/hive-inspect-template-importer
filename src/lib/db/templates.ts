/**
 * Everything that reads or writes a template.
 *
 * Kept apart from the parser so the parser stays testable without a database,
 * and apart from the UI so pages do not build SQL.
 */

import type { FidelityReport } from "@/lib/spectora";
import type { ImportIssue, ParseResult } from "@/lib/spectora";
import { supabaseRead, supabaseWrite } from "./client";

export interface TemplateSummary {
  id: string;
  name: string;
  source_filename: string | null;
  duplicated_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: string;
  name: string;
  name_raw: string;
  body_html: string | null;
  comment_type: string | null;
  category: number | null;
  answer_type: string | null;
  recommendation: string | null;
  position: number;
  order_in_item: number | null;
  source_row: number | null;
  extra: Record<string, string>;
  options: { id: string; kind: "choice" | "unit"; label: string; position: number }[];
}

export interface ItemRow {
  id: string;
  name: string;
  name_raw: string;
  position: number;
  comments: CommentRow[];
}

export interface SectionRow {
  id: string;
  name: string;
  name_raw: string;
  position: number;
  items: ItemRow[];
}

export interface TemplateDetail extends TemplateSummary {
  sections: SectionRow[];
}

export interface StoredIssue extends ImportIssue {
  id: string;
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  const { data, error } = await supabaseRead()
    .from("templates")
    .select("id, name, source_filename, duplicated_from, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not list templates: ${error.message}`);
  return data ?? [];
}

/**
 * Load a whole template in one request.
 *
 * PostgREST resource embedding does the joins, so there is no list of item ids
 * to stuff into a query string (which would break on a large template) and no
 * pagination to get wrong. Ordering is applied in JS because embedded ordering
 * only reaches one level down.
 */
export async function getTemplate(id: string): Promise<TemplateDetail | null> {
  const { data, error } = await supabaseRead()
    .from("templates")
    .select(
      `id, name, source_filename, duplicated_from, created_at, updated_at,
       sections (
         id, name, name_raw, position,
         items (
           id, name, name_raw, position,
           comments (
             id, name, name_raw, body_html, comment_type, category, answer_type,
             recommendation, position, order_in_item, source_row, extra,
             comment_options ( id, kind, label, position )
           )
         )
       )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not load template: ${error.message}`);
  if (!data) return null;

  const raw = data as unknown as TemplateSummary & {
    sections: (Omit<SectionRow, "items"> & {
      items: (Omit<ItemRow, "comments"> & {
        comments: (Omit<CommentRow, "options"> & {
          comment_options: CommentRow["options"];
        })[];
      })[];
    })[];
  };

  const byPosition = <T extends { position: number }>(rows: T[] = []) =>
    [...rows].sort((a, b) => a.position - b.position);

  return {
    id: raw.id,
    name: raw.name,
    source_filename: raw.source_filename,
    duplicated_from: raw.duplicated_from,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    sections: byPosition(raw.sections).map((s) => ({
      id: s.id,
      name: s.name,
      name_raw: s.name_raw,
      position: s.position,
      items: byPosition(s.items).map((i) => ({
        id: i.id,
        name: i.name,
        name_raw: i.name_raw,
        position: i.position,
        comments: byPosition(i.comments).map((c) => ({
          id: c.id,
          name: c.name,
          name_raw: c.name_raw,
          body_html: c.body_html,
          comment_type: c.comment_type,
          category: c.category,
          answer_type: c.answer_type,
          recommendation: c.recommendation,
          position: c.position,
          order_in_item: c.order_in_item,
          source_row: c.source_row,
          extra: (c.extra ?? {}) as Record<string, string>,
          options: byPosition(c.comment_options ?? []),
        })),
      })),
    })),
  };
}


// ------------------------------------------------------------------ import

export interface ImportOutcome {
  templateId: string;
  importRunId: string;
}

/**
 * Write a parsed template, its issues and its fidelity report.
 *
 * supabase-js has no cross-request transaction, so this inserts level by level
 * and deletes the template if any step fails. The cascade makes that cleanup
 * complete, so a failed import leaves nothing behind.
 *
 * ponytail: compensating delete rather than a stored procedure. If import
 * volume or partial-failure risk grows, move the whole insert into one
 * plpgsql function the way duplicate_template already is.
 */
export async function saveImport(
  result: ParseResult,
  fidelity: FidelityReport,
  name?: string,
): Promise<ImportOutcome> {
  const db = supabaseWrite();

  const { data: template, error: tErr } = await db
    .from("templates")
    .insert({
      name: name?.trim() || result.template.name,
      source_filename: result.template.sourceFilename,
      source_format: "spectora-html-text",
    })
    .select("id")
    .single();
  if (tErr || !template) throw new Error(`Could not create template: ${tErr?.message}`);
  const templateId = template.id as string;

  try {
    const { data: sections, error: sErr } = await db
      .from("sections")
      .insert(
        result.template.sections.map((s) => ({
          template_id: templateId,
          name_raw: s.nameRaw,
          name: s.name,
          position: s.position,
          source_row: s.sourceRow,
        })),
      )
      .select("id, position");
    if (sErr) throw new Error(`sections: ${sErr.message}`);
    const sectionIdByPosition = new Map((sections ?? []).map((s) => [s.position as number, s.id as string]));

    const itemPayload = result.template.sections.flatMap((s) =>
      s.items.map((i) => ({
        section_id: sectionIdByPosition.get(s.position)!,
        name_raw: i.nameRaw,
        name: i.name,
        position: i.position,
        source_row: i.sourceRow,
      })),
    );
    const items = await insertChunked(db, "items", itemPayload, "id, section_id, position");
    const itemIdByKey = new Map(items.map((i) => [`${i.section_id}:${i.position}`, i.id as string]));

    const commentPayload = result.template.sections.flatMap((s) =>
      s.items.flatMap((i) => {
        const itemId = itemIdByKey.get(`${sectionIdByPosition.get(s.position)}:${i.position}`)!;
        return i.comments.map((c) => ({
          item_id: itemId,
          name_raw: c.nameRaw,
          name: c.name,
          body_html: c.bodyHtml,
          comment_type: c.commentType,
          category: c.category,
          answer_type: c.answerType,
          recommendation: c.recommendation,
          position: c.position,
          order_in_item: c.orderInItem,
          source_row: c.sourceRow,
          extra: c.extra,
        }));
      }),
    );
    const comments = await insertChunked(db, "comments", commentPayload, "id, item_id, position");
    const commentIdByKey = new Map(comments.map((c) => [`${c.item_id}:${c.position}`, c.id as string]));

    const optionPayload = result.template.sections.flatMap((s) =>
      s.items.flatMap((i) => {
        const itemId = itemIdByKey.get(`${sectionIdByPosition.get(s.position)}:${i.position}`)!;
        return i.comments.flatMap((c) => {
          const commentId = commentIdByKey.get(`${itemId}:${c.position}`)!;
          return [
            ...c.choiceOptions.map((label, position) => ({ comment_id: commentId, kind: "choice", label, position })),
            ...c.unitOptions.map((label, position) => ({ comment_id: commentId, kind: "unit", label, position })),
          ];
        });
      }),
    );
    await insertChunked(db, "comment_options", optionPayload, "id");

    const { data: run, error: rErr } = await db
      .from("import_runs")
      .insert({
        template_id: templateId,
        filename: result.template.sourceFilename,
        stats: { counts: result.counts, headers: result.sourceHeaders, fidelity },
      })
      .select("id")
      .single();
    if (rErr || !run) throw new Error(`import run: ${rErr?.message}`);
    const importRunId = run.id as string;

    if (result.issues.length > 0) {
      await insertChunked(
        db,
        "import_issues",
        result.issues.map((i) => ({
          import_run_id: importRunId,
          severity: i.severity,
          origin: i.origin,
          code: i.code,
          message: i.message,
          source_row: i.sourceRow ?? null,
          source_column: i.sourceColumn ?? null,
          raw_value: i.rawValue ?? null,
        })),
        "id",
      );
    }

    return { templateId, importRunId };
  } catch (error) {
    await db.from("templates").delete().eq("id", templateId);
    throw error;
  }
}

/** Supabase rejects very large single inserts, so send them in batches. */
async function insertChunked(
  db: ReturnType<typeof supabaseWrite>,
  table: string,
  rows: Record<string, unknown>[],
  select: string,
  size = 500,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const { data, error } = await db.from(table).insert(rows.slice(i, i + size)).select(select);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return out;
}

// ------------------------------------------------------------------- reads

export async function getLatestImport(
  templateId: string,
): Promise<{ id: string; filename: string | null; stats: { fidelity?: FidelityReport; counts?: ParseResult["counts"] }; issues: StoredIssue[] } | null> {
  const db = supabaseRead();
  const { data: run, error } = await db
    .from("import_runs")
    .select("id, filename, stats")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load import run: ${error.message}`);
  if (!run) return null;

  const { data: issues, error: iErr } = await db
    .from("import_issues")
    .select("id, severity, origin, code, message, source_row, source_column, raw_value")
    .eq("import_run_id", run.id)
    .order("severity");
  if (iErr) throw new Error(`Could not load import issues: ${iErr.message}`);

  return {
    id: run.id as string,
    filename: run.filename as string | null,
    stats: (run.stats ?? {}) as { fidelity?: FidelityReport },
    issues: (issues ?? []).map((i) => ({
      id: i.id as string,
      severity: i.severity as StoredIssue["severity"],
      origin: i.origin as StoredIssue["origin"],
      code: i.code as string,
      message: i.message as string,
      sourceRow: (i.source_row as number | null) ?? undefined,
      sourceColumn: (i.source_column as string | null) ?? undefined,
      rawValue: (i.raw_value as string | null) ?? undefined,
    })),
  };
}

// --------------------------------------------------------------- mutations

async function touchTemplate(db: ReturnType<typeof supabaseWrite>, templateId: string) {
  await db.from("templates").update({ updated_at: new Date().toISOString() }).eq("id", templateId);
}

export async function renameTemplate(id: string, name: string): Promise<void> {
  const db = supabaseWrite();
  const { error } = await db.from("templates").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Could not rename template: ${error.message}`);
}

export async function renameSection(sectionId: string, name: string, templateId: string): Promise<void> {
  const db = supabaseWrite();
  const { error } = await db.from("sections").update({ name }).eq("id", sectionId);
  if (error) throw new Error(`Could not rename section: ${error.message}`);
  await touchTemplate(db, templateId);
}

export async function renameItem(itemId: string, name: string, templateId: string): Promise<void> {
  const db = supabaseWrite();
  const { error } = await db.from("items").update({ name }).eq("id", itemId);
  if (error) throw new Error(`Could not rename item: ${error.message}`);
  await touchTemplate(db, templateId);
}

export async function updateComment(
  commentId: string,
  patch: { name?: string; body_html?: string | null },
  templateId: string,
): Promise<void> {
  const db = supabaseWrite();
  const { error } = await db.from("comments").update(patch).eq("id", commentId);
  if (error) throw new Error(`Could not save comment: ${error.message}`);
  await touchTemplate(db, templateId);
}

/** Deep copy via the SQL function, so it is atomic and shares no rows. */
export async function duplicateTemplate(id: string, newName?: string): Promise<string> {
  const { data, error } = await supabaseWrite().rpc("duplicate_template", {
    p_template_id: id,
    p_new_name: newName ?? null,
  });
  if (error) throw new Error(`Could not duplicate template: ${error.message}`);
  return data as string;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabaseWrite().from("templates").delete().eq("id", id);
  if (error) throw new Error(`Could not delete template: ${error.message}`);
}
