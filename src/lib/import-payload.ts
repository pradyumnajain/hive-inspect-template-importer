import type { FidelityReport, ImportIssue, ImportPreview } from "@/lib/spectora";
import { toPlainText } from "@/lib/sanitize";

/**
 * What the preview screen needs. Deliberately not the whole tree: the sample
 * template is 392 comments and the browser only has to show an outline before
 * the user decides whether to commit.
 */
export interface PreviewPayload {
  filename: string;
  sheetName: string;
  headers: string[];
  counts: { sourceRows: number; sections: number; items: number; comments: number };
  repairedCells: number;
  issues: ImportIssue[];
  fidelity: FidelityReport;
  outline: {
    name: string;
    items: { name: string; comments: { name: string; excerpt: string; sourceRow: number }[] }[];
  }[];
  suggestedName: string;
}

export function toPreviewPayload(preview: ImportPreview, filename: string): PreviewPayload {
  return {
    filename,
    sheetName: preview.grid.sheetName,
    headers: preview.sourceHeaders.filter((h) => h.trim() !== ""),
    counts: preview.counts,
    repairedCells: preview.grid.corrections?.length ?? 0,
    issues: preview.issues,
    fidelity: preview.fidelity,
    suggestedName: preview.template.name,
    outline: preview.template.sections.map((s) => ({
      name: s.name,
      items: s.items.map((i) => ({
        name: i.name,
        comments: i.comments.map((c) => ({
          name: c.name,
          excerpt: c.bodyHtml ? toPlainText(c.bodyHtml, 110) : "",
          sourceRow: c.sourceRow,
        })),
      })),
    })),
  };
}

export interface ApiError {
  error: string;
  code?: string;
  hint?: string;
}
