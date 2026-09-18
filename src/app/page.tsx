import Link from "next/link";

import { isConfigured } from "@/lib/db/client";
import { listTemplatesWithCounts } from "@/lib/db/templates";
import { DuplicateButton, DeleteButton } from "@/components/TemplateActions";
import { btn, card } from "@/components/ui";

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
        <p className="mt-1.5 text-sm text-slate-600">
          Imported Spectora templates. Edits and copies live in Postgres and survive a refresh.
        </p>
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
                    {template.counts.sections} sections
                    <span className="mx-1.5 text-slate-300">·</span>
                    {template.counts.items} items
                    <span className="mx-1.5 text-slate-300">·</span>
                    {template.counts.comments.toLocaleString()} comments
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
                    {new Date(template.updated_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
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
      <p className="mt-4 text-xs text-slate-500">
        Or run <code className="rounded bg-slate-100 px-1 font-mono">npm run seed</code> to load the
        sample template.
      </p>
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
