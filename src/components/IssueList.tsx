import type { ImportIssue, IssueOrigin } from "@/lib/spectora";
import { card } from "@/components/ui";

/**
 * Import issues, grouped by whose problem they are.
 *
 * "Missing" and "unsupported" look similar in a list and are completely
 * different to the customer: one is something Spectora never wrote to the
 * file, the other is something we received and kept but cannot edit yet. The
 * grouping is the point, so each group says plainly what it means.
 */
const GROUPS: { origin: IssueOrigin; title: string; blurb: string }[] = [
  {
    origin: "missing",
    title: "Not in the export",
    blurb:
      "Spectora did not write this to the file, so no importer could recover it. Listed here so it is not a surprise later.",
  },
  {
    origin: "unsupported",
    title: "Kept, but not editable here",
    blurb:
      "Received and stored against the comment it belongs to. This app has no editor for it yet, so it is deferred rather than lost.",
  },
  {
    origin: "source",
    title: "About this file",
    blurb: "How this particular spreadsheet was put together, and anything that had to be corrected.",
  },
];

const SEVERITY: Record<string, { dot: string; label: string }> = {
  error: { dot: "bg-red-500", label: "text-red-700" },
  warning: { dot: "bg-amber-500", label: "text-amber-700" },
  info: { dot: "bg-slate-300", label: "text-slate-500" },
};

export function IssueList({ issues }: { issues: ImportIssue[] }) {
  if (issues.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Nothing to report. Every column in this file is one the importer understands.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {GROUPS.map((group) => {
        const rows = issues.filter((i) => i.origin === group.origin);
        if (rows.length === 0) return null;
        return (
          <section key={group.origin} className={card}>
            <header className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {group.title}
                <span className="ml-1.5 font-mono text-xs font-normal text-slate-400">
                  {rows.length}
                </span>
              </h3>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-500">{group.blurb}</p>
            </header>

            <ul className="divide-y divide-slate-50">
              {rows.map((issue, i) => {
                const severity = SEVERITY[issue.severity] ?? SEVERITY.info;
                return (
                  <li key={`${issue.code}-${i}`} className="px-4 py-3">
                    <div className="flex items-baseline gap-2 font-mono text-[11px]">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${severity.dot}`} aria-hidden />
                      <span className={severity.label}>{issue.severity}</span>
                      <span className="text-slate-400">{issue.code}</span>
                      {issue.sourceRow && <span className="text-slate-400">row {issue.sourceRow}</span>}
                      {issue.sourceColumn && (
                        <span className="truncate text-slate-400">{issue.sourceColumn}</span>
                      )}
                    </div>
                    <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-700">
                      {issue.message}
                    </p>
                    {issue.rawValue && (
                      <pre className="mt-2 overflow-x-auto rounded border border-slate-100 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed text-slate-600">
                        {issue.rawValue}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
