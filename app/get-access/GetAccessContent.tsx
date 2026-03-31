"use client";

import { SupportContactHint } from "@/app/components/SupportContactHint";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { signInAfterRegistration } from "@/lib/auth/signInAfterRegistration";

type Props = {
  subscriptionTrialDays: number;
  stripeConfigured: boolean;
  /** Marketing line only — must match your Stripe Price (see BILLING_PRICE_DISPLAY). */
  priceDisplay: string;
  subscriptionsPaused: boolean;
  subscriptionsPausedMessage: string;
  /** From SUPPORT_EMAIL — signup / payment help */
  supportEmail?: string;
};

export function GetAccessContent({
  subscriptionTrialDays,
  stripeConfigured,
  priceDisplay,
  subscriptionsPaused,
  subscriptionsPausedMessage,
  supportEmail,
}: Props) {
  const searchParams = useSearchParams();
  const checkout = searchParams.get("checkout");

  const [stripeLoading, setStripeLoading] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const promoCodeInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!promoOpen) return;
    const t = window.setTimeout(() => promoCodeInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [promoOpen]);

  useEffect(() => {
    if (!promoOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [promoOpen]);

  useEffect(() => {
    if (!promoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !promoLoading) setPromoOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [promoOpen, promoLoading]);

  const closePromoModal = useCallback(() => {
    if (promoLoading) return;
    setPromoOpen(false);
  }, [promoLoading]);

  useEffect(() => {
    if (promoOpen) return;
    promoCodeInputRef.current?.setCustomValidity("");
    confirmPasswordInputRef.current?.setCustomValidity("");
  }, [promoOpen]);

  const startStripe = useCallback(async () => {
    setStripeLoading(true);
    try {
      const res = await fetch("/api/billing/checkout-guest", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        alert(data.error ?? "Could not start checkout.");
        return;
      }
      window.location.href = data.url;
    } catch {
      alert("Could not start checkout.");
    } finally {
      setStripeLoading(false);
    }
  }, []);

  const onPromoSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    promoCodeInputRef.current?.setCustomValidity("");
    confirmPasswordInputRef.current?.setCustomValidity("");
    const pw = password.trim();
    const pw2 = confirmPassword.trim();
    if (pw !== pw2) {
      const el = confirmPasswordInputRef.current;
      if (el) {
        el.setCustomValidity("Passwords do not match.");
        el.reportValidity();
      }
      return;
    }
    setPromoLoading(true);
    try {
      const res = await fetch("/api/register/from-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoCode.trim(),
          email: email.trim().toLowerCase(),
          password: pw,
          name: name.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; email?: string };
      if (!res.ok) {
        const el = promoCodeInputRef.current;
        if (el) {
          el.setCustomValidity(data.error ?? "Registration failed.");
          el.reportValidity();
        }
        return;
      }
      const signEmail = data.email ?? email.trim().toLowerCase();
      const sessionResult = await signInAfterRegistration(signEmail, pw);
      if (!sessionResult.ok) {
        const el = promoCodeInputRef.current;
        if (el) {
          el.setCustomValidity(sessionResult.error);
          el.reportValidity();
        }
        return;
      }
      window.location.href = "/";
    } catch {
      const el = promoCodeInputRef.current;
      if (el) {
        el.setCustomValidity("Something went wrong. Try again.");
        el.reportValidity();
      }
    } finally {
      setPromoLoading(false);
    }
  };

  return (
    <>
    <div className="relative z-[1] mx-auto w-full max-w-lg space-y-4 sm:max-w-xl sm:space-y-5">
      {checkout === "cancel" ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-base text-amber-200">
          Checkout was canceled. You can start again below.
        </div>
      ) : null}
      <div className="rounded-2xl border border-slate-200/80 bg-white px-8 py-7 shadow-xl shadow-slate-200/50 sm:px-10 sm:py-8">
        {subscriptionsPaused ? (
          <div className="mb-4 rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-base text-amber-950 sm:mb-5">
            <p className="font-semibold text-amber-900">Paid signup is paused (testing phase)</p>
            <p className="mt-2 leading-relaxed text-amber-900/90">{subscriptionsPausedMessage}</p>
          </div>
        ) : null}

        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem]">Get access</h1>
        <p
          className={`mt-2 text-center text-lg font-medium sm:mt-3 ${subscriptionsPaused ? "text-slate-500" : "text-slate-800"}`}
        >
          {subscriptionsPaused ? (
            <span className="text-slate-600">
              Planned pricing when we open signup:{" "}
              {subscriptionTrialDays > 0 ? (
                <>
                  <span className="text-teal-700/80">{subscriptionTrialDays}-day trial</span>
                  <span>, then </span>
                </>
              ) : null}
              <span className="font-medium text-slate-700">{priceDisplay}</span>
            </span>
          ) : subscriptionTrialDays > 0 ? (
            <>
              <span className="text-teal-700">{subscriptionTrialDays}-day free trial</span>
              <span className="text-slate-500">, then </span>
              <span className="text-slate-900">{priceDisplay}</span>
            </>
          ) : (
            <span className="text-slate-900">{priceDisplay}</span>
          )}
        </p>
        <p className="mt-2 text-center text-base leading-snug text-slate-600">
          {subscriptionsPaused ? (
            <>
              Card checkout is turned off for now. Have an invite code? Open{" "}
              <strong className="font-medium text-slate-800">Promo access</strong> below.
            </>
          ) : subscriptionTrialDays > 0 ? (
            <>
              Full app access during your trial. Your card is saved at checkout; you are not charged until the trial
              ends. Cancel anytime in the billing portal before then to pay nothing. Have an invite code? Use{" "}
              <strong className="font-medium text-slate-800">Promo access</strong> below.
            </>
          ) : (
            <>
              Subscribe to unlock the app. After checkout you will set your password on the next screen. Have an invite
              code? Use <strong className="font-medium text-slate-800">Promo access</strong> below.
            </>
          )}
        </p>

        <div className="mt-6 border-t border-slate-200 pt-6 sm:mt-7 sm:pt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pay with card</p>
          {stripeConfigured ? (
            <>
              {subscriptionsPaused ? (
                <p className="mt-2 text-sm leading-snug text-amber-800/90">
                  Checkout is disabled during testing. We will turn this on when we start accepting subscribers.
                </p>
              ) : subscriptionTrialDays > 0 ? (
                <p className="mt-2 text-sm leading-snug text-slate-500">
                  You will finish account setup after checkout. Billing is {priceDisplay} after your{" "}
                  {subscriptionTrialDays}-day trial unless you cancel first.
                </p>
              ) : (
                <p className="mt-2 text-sm leading-snug text-slate-500">
                  You will set your password on the next screen. Subscription: {priceDisplay}.
                </p>
              )}
              <button
                type="button"
                onClick={() => void startStripe()}
                disabled={stripeLoading || subscriptionsPaused}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 py-3.5 text-base font-semibold text-white shadow-lg shadow-teal-500/25 disabled:pointer-events-none disabled:opacity-40"
              >
                {subscriptionsPaused
                  ? "Paid signup not available yet"
                  : stripeLoading
                    ? "Redirecting…"
                    : "Continue to secure checkout"}
              </button>
            </>
          ) : (
            <p className="mt-2 text-base leading-snug text-amber-800/90">
              Card checkout is not available until STRIPE_SECRET_KEY and STRIPE_PRICE_ID are set on the server.
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-6 sm:mt-7 sm:pt-7">
          <button
            type="button"
            onClick={() => setPromoOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={promoOpen}
            className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3.5 text-base font-semibold text-slate-800 shadow-sm transition-colors hover:border-teal-500/60 hover:bg-teal-50/50"
          >
            Promo access
          </button>
        </div>

        <p className="mt-5 text-center text-sm leading-snug text-slate-600 sm:mt-6">
          Already paid in Stripe but closed the tab before creating a password?{" "}
          <Link href="/signup/recover" className="font-semibold text-teal-600 hover:text-teal-500 hover:underline">
            Finish paid signup
          </Link>
        </p>
        <p className="mt-3 text-center text-base text-slate-500 sm:mt-4">
          <Link href="/login" className="font-semibold text-teal-600 hover:text-teal-500 hover:underline">
            Sign in
          </Link>
          {" · "}
          <Link href="/reset-password" className="font-semibold text-teal-600 hover:text-teal-500 hover:underline">
            Reset password
          </Link>
        </p>
        {supportEmail ? <SupportContactHint email={supportEmail} /> : null}
      </div>
    </div>

    {promoOpen ? (
      <div
        className="fixed inset-0 z-[200] flex items-stretch justify-center overflow-hidden sm:items-center sm:p-6"
        role="presentation"
      >
        <button
          type="button"
          aria-label="Close"
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
          onClick={closePromoModal}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="promo-modal-title"
          className="relative z-10 flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-none border-0 border-slate-200/80 bg-white shadow-none sm:h-[min(100dvh-3rem,52rem)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:border sm:shadow-xl sm:shadow-slate-200/50 md:max-w-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-8 py-6 sm:px-10 sm:py-7">
            <h2
              id="promo-modal-title"
              className="min-w-0 flex-1 text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-[1.75rem]"
            >
              Sign up with your promo code
            </h2>
            <button
              type="button"
              onClick={closePromoModal}
              disabled={promoLoading}
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
              aria-label="Close"
            >
              <span className="block text-xl leading-none" aria-hidden>
                ×
              </span>
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-8 py-5 sm:px-10 sm:py-6">
            <p className="shrink-0 text-center text-base leading-snug text-slate-600 sm:leading-normal">
              Enter your <strong className="font-medium text-slate-800">invite code</strong>, email, and password — we create your account and sign you in (no card).
              Next time use <strong className="font-medium text-slate-800">email and password</strong> only; subscribe when access ends.
            </p>
            <form onSubmit={onPromoSignup} className="mt-4 flex min-h-0 flex-1 flex-col sm:mt-5">
              <div className="flex min-h-0 flex-1 flex-col justify-center sm:justify-start">
                <div className="space-y-2 sm:space-y-3">
                  <label className="block text-base font-medium text-slate-700">
                    Promo code
                    <input
                      ref={promoCodeInputRef}
                      type="text"
                      value={promoCode}
                      onChange={(e) => {
                        e.target.setCustomValidity("");
                        setPromoCode(e.target.value);
                      }}
                      required
                      autoComplete="off"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50 sm:mt-1.5 sm:py-3"
                      placeholder="Enter code"
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
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50 sm:mt-1.5 sm:py-3"
                    />
                  </label>
                  <label className="block text-base font-medium text-slate-700">
                    Name <span className="text-slate-400">(optional)</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50 sm:mt-1.5 sm:py-3"
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
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50 sm:mt-1.5 sm:py-3"
                    />
                  </label>
                  <label className="block text-base font-medium text-slate-700">
                    Confirm password
                    <input
                      ref={confirmPasswordInputRef}
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        e.target.setCustomValidity("");
                        setConfirmPassword(e.target.value);
                      }}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50 sm:mt-1.5 sm:py-3"
                    />
                  </label>
                </div>
              </div>
              <button
                type="submit"
                disabled={promoLoading}
                className="mt-3 shrink-0 w-full rounded-xl border-2 border-slate-300 bg-white py-3.5 text-base font-semibold text-slate-800 hover:border-teal-500/60 hover:bg-teal-50/50 disabled:opacity-50 sm:mt-6"
              >
                {promoLoading ? "Creating account…" : "Create account with promo"}
              </button>
            </form>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
