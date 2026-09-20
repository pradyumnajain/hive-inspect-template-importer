"use client";

import { useState } from "react";

import { EditableField } from "@/components/EditableField";
import { SafeHtml } from "@/components/SafeHtml";
import { saveCommentBody, saveCommentName } from "@/app/actions";
import { toPlainText } from "@/lib/sanitize";
import { btn, chip } from "@/components/ui";

/** The rendered comment body, used in both the reading and editing views. */
const RENDERED =
  "min-h-10 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed " +
  "text-slate-700 [&_a]:text-teal-700 [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold";
import type { CommentRow } from "@/lib/db/templates";

const TYPE_STYLE: Record<string, string> = {
  defect: "bg-red-50 text-red-700",
  limit: "bg-amber-50 text-amber-800",
  info: "bg-slate-100 text-slate-600",
};

const SEVERITY: Record<string, string> = { "-1": "Low", "0": "Medium", "1": "High" };

/**
 * One comment: the unit the inspector actually edits.
 *
 * The face of the row carries only what helps them find it again, its name and
 * how it is answered. Everything that came out of the spreadsheet lives one
 * disclosure down, because it has to stay inspectable for the preservation
 * requirement but it is not what they came here to change.
 *
 * Both disclosures build their contents only once opened. A template has
 * hundreds of comments, and rendering every editor, preview and source table
 * up front for content that starts collapsed put the structure page at nearly
 * 5 MB. The data for a comment is a couple of kilobytes; the markup for one
 * was thirteen. Nothing is fetched late here, only rendered late, so opening a
 * disclosure is instant and offline-safe.
 */
export function CommentCard({ comment, templateId }: { comment: CommentRow; templateId: string }) {
  const [textOpen, setTextOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  // Opening a comment shows the text as it will read. The markup underneath is
  // only revealed to someone who has said they want to change it.
  const [editing, setEditing] = useState(false);
  // The in-progress text, so the preview shows what you are typing rather than
  // what was last saved. Without this the panel would quietly lie while you
  // edit, which is what makes editing markup feel unsafe.
  const [draft, setDraft] = useState(comment.body_html ?? "");

  const choices = comment.options.filter((o) => o.kind === "choice");
  const units = comment.options.filter((o) => o.kind === "unit");
  const extraKeys = Object.keys(comment.extra);
  const sourceFieldCount = choices.length + units.length + extraKeys.length + 1;
  const excerpt = comment.body_html ? toPlainText(comment.body_html, 120) : "";

  return (
    <li
      data-node="comment"
      data-search={comment.name.toLowerCase()}
      className="border-t border-slate-100 py-3 first:border-t-0"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <EditableField
            label="Comment name"
            size="heading"
            initialValue={comment.name}
            placeholder="Untitled comment"
            onSave={(value) => saveCommentName(templateId, comment.id, value)}
          />
        </div>
        <div className="mt-1.5 flex shrink-0 items-center gap-1">
          {comment.comment_type && (
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                TYPE_STYLE[comment.comment_type] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {comment.comment_type}
            </span>
          )}
          {comment.answer_type && <span className={chip}>{comment.answer_type}</span>}
        </div>
      </div>

      <details
        className="group mt-1"
        onToggle={(e) => {
          const open = e.currentTarget.open;
          setTextOpen(open);
          // Collapsing returns the comment to its reading state.
          if (!open) setEditing(false);
        }}
      >
        <summary className="flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700">
          <Chevron />
          <span className="group-open:hidden">
            {excerpt ? (
              <span className="text-slate-600">{excerpt}</span>
            ) : (
              <span className="italic">No comment text</span>
            )}
          </span>
          <span className="hidden group-open:inline">Comment text</span>
        </summary>

        {textOpen &&
          (editing ? (
            <div className="mt-2 grid gap-3 pl-2 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Text, as Spectora wrote it
                </p>
                <EditableField
                  label="Comment text"
                  multiline
                  rows={9}
                  placeholder="No comment text. Type here to add some."
                  initialValue={comment.body_html ?? ""}
                  onValueChange={setDraft}
                  onSave={(value) => saveCommentBody(templateId, comment.id, value)}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  How it will read
                </p>
                {draft.trim() ? (
                  <SafeHtml html={draft} className={RENDERED} />
                ) : (
                  <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
                    Nothing yet.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 pl-2">
              {comment.body_html ? (
                <SafeHtml html={comment.body_html} className={RENDERED} />
              ) : (
                <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
                  No comment text.
                </p>
              )}
              <button type="button" onClick={() => setEditing(true)} className={`${btn.secondary} mt-2`}>
                {comment.body_html ? "Edit text" : "Add text"}
              </button>
            </div>
          ))}
      </details>

      <details className="group/src mt-0.5" onToggle={(e) => setSourceOpen(e.currentTarget.open)}>
        <summary className="flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-600">
          <Chevron className="group-open/src:rotate-90" />
          Source details
          <span className="font-mono text-[11px]">({sourceFieldCount})</span>
        </summary>

        {sourceOpen && (
          <dl className="mt-1.5 ml-2 space-y-1.5 border-l border-slate-100 pl-4 text-xs">
            <Row
              label="Spreadsheet row"
              value={comment.source_row === null ? null : `${comment.source_row}`}
            />
            <Row label="Comment type" value={comment.comment_type} />
            <Row
              label="Severity"
              value={
                comment.category === null
                  ? null
                  : (SEVERITY[String(comment.category)] ?? String(comment.category))
              }
            />
            <Row label="Answer type" value={comment.answer_type} />
            <Row label="Recommendation" value={comment.recommendation} />
            <Row
              label="Order in item"
              value={comment.order_in_item === null ? null : `${comment.order_in_item}`}
              hint="Spectora's own value. Kept as data; it repeats and skips, so it is not used for sorting."
            />
            {choices.length > 0 && (
              <Options label="Choice options" options={choices.map((o) => o.label)} />
            )}
            {units.length > 0 && <Options label="Unit options" options={units.map((o) => o.label)} />}
            {extraKeys.map((key) => (
              <Row key={key} label={key} value={comment.extra[key]} />
            ))}
          </dl>
        )}
      </details>
    </li>
  );
}

function Row({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-3">
      <dt className="truncate text-slate-400" title={hint ?? label}>
        {label}
      </dt>
      <dd className={value === null ? "text-slate-300" : "font-mono text-slate-600"}>
        {value ?? "not set"}
      </dd>
    </div>
  );
}

function Options({ label, options }: { label: string; options: string[] }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="flex flex-wrap gap-1">
        {options.map((o, i) => (
          <span key={`${o}-${i}`} className={chip}>
            {o}
          </span>
        ))}
      </dd>
    </div>
  );
}

function Chevron({ className = "group-open:rotate-90" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`h-2.5 w-2.5 shrink-0 fill-none stroke-current stroke-2 transition-transform ${className}`}
    >
      <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
