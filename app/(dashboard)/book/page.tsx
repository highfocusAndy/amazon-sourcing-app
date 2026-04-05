import Link from "next/link";

export default function BookPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl shrink-0">
        <h1 className="text-xl font-bold text-slate-100 sm:text-2xl">Member playbook</h1>
        <p className="mt-1 text-sm text-slate-400">
          Your included PDF opens below. You can also{" "}
          <a
            href="/api/book/pdf?download=1"
            className="font-medium text-teal-400 underline decoration-teal-500/50 underline-offset-2 hover:text-teal-300"
          >
            download it
          </a>
          .
        </p>
      </div>
      <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-800/50 shadow-lg">
        <object
          data="/api/book/pdf#toolbar=1"
          type="application/pdf"
          className="min-h-[70vh] w-full flex-1 bg-slate-900"
          title="HIGH FOCUS playbook PDF"
        >
          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center text-sm text-slate-400">
            <p>Preview is not available in this browser.</p>
            <Link
              href="/api/book/pdf?download=1"
              className="rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-500"
            >
              Download PDF
            </Link>
          </div>
        </object>
      </div>
    </div>
  );
}
