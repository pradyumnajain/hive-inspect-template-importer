import Link from "next/link";
import { notFound } from "next/navigation";

import { saveItemName, saveSectionName, saveTemplateName } from "@/app/actions";
import { CommentCard } from "@/components/CommentCard";
import { EditableField } from "@/components/EditableField";
import { FidelityPanel } from "@/components/FidelityPanel";
import { IssueList } from "@/components/IssueList";
import { StructureSearch } from "@/components/StructureSearch";
import { DuplicateButton } from "@/components/TemplateActions";
import { btn, card } from "@/components/ui";
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

  const itemCount = template.sections.reduce((n, s) => n + s.items.length, 0);
  const commentCount = template.sections.reduce(
    (n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0),
    0,
  );
  const warningCount = run?.issues.filter((i) => i.severity !== "info").length ?? 0;

  return (
    <div>
      <header className="mb-6">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <span aria-hidden>&larr;</span> All templates
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <EditableField
              label="Template name"
              size="title"
              className="-ml-2.5 max-w-2xl"
              initialValue={template.name}
              onSave={saveTemplateName.bind(null, template.id)}
            />
            <p className="mt-1 pl-0.5 font-mono text-xs text-slate-500">
              {template.sections.length} sections
              <span className="mx-1.5 text-slate-300">·</span>
              {itemCount} items
              <span className="mx-1.5 text-slate-300">·</span>
              {commentCount.toLocaleString()} comments
              {template.duplicated_from && (
                <>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <Link
                    href={`/templates/${template.duplicated_from}`}
                    className="font-sans underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
                  >
                    copy of another template
                  </Link>
                </>
              )}
            </p>
          </div>
          <DuplicateButton templateId={template.id} label="Duplicate" className={btn.secondary} />
        </div>
      </header>

      <nav className="mb-6 flex gap-6 border-b border-slate-200 text-sm" aria-label="Template views">
        <Tab href={`/templates/${id}`} active={!showReport}>
          Structure
        </Tab>
        <Tab href={`/templates/${id}?tab=report`} active={showReport}>
          Import report
          {warningCount > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] text-amber-800">
              {warningCount}
            </span>
          )}
        </Tab>
      </nav>

      {showReport ? (
        <ReportView run={run} duplicatedFrom={template.duplicated_from} />
      ) : (
        <StructureView template={template} commentCount={commentCount} />
      )}
    </div>
  );
}

function StructureView({
  template,
  commentCount,
}: {
  template: NonNullable<Awaited<ReturnType<typeof getTemplate>>>;
  commentCount: number;
}) {
  return (
    <div>
      <div className="mb-4">
        <StructureSearch totalComments={commentCount} />
      </div>

      <div className="space-y-2">
        {template.sections.map((section) => (
          <details
            key={section.id}
            data-node="section"
            data-search={section.name.toLowerCase()}
            className={`${card} group overflow-hidden`}
          >
            <summary className="flex cursor-pointer items-center gap-2.5 px-4 py-3 hover:bg-slate-50">
              <Chevron />
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
                {section.name}
              </h2>
              <span className="ml-auto font-mono text-xs text-slate-400">
                {section.items.length} items
              </span>
            </summary>

            <div className="border-t border-slate-100 px-4 pb-4 pt-3">
              <FieldRow label="Section name">
                <EditableField
                  label={`Name of section ${section.position + 1}`}
                  className="-ml-2.5 max-w-lg"
                  initialValue={section.name}
                  onSave={saveSectionName.bind(null, template.id, section.id)}
                />
              </FieldRow>

              <div className="mt-2 space-y-0.5">
                {section.items.map((item) => (
                  <details
                    key={item.id}
                    data-node="item"
                    data-search={item.name.toLowerCase()}
                    className="group/item rounded-md"
                  >
                    <summary className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-50">
                      <Chevron className="group-open/item:rotate-90" />
                      <h3 className="text-sm font-medium text-slate-800">{item.name}</h3>
                      <span className="ml-auto font-mono text-xs text-slate-400">
                        {item.comments.length}
                      </span>
                    </summary>

                    <div className="ml-2 border-l border-slate-100 pb-2 pl-4">
                      <FieldRow label="Item name">
                        <EditableField
                          label={`Name of item ${item.position + 1}`}
                          className="-ml-2.5 max-w-lg"
                          initialValue={item.name}
                          onSave={saveItemName.bind(null, template.id, item.id)}
                        />
                      </FieldRow>

                      <ul className="mt-1">
                        {item.comments.map((comment) => (
                          <CommentCard key={comment.id} comment={comment} templateId={template.id} />
                        ))}
                      </ul>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function ReportView({
  run,
  duplicatedFrom,
}: {
  run: Awaited<ReturnType<typeof getLatestImport>>;
  duplicatedFrom: string | null;
}) {
  if (!run) {
    return (
      <div className={`${card} px-5 py-6 text-sm text-slate-600`}>
        <p className="font-medium text-slate-900">No import report for this template</p>
        <p className="mt-1.5">
          It was created by duplicating another template rather than by importing a file.
        </p>
        {duplicatedFrom && (
          <Link
            href={`/templates/${duplicatedFrom}?tab=report`}
            className="mt-3 inline-block text-sm underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
          >
            Open the original&rsquo;s report
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Imported from <span className="font-mono text-slate-800">{run.filename ?? "an upload"}</span>
      </p>
      {run.stats.fidelity && <FidelityPanel report={run.stats.fidelity} issues={run.issues} />}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          What to know about this file
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Everything the importer could not handle silently, kept with the template.
        </p>
        <IssueList issues={run.issues} />
      </section>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mb-px flex items-center border-b-2 pb-2.5 text-sm transition-colors ${
        active
          ? "border-slate-900 font-medium text-slate-900"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}

function Chevron({ className = "group-open:rotate-90" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`h-3 w-3 shrink-0 fill-none stroke-slate-400 stroke-2 transition-transform ${className}`}
    >
      <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
