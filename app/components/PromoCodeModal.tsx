"use client";

import Link from "next/link";
import { signInAfterRegistration } from "@/lib/auth/signInAfterRegistration";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackSignupComplete } from "@/lib/analytics";

export function PromoCodeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [promoCode, setPromoCode] = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [name, setName]           = useState("");
  const [loading, setLoading]     = useState(false);
  const promoRef   = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => promoRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, loading, onClose]);

  useEffect(() => {
    if (open) return;
    promoRef.current?.setCustomValidity("");
    confirmRef.current?.setCustomValidity("");
  }, [open]);

  const close = useCallback(() => { if (!loading) onClose(); }, [loading, onClose]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    promoRef.current?.setCustomValidity("");
    confirmRef.current?.setCustomValidity("");
    const pw = password.trim();
    if (pw !== confirmPw.trim()) {
      confirmRef.current?.setCustomValidity("Passwords do not match.");
      confirmRef.current?.reportValidity();
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch("/api/register/from-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim(), email: email.trim().toLowerCase(), password: pw, name: name.trim() || undefined }),
      });
      const data = await res.json() as { error?: string; email?: string };
      if (!res.ok) {
        promoRef.current?.setCustomValidity(data.error ?? "Registration failed.");
        promoRef.current?.reportValidity();
        return;
      }
      const result = await signInAfterRegistration(data.email ?? email.trim().toLowerCase(), pw);
      if (!result.ok) {
        promoRef.current?.setCustomValidity(result.error);
        promoRef.current?.reportValidity();
        return;
      }
      trackSignupComplete({ plan: "promo" });
      window.location.href = "/";
    } catch {
      promoRef.current?.setCustomValidity("Something went wrong. Try again.");
      promoRef.current?.reportValidity();
    } finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-stretch justify-center overflow-hidden sm:items-center sm:p-6"
      role="presentation"
    >
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/70 backdrop-blur-[2px]" onClick={close} />
      <div
        role="dialog" aria-modal="true" aria-labelledby="promo-modal-title"
        className="relative z-10 flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-none bg-white shadow-none sm:h-[min(100dvh-3rem,52rem)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-8 py-6 sm:px-10 sm:py-7">
          <h2 id="promo-modal-title" className="min-w-0 flex-1 text-2xl font-bold leading-tight tracking-tight text-slate-900">
            Sign up with your promo code
          </h2>
          <button type="button" onClick={close} disabled={loading} aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40">
            <span className="block text-xl leading-none" aria-hidden>×</span>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-8 py-5 sm:px-10 sm:py-6">
          <p className="shrink-0 text-center text-base leading-snug text-slate-600">
            Enter your <strong className="font-medium text-slate-800">invite code</strong>, email, and password — we create your account and sign you in. No card needed.
          </p>
          <form onSubmit={onSubmit} className="mt-4 flex min-h-0 flex-1 flex-col sm:mt-5">
            <div className="flex min-h-0 flex-1 flex-col justify-center space-y-2 sm:justify-start sm:space-y-3">
              <label className="block text-base font-medium text-slate-700">
                Promo code
                <input ref={promoRef} type="text" value={promoCode}
                  onChange={(e) => { e.target.setCustomValidity(""); setPromoCode(e.target.value); }}
                  required autoComplete="off" placeholder="e.g. HF-XXXX"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50" />
              </label>
              <label className="block text-base font-medium text-slate-700">
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  required autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50" />
              </label>
              <label className="block text-base font-medium text-slate-700">
                Name <span className="text-slate-400">(optional)</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50" />
              </label>
              <label className="block text-base font-medium text-slate-700">
                Password <span className="text-slate-400">(min 8)</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={8} autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50" />
              </label>
              <label className="block text-base font-medium text-slate-700">
                Confirm password
                <input ref={confirmRef} type="password" value={confirmPw}
                  onChange={(e) => { e.target.setCustomValidity(""); setConfirmPw(e.target.value); }}
                  required minLength={8} autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50" />
              </label>
            </div>
            <p className="mt-4 shrink-0 text-center text-xs leading-snug text-slate-500">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="font-semibold text-teal-700 hover:underline">Terms</Link>
              {" "}and{" "}
              <Link href="/privacy" className="font-semibold text-teal-700 hover:underline">Privacy Policy</Link>.
            </p>
            <button type="submit" disabled={loading}
              className="mt-3 w-full shrink-0 rounded-xl border-2 border-slate-300 bg-white py-3.5 text-base font-semibold text-slate-800 transition hover:border-teal-500/60 hover:bg-teal-50/50 disabled:opacity-50 sm:mt-5">
              {loading ? "Creating account…" : "Create account with promo"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
