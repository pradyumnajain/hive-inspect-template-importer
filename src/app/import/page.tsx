"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FidelityPanel } from "@/components/FidelityPanel";
import { IssueList } from "@/components/IssueList";
import { btn, card, input } from "@/components/ui";
import type { ApiError, PreviewPayload } from "@/lib/import-payload";

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [name, setName] = useState("");
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);

  async function analyse(chosen: File) {
    setBusy("preview");
    setFailure(null);
    setPreview(null);
    const body = new FormData();
    body.set("file", chosen);
    const response = await fetch("/api/import/preview", { method: "POST", body });
    const json = await response.json();
    setBusy(null);
    if (!response.ok) return setFailure(json as ApiError);
    const payload = json as PreviewPayload;
    setPreview(payload);
    setName(payload.suggestedName);
  }

  async function commit() {
    if (!file) return;
    setBusy("commit");
    setFailure(null);
    const body = new FormData();
    body.set("file", file);
    body.set("name", name);
    const response = await fetch("/api/import/commit", { method: "POST", body });
    const json = await response.json();
    setBusy(null);
    if (!response.ok) return setFailure(json as ApiError);
    router.push(`/templates/${json.templateId}`);
  }

  const errorCount = preview?.issues.filter((i) => i.severity === "error").length ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Import a template</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
          Upload the file from Spectora&rsquo;s{" "}
          <span className="font-medium text-slate-800">Export to spreadsheet &rarr; Export HTML Text</span>.
          You will see exactly what survived before anything is saved.
        </p>
      </header>

      <div className={`${card} px-5 py-4`}>
        <label className="block text-sm font-medium text-slate-900" htmlFor="file">
          Spectora export
        </label>
        <input
          id="file"
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            setFile(chosen);
            setPreview(null);
            setFailure(null);
            if (chosen) void analyse(chosen);
          }}
        />
        {busy === "preview" && (
          <p className="mt-2.5 flex items-center gap-2 text-sm text-slate-600">
            <Spinner /> Reading the workbook
          </p>
        )}
      </div>

      {failure && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
          <h2 className="text-sm font-semibold text-red-900">This file was not imported</h2>
          <p className="mt-1.5 text-sm text-red-900">{failure.error}</p>
          {failure.hint && <p className="mt-2 text-sm leading-relaxed text-red-800">{failure.hint}</p>}
          {failure.code && <p className="mt-2.5 font-mono text-[11px] text-red-600">{failure.code}</p>}
        </div>
      )}

      {preview && (
        <>
          <section className={`${card} px-5 py-4`}>
            <h2 className="text-sm font-semibold text-slate-900">What this file contains</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-5">
              <Stat label="Rows" value={preview.counts.sourceRows} />
              <Stat label="Sections" value={preview.counts.sections} />
              <Stat label="Items" value={preview.counts.items} />
              <Stat label="Comments" value={preview.counts.comments} />
              <Stat label="Columns" value={preview.headers.length} />
            </dl>
          </section>

          <FidelityPanel
            report={preview.fidelity}
            issues={preview.issues}
            repairedCells={preview.repairedCells}
          />

          <section>
            <h2 className="mb-1 text-sm font-semibold text-slate-900">What to know about this file</h2>
            <p className="mb-3 text-xs text-slate-500">
              Everything the importer could not handle silently. Nothing here blocks the import.
            </p>
            <IssueList issues={preview.issues} />
          </section>

          <section className={card}>
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
              Structure
            </h2>
            <div className="max-h-96 overflow-y-auto px-3 py-2">
              {preview.outline.map((section) => (
                <details key={section.name} className="group rounded-md">
                  <summary className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
                    <Chevron />
                    {section.name}
                    <span className="ml-auto font-mono text-xs text-slate-400">
                      {section.items.length} items
                    </span>
                  </summary>
                  <div className="ml-3 border-l border-slate-100 pl-3">
                    {section.items.map((item) => (
                      <details key={item.name} className="group/item rounded-md">
                        <summary className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                          <Chevron className="group-open/item:rotate-90" />
                          {item.name}
                          <span className="ml-auto font-mono text-xs text-slate-400">
                            {item.comments.length}
                          </span>
                        </summary>
                        <ul className="ml-3 space-y-1 border-l border-slate-100 py-1 pl-3">
                          {item.comments.map((comment, i) => (
                            <li key={i} className="text-xs leading-relaxed">
                              <span className="font-mono text-slate-300">r{comment.sourceRow}</span>{" "}
                              <span className="font-medium text-slate-700">
                                {comment.name || "(no name)"}
                              </span>
                              {comment.excerpt && (
                                <span className="text-slate-500"> &mdash; {comment.excerpt}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className={`${card} px-5 py-4`}>
            <label className="block text-sm font-medium text-slate-900" htmlFor="template-name">
              Name this template
            </label>
            <input
              id="template-name"
              className={`${input} mt-2 max-w-lg`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errorCount > 0 && (
              <p className="mt-3 text-sm text-red-800">
                {errorCount} row{errorCount === 1 ? "" : "s"} could not be placed and will not be
                imported. Everything else will be.
              </p>
            )}
            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={commit} disabled={busy !== null} className={btn.primary}>
                {busy === "commit" ? "Importing" : "Import into the database"}
              </button>
              {busy === "commit" && <Spinner />}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-xl font-semibold text-slate-900">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 animate-spin fill-none stroke-slate-400 stroke-2">
      <circle cx="8" cy="8" r="6" className="opacity-25" />
      <path d="M14 8a6 6 0 00-6-6" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ className = "group-open:rotate-90" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`h-2.5 w-2.5 shrink-0 fill-none stroke-slate-400 stroke-2 transition-transform ${className}`}
    >
      <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
