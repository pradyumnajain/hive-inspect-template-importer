import type { ImportIssue, IssueOrigin } from "@/lib/spectora";

/**
 * Import issues, grouped by the distinction the brief asks for.
 *
 * "Missing" and "unsupported" are genuinely different problems and a customer
 * needs to tell them apart: one is something Spectora never exported, the
 * other is something we received and kept but cannot yet edit.
 */
const GROUPS: { origin: IssueOrigin; title: string; blurb: string }[] = [
  {
    origin: "missing",
    title: "Missing from the Spectora export",
    blurb:
      "The export itself does not contain this. No importer could recover it, so it is listed here for the record.",
  },
  {
    origin: "unsupported",
    title: "In the export, not supported by this app",
    blurb:
      "These values were received and are stored against their comment. This app has no editor for them yet, so nothing was lost, only deferred.",
  },
  {
    origin: "source",
    title: "Notes about the source file",
    blurb: "Things worth knowing about how this particular spreadsheet was put together.",
  },
];

const SEVERITY_STYLE: Record<string, string> = {
  error: "border-red-300 bg-red-50 text-red-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};

export function IssueList({ issues }: { issues: ImportIssue[] }) {
  if (issues.length === 0) {
    return (
      <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Nothing to report. Every column in this file is one the importer models.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {GROUPS.map((group) => {
        const rows = issues.filter((i) => i.origin === group.origin);
        if (rows.length === 0) return null;
        return (
          <section key={group.origin}>
            <h3 className="text-sm font-semibold">
              {group.title}{" "}
              <span className="font-normal text-slate-500">
                ({rows.length})
              </span>
            </h3>
            <p className="mt-0.5 mb-2 text-xs text-slate-600">{group.blurb}</p>
            <ul className="space-y-2">
              {rows.map((issue, i) => (
                <li
                  key={`${issue.code}-${i}`}
                  className={`rounded border px-3 py-2 text-sm ${SEVERITY_STYLE[issue.severity]}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px] uppercase">
                      {issue.severity}
                    </span>
                    <span className="font-mono text-[11px] opacity-70">{issue.code}</span>
                    {issue.sourceRow && (
                      <span className="font-mono text-[11px] opacity-70">row {issue.sourceRow}</span>
                    )}
                    {issue.sourceColumn && (
                      <span className="font-mono text-[11px] opacity-70">{issue.sourceColumn}</span>
                    )}
                  </div>
                  <p className="mt-1">{issue.message}</p>
                  {issue.rawValue && (
                    <pre className="mt-1 overflow-x-auto rounded bg-white/70 p-2 font-mono text-[11px]">
                      {issue.rawValue}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
