"use client";

import Link from "next/link";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { useCallback, useState } from "react";
import { trackCheckoutStart } from "@/lib/analytics";
import { PromoCodeModal } from "@/app/components/PromoCodeModal";

const G      = "#C9A84C";
const G_DIM  = "rgba(201,168,76,0.08)";
const G_BORD = "rgba(201,168,76,0.28)";
const CARD   = "rgba(255,255,255,0.028)";
const C_BORD = "rgba(255,255,255,0.065)";

type CheckoutAction = "trial" | "starter" | "pro" | "buyer";

type Props = {
  stripeConfigured: boolean;
  proPlanEnabled: boolean;
  subscriptionsPaused: boolean;
  subscriptionTrialDays: number;
  buyerModeEnabled?: boolean;
};

export function LandingPricingSection({
  stripeConfigured,
  proPlanEnabled,
  subscriptionsPaused,
  subscriptionTrialDays,
  buyerModeEnabled = false,
}: Props) {
  const [navigating, setNavigating] = useState(false);
  const [promoOpen, setPromoOpen]   = useState(false);

  const navigate = useCallback((href: string) => {
    window.location.href = href;
  }, []);

  function handlePlanClick(action: CheckoutAction) {
    if (navigating) return;
    setNavigating(true);
    trackCheckoutStart({ plan: action });
    if (action === "buyer") {
      navigate("/register?mode=buyer");
      return;
    }
    if (action === "trial" || action === "starter") {
      if (stripeConfigured && !subscriptionsPaused) navigate("/billing?plan=starter");
      else { setNavigating(false); setPromoOpen(true); }
    } else {
      if (stripeConfigured && !subscriptionsPaused) navigate(`/billing?plan=${proPlanEnabled ? "pro" : "starter"}`);
      else { setNavigating(false); setPromoOpen(true); }
    }
  }

  const trialLabel = subscriptionTrialDays > 0 ? `${subscriptionTrialDays}-day free trial` : "free";

  type Plan = {
    name: string; price: string; period: string; desc: string;
    features: string[]; cta: string; action: CheckoutAction;
    pro: boolean; badge?: string; buyerPlan: boolean;
  };

  const freeTrialPlan: Plan = {
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
    pro: false,
    buyerPlan: false,
  };

  const buyerPlan: Plan = {
    name: "Buyer", price: "$0", period: "/ forever",
    desc: "Browse Amazon freely, no sourcing needed.",
    features: [
      "Unlimited Amazon browsing",
      "All categories and filters",
      "Best deals finder",
      "No credit card required",
    ],
    cta: "Start Browsing Free →",
    action: "buyer",
    badge: "Always Free",
    pro: false,
    buyerPlan: true,
  };

  const sellerPlans: Plan[] = [
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
      cta: subscriptionsPaused ? "Use promo code" : "Start Free Trial →",
      action: "starter",
      badge: trialLabel,
      pro: false,
      buyerPlan: false,
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
        "Export to XLSX",
        "Priority support",
      ],
      cta: subscriptionsPaused ? "Use promo code" : "Start Free Trial →",
      action: "pro",
      pro: true,
      badge: trialLabel,
      buyerPlan: false,
    },
  ];

  // Buyer mode ON: 4 cards — Buyer + Free Trial + Starter + Pro.
  // Buyer mode OFF: original 3 cards — Free Trial + Starter + Pro.
  const plans = buyerModeEnabled ? [buyerPlan, freeTrialPlan, ...sellerPlans] : [freeTrialPlan, ...sellerPlans];

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

          <div className={`grid gap-6 ${buyerModeEnabled ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            {plans.map(({ name, price, period, desc, features, cta, action, pro, badge, buyerPlan: isBuyerCard }, i) => (
              <ScrollReveal key={name} delay={i * 90}>
                <div
                  className={`relative flex h-full flex-col rounded-2xl p-8 ${pro ? "lp-pro-glow" : ""}`}
                  style={{
                    background: pro
                      ? "linear-gradient(160deg, rgba(201,168,76,0.11) 0%, rgba(201,168,76,0.04) 100%)"
                      : isBuyerCard
                      ? "linear-gradient(160deg, rgba(201,168,76,0.05) 0%, rgba(0,168,224,0.04) 100%)"
                      : CARD,
                    border: `1px solid ${pro || isBuyerCard ? G_BORD : C_BORD}`,
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
                      style={{ color: pro || isBuyerCard ? G : "rgb(100 116 139)" }}
                    >
                      {isBuyerCard ? "🛍️" : pro ? "🚀" : "📦"} {name}
                    </p>
                    <div className="flex items-end gap-1.5">
                      <span className="lp-h text-5xl font-bold leading-none text-white" style={{ fontStyle: "italic" }}>
                        {price}
                      </span>
                      <span className="lp-b mb-1.5 text-sm text-slate-500">{period}</span>
                    </div>
                    <p className="lp-b mt-2 text-[13px] text-slate-500">{desc}</p>
                  </div>

                  <ul className="mb-8 space-y-3">
                    {features.map((f) => (
                      <li key={f} className="lp-b flex items-start gap-2.5 text-[13px]">
                        <span className="mt-0.5 shrink-0" style={{ color: G }}>✓</span>
                        <span className={pro ? "text-slate-300" : "text-slate-400"}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto">
                    <button
                      type="button"
                      disabled={navigating}
                      onClick={() => handlePlanClick(action)}
                      className={`lp-b block w-full rounded-xl py-3.5 text-center text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        pro ? "lp-btn-g text-black" : isBuyerCard ? "lp-btn-g text-black" : "lp-btn-o text-slate-300"
                      }`}
                    >
                      {cta}
                    </button>
                    <p className="lp-b mt-2 min-h-[1rem] text-center text-[11px] text-slate-600">
                      {(action === "starter" || action === "pro") && !subscriptionsPaused
                        ? "14-day free trial · No charge until trial ends"
                        : isBuyerCard
                        ? "No credit card required"
                        : ""}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          {/* Footer links */}
          <ScrollReveal delay={270}>
            <div className="mt-10 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => setPromoOpen(true)}
                className="lp-b sm:hidden rounded-xl border px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-amber-500/50 hover:bg-amber-950/20 hover:text-amber-200"
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

      <PromoCodeModal open={promoOpen} onClose={() => setPromoOpen(false)} />
    </>
  );
}
