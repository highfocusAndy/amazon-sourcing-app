"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AmazonAccountForm } from "./AmazonAccountForm";

export function AmazonAccountModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<{
    connected: boolean;
    emailMasked?: string;
    connectionLabel?: string;
  } | null>(null);
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
      className="fixed inset-0 z-[9999] flex items-start justify-center p-4 pt-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="amazon-account-title"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
        aria-label="Close"
      />
      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 id="amazon-account-title" className="text-lg font-semibold text-slate-900">
              Amazon seller account
            </h2>
            {status?.connected ? (
              <p className="text-xs text-slate-500">
                {status.connectionLabel
                  ? status.connectionLabel
                  : status.emailMasked
                    ? `Connected as ${status.emailMasked}`
                    : "Connected"}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="px-6 pb-6 pt-4">
          <p className="mb-3 text-sm text-slate-600">
            Link the <strong className="font-semibold text-slate-800">Amazon seller account</strong> you use in Seller
            Central (it can be a different email than your HIGH FOCUS login). After you connect, this app can show live
            prices, offers, and eligibility for products you research.
          </p>
          <AmazonAccountForm onStatusChange={setStatus} />
        </div>
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

