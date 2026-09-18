"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

interface Props {
  initialValue: string;
  onSave: (value: string) => Promise<ActionResult>;
  label: string;
  multiline?: boolean;
  className?: string;
  rows?: number;
  placeholder?: string;
}

/**
 * One editable value with an explicit Save.
 *
 * Save is deliberate rather than automatic on blur: the reviewer, and the
 * inspector, should be able to see a change being committed.
 */
export function EditableField({
  initialValue,
  onSave,
  label,
  multiline = false,
  className = "",
  rows = 6,
  placeholder,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = value !== saved;

  function commit() {
    if (!dirty || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await onSave(value);
      if (result.ok) {
        setSaved(value);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
      } else {
        setError(result.error);
      }
    });
  }

  const shared =
    "w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 " +
    (dirty ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white");

  return (
    <div className={className}>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea
            aria-label={label}
            className={`${shared} font-mono`}
            rows={rows}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <input
            aria-label={label}
            className={shared}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") setValue(saved);
            }}
          />
        )}
        <button
          type="button"
          onClick={commit}
          disabled={!dirty || pending}
          className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving" : "Save"}
        </button>
      </div>
      {justSaved && <p className="mt-1 text-xs text-emerald-700">Saved to the database.</p>}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
