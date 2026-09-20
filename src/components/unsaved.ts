"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

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

// id -> a function that saves that field. Holding the callback, not just the
// id, is what lets one button commit everything at once.
const dirty = new Map<string, () => void>();
const listeners = new Set<() => void>();

function emit() {
  for (const listen of listeners) listen();
}

export function markDirty(id: string, isDirty: boolean, commit?: () => void): void {
  const had = dirty.has(id);
  if (!isDirty) {
    if (!had) return;
    dirty.delete(id);
    emit();
    return;
  }
  // Always refresh the callback: it closes over the field's current value.
  dirty.set(id, commit ?? (() => {}));
  if (!had) emit();
}

/** Save every field holding an unsaved edit. */
export function saveAllDirty(): void {
  for (const commit of [...dirty.values()]) commit();
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

/**
 * Keep one field's dirty state and its save function in the store, and clear
 * both on unmount. `commit` is read through a ref so the stored callback always
 * saves the field's latest value rather than the value it had when registered.
 */
export function useTrackUnsaved(id: string, isDirty: boolean, commit: () => void): void {
  const latest = useRef(commit);

  // Refresh after every render, so the stored callback is never stale.
  useEffect(() => {
    latest.current = commit;
  });

  useEffect(() => {
    markDirty(id, isDirty, () => latest.current());
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
