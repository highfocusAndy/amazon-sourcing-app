import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = {
  title: "HIGH FOCUS Sourcing — Amazon FBA Wholesale Research Tool",
  description:
    "Upload your supplier list. Pull live SP-API data. Get instant BUY / PASS decisions with FBA profit, ROI, and competition analysis.",
};

// ─── Shared style tokens ─────────────────────────────────────────────────────
const GOLD = "#c9a034";
const GOLD_LIGHT = "#e8c060";
const GOLD_DIM = "rgba(201,160,52,0.12)";
const GOLD_BORDER = "rgba(201,160,52,0.28)";
const CARD_BG = "rgba(255,255,255,0.03)";
const CARD_BORDER = "rgba(255,255,255,0.07)";

// ─── Nav ──────────────────────────────────────────────────────────────────────
function LandingNav() {
  return (
    <header
      className="sticky top-0 z-50 w-full border-b backdrop-blur-xl"
      style={{ background: "rgba(7,7,15,0.85)", borderColor: CARD_BORDER }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/HF_LOGO.png" alt="HF" className="h-7 w-7 rounded-md object-contain" />
          <span className="text-[15px] font-bold tracking-tight text-white">
            HIGH FOCUS{" "}
            <span className="font-normal" style={{ color: GOLD }}>
              Sourcing
            </span>
          </span>
        </div>

        {/* Auth buttons */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-white"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="rounded-xl px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)` }}
          >
            Start Free Trial
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative overflow-hidden px-5 pb-24 pt-20 text-center sm:pt-28">
      {/* Ambient gold glow behind the hero */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px]"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 50% -5%, rgba(201,160,52,0.18) 0%, transparent 65%)`,
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-4xl">
        {/* Badge */}
        <div className="mb-6 flex justify-center">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD }}
          >
            ✦ Amazon FBA Sourcing Tool
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl font-extrabold leading-[1.08] tracking-[-0.03em] text-white sm:text-5xl lg:text-[3.75rem]">
          Turn Supplier Lists Into{" "}
          <span
            className="block"
            style={{
              backgroundImage: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 55%, #a07820 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Instant Profit Decisions
          </span>
        </h1>

        {/* Subtext */}
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
          Upload your wholesale Excel or CSV. We pull{" "}
          <span className="font-medium text-slate-200">live Amazon SP-API data</span> — Buy Box
          prices, FBA fees, competition, restrictions — and return a color-coded{" "}
          <span className="font-medium text-slate-200">BUY / PASS decision</span> for every row.
          In minutes.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-base font-bold text-black shadow-lg transition hover:opacity-90 active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
              boxShadow: `0 0 32px -6px rgba(201,160,52,0.5)`,
            }}
          >
            Start Free Trial
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border px-7 py-3.5 text-base font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
            style={{ borderColor: CARD_BORDER }}
          >
            Sign In
          </Link>
        </div>

        <p className="mt-4 text-[13px] text-slate-600">
          No credit card required · 14-day free trial
        </p>

        {/* Decision badges */}
        <div className="mt-12 flex flex-wrap justify-center gap-2">
          {[
            { label: "BUY", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)", text: "#4ade80" },
            { label: "WORTH UNGATING", bg: "rgba(99,102,241,0.12)", border: "rgba(99,102,241,0.35)", text: "#a5b4fc" },
            { label: "LOW MARGIN", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)", text: "#fde68a" },
            { label: "PASS", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", text: "#fca5a5" },
          ].map(({ label, bg, border, text }) => (
            <span
              key={label}
              className="rounded-full px-3.5 py-1 text-[11px] font-bold uppercase tracking-widest"
              style={{ background: bg, border: `1px solid ${border}`, color: text }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { value: "200", label: "Products per batch" },
    { value: "Live", label: "SP-API data" },
    { value: "FBA", label: "Fee calculator" },
    { value: "XLSX / CSV", label: "Upload formats" },
  ];
  return (
    <div
      className="border-y px-5 py-5"
      style={{ borderColor: CARD_BORDER, background: "rgba(255,255,255,0.015)" }}
    >
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ value, label }) => (
          <div key={label} className="flex flex-col items-center gap-1 text-center">
            <span
              className="text-xl font-bold tabular-nums"
              style={{ color: GOLD }}
            >
              {value}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
function FeaturesSection() {
  const features = [
    {
      icon: "📦",
      title: "Bulk Upload",
      desc: "Drop your supplier's .xlsx, .xls, or .csv. Smart header detection handles any column layout. Analyze up to 200 products per batch.",
    },
    {
      icon: "📊",
      title: "Live Amazon Data",
      desc: "Buy Box prices, seller offer counts, BSR, FBA fees, and listing restrictions — pulled fresh from SP-API, never from a cached database.",
    },
    {
      icon: "🚦",
      title: "Smart Decisions",
      desc: "Every product gets a color-coded verdict: BUY · WORTH UNGATING · LOW MARGIN · PASS — calibrated to your ROI and margin targets.",
    },
    {
      icon: "💰",
      title: "Profit Engine",
      desc: "FBA fee preview, landed cost, net profit per unit, and ROI calculated automatically. See exactly what you make before you buy.",
    },
    {
      icon: "🔍",
      title: "Catalog Explorer",
      desc: "Browse Amazon categories and search by keyword to find wholesale opportunities. Filter by BSR, restriction status, and ROI floor.",
    },
    {
      icon: "🔑",
      title: "Your Amazon Account",
      desc: "Connect your Seller Central via official SP-API OAuth. Each user has their own credentials — your tokens never leave your account.",
    },
  ];

  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        {/* Section label */}
        <div className="mb-3 flex justify-center">
          <span
            className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD }}
          >
            Features
          </span>
        </div>
        <h2 className="mb-3 text-center text-3xl font-bold tracking-tight text-white">
          Everything you need to source smarter
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-slate-500">
          One tool replaces your spreadsheet, fee calculator, and Keepa research — with live data direct from Amazon.
        </p>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="group rounded-2xl p-6 transition-all duration-200 hover:scale-[1.01]"
              style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
            >
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-xl"
                style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}` }}
              >
                {icon}
              </div>
              <h3
                className="mb-2 text-[15px] font-semibold"
                style={{ color: GOLD_LIGHT }}
              >
                {title}
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
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
      desc: "For every row, we hit SP-API: catalog lookup, live pricing, FBA fee preview, offers count, and listing restrictions — all in parallel.",
    },
    {
      n: "03",
      title: "You Make the Call",
      desc: "Get a color-coded dashboard and exportable spreadsheet. Every product shows profit, ROI, competition, and a clear BUY or PASS verdict.",
    },
  ];

  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div
          className="rounded-3xl p-10 sm:p-14"
          style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${CARD_BORDER}` }}
        >
          <div className="mb-3 flex justify-center">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]"
              style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD }}
            >
              How It Works
            </span>
          </div>
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-white">
            Three steps from upload to decision
          </h2>

          <div className="grid gap-10 sm:grid-cols-3">
            {steps.map(({ n, title, desc }, i) => (
              <div key={n} className="flex flex-col items-center text-center sm:items-start sm:text-left">
                {/* Number + connector */}
                <div className="mb-5 flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
                    style={{
                      background: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
                      color: "#1a0e00",
                    }}
                  >
                    {n}
                  </span>
                  {i < steps.length - 1 && (
                    <div
                      className="hidden h-px flex-1 sm:block"
                      style={{ background: `linear-gradient(to right, ${GOLD_BORDER}, transparent)` }}
                    />
                  )}
                </div>
                <h3 className="mb-2 text-base font-semibold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function PricingSection() {
  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex justify-center">
          <span
            className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD }}
          >
            Pricing
          </span>
        </div>
        <h2 className="mb-3 text-center text-3xl font-bold tracking-tight text-white">
          Simple, honest pricing
        </h2>
        <p className="mx-auto mb-12 max-w-sm text-center text-slate-500">
          Start free. Upgrade when you're ready to scale.
        </p>

        <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
          {/* Free Trial */}
          <div
            className="flex flex-col rounded-2xl p-8"
            style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
          >
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Free Trial
            </p>
            <p className="text-4xl font-extrabold text-white">
              $0
              <span className="ml-1.5 text-base font-normal text-slate-500">/ 14 days</span>
            </p>
            <p className="mt-2 text-sm text-slate-500">
              No credit card required. Cancel anytime.
            </p>

            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {[
                "50 product analyses / month",
                "Bulk upload up to 200 rows",
                "Live SP-API pricing & fees",
                "Catalog & keyword explorer",
                "BUY / PASS decision engine",
                "Export to spreadsheet",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-xs" style={{ color: GOLD }}>✓</span>
                  <span className="text-slate-400">{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className="mt-8 block rounded-xl border py-3 text-center text-sm font-semibold text-white transition hover:bg-white/[0.06]"
              style={{ borderColor: CARD_BORDER }}
            >
              Start Free Trial
            </Link>
          </div>

          {/* Pro */}
          <div
            className="flex flex-col rounded-2xl p-8"
            style={{
              background: `linear-gradient(160deg, rgba(201,160,52,0.09) 0%, rgba(201,160,52,0.04) 100%)`,
              border: `1px solid ${GOLD_BORDER}`,
              boxShadow: `0 0 48px -16px rgba(201,160,52,0.25)`,
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
                Pro
              </p>
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD }}
              >
                Most popular
              </span>
            </div>
            <p className="text-4xl font-extrabold text-white">
              $29
              <span className="ml-1.5 text-base font-normal text-slate-400">/ month</span>
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Full access. No analysis limits.
            </p>

            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {[
                "Unlimited product analyses",
                "Bulk upload up to 200 rows",
                "Live SP-API pricing & fees",
                "Full catalog & keyword search",
                "BUY / PASS decision engine",
                "Export to spreadsheet",
                "Per-user Amazon OAuth",
                "Priority support",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-xs" style={{ color: GOLD }}>✓</span>
                  <span className="text-slate-300">{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className="mt-8 block rounded-xl py-3 text-center text-sm font-bold text-black transition hover:opacity-90"
              style={{
                background: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
              }}
            >
              Get Started →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function CtaSection() {
  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-3xl">
        <div
          className="relative overflow-hidden rounded-3xl px-8 py-16 text-center"
          style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}` }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(201,160,52,0.25), transparent 60%)`,
            }}
            aria-hidden
          />
          <div className="relative">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Start sourcing smarter today
            </h2>
            <p className="mx-auto mt-4 max-w-md text-slate-400">
              14-day free trial. No credit card required. Your first upload takes less than a minute.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-base font-bold text-black transition hover:opacity-90"
                style={{
                  background: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
                  boxShadow: `0 0 32px -6px rgba(201,160,52,0.5)`,
                }}
              >
                Create Free Account →
              </Link>
              <Link
                href="/login"
                className="text-sm font-medium text-slate-400 hover:text-white"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function LandingFooter() {
  return (
    <footer
      className="border-t px-5 py-8"
      style={{ borderColor: CARD_BORDER }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <span className="text-[13px] font-medium text-slate-600">
          © {new Date().getFullYear()} HIGH FOCUS. All rights reserved.
        </span>
        <div className="flex items-center gap-5">
          <Link href="/terms" className="text-[13px] text-slate-600 hover:text-slate-400 transition">
            Terms
          </Link>
          <Link href="/privacy" className="text-[13px] text-slate-600 hover:text-slate-400 transition">
            Privacy
          </Link>
          <Link href="/login" className="text-[13px] text-slate-600 hover:text-slate-400 transition">
            Sign In
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div
      className="min-h-screen antialiased"
      style={{ background: "#07070f", color: "#f1f5f9" }}
    >
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
