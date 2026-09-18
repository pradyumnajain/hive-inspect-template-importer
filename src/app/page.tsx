import Link from "next/link";

import { isConfigured } from "@/lib/db/client";
import { listTemplates } from "@/lib/db/templates";
import { DuplicateButton, DeleteButton } from "@/components/TemplateActions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isConfigured()) return <SetupNotice />;

  let templates;
  try {
    templates = await listTemplates();
  } catch (error) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-semibold">The database could not be reached.</p>
        <p className="mt-1">{error instanceof Error ? error.message : String(error)}</p>
        <p className="mt-2">Check the Supabase environment variables and that the migrations have been run.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Templates</h1>
        <p className="mt-1 text-sm text-slate-600">
          Imported Spectora templates. Edits and copies are stored in Postgres and survive a refresh.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white p-6 text-sm">
          <p className="font-medium">No templates yet.</p>
          <p className="mt-1 text-slate-600">
            <Link href="/import" className="underline">
              Import a Spectora export
            </Link>{" "}
            to get started, or run <code className="rounded bg-slate-100 px-1">npm run seed</code> to load the
            sample template.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {templates.map((template) => (
            <li key={template.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/templates/${template.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {template.name}
                </Link>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {template.duplicated_from ? "Copy of another template" : template.source_filename ?? "Imported"}
                  {" · updated "}
                  {new Date(template.updated_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/templates/${template.id}`}
                  className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100"
                >
                  Open
                </Link>
                <DuplicateButton templateId={template.id} />
                <DeleteButton templateId={template.id} name={template.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
      <h1 className="text-base font-semibold">Database not configured</h1>
      <p className="mt-2">
        Copy <code className="rounded bg-white px-1">.env.example</code> to{" "}
        <code className="rounded bg-white px-1">.env.local</code>, fill in your Supabase project URL, anon key
        and service role key, then run the SQL in{" "}
        <code className="rounded bg-white px-1">supabase/migrations</code> and restart the dev server.
      </p>
      <p className="mt-2">
        The parser itself needs no database. Run <code className="rounded bg-white px-1">npm test</code> to
        exercise it against the committed sample export.
      </p>
    </div>
  );
}
