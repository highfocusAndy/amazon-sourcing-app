"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 p-6 text-center">
      <div className="rounded-2xl border border-rose-500/20 bg-rose-950/20 px-8 py-10 max-w-md w-full">
        <p className="text-4xl font-bold text-rose-400">500</p>
        <h1 className="mt-3 text-xl font-semibold text-slate-100">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-400">
          An unexpected error occurred. You can try again or return to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[10px] text-slate-600">ref: {error.digest}</p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-900 transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #E8CC7A 0%, #C9A84C 60%)" }}
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
