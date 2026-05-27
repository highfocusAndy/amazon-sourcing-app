import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { LandingPricingSection } from "@/app/components/LandingPricingSection";
import { PromoCodeNavButton } from "@/app/components/PromoCodeNavButton";
import { defaultTrialDays, isSubscriptionsPaused } from "@/lib/billing/access";
import { isBuyerModeEnabled } from "@/lib/featureFlags";

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
          <img src="/HF_LOGO.png" alt="HIGH FOCUS" className="h-10 w-10 sm:h-16 sm:w-16 rounded-lg object-contain" style={{ filter: "invert(1) sepia(1) saturate(1.6) hue-rotate(5deg) brightness(0.92)" }} />
          <span className="lp-h text-[15px] sm:text-[17px] font-semibold tracking-tight text-white">
            HIGH FOCUS{" "}
            <span className="lp-b text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.22em]" style={{ color: G }}>
              Sourcing
            </span>
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:block"><PromoCodeNavButton /></div>
          <Link href="/login" className="lp-b text-sm font-medium text-slate-400 transition hover:text-white">
            Sign In
          </Link>
          <Link
            href="#pricing"
            className="lp-btn-g lp-b rounded-xl px-3 sm:px-5 py-2 sm:py-2.5 text-sm font-bold text-black"
          >
            <span className="sm:hidden">Get Started</span>
            <span className="hidden sm:inline">Start Free Trial</span>
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
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/HF_LOGO.png"
            alt="HIGH FOCUS"
            className="h-16 w-auto object-contain sm:h-20"
            style={{ filter: "invert(1) sepia(1) saturate(1.6) hue-rotate(5deg) brightness(0.92)" }}
          />
        </div>

        {/* Badge */}
        <Label>Amazon FBA Wholesale Intelligence</Label>

        {/* Headline */}
        <h1
          className="lp-h text-white"
          style={{
            fontSize: "clamp(2.4rem, 9vw, 7.5rem)",
            lineHeight: 1.05,
            fontStyle: "italic",
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          Source with Certainty.
          <br />
          <span className="lp-gold-text">Win on Amazon.</span>
        </h1>

        {/* Body */}
        <p
          className="lp-b mx-auto mt-8 max-w-2xl leading-relaxed text-slate-400 text-[0.95rem] sm:text-[1.075rem]"
        >
          Stop guessing. Browse{" "}
          <span className="font-semibold text-slate-200">Amazon categories by keyword</span>, analyze
          single products, or drop your entire supplier list — and get{" "}
          <span className="font-semibold text-slate-200">live Buy Box prices, FBA fees, competition scores,
          and profit margins</span>{" "}
          in seconds. Every product comes back with a decisive{" "}
          <span className="font-semibold text-slate-200">BUY · PASS · WORTH UNGATING</span> verdict
          so you source with confidence, not spreadsheets.
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
    { n: "01", icon: "📦", title: "Bulk Upload", pro: true,   desc: "Drop your supplier's .xlsx, .xls, or .csv. Auto-detects ASIN/UPC + price headers. Up to 200 rows per run." },
    { n: "02", icon: "📊", title: "Live SP-API Data",         desc: "Buy Box price, offer count, BSR, FBA fees, and listing restrictions — pulled live from Amazon on every analysis." },
    { n: "03", icon: "🚦", title: "Smart Buy Decisions",      desc: "BUY · WORTH UNGATING · LOW MARGIN · PASS — color-coded verdicts calibrated to your own ROI and margin targets." },
    { n: "04", icon: "💰", title: "Profit Engine",            desc: "FBA fee preview, net profit per unit, and ROI for every product. Know exactly what you earn before you order." },
    { n: "05", icon: "🔍", title: "Catalog & Keyword Search", desc: "Browse Amazon categories by keyword or BSR. Filter by restriction status, ROI floor, and competition level." },
    { n: "06", icon: "🔓", title: "Ungating Intelligence",    desc: "Instantly flag restricted products worth unlocking. The engine weighs ungate cost against profit potential for a clear verdict." },
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
          {cards.map(({ n, icon, title, desc, pro }, i) => (
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
                  <div className="flex items-center gap-2">
                    {pro && (
                      <span
                        className="lp-b rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]"
                        style={{ background: G_DIM, border: `1px solid ${G_BORD}`, color: G }}
                      >
                        Pro
                      </span>
                    )}
                    <span className="text-[22px]" aria-hidden>{icon}</span>
                  </div>
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
      title: "Find Your Products",
      desc: "Browse Amazon by keyword or category in the Explorer, scan a single ASIN or barcode in the Analyzer, or drop your entire supplier list for bulk processing — your call.",
    },
    {
      n: "02",
      title: "Get Live Amazon Data",
      desc: "Every product is instantly enriched via SP-API: real Buy Box price, FBA fee breakdown, offer count, BSR, competition score, and listing restrictions.",
    },
    {
      n: "03",
      title: "Source with Confidence",
      desc: "Walk away with exact profit, ROI, and a clear BUY · PASS · WORTH UNGATING verdict for every product — no guesswork, no spreadsheet math.",
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
            Three steps from search to profit
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

// ── Footer ────────────────────────────────────────────────────────────────────
function LandingFooter() {
  return (
    <footer className="lp-b border-t px-6 py-10" style={{ borderColor: C_BORD }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/HF_LOGO.png" alt="" className="h-6 w-6 rounded-md object-contain opacity-60" aria-hidden style={{ filter: "invert(1)" }} />
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
      <p className="mx-auto mt-6 max-w-6xl text-center text-[11px] leading-relaxed text-slate-700">
        HIGH FOCUS Sourcing is a participant in the Amazon Services LLC Associates Program, an affiliate
        advertising program designed to provide a means for sites to earn advertising fees by advertising
        and linking to Amazon.com.
      </p>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  const subscriptionTrialDays = defaultTrialDays();
  const starterPriceId    = process.env.STRIPE_PRICE_ID_STARTER?.trim() || process.env.STRIPE_PRICE_ID?.trim();
  const proPriceId        = process.env.STRIPE_PRICE_ID_PRO?.trim();
  const stripeConfigured  = Boolean(process.env.STRIPE_SECRET_KEY?.trim() && starterPriceId);
  const proPlanEnabled    = Boolean(process.env.STRIPE_SECRET_KEY?.trim() && proPriceId);
  const subsPaused        = isSubscriptionsPaused();
  const buyerModeEnabled  = await isBuyerModeEnabled();

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
      <LandingPricingSection
        stripeConfigured={stripeConfigured}
        proPlanEnabled={proPlanEnabled}
        subscriptionsPaused={subsPaused}
        subscriptionTrialDays={subscriptionTrialDays}
        buyerModeEnabled={buyerModeEnabled}
      />
      <LandingFooter />
    </div>
  );
}
