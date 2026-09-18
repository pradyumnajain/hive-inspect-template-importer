import { NextResponse } from "next/server";

import { buildImportPreview, SpectoraImportError } from "@/lib/spectora";
import { saveImport } from "@/lib/db/templates";
import { isConfigured } from "@/lib/db/client";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Parse the file a second time and write it.
 *
 * The browser re-sends the same file rather than the server holding preview
 * state between requests. Parsing is deterministic, so what was previewed is
 * what gets stored, and there is no temporary state to expire or leak.
 */
export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "The database is not configured. Set the Supabase environment variables and restart." },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const name = form?.get("name");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is above the 10 MB limit." }, { status: 413 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preview = await buildImportPreview(bytes, file.name);
    const outcome = await saveImport(preview, preview.fidelity, typeof name === "string" ? name : undefined);
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof SpectoraImportError) {
      return NextResponse.json({ error: error.message, code: error.code, hint: error.hint }, { status: 422 });
    }
    console.error("import commit failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The import could not be saved." },
      { status: 500 },
    );
  }
}
