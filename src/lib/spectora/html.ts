/**
 * Small HTML helpers for the importer.
 *
 * There is no sanitising here on purpose. Comment Text is stored exactly as it
 * arrived and is sanitised only where it is rendered (see `src/lib/sanitize.ts`).
 */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decode HTML entities in a single pass.
 *
 * Single pass matters: `&amp;lt;` must decode to the literal text `&lt;`, not
 * to `<`. A loop would over-decode and silently change customer content.
 *
 * Used ONLY on Section Name and Item Name, which Spectora exports escaped
 * ("Roof Structure &amp; Attic"). Comment Name and choice options arrive
 * unescaped, and Comment Text is real HTML, so neither is decoded.
 */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED[body.toLowerCase()];
    return named ?? match;
  });
}

/** True if the value looks like it contains markup rather than plain text. */
export function looksLikeHtml(value: string): boolean {
  return /<[a-zA-Z][^>]*>/.test(value);
}

/** Lowercased tag names in document order, e.g. `["p", "a", "p"]`. */
export function tagNames(html: string): string[] {
  return Array.from(html.matchAll(/<\s*([a-zA-Z][a-zA-Z0-9]*)/g)).map((m) => m[1].toLowerCase());
}

/** Every `href` value, in order. Links are the rich content most worth checking. */
export function hrefs(html: string): string[] {
  return Array.from(html.matchAll(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/g)).map(
    (m) => m[1] ?? m[2],
  );
}

/** Text with all tags removed. Used to confirm wording survived import. */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Detect an embed wrapper whose actual embed is gone.
 *
 * The real InterNACHI export contains this, verbatim:
 *
 *   <div class="youtube-embed-wrapper" style="...">&nbsp;</div>
 *
 * The inspector embedded a video; Spectora's HTML-text export emitted the
 * wrapper without the `iframe`. The content is genuinely absent from the file,
 * so the honest thing is to tell the user rather than render an invisible box.
 */
export function findEmptyEmbeds(html: string): string[] {
  const found: string[] = [];
  const re = /<div\b[^>]*class\s*=\s*["'][^"']*embed[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  for (const match of html.matchAll(re)) {
    const inner = match[1];
    if (!/<(iframe|video|embed|object|img)\b/i.test(inner)) {
      found.push(match[0]);
    }
  }
  return found;
}
