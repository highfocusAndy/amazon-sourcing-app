import Link from "next/link";
import type { ReactNode } from "react";

/** Simple readable layout for `/terms` and `/privacy` (light, matches auth marketing pages). */
export function LegalDocShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/30 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="text-center">
          <Link href="/login" className="text-sm font-semibold text-teal-700 hover:text-teal-600 hover:underline">
            ← Back to sign in
          </Link>
        </p>
        <header className="mt-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
        </header>
        <article className="mt-10 space-y-8 rounded-2xl border border-slate-200/80 bg-white px-6 py-8 text-slate-700 shadow-lg shadow-slate-200/40 sm:px-10 sm:py-10 [&_h2]:mt-0 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:first:mt-0 [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:leading-relaxed [&_strong]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </article>
        <footer className="mt-8 text-center">
          <Link href="/terms" className="text-sm text-teal-700 hover:underline">
            Terms
          </Link>
          {" · "}
          <Link href="/privacy" className="text-sm text-teal-700 hover:underline">
            Privacy
          </Link>
          {" · "}
          <Link href="/get-access" className="text-sm text-teal-700 hover:underline">
            Get access
          </Link>
        </footer>
      </div>
    </div>
  );
}
