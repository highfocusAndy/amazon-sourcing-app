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
    <div
      id="admin-shell-bg"
      className="relative min-h-screen overflow-x-hidden text-slate-100"
      style={{ background: "rgb(var(--bg-body-base))" }}
    >
      {/* Ambient glow — tracks the active accent colour */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgb(var(--accent) / 0.14), transparent 55%)",
            "radial-gradient(ellipse 60% 40% at 100% 0%,   rgb(var(--accent-2) / 0.07), transparent 50%)",
            "radial-gradient(ellipse 50% 35% at 0%   100%, rgb(var(--accent) / 0.05), transparent 45%)",
          ].join(","),
        }}
        aria-hidden
      />
      <header
        id="admin-shell-header"
        className="sticky top-0 z-30 border-b border-white/[0.07] backdrop-blur-2xl shadow-[0_20px_50px_-28px_rgba(0,0,0,0.85)]"
        style={{ background: "rgb(var(--bg-body-base) / 0.88)" }}
      >
        {/* Accent hairline under the header */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{ background: "linear-gradient(to right, transparent, rgb(var(--accent) / 0.28), transparent)" }}
          aria-hidden
        />
        <div className="relative mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              prefetch={false}
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:text-slate-200"
            >
              ← Workspace
            </Link>
            <span className="hidden h-5 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent sm:inline-block" aria-hidden />
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white"
              style={{
                border: "1px solid rgb(var(--accent) / 0.38)",
                background: "linear-gradient(135deg, rgb(var(--accent) / 0.16) 0%, rgb(var(--accent) / 0.04) 100%)",
                boxShadow: "0 0 24px -4px rgb(var(--accent) / 0.35)",
              }}
            >
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
                      ? "bg-white/[0.1] font-semibold text-white"
                      : "font-medium text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
                  }`}
                  style={
                    active
                      ? {
                          outline: "1px solid rgb(var(--accent) / 0.28)",
                          outlineOffset: "-1px",
                          boxShadow: "0 1px 0 0 rgba(255,255,255,0.08), 0 12px 38px -14px rgb(var(--accent) / 0.28)",
                        }
                      : undefined
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main id="admin-main-content" className="relative mx-auto max-w-[1400px] px-4 pb-14 pt-10">{children}</main>
    </div>
  );
}
