"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FidelityPanel } from "@/components/FidelityPanel";
import { IssueList } from "@/components/IssueList";
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
    if (!response.ok) {
      setFailure(json as ApiError);
      return;
    }
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
    if (!response.ok) {
      setFailure(json as ApiError);
      return;
    }
    router.push(`/templates/${json.templateId}`);
  }

  const errorCount = preview?.issues.filter((i) => i.severity === "error").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Import a Spectora template</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload the file from Spectora&rsquo;s <strong>Export to spreadsheet &rarr; Export HTML Text</strong>.
          Nothing is written to the database until you confirm.
        </p>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium" htmlFor="file">
          Spectora export
        </label>
        <input
          id="file"
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="mt-2 block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            setFile(chosen);
            setPreview(null);
            setFailure(null);
            if (chosen) void analyse(chosen);
          }}
        />
        {busy === "preview" && <p className="mt-2 text-sm text-slate-600">Reading the workbook...</p>}
      </div>

      {failure && (
        <div className="rounded border border-red-300 bg-red-50 p-4">
          <h2 className="text-sm font-semibold text-red-900">This file was not imported</h2>
          <p className="mt-1 text-sm text-red-900">{failure.error}</p>
          {failure.hint && <p className="mt-2 text-sm text-red-800">{failure.hint}</p>}
          {failure.code && (
            <p className="mt-2 font-mono text-xs text-red-700">code: {failure.code}</p>
          )}
        </div>
      )}

      {preview && (
        <>
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold">What this file contains</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
              <Stat label="Rows" value={preview.counts.sourceRows} />
              <Stat label="Sections" value={preview.counts.sections} />
              <Stat label="Items" value={preview.counts.items} />
              <Stat label="Comments" value={preview.counts.comments} />
              <Stat label="Columns" value={preview.headers.length} />
            </dl>
            {preview.repairedCells > 0 && (
              <p className="mt-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {preview.repairedCells} cells were stored HTML-escaped inside the workbook and the
                spreadsheet library decoded them one level too far. The original escaping was restored
                before anything was read.
              </p>
            )}
          </section>

          <FidelityPanel report={preview.fidelity} />

          <section>
            <h2 className="mb-2 text-sm font-semibold">
              Warnings{" "}
              <span className="font-normal text-slate-500">({preview.issues.length})</span>
            </h2>
            <IssueList issues={preview.issues} />
          </section>

          <section className="rounded border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
              Structure preview
            </h2>
            <div className="max-h-96 overflow-y-auto p-2">
              {preview.outline.map((section) => (
                <details key={section.name} className="rounded px-2 py-1">
                  <summary className="cursor-pointer text-sm font-medium">
                    {section.name}{" "}
                    <span className="font-normal text-slate-500">({section.items.length} items)</span>
                  </summary>
                  <div className="ml-4 border-l border-slate-200 pl-3">
                    {section.items.map((item) => (
                      <details key={item.name} className="py-1">
                        <summary className="cursor-pointer text-sm">
                          {item.name}{" "}
                          <span className="text-slate-500">({item.comments.length})</span>
                        </summary>
                        <ul className="ml-4 mt-1 space-y-1 border-l border-slate-200 pl-3">
                          {item.comments.map((comment, i) => (
                            <li key={i} className="text-xs">
                              <span className="font-mono text-slate-400">r{comment.sourceRow}</span>{" "}
                              <span className="font-medium">{comment.name || "(no name)"}</span>
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

          <section className="rounded border border-slate-200 bg-white p-4">
            <label className="block text-sm font-medium" htmlFor="template-name">
              Name this template
            </label>
            <input
              id="template-name"
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errorCount > 0 && (
              <p className="mt-3 text-sm text-red-800">
                {errorCount} row(s) could not be placed and will not be imported. Everything else will be.
              </p>
            )}
            <button
              type="button"
              onClick={commit}
              disabled={busy !== null}
              className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy === "commit" ? "Importing..." : "Import into the database"}
            </button>
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
      <dd className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}
