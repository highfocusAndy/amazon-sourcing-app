"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { SavedProductsProvider } from "@/app/context/SavedProductsContext";
import { DashboardSettingsProvider } from "@/app/context/DashboardSettingsContext";
import { ExplorerCategoryProvider, useExplorerCategoryOptional } from "@/app/context/ExplorerCategoryContext";
import { TOP_LEVEL_CATEGORIES, getSubcategoriesForCategory } from "@/lib/catalogCategories";
import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { AccountSettingsModal } from "@/app/settings/AccountSettingsModal";
import { DashboardHeaderMark } from "@/app/components/DashboardHeaderMark";
import { MobileHeaderAmazon } from "@/app/components/MobileHeaderAmazon";
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
  onOpenSettings,
}: {
  mobileDrawerOpen: boolean;
  onCloseMobileMenu: () => void;
  onOpenSettings: () => void;
}) {
  const pathname = usePathname();
  const ctx = useExplorerCategoryOptional();
  const { data: session, status } = useSession();
  const [showAccountModal, setShowAccountModal] = useState(false);

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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Menu</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <NavLink href="/" active={pathname === "/"} icon="◆" onNavigate={onCloseMobileMenu}>
            Explorer
          </NavLink>
          {pathname === "/" && ctx && (
            <>
              <button
                type="button"
                onClick={() => ctx.setCategoriesOpen(!ctx.categoriesOpen)}
                className="flex w-full items-center gap-3 border-l-2 border-transparent px-4 py-2 text-left text-sm text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-200"
              >
                <span
                  className={`shrink-0 text-slate-500 transition-transform ${ctx.categoriesOpen ? "rotate-90" : ""}`}
                  aria-hidden
                >
                  ▶
                </span>
                <span>Categories</span>
              </button>
              {ctx.categoriesOpen && (
                <ul className="py-1 text-sm">
                  {TOP_LEVEL_CATEGORIES.map((cat) => {
                    const isExpanded = ctx.expandedCategory === cat;
                    const subs = getSubcategoriesForCategory(cat);
                    return (
                      <li key={cat}>
                        <button
                          type="button"
                          onClick={() => ctx.setExpandedCategory(isExpanded ? null : cat)}
                          className="flex w-full items-center gap-2 px-4 py-1.5 pl-8 text-left text-slate-300 transition-colors hover:bg-slate-700/60 hover:text-teal-200/90"
                        >
                          <span
                            className={`shrink-0 text-[10px] text-slate-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          >
                            ▶
                          </span>
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
                                  className={`block w-full truncate py-1 pl-12 pr-2 text-left text-xs transition-colors ${
                                    ctx.selectedCategory === cat && ctx.selectedSubcategory === sub
                                      ? "bg-teal-500/25 font-semibold text-teal-200"
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
          <NavLink href="/analyzer" active={pathname === "/analyzer"} icon="▷" onNavigate={onCloseMobileMenu}>
            Analyzer
          </NavLink>
          <NavLink href="/saved" active={pathname === "/saved"} icon="★" onNavigate={onCloseMobileMenu}>
            Saved Products
          </NavLink>
          <NavLink href="/book" active={pathname === "/book"} icon="📘" onNavigate={onCloseMobileMenu}>
            Playbook
          </NavLink>
          <NavLink href="/subscribe" active={pathname === "/subscribe"} icon="◈" onNavigate={onCloseMobileMenu}>
            Plan & billing
          </NavLink>
        </div>
      </div>
      <div className="shrink-0 border-t border-slate-700/80 bg-slate-800/30 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onCloseMobileMenu();
          }}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-teal-300"
        >
          <span className="text-slate-500" aria-hidden>
            ⚙
          </span>
          Settings
        </button>
      </div>
    </nav>
  );
}

function mobilePageTitle(pathname: string): string {
  const p = pathname.split("?")[0] ?? pathname;
  if (p === "/" || p === "") return "Explorer";
  if (p.startsWith("/analyzer")) return "Analyzer";
  if (p.startsWith("/saved")) return "Saved";
  if (p.startsWith("/book")) return "Playbook";
  if (p.startsWith("/subscribe")) return "Plan & billing";
  return "HIGH FOCUS";
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
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

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
        <DashboardSettingsProvider openSettings={() => setSettingsModalOpen(true)}>
        <div className="relative h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-slate-900/50">
          <BrandBackdrop variant="onDark" />
          <div className="relative z-[1] flex h-full min-h-0 w-full flex-col md:flex-row">
            <header className="sticky top-0 z-40 shrink-0 border-b border-slate-700/80 bg-slate-900/95 px-3 py-2 backdrop-blur-md md:hidden">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <MobileMenuOpenButton onClick={() => setMobileDrawerOpen(true)} menuOpen={mobileDrawerOpen} />
                  <span
                    className="max-w-[4.25rem] text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-slate-400"
                    title={mobilePageTitle(pathname)}
                  >
                    {mobilePageTitle(pathname)}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-0">
                  <DashboardHeaderMark variant="compact" />
                  <span className="min-w-0 pl-0.5 text-xs font-bold leading-tight tracking-tight text-slate-100 sm:pl-1 sm:text-base sm:leading-snug">
                    <span className="sm:hidden">Sourcing App</span>
                    <span className="hidden sm:inline">HIGH FOCUS Sourcing App</span>
                  </span>
                </div>
                <MobileHeaderAmazon />
              </div>
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
              onOpenSettings={() => setSettingsModalOpen(true)}
            />
            {!mobileDrawerOpen && !pathname.startsWith("/analyzer") ? (
              <button
                type="button"
                onClick={() => setSettingsModalOpen(true)}
                className="pointer-events-auto fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-[44] flex h-12 w-12 items-center justify-center rounded-full border border-slate-600 bg-slate-800/95 text-lg text-slate-200 shadow-lg shadow-black/30 backdrop-blur-sm transition hover:border-teal-500/50 hover:bg-slate-700 hover:text-teal-200 md:hidden"
                aria-label="Settings"
                title="Settings"
              >
                <span aria-hidden>⚙</span>
              </button>
            ) : null}
            {settingsModalOpen ? <SettingsModal onClose={() => setSettingsModalOpen(false)} /> : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
          </div>
        </div>
        </DashboardSettingsProvider>
      </ExplorerCategoryProvider>
    </SavedProductsProvider>
  );
}
