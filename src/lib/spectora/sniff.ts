import { SpectoraImportError } from "./types";

export type FileKind = "ooxml" | "biff" | "unknown";

/**
 * Identify a spreadsheet by its bytes, not by its file extension.
 *
 * This matters here: Spectora names the download `.xls`, but the bytes are a
 * modern OOXML zip. Trusting the extension picks the wrong reader.
 */
export function sniff(data: Uint8Array): FileKind {
  // "PK\x03\x04" - zip container, which is what .xlsx actually is
  if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) {
    return "ooxml";
  }
  // OLE2 compound file, the legacy binary .xls format
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (ole.every((byte, i) => data[i] === byte)) return "biff";
  return "unknown";
}

/**
 * Reject anything the reader cannot handle, with an explanation the user can
 * act on. Failing clearly beats failing deep inside a parser.
 */
export function assertReadable(data: Uint8Array): void {
  if (data.length === 0) {
    throw new SpectoraImportError("empty_file", "That file is empty.", "Re-export from Spectora and upload the new file.");
  }
  const kind = sniff(data);
  if (kind === "ooxml") return;

  if (kind === "biff") {
    throw new SpectoraImportError(
      "legacy_xls",
      "This is a legacy Excel file (the pre-2007 binary format), which this importer cannot read.",
      "Open it in Excel, Numbers or Google Sheets and save as .xlsx, then upload that. Spectora's own \"Export to spreadsheet -> Export HTML Text\" already produces the newer format.",
    );
  }

  throw new SpectoraImportError(
    "not_a_spreadsheet",
    "This does not look like an Excel workbook.",
    "Upload the file produced by Spectora's \"Export to spreadsheet -> Export HTML Text\". A PDF or the plain-text export will not work.",
  );
}
