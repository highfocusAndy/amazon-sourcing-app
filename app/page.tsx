import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ScrollReveal } from "@/app/components/ScrollReveal";

export const metadata = {
  title: "HIGH FOCUS Sourcing — Amazon FBA Wholesale Research Tool",
  description:
    "Upload your supplier list. Pull live SP-API data. Get instant BUY / PASS decisions with FBA profit, ROI, and competition analysis.",
};

// ── Google Fonts ──────────────────────────────────────────────────────────────
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

// ── Design tokens ─────────────────────────────────────────────────────────────
const G       = "#C9A84C";           // primary gold
const G_L     = "#E8CC7A";           // light gold
const G_DIM   = "rgba(201,168,76,0.08)";
const G_GLOW  = "rgba(201,168,76,0.18)";
const G_BORD  = "rgba(201,168,76,0.28)";
const CARD    = "rgba(255,255,255,0.028)";
const C_BORD  = "rgba(255,255,255,0.065)";

// ── Injected CSS (keyframes, utility classes) ─────────────────────────────────
function LandingStyles() {
  return (
    <style>{`
      .lp-h  { font-family: var(--font-cormorant), Georgia, serif; }
      .lp-b  { font-family: var(--font-montserrat), Arial, sans-serif; }

      /* ── Grid overlay ───────────────────────────────────── */
      .lp-grid-bg {
        background-image:
          linear-gradient(rgba(201,168,76,0.045) 1px, transparent 1px),
          linear-gradient(90deg, rgba(201,168,76,0.045) 1px, transparent 1px);
        background-size: 58px 58px;
      }

      /* ── Floating orbs ──────────────────────────────────── */
      @keyframes lp-float-a {
        0%,100% { transform: translate(0,0) scale(1); }
        35%     { transform: translate(14px,-26px) scale(1.03); }
        70%     { transform: translate(-9px,-14px) scale(0.98); }
      }
      @keyframes lp-float-b {
        0%,100% { transform: translate(0,0) scale(1); }
        50%     { transform: translate(-18px,-30px) scale(1.04); }
      }
      @keyframes lp-float-c {
        0%,100% { transform: translate(0,0); }
        45%     { transform: translate(11px,-20px); }
        80%     { transform: translate(-7px,-10px); }
      }
      .lp-orb-a { animation: lp-float-a 11s ease-in-out infinite; }
      .lp-orb-b { animation: lp-float-b 15s ease-in-out infinite 3s; }
      .lp-orb-c { animation: lp-float-c  9s ease-in-out infinite 6s; }

      /* ── Scroll reveal ──────────────────────────────────── */
      .lp-reveal {
        opacity: 0;
        transform: translateY(30px);
        transition: opacity 0.82s cubic-bezier(0.16,1,0.3,1),
                    transform 0.82s cubic-bezier(0.16,1,0.3,1);
      }
      .lp-reveal.lp-revealed { opacity: 1; transform: translateY(0); }

      /* ── Feature card hover ─────────────────────────────── */
      .lp-feat {
        position: relative;
        overflow: hidden;
        transition: border-color .3s ease, box-shadow .3s ease;
      }
      .lp-feat::before {
        content: '';
        position: absolute; top: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(90deg, transparent, ${G}, transparent);
        opacity: 0;
        transition: opacity .3s ease;
      }
      .lp-feat:hover::before { opacity: 1; }
      .lp-feat:hover {
        border-color: ${G_BORD} !important;
        box-shadow: 0 0 44px -14px ${G_GLOW};
      }

      /* ── Buttons ────────────────────────────────────────── */
      .lp-btn-g {
        background: linear-gradient(135deg, ${G_L} 0%, ${G} 55%, #9A7830 100%);
        transition: opacity .2s ease, transform .2s ease, box-shadow .3s ease;
      }
      .lp-btn-g:hover {
        opacity: .9;
        transform: translateY(-1px);
        box-shadow: 0 0 38px -6px rgba(201,168,76,.55);
      }
      .lp-btn-o {
        border: 1px solid ${G_BORD};
        transition: border-color .2s ease, background .2s ease, transform .2s ease;
      }
      .lp-btn-o:hover {
        border-color: rgba(201,168,76,.6);
        background: ${G_DIM};
        transform: translateY(-1px);
      }

      /* ── Misc ───────────────────────────────────────────── */
      .lp-divider {
        height: 1px;
        background: linear-gradient(to right, transparent, ${G_BORD}, transparent);
      }
      .lp-gold-text {
        background: linear-gradient(135deg, ${G_L} 0%, ${G} 55%, #A07828 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .lp-pro-glow {
        box-shadow: 0 0 70px -20px rgba(201,168,76,.32), 0 0 0 1px ${G_BORD};
      }
    `}</style>
  );
}

