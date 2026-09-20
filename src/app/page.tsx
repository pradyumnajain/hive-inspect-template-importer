import Link from "next/link";

import { isConfigured } from "@/lib/db/client";
import { listTemplatesWithCounts } from "@/lib/db/templates";
import { DuplicateButton, DeleteButton } from "@/components/TemplateActions";
import { btn, card, count } from "@/components/ui";
import { absoluteUtc, relativeTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isConfigured()) return <SetupNotice />;

  let templates;
  try {
    templates = await listTemplatesWithCounts();
  } catch (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900">
        <p className="font-semibold">The database could not be reached.</p>
        <p className="mt-1.5">{error instanceof Error ? error.message : String(error)}</p>
        <p className="mt-3 text-red-800">
          Check the Supabase environment variables, and that both files in{" "}
          <code className="rounded bg-white px-1 font-mono">supabase/migrations</code> have been run.
        </p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Templates</h1>
      </header>

      {templates.length === 0 ? <EmptyState /> : (
        <ul className="space-y-3">
          {templates.map((template) => (
            <li key={template.id} className={`${card} group px-5 py-4 transition-colors hover:border-slate-300`}>
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900">
                    <Link href={`/templates/${template.id}`} className="hover:underline">
                      {template.name}
                    </Link>
                  </h2>

                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {count(template.counts.sections, "section")}
                    <span className="mx-1.5 text-slate-300">·</span>
                    {count(template.counts.items, "item")}
                    <span className="mx-1.5 text-slate-300">·</span>
                    {count(template.counts.comments, "comment")}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    {template.copiedFrom ? (
                      <>
                        Copy of{" "}
                        <Link
                          href={`/templates/${template.duplicated_from}`}
                          className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
                        >
                          {template.copiedFrom}
                        </Link>
                      </>
                    ) : template.duplicated_from ? (
                      "Copy of a template that has since been deleted"
                    ) : (
                      <>
                        Imported from{" "}
                        <span className="font-mono text-slate-600">
                          {template.source_filename ?? "an upload"}
                        </span>
                      </>
                    )}
                    <span className="mx-1.5 text-slate-300">·</span>
                    edited{" "}
                    <time
                      dateTime={template.updated_at}
                      title={absoluteUtc(template.updated_at)}
                    >
                      {relativeTime(template.updated_at)}
                    </time>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Link href={`/templates/${template.id}`} className={btn.primary}>
                    Open
                  </Link>
                  <DuplicateButton templateId={template.id} />
                  <DeleteButton templateId={template.id} name={template.name} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className={`${card} px-6 py-10 text-center`}>
      <h2 className="text-base font-semibold text-slate-900">No templates yet</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
        Import a Spectora export and you will see exactly what survived before anything is saved.
      </p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <Link href="/import" className={btn.primary}>
          Import a template
        </Link>
      </div>
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
      <h1 className="text-base font-semibold">Database not configured</h1>
      <p className="mt-2">
        Copy <code className="rounded bg-white px-1 font-mono">.env.example</code> to{" "}
        <code className="rounded bg-white px-1 font-mono">.env.local</code>, fill in the Supabase
        project URL, anon key and service role key, run the SQL in{" "}
        <code className="rounded bg-white px-1 font-mono">supabase/migrations</code>, then restart
        the dev server.
      </p>
      <p className="mt-2">
        The importer itself needs no database. Run{" "}
        <code className="rounded bg-white px-1 font-mono">npm test</code> to exercise it against the
        committed sample export.
      </p>
    </div>
  );
}
