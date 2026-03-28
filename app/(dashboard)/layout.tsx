"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { SavedProductsProvider } from "@/app/context/SavedProductsContext";
import { ExplorerCategoryProvider, useExplorerCategoryOptional } from "@/app/context/ExplorerCategoryContext";
import { TOP_LEVEL_CATEGORIES, getSubcategoriesForCategory } from "@/lib/catalogCategories";
import { AccountSettingsModal } from "@/app/settings/AccountSettingsModal";
import { SettingsModal } from "@/app/settings/SettingsModal";

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
        active
          ? "font-semibold text-teal-300 bg-teal-500/15 border-l-2 border-teal-400 shadow-[inset_0_0_20px_-10px_rgba(20,184,166,0.3)]"
          : "text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 border-l-2 border-transparent"
      }`}
    >
      <span className={active ? "text-teal-400" : "text-slate-500"} aria-hidden>
        {icon}
      </span>
      {children}
    </Link>
  );
}

function LeftNavWithCategories({
  mobileNavOpen,
  onCloseMobile,
}: {
  mobileNavOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const ctx = useExplorerCategoryOptional();
  const { data: session, status } = useSession();
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  return (
    <nav
      id="dashboard-sidebar"
      className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-56 max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-slate-700/80 bg-gradient-to-b from-slate-900 via-slate-800/95 to-slate-900 shadow-xl shadow-black/20 transition-transform duration-200 ease-out lg:static lg:z-auto lg:max-w-none ${
        mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}
    >
      <div className="flex items-center justify-end border-b border-slate-700/80 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700/80 hover:text-white"
        >
          Close menu
        </button>
      </div>
      {/* Top: user avatar + name, or Login button */}
      <div className="border-b border-slate-700/80 px-3 py-4 bg-slate-800/40">
        {status === "loading" ? (
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 shrink-0 rounded-full bg-slate-600 animate-pulse" />
            <div className="h-4 flex-1 rounded bg-slate-600/50 animate-pulse" />
          </div>
        ) : session?.user ? (
          <>
            <button
              type="button"
              onClick={() => setShowAccountModal(true)}
              className="flex w-full items-center gap-3 min-w-0 rounded-lg px-1 py-1.5 -mx-1 transition-colors hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:ring-offset-2 focus:ring-offset-slate-800"
              title="Account settings"
            >
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full border-2 border-teal-500/30 object-cover ring-2 ring-slate-700"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-sm font-semibold text-white shadow-lg shadow-teal-500/20">
                  {(session.user.name || session.user.email || "?")[0].toUpperCase()}
                </div>
              )}
              <span className="truncate text-sm font-medium text-slate-200" title={session.user.name || session.user.email || undefined}>
                {session.user.name || session.user.email || "Signed in"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="mt-1 text-[11px] text-slate-400 underline underline-offset-2 decoration-slate-500 hover:text-slate-100"
            >
              Sign out
            </button>
            {showAccountModal && (
              <AccountSettingsModal
                onClose={() => setShowAccountModal(false)}
                userEmail={session.user.email ?? undefined}
              />
            )}
          </>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 hover:from-teal-400 hover:to-cyan-500 transition-all duration-200"
          >
            Login
          </Link>
        )}
      </div>

      <div className="px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Menu
        </p>
      </div>
      <div>
        <NavLink href="/" active={pathname === "/"} icon="◆">
          Explorer
        </NavLink>
        {pathname === "/" && ctx && (
          <>
            <button
              type="button"
              onClick={() => ctx.setCategoriesOpen(!ctx.categoriesOpen)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 border-l-2 border-transparent w-full text-left transition-colors"
            >
              <span className={`text-slate-500 shrink-0 transition-transform ${ctx.categoriesOpen ? "rotate-90" : ""}`} aria-hidden>▶</span>
              <span>Categories</span>
            </button>
            {ctx.categoriesOpen && (
              <ul className="max-h-[60vh] overflow-y-auto py-1 text-sm">
                {TOP_LEVEL_CATEGORIES.map((cat) => {
                  const isExpanded = ctx.expandedCategory === cat;
                  const subs = getSubcategoriesForCategory(cat);
                  return (
                    <li key={cat}>
                      <button
                        type="button"
                        onClick={() => ctx.setExpandedCategory(isExpanded ? null : cat)}
                        className="flex items-center gap-2 px-4 py-1.5 pl-8 text-left text-slate-300 hover:bg-slate-700/60 hover:text-teal-200/90 w-full transition-colors"
                      >
                        <span className={`shrink-0 text-slate-500 text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                        <span className="truncate">{cat}</span>
                      </button>
                      {isExpanded && (
                        <ul className="pb-1">
                          {subs.map((sub) => (
                            <li key={sub}>
                              <button
                                type="button"
                                onClick={() => {
                                  const same = ctx.selectedCategory === cat && ctx.selectedSubcategory === sub;
                                  ctx.setSelectedCategory(same ? null : cat);
                                  ctx.setSelectedSubcategory(same ? null : sub);
                                }}
                                className={`block w-full py-1 pl-12 pr-2 text-left text-xs truncate transition-colors ${
                                  ctx.selectedCategory === cat && ctx.selectedSubcategory === sub
                                    ? "bg-teal-500/25 text-teal-200 font-semibold"
                                    : "text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
                                }`}
                              >
                                {sub}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
      <NavLink href="/analyzer" active={pathname === "/analyzer"} icon="▷">
        Analyzer
      </NavLink>
      <NavLink href="/saved" active={pathname === "/saved"} icon="★">
        Saved Products
      </NavLink>
      <div className="mt-auto border-t border-slate-700/80 pt-2 bg-slate-800/30">
        <button
          type="button"
          onClick={() => setShowSettingsModal(true)}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-700/60 hover:text-teal-300 transition-colors"
        >
          <span className="text-slate-500" aria-hidden>⚙</span>
          Settings
        </button>
        {showSettingsModal && (
          <SettingsModal onClose={() => setShowSettingsModal(false)} />
        )}
      </div>
    </nav>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <SavedProductsProvider>
      <ExplorerCategoryProvider>
        <div className="flex min-h-screen min-h-[100dvh] w-full bg-slate-900/50">
          {mobileNavOpen ? (
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] lg:hidden"
              aria-label="Close menu"
              onClick={() => setMobileNavOpen(false)}
            />
          ) : null}
          <LeftNavWithCategories
            mobileNavOpen={mobileNavOpen}
            onCloseMobile={() => setMobileNavOpen(false)}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-[env(safe-area-inset-top)] lg:pt-0">
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-700/80 bg-slate-900/95 px-3 py-2 backdrop-blur-md lg:hidden">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                aria-expanded={mobileNavOpen}
                aria-controls="dashboard-sidebar"
                aria-label="Open menu"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                </svg>
              </button>
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-slate-100">
                HIGH FOCUS Sourcing
              </span>
            </header>
            <div className="min-h-0 min-w-0 flex-1">{children}</div>
          </div>
        </div>
      </ExplorerCategoryProvider>
    </SavedProductsProvider>
  );
}
