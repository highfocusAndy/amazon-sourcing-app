"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { AmazonSmile } from "./AmazonSmile";
import { AppearanceSection } from "@/app/settings/AppearanceSection";
import { persistAppearanceCookies, initAppearance } from "@/lib/theme";

export function BuyerShell({
  children,
  userMode,
  userDisplayName,
}: {
  children: React.ReactNode;
  userMode: string | null;
  userDisplayName: string;
}) {
  const router = useRouter();
  const isBuyer = userMode === "buyer";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Restore saved theme / mode on mount — same as seller dashboard.
  useEffect(() => {
    initAppearance();
    persistAppearanceCookies();
  }, []);

  // Lock body scroll while any overlay is open.
  useEffect(() => {
    if (settingsOpen || mobileMenuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [settingsOpen, mobileMenuOpen]);

  return (
    <div id="buyer-shell" className="relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="buyer-header relative z-[2] flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4"
      >
        {/* Logo + title */}
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 transition hover:opacity-90"
          aria-label="HIGH FOCUS – Buyer Catalog"
        >
          <img
            src="/HF_LOGO.png"
            alt=""
            aria-hidden
            className="buyer-logo h-10 w-auto object-contain transition duration-300 group-hover:scale-[1.04]"
          />
          <span
            aria-hidden
            className="buyer-title-divider hidden h-7 w-px sm:block"
          />
          <span className="flex flex-col leading-tight">
            <span
              className="buyer-title text-[14px] font-semibold tracking-tight sm:text-[15px]"
              style={{
                fontFamily: "Georgia, serif",
                fontStyle: "italic",
              }}
            >
              Buyer Catalog
            </span>
            <span className="buyer-header-subtitle mt-0.5 hidden items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.10em] sm:inline-flex">
              <AmazonSmile className="h-2.5 w-2.5" color="currentColor" />
              Powered by Amazon Associates
            </span>
          </span>
        </Link>

        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
        {/* Mode toggle — inline, hidden on very small screens */}
        <div className="hidden items-center sm:flex">
          <div className="buyer-mode-toggle flex h-8 overflow-hidden rounded-xl border">
            {isBuyer ? (
              <button
                type="button"
                disabled
                className="cursor-not-allowed px-3 text-[11px] font-semibold text-slate-600"
                aria-label="Upgrade to unlock Seller mode"
              >
                🔒 Seller
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="px-3 text-[11px] font-semibold text-slate-400 transition hover:text-slate-200"
              >
                Seller
              </button>
            )}
            <div className="buyer-mode-toggle__divider w-px shrink-0" />
            <span className="buyer-mode-toggle__active flex items-center px-3 text-[11px] font-semibold">
              🛍️ Buyer
            </span>
          </div>
        </div>

        {/* Settings gear */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="buyer-icon-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition"
          aria-label="App settings"
          title="Appearance settings"
        >
          ⚙
        </button>

        {/* User / sign-out — always visible (name from server session) */}
        <div className="buyer-header-user flex shrink-0 items-center gap-2">
          <span className="buyer-header-user-name max-w-[7rem] truncate text-[11px] sm:max-w-[9rem] sm:text-[13px]">
            {userDisplayName}
          </span>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/login" })}
            className="buyer-header-signout shrink-0 text-[11px] underline underline-offset-2 sm:text-[12px]"
          >
            Sign out
          </button>
        </div>

        {/* Mobile hamburger — only when header is too tight */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="buyer-icon-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border md:hidden"
          aria-label="Menu"
        >
          ☰
        </button>
        </div>
      </header>

      {/* ── Main (just children — one filter sidebar inside BuyerCatalog) ─── */}
      <div className="relative z-[1] flex min-h-0 flex-1 overflow-hidden">
        {children}
      </div>

      {/* Amazon Associates disclosure — always visible (affiliate program requirement). */}
      <footer
        className="buyer-disclosure relative z-[2] shrink-0 border-t px-4 py-2.5 text-center text-[11px] leading-relaxed"
      >
        As an Amazon Associate, we earn from qualifying purchases.
      </footer>

      {/* ── Mobile nav drawer ──────────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
            className="buyer-overlay absolute inset-0 backdrop-blur-[2px]"
          />
          <div
            className="buyer-drawer-panel absolute left-0 top-0 flex h-full w-64 flex-col border-r"
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
              <span className="text-sm font-semibold text-slate-200">Menu</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="text-2xl leading-none text-slate-400 hover:text-slate-100"
              >
                ×
              </button>
            </div>

            {/* Mode toggle */}
            <div className="border-b border-slate-700/60 px-4 py-3">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">Mode</p>
              <div className="buyer-mode-toggle flex h-8 overflow-hidden rounded-xl border">
                {isBuyer ? (
                  <button type="button" disabled className="flex-1 cursor-not-allowed text-[11px] font-semibold text-slate-600">
                    🔒 Seller
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); router.push("/dashboard"); }}
                    className="flex-1 text-[11px] font-semibold text-slate-400 transition hover:text-slate-200"
                  >
                    Seller
                  </button>
                )}
                <div className="buyer-mode-toggle__divider w-px" />
                <span className="buyer-mode-toggle__active flex flex-1 items-center justify-center text-[11px] font-semibold">
                  🛍️ Buyer
                </span>
              </div>
            </div>

            <div className="px-4 py-3">
              <Link
                href="/buyer"
                onClick={() => setMobileMenuOpen(false)}
                className="buyer-nav-link--active flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition"
              >
                🛍️ Browse Catalog
              </Link>
              {userMode !== "buyer" && (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-slate-400 transition hover:text-slate-200"
                >
                  ◆ Seller Dashboard
                </Link>
              )}
            </div>

            <div className="mt-auto border-t border-slate-700/60 px-4 py-4">
              <p className="truncate text-[12px] text-slate-400">{userDisplayName}</p>
              <button
                type="button"
                onClick={() => void signOut({ callbackUrl: "/login" })}
                className="mt-1 text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-300"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Appearance settings drawer (slides in from right) ──────────────── */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Appearance settings">
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => setSettingsOpen(false)}
            className="buyer-overlay absolute inset-0 backdrop-blur-[2px]"
          />
          <div className="buyer-drawer-panel relative flex w-full max-w-sm flex-col overflow-hidden border-l shadow-2xl">
            {/* Drawer header */}
            <div
              className="flex shrink-0 items-center justify-between border-b border-slate-200/80 px-5 py-4"
              style={{ background: "#f8fafc" }}
            >
              <div>
                <p className="text-[15px] font-semibold text-slate-800">Appearance</p>
                <p className="text-[11px] text-slate-500">Theme &amp; display settings</p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto bg-white px-5 py-5">
              <AppearanceSection />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
