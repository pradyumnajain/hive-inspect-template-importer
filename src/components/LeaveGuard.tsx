"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveAllDirty,
  useConfirmLeave,
  useUnsavedCount,
  useWarnOnLeave,
} from "@/components/unsaved";

/**
 * Warns before unsaved edits are thrown away.
 *
 * Mount once per editor page. It covers closing the tab, reloading and leaving
 * the site. Navigation inside the app does not fire `beforeunload`, so the
 * links that lead out of the editor use `BackLink` below.
 *
 * Known gap: the browser's own back button during a client-side navigation is
 * not covered. Intercepting that in the App Router means patching history, and
 * a half-working hack is worse than a documented limit.
 */
export function LeaveGuard() {
  useWarnOnLeave();
  return null;
}

/** A link out of the editor that asks first if anything is unsaved. */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const confirmLeave = useConfirmLeave();

  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        if (confirmLeave()) router.push(href);
      }}
    >
      {children}
    </Link>
  );
}

/** A quiet count, so the reader can see there is something outstanding. */
export function UnsavedCount({ className }: { className?: string }) {
  const count = useUnsavedCount();
  if (count === 0) return null;
  return (
    <span className={className}>
      {count === 1 ? "1 unsaved change" : `${count} unsaved changes`}
    </span>
  );
}

/**
 * Saves every field holding an unsaved edit.
 *
 * Each field keeps its own Save, which is how you demonstrate one change
 * reaching the database. This is the convenience on top, for someone who has
 * renamed several things and does not want to click through them one at a
 * time. It says how many changes it will write, and it is disabled when there
 * is nothing to write, so it never claims something is outstanding when
 * nothing is.
 */
export function SaveAllButton({ className }: { className?: string }) {
  const count = useUnsavedCount();
  return (
    <button
      type="button"
      onClick={() => saveAllDirty()}
      disabled={count === 0}
      className={className}
      title={count === 0 ? "Nothing to save" : undefined}
    >
      {count === 0 ? "Saved" : count === 1 ? "Save 1 change" : `Save ${count} changes`}
    </button>
  );
}
