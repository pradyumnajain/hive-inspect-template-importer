"use client";

import DOMPurify from "dompurify";
import { useMemo } from "react";

/**
 * Render a comment's stored HTML, sanitised immediately before it is inserted.
 *
 * Why the browser and not the server. DOMPurify needs a DOM. On the server
 * that means jsdom, which traced 1,294 files into this one route and is a poor
 * thing to cold-start inside a serverless function just to clean a paragraph
 * of markup. In the browser DOMPurify uses the DOM that is already there, and
 * this is the pattern it is designed for: sanitise, then insert, with no gap
 * in between.
 *
 * This only renders once the reader opens a comment's text, which happens
 * after hydration, so there is no server pass to worry about. The
 * `isSupported` guard is belt and braces: without a DOM, DOMPurify would hand
 * the input straight back, so in that case nothing is inserted at all.
 *
 * Storage is unchanged. The database keeps the export byte for byte; this is
 * the only place anything is ever stripped.
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

export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => {
    if (!DOMPurify.isSupported) return null;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ["href", "target", "rel", "title"],
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
      FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
      ALLOW_DATA_ATTR: false,
    });
  }, [html]);

  if (clean === null) return <div className={className} aria-busy="true" />;
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
