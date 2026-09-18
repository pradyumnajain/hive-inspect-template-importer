/**
 * Plain-text helpers. No HTML sanitising here, and no DOM library.
 *
 * Sanitising happens in the browser, immediately before the markup is
 * inserted, in `src/components/SafeHtml.tsx`. Doing it on the server meant
 * shipping a full DOM implementation into a serverless function to clean a
 * paragraph of HTML, which is both wasteful and fragile.
 *
 * What has not changed: the database still stores the customer's comment text
 * byte for byte. Nothing is ever cleaned on the way in.
 */

/** Readable one-line summary of a comment body, for collapsed rows. */
export function toPlainText(html: string, limit = 160): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;| /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
