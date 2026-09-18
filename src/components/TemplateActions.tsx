"use client";

import { useState, useTransition } from "react";
import { deleteTemplateAction, duplicateTemplateAction } from "@/app/actions";
import { btn } from "@/components/ui";

export function DuplicateButton({
  templateId,
  label = "Duplicate",
  className = btn.secondary,
}: {
  templateId: string;
  label?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => duplicateTemplateAction(templateId))}
      className={className}
    >
      {pending ? "Duplicating" : label}
    </button>
  );
}

export function DeleteButton({ templateId, name }: { templateId: string; name: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  // Two steps rather than a browser confirm() dialog: the second click is the
  // destructive one, and the button says exactly what it will delete.
  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => deleteTemplateAction(templateId))}
          className={`${btn.danger} bg-red-50 text-red-700 hover:bg-red-100`}
          title={`Permanently delete ${name}`}
        >
          {pending ? "Deleting" : "Delete for good"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={btn.quiet}>
          Keep
        </button>
      </span>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className={btn.danger}>
      Delete
    </button>
  );
}