// ── Label pill ────────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex justify-center">
      <span
        className="lp-b inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em]"
        style={{ border: `1px solid ${G_BORD}`, background: G_DIM, color: G }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: G }} aria-hidden />
        {children}
      </span>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function LandingNav() {
  return (
    <header
      className="lp-b sticky top-0 z-50 border-b"
      style={{ background: "rgba(2,2,2,0.88)", borderColor: C_BORD, backdropFilter: "blur(22px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/HF_LOGO.png" alt="HIGH FOCUS" className="h-8 w-8 rounded-lg object-contain" />
          <span className="lp-h text-[17px] font-semibold tracking-tight text-white">
            HIGH FOCUS{" "}
            <span className="lp-b text-[11px] font-medium uppercase tracking-[0.22em]" style={{ color: G }}>
              Sourcing
            </span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/login" className="lp-b text-sm font-medium text-slate-400 transition hover:text-white">
            Sign In
          </Link>
          <Link
            href="/get-access"
            className="lp-btn-g lp-b rounded-xl px-5 py-2.5 text-sm font-bold text-black"
          >
            Start Free Trial
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section
      className="lp-grid-bg relative flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-16 text-center"
    >
      {/* Floating orbs */}
      <div
        className="lp-orb-a pointer-events-none absolute left-[5%] top-[12%] h-[560px] w-[560px] rounded-full"
        style={{ background: `radial-gradient(circle, ${G_GLOW} 0%, transparent 68%)`, filter: "blur(48px)" }}
        aria-hidden
      />
      <div
        className="lp-orb-b pointer-events-none absolute right-[4%] top-[8%] h-[420px] w-[420px] rounded-full"
        style={{ background: `radial-gradient(circle, rgba(201,168,76,0.11) 0%, transparent 65%)`, filter: "blur(56px)" }}
        aria-hidden
      />
      <div
        className="lp-orb-c pointer-events-none absolute bottom-[8%] left-1/2 h-[320px] w-[320px] -translate-x-1/2 rounded-full"
        style={{ background: `radial-gradient(circle, rgba(201,168,76,0.09) 0%, transparent 65%)`, filter: "blur(64px)" }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* Badge */}
        <Label>Professional Sourcing Platform</Label>

        {/* Headline */}
        <h1
          className="lp-h text-white"
          style={{
            fontSize: "clamp(3.2rem, 9vw, 7.5rem)",
            lineHeight: 1.05,
            fontStyle: "italic",
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          Find Profitable Products.
          <br />
          <span className="lp-gold-text">At Scale.</span>
        </h1>

        {/* Body */}
        <p
          className="lp-b mx-auto mt-8 max-w-2xl leading-relaxed text-slate-400"
          style={{ fontSize: "1.075rem" }}
        >
          Upload your wholesale file. Pull{" "}
          <span className="font-semibold text-slate-200">live Amazon SP-API data</span> — Buy Box
          prices, FBA fees, competition, and restrictions. Get a{" "}
          <span className="font-semibold text-slate-200">color-coded BUY / PASS decision</span>{" "}
          for every product in minutes.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/get-access"
            className="lp-btn-g lp-b inline-flex items-center gap-2.5 rounded-xl px-9 py-4 text-[15px] font-bold text-black"
          >
            Start Free Trial <span aria-hidden>→</span>
          </Link>
          <Link
            href="/login"
            className="lp-btn-o lp-b inline-flex items-center gap-2.5 rounded-xl px-9 py-4 text-[15px] font-semibold text-slate-300"
          >
            Sign In
          </Link>
        </div>

        <p className="lp-b mt-5 text-[13px]" style={{ color: "rgba(148,163,184,0.55)" }}>
          No credit card required · 14-day free trial
        </p>

        {/* Decision badges */}
        <div className="mt-14 flex flex-wrap justify-center gap-2.5">
          {[
            { label: "BUY",            c: "#4ade80", bg: "rgba(74,222,128,0.08)",   b: "rgba(74,222,128,0.22)"   },
            { label: "WORTH UNGATING", c: "#a78bfa", bg: "rgba(167,139,250,0.08)",  b: "rgba(167,139,250,0.22)"  },
            { label: "LOW MARGIN",     c: "#fbbf24", bg: "rgba(251,191,36,0.08)",   b: "rgba(251,191,36,0.22)"   },
            { label: "NO MARGIN",      c: "#f97316", bg: "rgba(249,115,22,0.08)",   b: "rgba(249,115,22,0.22)"   },
            { label: "PASS",           c: "#f87171", bg: "rgba(248,113,113,0.08)",  b: "rgba(248,113,113,0.22)"  },
          ].map(({ label, c, bg, b }) => (
            <span
              key={label}
              className="lp-b rounded-full px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
              style={{ color: c, background: bg, border: `1px solid ${b}` }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar() {
  return (
    <div className="lp-b border-y px-6 py-7" style={{ borderColor: C_BORD, background: "rgba(255,255,255,0.015)" }}>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-y-7 sm:grid-cols-4">
        {[
          { v: "200",       l: "Products per batch" },
          { v: "Live",      l: "SP-API data"        },
          { v: "FBA",       l: "Fee calculator"     },
          { v: "XLSX · CSV",l: "Upload formats"     },
        ].map(({ v, l }) => (
          <div key={l} className="flex flex-col items-center gap-1 text-center">
            <span
              className="lp-h text-2xl font-semibold"
              style={{ color: G, fontStyle: "italic" }}
            >
              {v}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-600">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────
function FeaturesSection() {
  const cards = [
    { n: "01", icon: "📦", title: "Bulk Upload",            desc: "Drop your supplier's .xlsx, .xls, or .csv. Auto-detects ASIN/UPC + price headers. Up to 200 rows per run." },
    { n: "02", icon: "📊", title: "Live SP-API Data",       desc: "Buy Box price, offer count, BSR, FBA fees, and listing restrictions — pulled live from Amazon on every analysis." },
    { n: "03", icon: "🚦", title: "Smart Buy Decisions",    desc: "BUY · WORTH UNGATING · LOW MARGIN · PASS — color-coded verdicts calibrated to your own ROI and margin targets." },
    { n: "04", icon: "💰", title: "Profit Engine",          desc: "FBA fee preview, net profit per unit, and ROI for every product. Know exactly what you earn before you order." },
    { n: "05", icon: "🔍", title: "Catalog & Keyword Search", desc: "Browse Amazon categories by keyword or BSR. Filter by restriction status, ROI floor, and competition level." },
    { n: "06", icon: "🔓", title: "Ungating Intelligence",  desc: "Instantly flag restricted products worth unlocking. The engine weighs ungate cost against profit potential for a clear verdict." },
  ];

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <Label>Features</Label>
          <h2
            className="lp-h mb-4 text-center text-white"
            style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontStyle: "italic", fontWeight: 600 }}
          >
            Everything you need to source smarter
          </h2>
          <p className="lp-b mx-auto mb-14 max-w-lg text-center text-slate-500">
            One tool replaces your fee calculator, Keepa research, and manual spreadsheet work.
          </p>
        </ScrollReveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ n, icon, title, desc }, i) => (
            <ScrollReveal key={n} delay={i * 65}>
              <div
                className="lp-feat lp-b flex h-full flex-col rounded-2xl border p-7"
                style={{ background: CARD, borderColor: C_BORD }}
              >
                <div className="mb-5 flex items-start justify-between">
                  <span
                    className="lp-b text-[11px] font-bold uppercase tracking-[0.24em]"
                    style={{ color: G }}
                  >
                    {n}
                  </span>
                  <span className="text-[22px]" aria-hidden>{icon}</span>
                </div>
                <h3
                  className="lp-h mb-2.5 text-[19px] font-semibold text-white"
                  style={{ fontStyle: "normal" }}
                >
                  {title}
                </h3>
                <p className="mt-auto pt-2 text-[13.5px] leading-relaxed text-slate-500">{desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────
function HowItWorksSection() {
  const steps = [
    {
      n: "01",
      title: "Upload Your List",
      desc: "Drag and drop your supplier's file — Excel or CSV. Column headers are detected automatically, even with non-standard naming.",
    },
    {
      n: "02",
      title: "We Fetch the Data",
      desc: "For every row, SP-API fires: catalog lookup, live pricing, FBA fee preview, offer count, and listing restrictions — all in parallel.",
    },
    {
      n: "03",
      title: "Make Your Move",
      desc: "Get a color-coded dashboard and exportable spreadsheet. Every product shows profit, ROI, competition level, and a clear verdict.",
    },
  ];

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="lp-divider mb-20" />

        <ScrollReveal>
          <Label>How It Works</Label>
          <h2
            className="lp-h mb-16 text-center text-white"
            style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontStyle: "italic", fontWeight: 600 }}
          >
            Three steps from upload to decision
          </h2>
        </ScrollReveal>

        <div className="grid gap-14 sm:grid-cols-3">
          {steps.map(({ n, title, desc }, i) => (
            <ScrollReveal key={n} delay={i * 120}>
              <div>
                {/* Large italic step number */}
                <div
                  className="lp-gold-text lp-h mb-5 text-[5rem] font-bold leading-none"
                  style={{ fontStyle: "italic" }}
                >
                  {n}
                </div>
                <h3
                  className="lp-h mb-3 text-xl font-semibold text-white"
                  style={{ fontStyle: "italic" }}
                >
                  {title}
                </h3>
                <p className="lp-b text-[13.5px] leading-relaxed text-slate-500">{desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <div className="lp-divider mt-20" />
      </div>
    </section>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────
function PricingSection() {
  const plans: Array<{
    name: string;
    price: string;
    period: string;
    desc: string;
    features: string[];
    cta: string;
    href: string;
    pro?: boolean;
    badge?: string;
  }> = [
    {
      name: "Free Trial",
      price: "$0",
      period: "no card needed",
      desc: "Try before you commit.",
      features: [
        "10 product analyses",
        "10 catalog searches",
        "Live SP-API pricing & fees",
        "BUY / PASS / WORTH UNGATING",
        "Single-product manual search",
      ],
      cta: "Try Free",
      href: "/get-access",
    },
    {
      name: "Starter",
      price: "$18.99",
      period: "/ month",
      desc: "Everything you need to source daily.",
      features: [
        "1,000 product analyses / month",
        "3,000 catalog searches / month",
        "1,200 keyword searches / month",
        "BUY / PASS / WORTH UNGATING",
        "Ungating opportunity scanner",
        "Export to XLSX",
      ],
      cta: "Get Starter →",
      href: "/get-access",
    },
    {
      name: "Pro",
      price: "$29.95",
      period: "/ month",
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
      cta: "Get Pro →",
      href: "/get-access",
      pro: true,
      badge: "Best Value",
    },
  ];

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <Label>Pricing</Label>
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

        <div className="grid gap-6 sm:grid-cols-3">
          {plans.map(({ name, price, period, desc, features, cta, href, pro, badge }, i) => (
            <ScrollReveal key={name} delay={i * 90}>
              <div
                className={`relative flex h-full flex-col rounded-2xl p-8 ${pro ? "lp-pro-glow" : ""}`}
                style={{
                  background: pro
                    ? `linear-gradient(160deg, rgba(201,168,76,0.11) 0%, rgba(201,168,76,0.04) 100%)`
                    : CARD,
                  border: `1px solid ${pro ? G_BORD : C_BORD}`,
                }}
              >
                {/* "Most Popular" badge floats above the card */}
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

                {/* Plan header */}
                <div className="mb-6">
                  <p
                    className="lp-b mb-2 text-[10px] font-bold uppercase tracking-[0.24em]"
                    style={{ color: pro ? G : "rgb(100 116 139)" }}
                  >
                    {name}
                  </p>
                  <div className="flex items-end gap-1.5">
                    <span
                      className="lp-h text-5xl font-bold leading-none text-white"
                      style={{ fontStyle: "italic" }}
                    >
                      {price}
                    </span>
                    <span className="lp-b mb-1.5 text-sm text-slate-500">{period}</span>
                  </div>
                  <p className="lp-b mt-2 text-[13px] text-slate-500">{desc}</p>
                </div>

                {/* Features list */}
                <ul className="mb-8 flex-1 space-y-3">
                  {features.map((f) => (
                    <li key={f} className="lp-b flex items-start gap-2.5 text-[13px]">
                      <span className="mt-0.5 shrink-0" style={{ color: G }}>✓</span>
                      <span className={pro ? "text-slate-300" : "text-slate-400"}>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={href}
                  className={`lp-b block rounded-xl py-3.5 text-center text-sm font-bold transition ${
                    pro ? "lp-btn-g text-black" : "lp-btn-o text-slate-300"
                  }`}
                >
                  {cta}
                </Link>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function CtaSection() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <div
            className="lp-grid-bg relative overflow-hidden rounded-3xl px-8 py-20 text-center"
            style={{
              background: `linear-gradient(160deg, rgba(201,168,76,0.09) 0%, rgba(201,168,76,0.03) 100%)`,
              border: `1px solid ${G_BORD}`,
            }}
          >
            {/* Ambient glow */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-72"
              style={{
                background: "radial-gradient(ellipse 80% 60% at 50% -15%, rgba(201,168,76,0.24), transparent 60%)",
              }}
              aria-hidden
            />
            <div className="relative z-10">
              <h2
                className="lp-h text-white"
                style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontStyle: "italic", fontWeight: 600 }}
              >
                Start sourcing smarter today
              </h2>
              <p className="lp-b mx-auto mt-5 max-w-md text-slate-400">
                14-day free trial. No credit card. Your first upload takes less than 60 seconds.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/get-access"
                  className="lp-btn-g lp-b inline-flex items-center gap-2.5 rounded-xl px-10 py-4 text-base font-bold text-black"
                >
                  Create Free Account →
                </Link>
                <Link href="/login" className="lp-b text-sm text-slate-500 transition hover:text-slate-300">
                  Already have an account? Sign in
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function LandingFooter() {
  return (
    <footer className="lp-b border-t px-6 py-10" style={{ borderColor: C_BORD }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/HF_LOGO.png" alt="" className="h-6 w-6 rounded-md object-contain opacity-60" aria-hidden />
          <span className="text-[13px] text-slate-600">
            © {new Date().getFullYear()} HIGH FOCUS. All rights reserved.
          </span>
        </div>
        <div className="flex items-center gap-6">
          {[
            { label: "Terms",   href: "/terms"   },
            { label: "Privacy", href: "/privacy" },
            { label: "Sign In", href: "/login"   },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-[13px] text-slate-600 transition hover:text-slate-400"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <div
      className={`${cormorant.variable} ${montserrat.variable} min-h-screen`}
      style={{ background: "#020202", color: "#f1f5f9" }}
    >
      <LandingStyles />
      <LandingNav />
      <HeroSection />
      <StatsBar />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <CtaSection />
      <LandingFooter />
    </div>
  );
}
