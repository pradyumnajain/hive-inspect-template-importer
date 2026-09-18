import { EditableField } from "@/components/EditableField";
import { saveCommentBody, saveCommentName } from "@/app/actions";
import { sanitizeCommentHtml } from "@/lib/sanitize";
import type { CommentRow } from "@/lib/db/templates";

const TYPE_STYLE: Record<string, string> = {
  defect: "bg-red-100 text-red-800",
  limit: "bg-amber-100 text-amber-800",
  info: "bg-sky-100 text-sky-800",
};

const CATEGORY_LABEL: Record<string, string> = { "-1": "Low", "0": "Medium", "1": "High" };

export function CommentCard({ comment, templateId }: { comment: CommentRow; templateId: string }) {
  const choices = comment.options.filter((o) => o.kind === "choice");
  const units = comment.options.filter((o) => o.kind === "unit");
  const extraKeys = Object.keys(comment.extra);

  return (
    <li className="rounded border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-mono text-slate-400">row {comment.source_row ?? "?"}</span>
        {comment.comment_type && (
          <span className={`rounded px-1.5 py-0.5 font-medium ${TYPE_STYLE[comment.comment_type] ?? "bg-slate-100"}`}>
            {comment.comment_type}
          </span>
        )}
        {comment.category !== null && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5">
            severity {CATEGORY_LABEL[String(comment.category)] ?? comment.category}
          </span>
        )}
        {comment.answer_type && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5">{comment.answer_type}</span>
        )}
        {comment.recommendation && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5">rec: {comment.recommendation}</span>
        )}
        <span className="rounded bg-slate-100 px-1.5 py-0.5" title="Spectora's own Order value, kept but not used for sorting">
          order {comment.order_in_item ?? "-"}
        </span>
      </div>

      <div className="mt-2">
        <EditableField
          label="Comment name"
          initialValue={comment.name}
          onSave={saveCommentName.bind(null, templateId, comment.id)}
        />
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-600">Comment text</summary>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <EditableField
            label="Comment text"
            multiline
            rows={8}
            placeholder="This comment has no text."
            initialValue={comment.body_html ?? ""}
            onSave={saveCommentBody.bind(null, templateId, comment.id)}
          />
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Rendered</p>
            {comment.body_html ? (
              <div
                className="prose-sm space-y-2 text-sm [&_a]:text-sky-700 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(comment.body_html) }}
              />
            ) : (
              <p className="text-sm text-slate-400">No text.</p>
            )}
          </div>
        </div>
      </details>

      {(choices.length > 0 || units.length > 0 || extraKeys.length > 0) && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-600">
            Preserved source fields ({choices.length + units.length + extraKeys.length})
          </summary>
          <div className="mt-2 space-y-2 text-xs">
            {choices.length > 0 && (
              <div>
                <p className="text-slate-500">Multiple choice options</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {choices.map((o) => (
                    <span key={o.id} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                      {o.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {units.length > 0 && (
              <div>
                <p className="text-slate-500">Unit options</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {units.map((o) => (
                    <span key={o.id} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                      {o.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {extraKeys.length > 0 && (
              <div>
                <p className="text-slate-500">
                  Stored from the export, not editable here
                </p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
                  {extraKeys.map((key) => (
                    <div key={key} className="contents">
                      <dt className="text-slate-500">{key}</dt>
                      <dd className="truncate">{comment.extra[key]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </details>
      )}
    </li>
  );
}
