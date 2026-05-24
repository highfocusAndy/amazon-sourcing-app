"use client";

import Link from "next/link";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { signInAfterRegistration } from "@/lib/auth/signInAfterRegistration";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackCheckoutStart, trackSignupComplete } from "@/lib/analytics";

const G      = "#C9A84C";
const G_DIM  = "rgba(201,168,76,0.08)";
const G_BORD = "rgba(201,168,76,0.28)";
const CARD   = "rgba(255,255,255,0.028)";
const C_BORD = "rgba(255,255,255,0.065)";

type CheckoutAction = "trial" | "starter" | "pro";

type Props = {
  stripeConfigured: boolean;
  proPlanEnabled: boolean;
  starterPriceDisplay: string;
  proPriceDisplay: string;
  subscriptionsPaused: boolean;
  subscriptionTrialDays: number;
};

export function LandingPricingSection({
  stripeConfigured,
  proPlanEnabled,
  starterPriceDisplay,
  proPriceDisplay,
  subscriptionsPaused,
  subscriptionTrialDays,
}: Props) {
  const [loadingAction, setLoadingAction] = useState<CheckoutAction | null>(null);
  const [promoOpen, setPromoOpen]         = useState(false);
  const [promoCode, setPromoCode]         = useState("");
  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [confirmPw, setConfirmPw]         = useState("");
  const [name, setName]                   = useState("");
  const [promoLoading, setPromoLoading]   = useState(false);
  const promoCodeRef    = useRef<HTMLInputElement>(null);
  const confirmPwRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!promoOpen) return;
    const t = window.setTimeout(() => promoCodeRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [promoOpen]);

  useEffect(() => {
    if (!promoOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [promoOpen]);

  useEffect(() => {
    if (!promoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !promoLoading) setPromoOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [promoOpen, promoLoading]);

  useEffect(() => {
    if (promoOpen) return;
    promoCodeRef.current?.setCustomValidity("");
    confirmPwRef.current?.setCustomValidity("");
  }, [promoOpen]);

  const closePromo = useCallback(() => {
    if (promoLoading) return;
    setPromoOpen(false);
  }, [promoLoading]);

  const startStripe = useCallback(async (stripePlan: "starter" | "pro", action: CheckoutAction) => {
    setLoadingAction(action);
    try {
      const res  = await fetch("/api/billing/checkout-guest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: stripePlan }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) { alert(data.error ?? "Could not start checkout."); return; }
      window.location.href = data.url;
    } catch { alert("Could not start checkout."); }
    finally    { setLoadingAction(null); }
  }, []);

  function handlePlanClick(action: CheckoutAction) {
    if (loadingAction) return;
    trackCheckoutStart({ plan: action });
    if (action === "trial" || action === "starter") {
      if (stripeConfigured && !subscriptionsPaused) void startStripe("starter", action);
      else setPromoOpen(true);
    } else {
      if (stripeConfigured && !subscriptionsPaused) void startStripe(proPlanEnabled ? "pro" : "starter", action);
      else setPromoOpen(true);
    }
  }

  const onPromoSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    promoCodeRef.current?.setCustomValidity("");
    confirmPwRef.current?.setCustomValidity("");
    const pw = password.trim();
    if (pw !== confirmPw.trim()) {
      confirmPwRef.current?.setCustomValidity("Passwords do not match.");
      confirmPwRef.current?.reportValidity();
      return;
    }
    setPromoLoading(true);
    try {
      const res  = await fetch("/api/register/from-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim(), email: email.trim().toLowerCase(), password: pw, name: name.trim() || undefined }),
      });
      const data = await res.json() as { error?: string; email?: string };
      if (!res.ok) {
        promoCodeRef.current?.setCustomValidity(data.error ?? "Registration failed.");
        promoCodeRef.current?.reportValidity();
        return;
      }
      const result = await signInAfterRegistration(data.email ?? email.trim().toLowerCase(), pw);
      if (!result.ok) {
        promoCodeRef.current?.setCustomValidity(result.error);
        promoCodeRef.current?.reportValidity();
        return;
      }
      trackSignupComplete({ plan: "promo" });
      window.location.href = "/";
    } catch {
      promoCodeRef.current?.setCustomValidity("Something went wrong. Try again.");
      promoCodeRef.current?.reportValidity();
    } finally { setPromoLoading(false); }
  };

  const trialLabel = subscriptionTrialDays > 0 ? `${subscriptionTrialDays}-day free trial` : "free";

  const plans: Array<{
    name: string; price: string; period: string; desc: string;
    features: string[]; cta: string; action: CheckoutAction;
    pro?: boolean; badge?: string;
  }> = [
    {
      name: "Free Trial", price: "$0", period: trialLabel,
      desc: "Try before you commit.",
      features: [
        "10 product analyses",
        "10 catalog searches",
        "Live SP-API pricing & fees",
        "BUY / PASS / WORTH UNGATING",
        "Single-product manual search",
      ],
      cta: subscriptionsPaused ? "Use promo code" : "Start Free Trial",
      action: "trial",
    },
    {
      name: "Starter", price: "$18.99", period: "/ month",
      desc: "Everything you need to source daily.",
      features: [
        "1,000 product analyses / month",
        "3,000 catalog searches / month",
        "1,200 keyword searches / month",
        "BUY / PASS / WORTH UNGATING",
        "Ungating opportunity scanner",
        "Export to XLSX",
      ],
      cta: `Get Starter — ${starterPriceDisplay} →`,
      action: "starter",
    },
    {
      name: "Pro", price: "$29.95", period: "/ month",
      desc: "High-volume sourcing at full power.",
      features: [
        "5,000 product analyses / month",
        "20,000 catalog searches / month",
        "1,500 bulk offer analyses / month",
        "8,000 keyword searches / month",
        "Bulk upload (200 rows per run)",
        "Ungating opportunity scanner",
        "Export to XLSX · Priority support",
      ],
      cta: `Get Pro — ${proPriceDisplay} →`,
      action: "pro",
      pro: true,
      badge: "Best Value",
    },
  ];

  return (
    <>
      <section id="pricing" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <div className="mb-5 flex justify-center">
              <span
                className="lp-b inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em]"
                style={{ border: `1px solid ${G_BORD}`, background: G_DIM, color: G }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: G }} aria-hidden />
                Pricing
              </span>
            </div>
            <h2
              className="lp-h mb-3 text-center text-white"
              style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontStyle: "italic", fontWeight: 600 }}
            >
              Simple, honest pricing
            </h2>
            <p className="lp-b mx-auto mb-14 max-w-sm text-center text-slate-500">
              Start free. Upgrade when you&apos;re ready to scale.
            </p>
          </ScrollReveal>

          {subscriptionsPaused && (
            <div className="mx-auto mb-8 max-w-lg rounded-xl border border-amber-500/40 bg-amber-950/30 px-5 py-4 text-center text-sm text-amber-200">
              Paid signup is currently paused. Use a promo / invite code to access the app.
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-3">
            {plans.map(({ name, price, period, desc, features, cta, action, pro, badge }, i) => (
              <ScrollReveal key={name} delay={i * 90}>
                <div
                  className={`relative flex h-full flex-col rounded-2xl p-8 ${pro ? "lp-pro-glow" : ""}`}
                  style={{
                    background: pro
                      ? "linear-gradient(160deg, rgba(201,168,76,0.11) 0%, rgba(201,168,76,0.04) 100%)"
                      : CARD,
                    border: `1px solid ${pro ? G_BORD : C_BORD}`,
                  }}
                >
                  {badge && (
                    <div className="absolute -top-4 left-0 right-0 flex justify-center">
                      <span
                        className="lp-b rounded-full px-4 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
                        style={{ background: G, color: "#0a0800" }}
                      >
                        {badge}
                      </span>
                    </div>
                  )}

                  <div className="mb-6">
                    <p
                      className="lp-b mb-2 text-[10px] font-bold uppercase tracking-[0.24em]"
                      style={{ color: pro ? G : "rgb(100 116 139)" }}
                    >
                      {name}
                    </p>
                    <div className="flex items-end gap-1.5">
                      <span className="lp-h text-5xl font-bold leading-none text-white" style={{ fontStyle: "italic" }}>
                        {price}
                      </span>
                      <span className="lp-b mb-1.5 text-sm text-slate-500">{period}</span>
                    </div>
                    <p className="lp-b mt-2 text-[13px] text-slate-500">{desc}</p>
                  </div>

                  <ul className="mb-8 flex-1 space-y-3">
                    {features.map((f) => (
                      <li key={f} className="lp-b flex items-start gap-2.5 text-[13px]">
                        <span className="mt-0.5 shrink-0" style={{ color: G }}>✓</span>
                        <span className={pro ? "text-slate-300" : "text-slate-400"}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() => handlePlanClick(action)}
                    className={`lp-b block w-full rounded-xl py-3.5 text-center text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      pro ? "lp-btn-g text-black" : "lp-btn-o text-slate-300"
                    }`}
                  >
                    {loadingAction === action ? "Redirecting…" : cta}
                  </button>
                </div>
              </ScrollReveal>
            ))}
          </div>

          {/* Secondary access options */}
          <ScrollReveal delay={270}>
            <div className="mt-10 flex flex-col items-center gap-4">
              <button
                type="button"
                onClick={() => setPromoOpen(true)}
                className="lp-b rounded-xl border px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-amber-500/50 hover:bg-amber-950/20 hover:text-amber-200"
                style={{ borderColor: C_BORD }}
              >
                Have a promo / invite code?
              </button>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-slate-600">
                <Link href="/login" className="transition hover:text-slate-400">Already have an account? Sign in</Link>
                <span aria-hidden>·</span>
                <Link href="/signup/recover" className="transition hover:text-slate-400">Finish paid signup</Link>
                <span aria-hidden>·</span>
                <Link href="/terms" className="transition hover:text-slate-400">Terms of Service</Link>
                <span aria-hidden>·</span>
                <Link href="/privacy" className="transition hover:text-slate-400">Privacy Policy</Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Promo / invite code modal */}
      {promoOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-stretch justify-center overflow-hidden sm:items-center sm:p-6"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-900/70 backdrop-blur-[2px]"
            onClick={closePromo}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="promo-modal-title"
            className="relative z-10 flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-none bg-white shadow-none sm:h-[min(100dvh-3rem,52rem)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-8 py-6 sm:px-10 sm:py-7">
              <h2 id="promo-modal-title" className="min-w-0 flex-1 text-2xl font-bold leading-tight tracking-tight text-slate-900">
                Sign up with your promo code
              </h2>
              <button
                type="button"
                onClick={closePromo}
                disabled={promoLoading}
                aria-label="Close"
                className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
              >
                <span className="block text-xl leading-none" aria-hidden>×</span>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-8 py-5 sm:px-10 sm:py-6">
              <p className="shrink-0 text-center text-base leading-snug text-slate-600">
                Enter your <strong className="font-medium text-slate-800">invite code</strong>, email, and password — we create your account and sign you in. No card needed.
              </p>
              <form onSubmit={onPromoSignup} className="mt-4 flex min-h-0 flex-1 flex-col sm:mt-5">
                <div className="flex min-h-0 flex-1 flex-col justify-center space-y-2 sm:justify-start sm:space-y-3">
                  <label className="block text-base font-medium text-slate-700">
                    Promo code
                    <input
                      ref={promoCodeRef}
                      type="text"
                      value={promoCode}
                      onChange={(e) => { e.target.setCustomValidity(""); setPromoCode(e.target.value); }}
                      required
                      autoComplete="off"
                      placeholder="e.g. HF-XXXX"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50"
                    />
                  </label>
                  <label className="block text-base font-medium text-slate-700">
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50"
                    />
                  </label>
                  <label className="block text-base font-medium text-slate-700">
                    Name <span className="text-slate-400">(optional)</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50"
                    />
                  </label>
                  <label className="block text-base font-medium text-slate-700">
                    Password <span className="text-slate-400">(min 8)</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50"
                    />
                  </label>
                  <label className="block text-base font-medium text-slate-700">
                    Confirm password
                    <input
                      ref={confirmPwRef}
                      type="password"
                      value={confirmPw}
                      onChange={(e) => { e.target.setCustomValidity(""); setConfirmPw(e.target.value); }}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50"
                    />
                  </label>
                </div>

                <p className="mt-4 shrink-0 text-center text-xs leading-snug text-slate-500">
                  By creating an account you agree to our{" "}
                  <Link href="/terms" className="font-semibold text-teal-700 hover:underline">Terms</Link>
                  {" "}and{" "}
                  <Link href="/privacy" className="font-semibold text-teal-700 hover:underline">Privacy Policy</Link>.
                </p>
                <button
                  type="submit"
                  disabled={promoLoading}
                  className="mt-3 w-full shrink-0 rounded-xl border-2 border-slate-300 bg-white py-3.5 text-base font-semibold text-slate-800 transition hover:border-teal-500/60 hover:bg-teal-50/50 disabled:opacity-50 sm:mt-5"
                >
                  {promoLoading ? "Creating account…" : "Create account with promo"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
