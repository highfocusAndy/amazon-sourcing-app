"use client";

import { SupportContactHint } from "@/app/components/SupportContactHint";
import type { BillingOverview } from "@/lib/billing/access";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

export function SubscribeContent({
  initial,
  supportEmail,
}: {
  initial: BillingOverview;
  supportEmail?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkout = searchParams.get("checkout");
  const [overview, setOverview] = useState(initial);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/billing/status", { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as BillingOverview;
      setOverview(data);
    }
  }, []);

  useEffect(() => {
    if (checkout !== "success") return;
    const t1 = setTimeout(() => void refresh(), 1500);
    const t2 = setTimeout(() => void refresh(), 4500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [checkout, refresh]);

  useEffect(() => {
    if (checkout === "success" && overview.hasAccess) {
      router.replace("/");
      router.refresh();
    }
  }, [checkout, overview.hasAccess, router]);

  const onRedeemPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError(null);
    setPromoLoading(true);
    try {
      const res = await fetch("/api/promo/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const json = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setPromoError(json.error ?? "Could not redeem code.");
        return;
      }
      setPromoCode("");
      await refresh();
      router.push("/");
      router.refresh();
    } catch {
      setPromoError("Network error. Try again.");
    } finally {
      setPromoLoading(false);
    }
  };

  const onCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        alert(json.error ?? "Checkout could not start.");
        return;
      }
      window.location.href = json.url;
    } catch {
      alert("Could not start checkout.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const onPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        alert(json.error ?? "Could not open billing portal.");
        return;
      }
      window.location.href = json.url;
    } catch {
      alert("Could not open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  if (overview.billingDisabled) {
    return (
      <div className="rounded-2xl border border-slate-600/80 bg-slate-800/80 p-8 text-slate-200 shadow-xl backdrop-blur">
        <p className="text-lg font-semibold text-teal-300">Billing checks are disabled</p>
        <p className="mt-2 text-sm text-slate-400">Set BILLING_DISABLED=false in production.</p>
        <Link href="/" className="mt-6 inline-block text-teal-400 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (overview.hasAccess && overview.subscriptionStatus !== "none") {
    const trialing = overview.subscriptionStatus === "trialing";
    return (
      <div className="rounded-2xl border border-slate-600/80 bg-slate-800/80 p-8 text-slate-200 shadow-xl backdrop-blur">
        <p className="text-lg font-semibold text-teal-300">
          {trialing ? "Subscription — trial" : "Subscription active"}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Status: {overview.subscriptionStatus}
          {trialing && overview.subscriptionTrialDays > 0
            ? `. No charge until the ${overview.subscriptionTrialDays}-day trial ends; Stripe will bill automatically after that unless you cancel in the portal.`
            : null}
        </p>
        {overview.hasStripeCustomer ? (
          <button
            type="button"
            onClick={() => void onPortal()}
            disabled={portalLoading}
            className="mt-6 rounded-xl bg-slate-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
          >
            {portalLoading ? "Opening…" : "Manage billing"}
          </button>
        ) : null}
        <Link href="/" className="mt-4 block text-sm text-teal-400 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (overview.hasAccess) {
    return (
      <div className="rounded-2xl border border-slate-600/80 bg-slate-800/80 p-8 text-slate-200 shadow-xl backdrop-blur">
        <p className="text-lg font-semibold text-teal-300">You have access</p>
        {overview.testingBillingPass ? (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/35 px-3 py-2 text-sm text-amber-100">
            <strong className="font-semibold">Testing mode.</strong>{" "}
            <code className="text-amber-200/90">TESTING_BILLING_PASS</code> is on, so billing is open for everyone.
            When you go live, remove it or set it to <code className="text-amber-200/90">false</code> — then only trial,
            promo codes, or Stripe will grant access.
          </p>
        ) : null}
        <p className="mt-2 text-sm text-slate-400">
          {overview.appOwnerAccess
            ? "Owner access — this account always has full use of the app."
            : overview.testingBillingPass
              ? "No payment required while this flag is enabled."
              : overview.trialDaysLeft > 0
                ? `Trial: about ${overview.trialDaysLeft} day(s) left.`
                : overview.promoDaysLeft > 0
                  ? `Promo access: about ${overview.promoDaysLeft} day(s) left.`
                  : "Your account is active."}
        </p>
        {overview.stripeConfigured ? (
          <div className="mt-6 space-y-2">
            {overview.subscriptionsPaused ? (
              <div className="space-y-2">
                <p className="rounded-lg border border-amber-500/40 bg-amber-950/35 px-3 py-2 text-xs text-amber-100">
                  {overview.subscriptionsPausedMessage}
                </p>
                <p className="text-xs text-slate-500">
                  New visitors without an account should start at{" "}
                  <Link href="/get-access" className="font-semibold text-teal-400 underline hover:text-teal-300">
                    Get access
                  </Link>{" "}
                  (pay or promo).
                </p>
              </div>
            ) : overview.subscriptionTrialDays > 0 ? (
              <p className="text-xs text-slate-500">
                Subscribe with card: you get another {overview.subscriptionTrialDays}-day billing trial, then the plan
                charges automatically. Cancel anytime before then in the billing portal.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void onCheckout()}
              disabled={checkoutLoading || overview.subscriptionsPaused}
              className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg disabled:pointer-events-none disabled:opacity-40"
            >
              {overview.subscriptionsPaused
                ? "Paid signup not available yet"
                : checkoutLoading
                  ? "Redirecting…"
                  : overview.subscriptionTrialDays > 0
                    ? `Subscribe (${overview.subscriptionTrialDays}-day trial)`
                    : "Subscribe with card"}
            </button>
          </div>
        ) : null}
        <Link href="/" className="mt-4 block text-sm text-teal-400 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      {checkout === "success" ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          Checkout complete. Syncing your subscription…
        </div>
      ) : null}
      {checkout === "cancel" ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          Checkout was canceled. You can try again when you are ready.
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-600/80 bg-slate-800/80 p-8 text-slate-200 shadow-xl backdrop-blur">
        {overview.subscriptionsPaused ? (
          <div className="mb-6 space-y-3 rounded-xl border border-amber-500/45 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
            <div>
              <p className="font-semibold text-amber-50">Paid signup is paused (testing phase)</p>
              <p className="mt-2 leading-relaxed text-amber-100/90">{overview.subscriptionsPausedMessage}</p>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              Need a brand-new account while checkout is off? Start at{" "}
              <Link href="/get-access" className="font-semibold text-teal-400 underline hover:text-teal-300">
                Get access
              </Link>{" "}
              (invite promo or pay when we open).
            </p>
          </div>
        ) : null}
        <h1 className="text-xl font-bold text-white">Continue using the app</h1>
        <p className="mt-2 text-sm text-slate-400">
          You sign in with your <strong className="font-medium text-slate-300">email and password</strong> — you only
          needed your invite code once to create this account.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          {overview.subscriptionsPaused
            ? "Your access period has ended. Card checkout is off while we are in testing — use a new invite code below if you have one."
            : "Your trial or invite access has ended. Subscribe below to renew. If the team gave you another extension code, you can apply it after this section."}
        </p>

        {overview.stripeConfigured && !overview.subscriptionsPaused ? (
          <div className="mt-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subscribe</p>
            {overview.subscriptionTrialDays > 0 ? (
              <p className="text-xs text-slate-500">
                {overview.subscriptionTrialDays}-day trial on the subscription: enter a card at checkout (kept on file).
                You are not charged until the trial ends; after that, Stripe bills automatically each period unless you
                cancel in the customer portal.
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                You will be charged at checkout; subscription renews automatically until you cancel in the customer
                portal.
              </p>
            )}
            <button
              type="button"
              onClick={() => void onCheckout()}
              disabled={checkoutLoading}
              className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 disabled:pointer-events-none disabled:opacity-40"
            >
              {checkoutLoading
                ? "Redirecting to secure checkout…"
                : overview.subscriptionTrialDays > 0
                  ? `Start subscription (${overview.subscriptionTrialDays}-day trial)`
                  : "Pay with card (Stripe)"}
            </button>
          </div>
        ) : null}

        <div
          className={
            overview.stripeConfigured && !overview.subscriptionsPaused
              ? "mt-8 space-y-3 border-t border-slate-700 pt-8"
              : "mt-6 space-y-3"
          }
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {overview.stripeConfigured && !overview.subscriptionsPaused
              ? "Optional: invite code (extra time)"
              : "Promo code"}
          </p>
          {overview.stripeConfigured && !overview.subscriptionsPaused ? (
            <p className="text-xs text-slate-500">
              Only if you received a new code — not required to sign in day to day.
            </p>
          ) : null}
          <form onSubmit={onRedeemPromo} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Enter code"
                className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={promoLoading || !promoCode.trim()}
                className="shrink-0 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
              >
                {promoLoading ? "…" : "Apply"}
              </button>
            </div>
            {promoError ? <p className="text-sm text-rose-400">{promoError}</p> : null}
          </form>
        </div>

        {overview.stripeConfigured && overview.subscriptionsPaused ? (
          <div className="mt-8 space-y-3 border-t border-slate-700 pt-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subscribe</p>
            <p className="text-xs text-amber-200/90">
              Checkout is disabled during testing. Use a promo code above, or come back after we open paid signup.
            </p>
            <button
              type="button"
              onClick={() => void onCheckout()}
              disabled
              className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 pointer-events-none opacity-40"
            >
              Paid signup not available yet
            </button>
          </div>
        ) : null}

        {!overview.stripeConfigured ? (
          <p className="mt-6 text-sm text-amber-200/90">
            Stripe is not configured yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to the server environment.
          </p>
        ) : null}

        <p className="mt-6 text-sm text-slate-500">
          Signed in as the wrong person?{" "}
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/login" })}
            className="font-medium text-teal-400 underline decoration-teal-500/50 underline-offset-2 hover:text-teal-300"
          >
            Sign out
          </button>{" "}
          — then sign in with the correct email or start at{" "}
          <Link href="/get-access" className="font-medium text-teal-400 underline hover:text-teal-300">
            Get access
          </Link>{" "}
          for a new purchase.
        </p>
        {supportEmail ? <SupportContactHint email={supportEmail} tone="dark" /> : null}
      </div>
    </div>
  );
}
