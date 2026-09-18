import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spectora template importer",
  description:
    "Import, review and edit Spectora inspection templates without losing the customer's work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-3.5">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-slate-900 hover:text-slate-600"
            >
              Spectora template importer
            </Link>
            <Link
              href="/import"
              className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              Import a template
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-8 py-10">{children}</main>
      </body>
    </html>
  );
}
