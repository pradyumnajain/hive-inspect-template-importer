import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitise comment HTML at render time, never on the way in.
 *
 * Storing a cleaned version would silently rewrite the customer's content,
 * which is the one thing this importer must not do. The database keeps the
 * export byte for byte; this is the only place anything is stripped, and only
 * for the browser's benefit.
 *
 * The allowlist covers everything the real export uses (p, a, strong, div)
 * plus the obvious rich-text neighbours an inspector might have added.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "a",
  "span",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

export function sanitizeCommentHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "target", "rel", "title"],
    // Anything that could execute or phone out.
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
    ALLOW_DATA_ATTR: false,
  });
}

/** Plain text preview for collapsed rows. */
export function toPlainText(html: string, limit = 160): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;| /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
