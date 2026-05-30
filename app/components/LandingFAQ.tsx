"use client";

import { useState } from "react";
import { ScrollReveal } from "@/app/components/ScrollReveal";

const G      = "#C9A84C";
const G_DIM  = "rgba(201,168,76,0.08)";
const G_BORD = "rgba(201,168,76,0.28)";
const C_BORD = "rgba(255,255,255,0.065)";

const faqs = [
  {
    q: "Is there a free trial?",
    a: "Yes. Every new account includes a free trial with full access to all features — no credit card required to get started. You'll only be prompted to subscribe once your trial ends.",
  },
  {
    q: "How accurate is the data?",
    a: "Buy Box prices, BSR, and FBA fees come directly from Amazon's Selling Partner API (SP-API) in real time. Data reflects what's live on Amazon when you scan — not cached estimates from third-party databases.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. Cancel at any time through the billing portal with no fees or penalties. Access continues until the end of your current billing period.",
  },
  {
    q: "What's the difference between FBA and FBM support?",
    a: "The app calculates fees and net profit for both fulfillment models. Switch the FBA / FBM toggle in the product detail panel to instantly see how each affects your margin on any listing.",
  },
  {
    q: "Who is this app for?",
    a: "HIGH FOCUS is built for Amazon FBA wholesale resellers — people who source products from brands and distributors to resell on Amazon. It's ideal for solo sellers and teams who review supplier lists regularly.",
  },
];

export function LandingFAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    /* spacing reduced 25%: py-24 → py-[4.5rem] */
    <section className="px-6 py-[4.5rem]">
      <div className="mx-auto max-w-3xl">
        <ScrollReveal>
          <div className="mb-5 flex justify-center">
            <span
              className="lp-b inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em]"
              style={{ border: `1px solid ${G_BORD}`, background: G_DIM, color: G }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: G }} aria-hidden />
              FAQ
            </span>
          </div>
          <h2
            className="lp-h mb-10 text-center text-white"
            style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontStyle: "italic", fontWeight: 600 }}
          >
            Frequently asked questions
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={80}>
          <div
            className="divide-y overflow-hidden rounded-2xl"
            style={{ border: `1px solid ${C_BORD}`, background: "rgba(255,255,255,0.018)", divideColor: C_BORD }}
          >
            {faqs.map((faq, i) => (
              <div key={i} style={{ borderColor: C_BORD }}>
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <span className="lp-b text-sm font-semibold text-white sm:text-base">{faq.q}</span>
                  <span
                    className="lp-b shrink-0 text-xl font-light transition-transform duration-200"
                    style={{
                      color: G,
                      transform: open === i ? "rotate(45deg)" : "rotate(0deg)",
                      display: "inline-block",
                    }}
                    aria-hidden
                  >
                    +
                  </span>
                </button>
                {open === i && (
                  <div className="px-6 pb-5" style={{ borderTop: `1px solid ${C_BORD}` }}>
                    <p className="lp-b pt-4 text-sm leading-relaxed text-slate-400">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
