/**
 * Copy naming. The SQL function's default appends " (copy)", so duplicating a
 * copy produced "Template (copy) (copy)". The app now picks the name.
 */

import { describe, expect, it } from "vitest";
import { nextCopyName } from "@/lib/db/templates";

const NAME = "InterNACHI Residential -2026-09-17";

describe("nextCopyName", () => {
  it("names the first copy", () => {
    expect(nextCopyName(NAME, [NAME])).toBe(`${NAME} (copy)`);
  });

  it("numbers later copies instead of stacking suffixes", () => {
    expect(nextCopyName(NAME, [NAME, `${NAME} (copy)`])).toBe(`${NAME} (copy 2)`);
    expect(nextCopyName(NAME, [NAME, `${NAME} (copy)`, `${NAME} (copy 2)`])).toBe(`${NAME} (copy 3)`);
  });

  it("copies a copy back off the original name, not off the copy", () => {
    expect(nextCopyName(`${NAME} (copy)`, [NAME, `${NAME} (copy)`])).toBe(`${NAME} (copy 2)`);
    expect(nextCopyName(`${NAME} (copy 2)`, [NAME, `${NAME} (copy)`, `${NAME} (copy 2)`])).toBe(
      `${NAME} (copy 3)`,
    );
  });

  it("fills a gap left by a deleted copy", () => {
    expect(nextCopyName(NAME, [NAME, `${NAME} (copy 2)`])).toBe(`${NAME} (copy)`);
  });

  it("ignores case when checking what is taken", () => {
    expect(nextCopyName(NAME, [NAME, `${NAME} (COPY)`])).toBe(`${NAME} (copy 2)`);
  });

  it("leaves a name that merely mentions copy elsewhere alone", () => {
    expect(nextCopyName("Copy of my template", [])).toBe("Copy of my template (copy)");
  });

  it("does not produce an empty name if the whole name was a suffix", () => {
    expect(nextCopyName("(copy)", [])).toBe("(copy) (copy)");
  });
});
