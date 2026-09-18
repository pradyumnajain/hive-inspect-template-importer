"use client";

import { useTransition } from "react";
import { deleteTemplateAction, duplicateTemplateAction } from "@/app/actions";

export function DuplicateButton({ templateId, label = "Duplicate" }: { templateId: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => duplicateTemplateAction(templateId))}
      className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-50"
    >
      {pending ? "Copying..." : label}
    </button>
  );
}

export function DeleteButton({ templateId, name }: { templateId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete "${name}" and everything in it? This cannot be undone.`)) return;
        start(() => deleteTemplateAction(templateId));
      }}
      className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}
