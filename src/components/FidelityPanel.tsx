import type { FidelityReport } from "@/lib/spectora";

/**
 * The Import Fidelity Report.
 *
 * The point is evidence, not reassurance: every row says how many values were
 * compared, and anything that did not match is listed with the spreadsheet row
 * and column it came from.
 */
export function FidelityPanel({ report }: { report: FidelityReport }) {
  const allPassed = report.passed === report.total;

  return (
    <section className="rounded border border-slate-200 bg-white">
      <div
        className={`flex items-baseline justify-between rounded-t border-b px-4 py-3 ${
          allPassed ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
        }`}
      >
        <div>
          <h2 className="text-sm font-semibold">Import fidelity</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            {allPassed
              ? "Every check compared the spreadsheet against what will be stored, and found no difference."
              : "Some values did not survive the import. Each one is listed with its source cell."}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">
            {report.passed}/{report.total} checks
          </p>
          <p className="text-xs text-slate-600 tabular-nums">
            {report.valuesMatched.toLocaleString()}/{report.valuesCompared.toLocaleString()} values
          </p>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {report.checks.map((check) => (
            <tr key={check.id} className="border-b border-slate-100 last:border-0 align-top">
              <td className="w-8 py-2 pl-4">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    check.status === "pass" ? "bg-emerald-500" : "bg-red-500"
                  }`}
                  aria-label={check.status}
                />
              </td>
              <td className="py-2 pr-4">
                <p className="font-medium">{check.label}</p>
                <p className="text-xs text-slate-600">{check.description}</p>
                {check.discrepancies.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {check.discrepancies.map((d, i) => (
                      <li key={i} className="rounded bg-red-50 px-2 py-1 font-mono text-xs text-red-900">
                        {d.sourceRow ? `row ${d.sourceRow}` : d.note ?? ""}
                        {d.sourceColumn ? ` · ${d.sourceColumn}` : ""}: expected {d.expected} · got {d.actual}
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
              <td className="w-28 py-2 pr-4 text-right text-xs tabular-nums text-slate-600">
                {check.matched.toLocaleString()}/{check.compared.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
