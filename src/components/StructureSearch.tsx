"use client";

import { useRef, useState } from "react";

/**
 * Filter the structure tree by name.
 *
 * This works on the rendered tree rather than on data, which keeps the whole
 * hierarchy server-rendered and leaves every save wired exactly as it was.
 * The tree is already on the page; matching it is a read, not a re-render.
 *
 * Nodes opt in with `data-node` and `data-search`, so nothing here knows
 * anything about sections, items or comments beyond their nesting.
 */
export function StructureSearch({ totalComments }: { totalComments: number }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number | null>(null);
  // Sections and items this search opened, so clearing puts the tree back.
  const openedBySearch = useRef<Set<HTMLDetailsElement>>(new Set());

  function open(node: HTMLElement) {
    if (node instanceof HTMLDetailsElement && !node.open) {
      node.open = true;
      openedBySearch.current.add(node);
    }
  }

  function filter(raw: string) {
    setQuery(raw);
    const needle = raw.trim().toLowerCase();

    if (needle === "") {
      for (const node of document.querySelectorAll<HTMLElement>("[data-node]")) node.hidden = false;
      for (const node of openedBySearch.current) node.open = false;
      openedBySearch.current.clear();
      setMatches(null);
      return;
    }

    let found = 0;

    for (const section of document.querySelectorAll<HTMLElement>('[data-node="section"]')) {
      const sectionHit = (section.dataset.search ?? "").includes(needle);
      let sectionVisible = sectionHit;

      for (const item of section.querySelectorAll<HTMLElement>('[data-node="item"]')) {
        const itemHit = sectionHit || (item.dataset.search ?? "").includes(needle);
        let itemVisible = itemHit;

        for (const comment of item.querySelectorAll<HTMLElement>('[data-node="comment"]')) {
          const hit = itemHit || (comment.dataset.search ?? "").includes(needle);
          comment.hidden = !hit;
          if (hit) {
            found += 1;
            itemVisible = true;
          }
        }

        item.hidden = !itemVisible;
        if (itemVisible) {
          sectionVisible = true;
          open(item);
        }
      }

      section.hidden = !sectionVisible;
      if (sectionVisible) open(section);
    }

    setMatches(found);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-1">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => filter(e.target.value)}
          placeholder="Find a section, item or comment by name"
          aria-label="Find a section, item or comment by name"
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
        />
      </div>
      <p className="w-48 shrink-0 text-right font-mono text-xs text-slate-500" aria-live="polite">
        {matches === null
          ? `${totalComments.toLocaleString()} comments`
          : matches === 0
            ? "no matches"
            : `${matches.toLocaleString()} of ${totalComments.toLocaleString()}`}
      </p>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 fill-none stroke-slate-400 stroke-2"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" strokeLinecap="round" />
    </svg>
  );
}
