/**
 * Shared class strings, so a button in the template list and a button in the
 * editor cannot drift apart.
 *
 * Three button weights and no more. Primary is ink, because ink is the only
 * colour allowed to carry an action; green is reserved for preservation being
 * confirmed and must not be spent on a button.
 */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export const btn = {
  /** The one action we want the eye to land on. */
  primary: `${BUTTON_BASE} bg-slate-900 px-3.5 py-2 text-white hover:bg-slate-700`,
  /** Everything else that is still a real action. */
  secondary: `${BUTTON_BASE} border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50`,
  /** Save, and other frequent inline actions. Quiet until it has something to do. */
  quiet: `${BUTTON_BASE} px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900`,
  /** Destructive, kept subtle until hover so it is never the loudest thing. */
  danger: `${BUTTON_BASE} px-2.5 py-1.5 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700`,
} as const;

export const input =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:border-slate-900 focus:outline-none";

/** A value that came out of the customer's spreadsheet. Always monospace. */
export const chip =
  "inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600";

export const card = "rounded-lg border border-slate-200 bg-white";
