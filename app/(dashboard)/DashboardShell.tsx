"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { SavedProductsProvider } from "@/app/context/SavedProductsContext";
import { ExplorerCategoryProvider, useExplorerCategoryOptional } from "@/app/context/ExplorerCategoryContext";
import { TOP_LEVEL_CATEGORIES, getSubcategoriesForCategory } from "@/lib/catalogCategories";
import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { AccountSettingsModal } from "@/app/settings/AccountSettingsModal";
import { SettingsModal } from "@/app/settings/SettingsModal";

function NavLink({
  href,
  active,
  icon,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={() => onNavigate?.()}
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
  mobileDrawerOpen,
  onCloseMobileMenu,
}: {
  mobileDrawerOpen: boolean;
  onCloseMobileMenu: () => void;
}) {
  const pathname = usePathname();
  const ctx = useExplorerCategoryOptional();
  const { data: session, status } = useSession();
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  return (
    <nav
      id="dashboard-sidebar-nav"
      className={`flex h-[100dvh] w-[min(18rem,100vw)] shrink-0 flex-col overflow-hidden border-r border-slate-700/80 bg-gradient-to-b from-slate-900 via-slate-800/95 to-slate-900 shadow-xl shadow-black/20 transition-transform duration-200 ease-out md:sticky md:top-0 md:z-auto md:w-56 md:translate-x-0 ${
        mobileDrawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      } fixed left-0 top-0 z-50 max-md:shadow-2xl`}
    >
      <div className="flex items-center justify-end border-b border-slate-700/80 px-2 py-2 md:hidden">
        <button
          type="button"
          onClick={onCloseMobileMenu}
          className="rounded-lg p-2.5 text-slate-400 transition-colors hover:bg-slate-700/80 hover:text-slate-100"
          aria-label="Close menu"
        >
          <span className="block text-2xl leading-none" aria-hidden>
            ×
          </span>
        </button>
      </div>
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
              onClick={() => {
                setShowAccountModal(true);
                onCloseMobileMenu();
              }}
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
              onClick={() => {
                onCloseMobileMenu();
                void signOut({ callbackUrl: "/login" });
              }}
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
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Menu</p>
      </div>
      <div>
        <NavLink href="/" active={pathname === "/"} icon="◆" onNavigate={onCloseMobileMenu}>
          Explorer
        </NavLink>
        {pathname === "/" && ctx && (
          <>
            <button
              type="button"
              onClick={() => ctx.setCategoriesOpen(!ctx.categoriesOpen)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 border-l-2 border-transparent w-full text-left transition-colors"
            >
              <span className={`text-slate-500 shrink-0 transition-transform ${ctx.categoriesOpen ? "rotate-90" : ""}`} aria-hidden>
                ▶
              </span>
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
                                  onCloseMobileMenu();
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
      <NavLink href="/analyzer" active={pathname === "/analyzer"} icon="▷" onNavigate={onCloseMobileMenu}>
        Analyzer
      </NavLink>
      <NavLink href="/saved" active={pathname === "/saved"} icon="★" onNavigate={onCloseMobileMenu}>
        Saved Products
      </NavLink>
      <NavLink href="/subscribe" active={pathname === "/subscribe"} icon="◈" onNavigate={onCloseMobileMenu}>
        Plan & billing
      </NavLink>
      <div className="mt-auto border-t border-slate-700/80 pt-2 bg-slate-800/30">
        <button
          type="button"
          onClick={() => setShowSettingsModal(true)}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-700/60 hover:text-teal-300 transition-colors"
        >
          <span className="text-slate-500" aria-hidden>
            ⚙
          </span>
          Settings
        </button>
        {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
      </div>
    </nav>
  );
}

function MobileMenuOpenButton({ onClick, menuOpen }: { onClick: () => void; menuOpen: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-slate-200 shadow-sm hover:bg-slate-700"
      aria-label="Open menu"
      aria-expanded={menuOpen}
      aria-controls="dashboard-sidebar-nav"
    >
      <span className="flex flex-col gap-1.5" aria-hidden>
        <span className="block h-0.5 w-5 rounded-full bg-current" />
        <span className="block h-0.5 w-5 rounded-full bg-current" />
        <span className="block h-0.5 w-5 rounded-full bg-current" />
      </span>
    </button>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileDrawerOpen]);

  return (
    <SavedProductsProvider>
      <ExplorerCategoryProvider>
        <div className="relative min-h-screen min-h-[100dvh] w-full bg-slate-900/50">
          <BrandBackdrop variant="onDark" />
          <div className="relative z-[1] flex min-h-screen min-h-[100dvh] w-full flex-col md:flex-row">
            <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-slate-700/80 bg-slate-900/95 px-3 backdrop-blur-md md:hidden">
              <MobileMenuOpenButton onClick={() => setMobileDrawerOpen(true)} menuOpen={mobileDrawerOpen} />
              <span className="truncate text-sm font-semibold text-slate-100">HIGH FOCUS</span>
            </header>
            {mobileDrawerOpen ? (
              <button
                type="button"
                className="fixed inset-0 z-[45] bg-slate-950/50 backdrop-blur-[1px] md:hidden"
                aria-label="Close menu"
                onClick={() => setMobileDrawerOpen(false)}
              />
            ) : null}
            <LeftNavWithCategories
              mobileDrawerOpen={mobileDrawerOpen}
              onCloseMobileMenu={() => setMobileDrawerOpen(false)}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
          </div>
        </div>
      </ExplorerCategoryProvider>
    </SavedProductsProvider>
  );
}
