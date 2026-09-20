"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { btn } from "@/components/ui";
import { useTrackUnsaved } from "@/components/unsaved";

interface Props {
  initialValue: string;
  onSave: (value: string) => Promise<ActionResult>;
  /** Fires on every keystroke, so a caller can render a live preview. */
  onValueChange?: (value: string) => void;
  label: string;
  multiline?: boolean;
  className?: string;
  rows?: number;
  placeholder?: string;
  /** `title` is the big editable heading at the top of a template. */
  size?: "title" | "heading" | "body";
}

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  title: "text-xl font-semibold tracking-tight",
  heading: "text-sm font-medium",
  body: "text-sm",
};

/**
 * One editable value.
 *
 * Save appears only once the value has actually changed. With hundreds of
 * comments on screen a permanent row of disabled Save buttons made the page
 * read as a database form rather than a document, so the control stays out of
 * the way until it has something to do.
 *
 * Saving is still per field and immediate, which is what the backend does.
 */
export function EditableField({
  initialValue,
  onSave,
  onValueChange,
  label,
  multiline = false,
  className = "",
  rows = 8,
  placeholder,
  size = "body",
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const dirty = value !== saved;

  // Let the page know this field is holding an unsaved edit, so leaving
  // the page can warn instead of discarding it silently.
  // `commit` is a hoisted declaration, so registering it here is fine.
  useTrackUnsaved(useId(), dirty, commit);

  function change(next: string) {
    setValue(next);
    onValueChange?.(next);
  }

  function commit() {
    if (!dirty || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await onSave(value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(value);
      setJustSaved(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setJustSaved(false), 2400);
    });
  }

  // Reads as text until you touch it, so a page of editable names does not
  // look like a page of form inputs.
  const field =
    `w-full rounded-md border px-2.5 py-1.5 text-slate-900 transition-colors ` +
    `placeholder:text-slate-400 focus:outline-none ${SIZES[size]} ` +
    (dirty
      ? "border-amber-400 bg-amber-50"
      : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white focus:border-slate-900 focus:bg-white");

  return (
    <div className={className}>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea
            aria-label={label}
            className={`${field} resize-y border-slate-200 bg-white font-mono text-[13px] leading-relaxed`}
            rows={rows}
            value={value}
            placeholder={placeholder}
            onChange={(e) => change(e.target.value)}
          />
        ) : (
          <input
            aria-label={label}
            className={field}
            value={value}
            placeholder={placeholder}
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setValue(saved);
                setError(null);
              }
            }}
          />
        )}

        {/* Reserve no space when there is nothing to do. */}
        {(dirty || pending) && (
          <button
            type="button"
            onClick={commit}
            disabled={pending}
            className={`${btn.secondary} mt-px shrink-0`}
          >
            {pending ? "Saving" : "Save"}
          </button>
        )}
      </div>

      {justSaved && !dirty && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700">
          <Check /> Saved
        </p>
      )}
      {dirty && !pending && !error && (
        <p className="mt-1 text-xs text-slate-500">
          Not saved yet. Press {multiline ? "Save" : "Enter or Save"} to keep this change.
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-700">
          Not saved. {error}
        </p>
      )}
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
      <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
