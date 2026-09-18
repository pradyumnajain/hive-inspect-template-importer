import Link from "next/link";
import { notFound } from "next/navigation";

import { saveItemName, saveSectionName, saveTemplateName } from "@/app/actions";
import { CommentCard } from "@/components/CommentCard";
import { EditableField } from "@/components/EditableField";
import { FidelityPanel } from "@/components/FidelityPanel";
import { IssueList } from "@/components/IssueList";
import { DuplicateButton } from "@/components/TemplateActions";
import { getLatestImport, getTemplate } from "@/lib/db/templates";

export const dynamic = "force-dynamic";

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;

  const template = await getTemplate(id);
  if (!template) notFound();

  const run = await getLatestImport(id);
  const showReport = tab === "report";

  const commentCount = template.sections.reduce(
    (n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0),
    0,
  );
  const itemCount = template.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <EditableField
            label="Template name"
            className="max-w-xl"
            initialValue={template.name}
            onSave={saveTemplateName.bind(null, template.id)}
          />
          <p className="mt-1 text-xs text-slate-500">
            {template.sections.length} sections · {itemCount} items · {commentCount} comments
            {template.duplicated_from && (
              <>
                {" · "}
                <Link href={`/templates/${template.duplicated_from}`} className="underline">
                  copied from another template
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DuplicateButton templateId={template.id} label="Duplicate this template" />
        </div>
      </div>

      <nav className="flex gap-1 border-b border-slate-200 text-sm">
        <Tab href={`/templates/${id}`} active={!showReport}>
          Structure
        </Tab>
        <Tab href={`/templates/${id}?tab=report`} active={showReport}>
          Import report{" "}
          {run && run.issues.length > 0 && (
            <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-900">
              {run.issues.length}
            </span>
          )}
        </Tab>
      </nav>

      {showReport ? (
        <div className="space-y-6">
          {run ? (
            <>
              <p className="text-sm text-slate-600">
                Imported from <span className="font-mono">{run.filename ?? "an upload"}</span>.
              </p>
              {run.stats.fidelity && <FidelityPanel report={run.stats.fidelity} />}
              <section>
                <h2 className="mb-2 text-sm font-semibold">
                  Warnings <span className="font-normal text-slate-500">({run.issues.length})</span>
                </h2>
                <IssueList issues={run.issues} />
              </section>
            </>
          ) : (
            <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
              This template was created by duplicating another one, so it has no import report of its own.
              {template.duplicated_from && (
                <>
                  {" "}
                  <Link href={`/templates/${template.duplicated_from}?tab=report`} className="underline">
                    See the original&rsquo;s report
                  </Link>
                  .
                </>
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Edit a section, item or comment and press Save. Changes are written to Postgres immediately.
          </p>
          {template.sections.map((section) => (
            <details key={section.id} className="rounded border border-slate-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                {section.name}{" "}
                <span className="font-normal text-slate-500">
                  ({section.items.length} items)
                </span>
              </summary>
              <div className="space-y-4 border-t border-slate-100 px-4 py-3">
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Section name</p>
                  <EditableField
                    label={`Section ${section.position} name`}
                    className="max-w-xl"
                    initialValue={section.name}
                    onSave={saveSectionName.bind(null, template.id, section.id)}
                  />
                </div>

                {section.items.map((item) => (
                  <details key={item.id} className="rounded border border-slate-200 bg-slate-50">
                    <summary className="cursor-pointer px-3 py-2 text-sm">
                      {item.name}{" "}
                      <span className="text-slate-500">({item.comments.length})</span>
                    </summary>
                    <div className="space-y-3 border-t border-slate-200 px-3 py-3">
                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Item name</p>
                        <EditableField
                          label={`Item ${item.position} name`}
                          className="max-w-xl"
                          initialValue={item.name}
                          onSave={saveItemName.bind(null, template.id, item.id)}
                        />
                      </div>
                      <ul className="space-y-2">
                        {item.comments.map((comment) => (
                          <CommentCard key={comment.id} comment={comment} templateId={template.id} />
                        ))}
                      </ul>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 ${
        active ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}
