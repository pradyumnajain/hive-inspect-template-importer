"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
  nextCopyName,
  renameItem,
  renameSection,
  renameTemplate,
  updateComment,
} from "@/lib/db/templates";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function guard(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function saveSectionName(
  templateId: string,
  sectionId: string,
  name: string,
): Promise<ActionResult> {
  const result = await guard(() => renameSection(sectionId, name, templateId));
  if (result.ok) revalidatePath(`/templates/${templateId}`);
  return result;
}

export async function saveItemName(
  templateId: string,
  itemId: string,
  name: string,
): Promise<ActionResult> {
  const result = await guard(() => renameItem(itemId, name, templateId));
  if (result.ok) revalidatePath(`/templates/${templateId}`);
  return result;
}

export async function saveCommentName(
  templateId: string,
  commentId: string,
  name: string,
): Promise<ActionResult> {
  const result = await guard(() => updateComment(commentId, { name }, templateId));
  if (result.ok) revalidatePath(`/templates/${templateId}`);
  return result;
}

export async function saveCommentBody(
  templateId: string,
  commentId: string,
  bodyHtml: string,
): Promise<ActionResult> {
  const result = await guard(() =>
    updateComment(commentId, { body_html: bodyHtml === "" ? null : bodyHtml }, templateId),
  );
  if (result.ok) revalidatePath(`/templates/${templateId}`);
  return result;
}

export async function saveTemplateName(templateId: string, name: string): Promise<ActionResult> {
  const result = await guard(() => renameTemplate(templateId, name));
  if (result.ok) {
    revalidatePath(`/templates/${templateId}`);
    revalidatePath("/");
  }
  return result;
}

export async function duplicateTemplateAction(templateId: string): Promise<void> {
  const templates = await listTemplates();
  const source = templates.find((t) => t.id === templateId);
  const name = source ? nextCopyName(source.name, templates.map((t) => t.name)) : undefined;

  const newId = await duplicateTemplate(templateId, name);
  revalidatePath("/");
  // `copied` tells the new template's page to confirm what just happened,
  // since a silent redirect leaves the user guessing whether it worked.
  redirect(`/templates/${newId}?copied=1`);
}

export async function deleteTemplateAction(templateId: string): Promise<void> {
  await deleteTemplate(templateId);
  revalidatePath("/");
  redirect("/");
}
