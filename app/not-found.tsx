import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 p-6 text-center">
      <div className="max-w-md w-full">
        <p className="text-6xl font-bold text-slate-700">404</p>
        <h1 className="mt-4 text-xl font-semibold text-slate-100">Page not found</h1>
        <p className="mt-2 text-sm text-slate-400">
          This page doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-xl px-6 py-2.5 text-sm font-bold text-slate-900 transition hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #E8CC7A 0%, #C9A84C 60%)" }}
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
