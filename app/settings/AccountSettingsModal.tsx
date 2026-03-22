"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AccountSettingsPanels } from "./AccountSettingsPanels";

export function AccountSettingsModal({
  onClose,
  userEmail,
}: {
  onClose: () => void;
  userEmail?: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center p-4 pt-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-settings-title"
    >
      {/* Backdrop - covers entire viewport, blurs left, middle, and right panels */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
        aria-label="Close"
      />
      {/* Popup - aligned to top */}
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 pr-12">
          <h2 id="account-settings-title" className="text-lg font-semibold text-slate-900">
            Account &amp; settings
          </h2>
          {userEmail ? (
            <span className="hidden truncate text-sm text-slate-500 sm:block max-w-[180px]" title={userEmail}>
              {userEmail}
            </span>
          ) : null}
        </header>
        {/* Close button: top-right corner, rendered on top of header */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
          aria-label="Close"
        >
          ✕
        </button>
        <div className="min-h-0 flex-1 overflow-hidden">
          <AccountSettingsPanels />
        </div>
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
