"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/promos", label: "Promos" },
  { href: "/admin/legal", label: "Legal" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Force a full reload when the browser restores this page from bfcache,
  // so the server-side password check always re-runs.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050608] text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgb(13_148_136/0.14),transparent_55%),radial-gradient(ellipse_60%_40%_at_100%_0%,rgb(139_92_246/0.07),transparent_50%),radial-gradient(ellipse_50%_35%_at_0%_100%,rgb(13_148_136/0.05),transparent_45%)]"
        aria-hidden
      />
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#07090d]/88 backdrop-blur-2xl shadow-[0_20px_50px_-28px_rgba(0,0,0,0.85)]">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-teal-500/25 to-transparent" aria-hidden />
        <div className="relative mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:text-teal-300"
            >
              ← Workspace
            </Link>
            <span className="hidden h-5 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent sm:inline-block" aria-hidden />
            <span className="rounded-md border border-teal-400/35 bg-gradient-to-br from-teal-500/15 to-teal-500/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-100 shadow-[0_0_24px_-4px_rgb(45_212_191/0.35)]">
              Admin
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-0.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
            {NAV_ITEMS.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-[13px] transition-all duration-200 ${
                    active
                      ? "bg-white/[0.1] font-semibold text-white shadow-[0_1px_0_0_rgba(255,255,255,0.08),0_12px_38px_-14px_rgb(45_212_191/0.22)] ring-1 ring-teal-500/25"
                      : "font-medium text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1400px] px-4 pb-14 pt-10">{children}</main>
    </div>
  );
}
