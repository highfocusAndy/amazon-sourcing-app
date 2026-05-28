"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { AmazonSmile } from "./AmazonSmile";

const G = "#C9A84C";

function ModeToggle({ userMode }: { userMode: string | null }) {
  const router = useRouter();
  const isBuyer = userMode === "buyer";
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="px-3 py-3">
      <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">Mode</p>
      <div
        className="flex h-8 overflow-hidden rounded-xl border"
        style={{ borderColor: "rgba(201,168,76,0.3)" }}
      >
        {/* Seller side */}
        {isBuyer ? (
          <div className="relative flex-1">
            <button
              type="button"
              className="w-full h-full text-[11px] font-semibold text-slate-600 cursor-not-allowed"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              aria-label="Seller mode — upgrade to unlock"
            >
              🔒 Seller
            </button>
            {showTooltip && (
              <div
                className="absolute bottom-full left-1/2 mb-2 w-44 -translate-x-1/2 rounded-lg px-3 py-2 text-center text-[11px] text-white shadow-xl z-50"
                style={{ background: "#1e293b", border: "1px solid rgba(201,168,76,0.3)" }}
              >
                Upgrade to Seller plan to unlock
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex-1 text-[11px] font-semibold text-slate-400 transition hover:text-slate-200"
          >
            Seller
          </button>
        )}

        {/* Divider */}
        <div className="w-px" style={{ background: "rgba(201,168,76,0.3)" }} />

        {/* Buyer side (always active here) */}
        <div
          className="flex flex-1 items-center justify-center text-[11px] font-semibold"
          style={{ background: "rgba(201,168,76,0.15)", color: G }}
        >
          🛍️ Buyer
        </div>
      </div>
    </div>
  );
}

export function BuyerShell({
  children,
  userMode,
}: {
  children: React.ReactNode;
  userMode: string | null;
}) {
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-slate-900/50">
      {/* Repeating HF logo watermark behind UI (matches seller dashboard). */}
      <BrandBackdrop variant="onDark" />

      {/* Header */}
      <header
        className="relative z-[2] flex h-16 shrink-0 items-center gap-3 border-b border-slate-700/60 px-4 backdrop-blur-md"
        style={{ background: "rgba(15,23,42,0.78)" }}
      >
        <Link
          href="/"
          className="group flex items-center gap-3 shrink-0 transition hover:opacity-95"
          aria-label="HIGH FOCUS — Buyer Catalog"
        >
          {/* Logo: larger + soft gold halo so it actually reads on dark. */}
          <span
            className="relative flex items-center justify-center"
            style={{ filter: "drop-shadow(0 0 12px rgba(201,168,76,0.25))" }}
          >
            <img
              src="/HF_LOGO.png"
              alt=""
              aria-hidden="true"
              className="h-10 w-auto object-contain transition duration-300 group-hover:scale-[1.05]"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </span>
          {/* Thin vertical divider between logo and title for cleaner hierarchy. */}
          <span
            aria-hidden="true"
            className="hidden h-8 w-px sm:block"
            style={{ background: "linear-gradient(to bottom, transparent, rgba(201,168,76,0.4), transparent)" }}
          />
          <span className="flex flex-col leading-[1.1]">
            <span
              className="text-[15px] font-semibold tracking-tight sm:text-[16px]"
              style={{
                color: G,
                fontFamily: "Georgia, serif",
                fontStyle: "italic",
                textShadow: "0 0 8px rgba(201,168,76,0.14)",
              }}
            >
              Buyer Catalog
            </span>
            <span className="mt-0.5 hidden items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:inline-flex">
              <AmazonSmile className="h-2.5 w-2.5" />
              Powered by Amazon Associates
            </span>
          </span>
        </Link>

        <div className="flex-1" />

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 md:hidden"
          aria-label="Menu"
        >
          ☰
        </button>

        {session?.user && (
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-[13px] text-slate-400 truncate max-w-[10rem]">
              {session.user.name || session.user.email}
            </span>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/login" })}
              className="text-[12px] text-slate-500 underline underline-offset-2 hover:text-slate-300"
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      <div className="relative z-[1] flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside
          className="hidden w-52 shrink-0 flex-col border-r border-slate-700/60 backdrop-blur-md md:flex"
          style={{ background: "rgba(15,23,42,0.55)" }}
        >
          <ModeToggle userMode={userMode} />
          <div className="border-t border-slate-700/60 px-3 py-2">
            <Link
              href="/buyer"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition"
              style={{ background: "rgba(201,168,76,0.1)", color: G }}
            >
              <span>🛍️</span> Browse Catalog
            </Link>
          </div>

          {userMode !== "buyer" && (
            <div className="px-3 py-2">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-slate-400 transition hover:text-slate-200"
              >
                <span>◆</span> Seller Dashboard
              </Link>
            </div>
          )}

          <div className="mt-auto border-t border-slate-700/60 px-3 py-3">
            {session?.user && (
              <button
                type="button"
                onClick={() => void signOut({ callbackUrl: "/login" })}
                className="w-full text-left text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-300"
              >
                Sign out
              </button>
            )}
          </div>
        </aside>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
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
                  className="text-xl text-slate-400 hover:text-slate-200"
                >
                  ×
                </button>
              </div>
              <ModeToggle userMode={userMode} />
              <div className="border-t border-slate-700/60 px-3 py-2">
                <Link
                  href="/buyer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium"
                  style={{ color: G }}
                >
                  🛍️ Browse Catalog
                </Link>
              </div>
              {session?.user && (
                <div className="mt-auto border-t border-slate-700/60 px-4 py-3">
                  <p className="text-[12px] text-slate-400 truncate">{session.user.name || session.user.email}</p>
                  <button
                    type="button"
                    onClick={() => void signOut({ callbackUrl: "/login" })}
                    className="mt-1 text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-300"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
