"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { AmazonSmile } from "./AmazonSmile";
import { AppearanceSection } from "@/app/settings/AppearanceSection";
import { persistAppearanceCookies } from "@/lib/theme";

const G = "#C9A84C";
const G_DIM = "rgba(201,168,76,0.10)";
const G_BORD = "rgba(201,168,76,0.28)";

export function BuyerShell({
  children,
  userMode,
}: {
  children: React.ReactNode;
  userMode: string | null;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const isBuyer = userMode === "buyer";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Restore saved theme / mode on mount — same as seller dashboard.
  useEffect(() => {
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
    <div className="relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-slate-900/50">
      {/* Repeating HF watermark — same as seller dashboard. */}
      <BrandBackdrop variant="onDark" />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="relative z-[2] flex h-14 shrink-0 items-center gap-2 border-b border-slate-700/60 px-4 backdrop-blur-md sm:gap-3"
        style={{ background: "rgba(15,23,42,0.88)" }}
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
            className="h-9 w-auto object-contain transition duration-300 group-hover:scale-[1.04]"
            style={{ filter: "brightness(0) invert(1) drop-shadow(0 0 7px rgba(201,168,76,0.28))" }}
          />
          <span
            aria-hidden
            className="hidden h-7 w-px sm:block"
            style={{ background: "linear-gradient(to bottom, transparent, rgba(201,168,76,0.38), transparent)" }}
          />
          <span className="flex flex-col leading-tight">
            <span
              className="text-[14px] font-semibold tracking-tight sm:text-[15px]"
              style={{
                color: G,
                fontFamily: "Georgia, serif",
                fontStyle: "italic",
                textShadow: "0 0 7px rgba(201,168,76,0.13)",
              }}
            >
              Buyer Catalog
            </span>
            <span className="mt-0.5 hidden items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.10em] text-slate-500 sm:inline-flex">
              <AmazonSmile className="h-2.5 w-2.5" />
              Powered by Amazon Associates
            </span>
          </span>
        </Link>

        <div className="flex-1" />

        {/* Mode toggle — inline, hidden on very small screens */}
        <div className="hidden items-center sm:flex">
          <div
            className="flex h-8 overflow-hidden rounded-xl border"
            style={{ borderColor: G_BORD }}
          >
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
            <div className="w-px shrink-0" style={{ background: G_BORD }} />
            <span
              className="flex items-center px-3 text-[11px] font-semibold"
              style={{ background: G_DIM, color: G }}
            >
              🛍️ Buyer
            </span>
          </div>
        </div>

        {/* Settings gear */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/70 bg-slate-800/50 text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
          aria-label="App settings"
          title="Appearance settings"
        >
          ⚙
        </button>

        {/* User / sign-out — desktop only */}
        {session?.user && (
          <div className="hidden items-center gap-2 md:flex">
            <span className="max-w-[9rem] truncate text-[13px] text-slate-400">
              {session.user.name || session.user.email}
            </span>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/login" })}
              className="text-[12px] text-slate-500 underline underline-offset-2 transition hover:text-slate-300"
            >
              Sign out
            </button>
          </div>
        )}

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 sm:hidden"
          aria-label="Menu"
        >
          ☰
        </button>
      </header>

      {/* ── Main (just children — one filter sidebar inside BuyerCatalog) ─── */}
      <div className="relative z-[1] flex min-h-0 flex-1 overflow-hidden">
        {children}
      </div>

      {/* ── Mobile nav drawer ──────────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px]"
          />
          <div
            className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-slate-700/60"
            style={{ background: "#0f172a" }}
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
              <div
                className="flex h-8 overflow-hidden rounded-xl border"
                style={{ borderColor: G_BORD }}
              >
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
                <div className="w-px" style={{ background: G_BORD }} />
                <span
                  className="flex flex-1 items-center justify-center text-[11px] font-semibold"
                  style={{ background: G_DIM, color: G }}
                >
                  🛍️ Buyer
                </span>
              </div>
            </div>

            <div className="px-4 py-3">
              <Link
                href="/buyer"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition"
                style={{ color: G }}
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
              {session?.user && (
                <>
                  <p className="truncate text-[12px] text-slate-400">{session.user.name || session.user.email}</p>
                  <button
                    type="button"
                    onClick={() => void signOut({ callbackUrl: "/login" })}
                    className="mt-1 text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-300"
                  >
                    Sign out
                  </button>
                </>
              )}
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
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
          />
          <div className="relative flex w-full max-w-sm flex-col overflow-hidden border-l border-slate-700/60 shadow-2xl">
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
