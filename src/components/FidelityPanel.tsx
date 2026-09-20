import type { FidelityReport, ImportIssue } from "@/lib/spectora";
import { card, count } from "@/components/ui";

/**
 * The import fidelity report.
 *
 * The headline is a short list of plain statements a home inspector can read
 * without knowing what a check is, each one backed by a number the validator
 * actually produced. The eleven underlying checks stay one disclosure away for
 * anyone who wants to audit the claim.
 *
 * Every figure here comes from the stored report. Nothing is estimated.
 */
export function FidelityPanel({
  report,
  issues = [],
  repairedCells,
}: {
  report: FidelityReport;
  issues?: ImportIssue[];
  /** Known on the import preview. Omitted when reading a stored report back. */
  repairedCells?: number;
}) {
  const allPassed = report.passed === report.total;
  const find = (id: string) => report.checks.find((c) => c.id === id);
  const warnings = issues.filter((i) => i.severity !== "info").length;
  const repairIssue = issues.find((i) => i.code === "entities_repaired");

  const lines: { ok: boolean; text: string }[] = [];
  const push = (id: string, render: (n: number) => string) => {
    const check = find(id);
    if (check) lines.push({ ok: check.status === "pass", text: render(check.compared) });
  };

  push("sections", (n) => `${count(n, "section")} preserved`);
  push("items", (n) => `${count(n, "item")} preserved`);
  push("comments", (n) => `${count(n, "comment")} preserved`);
  lines.push({
    ok: report.valuesMatched === report.valuesCompared,
    text: `${report.valuesMatched.toLocaleString()} of ${report.valuesCompared.toLocaleString()} values preserved`,
  });
  push("ordering", () => "Original spreadsheet order preserved");
  push("extra_fields", (n) => `${count(n, "unsupported value")} kept, not dropped`);

  if (repairedCells !== undefined && repairedCells > 0) {
    lines.push({ ok: true, text: `${repairedCells.toLocaleString()} cells repaired before reading` });
  } else if (repairIssue) {
    lines.push({ ok: true, text: "Source escaping repaired before reading" });
  }

  return (
    <section className={card}>
      <header
        className={`border-b px-5 py-4 ${
          allPassed ? "border-emerald-100 bg-emerald-50/70" : "border-red-100 bg-red-50/70"
        }`}
      >
        <div className="flex items-baseline justify-between gap-6">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">
              {allPassed ? "Nothing was lost in this import" : "Some values did not survive"}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              {allPassed
                ? "Every value in the spreadsheet was compared against what is stored, and the two match."
                : "Each difference is listed below with the spreadsheet row and column it came from."}
            </p>
          </div>
          <p className="shrink-0 whitespace-nowrap font-mono text-sm text-slate-600">
            {report.passed}/{report.total} checks
          </p>
        </div>

        {/* One hairline, proportional to what matched. It is the whole promise. */}
        <div className="mt-3.5 h-1 w-full overflow-hidden rounded-full bg-slate-900/10">
          <div
            className={allPassed ? "h-full bg-emerald-600" : "h-full bg-red-600"}
            style={{
              width: `${report.valuesCompared === 0 ? 0 : (report.valuesMatched / report.valuesCompared) * 100}%`,
            }}
          />
        </div>
      </header>

      <ul className="grid gap-x-8 gap-y-2 px-5 py-4 sm:grid-cols-2">
        {lines.map((line) => (
          <li key={line.text} className="flex items-start gap-2 text-sm text-slate-700">
            {line.ok ? <Tick /> : <Cross />}
            <span>{line.text}</span>
          </li>
        ))}
        {warnings > 0 && (
          <li className="flex items-start gap-2 text-sm text-slate-700">
            <Bang />
            <span>
              {warnings} {warnings === 1 ? "thing" : "things"} to know about, below
            </span>
          </li>
        )}
      </ul>

      <details className="group border-t border-slate-100">
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700">
          <svg
            viewBox="0 0 12 12"
            aria-hidden
            className="h-2.5 w-2.5 fill-none stroke-current stroke-2 transition-transform group-open:rotate-90"
          >
            <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          See all {report.total} checks
        </summary>

        <table className="w-full border-t border-slate-100 text-sm">
          <caption className="sr-only">
            Each fidelity check, what it protects, and how many values it compared
          </caption>
          <tbody>
            {report.checks.map((check) => (
              <tr key={check.id} className="border-b border-slate-50 align-top last:border-0">
                <td className="py-2.5 pl-5 pr-3 w-6">{check.status === "pass" ? <Tick /> : <Cross />}</td>
                <td className="py-2.5 pr-4">
                  <p className="font-medium text-slate-800">{check.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{check.description}</p>
                  {check.discrepancies.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {check.discrepancies.map((d, i) => (
                        <li key={i} className="rounded bg-red-50 px-2 py-1 font-mono text-[11px] text-red-900">
                          {d.sourceRow ? `row ${d.sourceRow}` : (d.note ?? "")}
                          {d.sourceColumn ? ` · ${d.sourceColumn}` : ""}: expected {d.expected} · got{" "}
                          {d.actual}
                        </li>
                      ))}
                      {check.discrepancyCount > check.discrepancies.length && (
                        <li className="text-xs text-red-700">
                          and {check.discrepancyCount - check.discrepancies.length} more
                        </li>
                      )}
                    </ul>
                  )}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-5 text-right font-mono text-xs text-slate-500">
                  {check.matched.toLocaleString()}/{check.compared.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 16 16" aria-label="passed" role="img" className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-none stroke-emerald-600 stroke-2">
      <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 16 16" aria-label="failed" role="img" className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-none stroke-red-600 stroke-2">
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}

function Bang() {
  return (
    <svg viewBox="0 0 16 16" aria-label="note" role="img" className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-none stroke-amber-600 stroke-2">
      <path d="M8 4v5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.6" className="fill-amber-600 stroke-0" />
    </svg>
  );
}
