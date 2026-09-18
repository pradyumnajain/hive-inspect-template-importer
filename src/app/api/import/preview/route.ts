import { NextResponse } from "next/server";

import { buildImportPreview, SpectoraImportError } from "@/lib/spectora";
import { toPreviewPayload } from "@/lib/import-payload";

/** 10 MB. The sample export is 56 KB; this is a generous ceiling, not a target. */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB, above the 10 MB limit.` },
      { status: 413 },
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preview = await buildImportPreview(bytes, file.name);
    return NextResponse.json(toPreviewPayload(preview, file.name));
  } catch (error) {
    if (error instanceof SpectoraImportError) {
      return NextResponse.json(
        { error: error.message, code: error.code, hint: error.hint },
        { status: 422 },
      );
    }
    console.error("import preview failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The file could not be read." },
      { status: 500 },
    );
  }
}
