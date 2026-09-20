"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Tracks which fields on the page have edits that have not been saved.
 *
 * Every field saves itself, so nothing here writes anything. This exists only
 * to answer one question: is there work on screen that would be lost if the
 * reader left now? Without it, typing a new section name and pressing back
 * discarded the edit in silence, which is a poor thing for an app whose whole
 * argument is that it does not lose the customer's work.
 *
 * A module-level store rather than a context, because there is exactly one
 * page and every field would otherwise need a provider threaded through it.
 * Fields remove themselves on unmount, so collapsing a section cannot leave a
 * stale entry behind.
 */

const dirty = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listen of listeners) listen();
}

export function markDirty(id: string, isDirty: boolean): void {
  const had = dirty.has(id);
  if (isDirty === had) return;
  if (isDirty) dirty.add(id);
  else dirty.delete(id);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** How many fields are currently holding unsaved edits. */
export function useUnsavedCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => dirty.size,
    () => 0,
  );
}

/** Keep one field's dirty state in the store, and clear it on unmount. */
export function useTrackUnsaved(id: string, isDirty: boolean): void {
  useEffect(() => {
    markDirty(id, isDirty);
    return () => markDirty(id, false);
  }, [id, isDirty]);
}

/**
 * Ask before leaving with unsaved edits.
 *
 * `beforeunload` covers closing the tab, reloading, and navigating to another
 * site. It does not fire for navigation inside the app, so the links that lead
 * away from the editor confirm separately, via `useConfirmLeave`.
 */
export function useWarnOnLeave(): void {
  const count = useUnsavedCount();
  useEffect(() => {
    if (count === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [count]);
}

/** Returns a guard for in-app navigation: true means it is safe to go. */
export function useConfirmLeave(): () => boolean {
  const count = useUnsavedCount();
  return useCallback(() => {
    if (count === 0) return true;
    return window.confirm(
      count === 1
        ? "One change has not been saved yet. Leave anyway and lose it?"
        : `${count} changes have not been saved yet. Leave anyway and lose them?`,
    );
  }, [count]);
}
