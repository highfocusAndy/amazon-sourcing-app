import Link from "next/link";
import type { ReactNode } from "react";
import { appDisplayName } from "@/lib/appBranding";

/** Readable layout for `/terms` and `/privacy` — light, matches auth marketing pages. */
export function LegalDocShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const appName = appDisplayName;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/30 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-3xl">

        {/* Top nav */}
        <nav className="flex items-center justify-between">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-teal-700"
          >
            <span aria-hidden className="text-base leading-none">←</span>
            Back to sign in
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href="/terms" className="font-medium text-slate-500 transition-colors hover:text-teal-700">
              Terms
            </Link>
            <Link href="/privacy" className="font-medium text-slate-500 transition-colors hover:text-teal-700">
              Privacy
            </Link>
          </div>
        </nav>

        {/* Header */}
        <header className="mt-10 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-teal-600/80">{appName}</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-slate-400">Last updated: {updated}</p>
        </header>

        {/* Divider */}
        <div className="mt-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-200" />
          <div className="h-1.5 w-1.5 rounded-full bg-teal-400" />
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Document body */}
        <article className="mt-8 space-y-8 rounded-2xl border border-slate-200/80 bg-white px-6 py-8 text-slate-700 shadow-xl shadow-slate-200/50 sm:px-10 sm:py-10
          [&_a]:text-teal-700 [&_a:hover]:underline
          [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:text-slate-700
          [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:sm:text-lg
          [&_li]:mt-1.5 [&_li]:leading-relaxed
          [&_ol]:list-decimal [&_ol]:pl-6
          [&_p]:leading-relaxed
          [&_section]:scroll-mt-8
          [&_strong]:font-semibold [&_strong]:text-slate-900
          [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </article>

        {/* Footer */}
        <footer className="mt-10 border-t border-slate-200 pt-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <p className="text-xs text-slate-400">
              &copy; {new Date().getFullYear()} {appName}. All rights reserved.
            </p>
            <nav aria-label="Legal links" className="flex items-center gap-5 text-sm">
              <Link href="/terms" className="font-medium text-slate-500 transition-colors hover:text-teal-700">
                Terms of Service
              </Link>
              <span className="text-slate-300" aria-hidden>·</span>
              <Link href="/privacy" className="font-medium text-slate-500 transition-colors hover:text-teal-700">
                Privacy Policy
              </Link>
              <span className="text-slate-300" aria-hidden>·</span>
              <Link href="/get-access" className="font-medium text-teal-700 transition-colors hover:text-teal-600">
                Get access
              </Link>
            </nav>
          </div>
        </footer>

      </div>
    </div>
  );
}
