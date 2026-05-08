"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin/users", label: "Users", icon: "👤" },
  { href: "/admin/promos", label: "Promo Codes", icon: "🎟" },
  { href: "/admin/usage", label: "Usage", icon: "📊" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              title="Back to app"
            >
              ← App
            </Link>
            <span className="text-slate-700">|</span>
            <span className="text-sm font-bold tracking-tight text-teal-400">⚡ Admin</span>
          </div>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-teal-500/20 font-semibold text-teal-300"
                      : "text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
