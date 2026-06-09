/* eslint-disable @next/next/no-img-element */
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BuyerRegisterForm } from "./BuyerRegisterForm";
import { FreeRegisterForm } from "./FreeRegisterForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const sp = searchParams != null ? await searchParams : {};
  const rawMode = sp.mode;
  const mode = typeof rawMode === "string" ? rawMode : Array.isArray(rawMode) ? rawMode[0] : undefined;

  if (session?.user) {
    redirect(mode === "buyer" ? "/buyer" : "/dashboard");
  }

  const isBuyer = mode === "buyer";

  return (
    <div
      className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-center px-4 py-8"
      style={{ background: "#020202" }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(201,168,76,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.04) 1px, transparent 1px)",
          backgroundSize: "58px 58px",
        }}
        aria-hidden
      />

      <div
        className="relative z-[1] w-full max-w-md rounded-2xl px-8 py-8 sm:px-10 sm:py-9"
        style={{
          background: "linear-gradient(160deg, rgba(201,168,76,0.07) 0%, rgba(201,168,76,0.02) 100%)",
          border: "1px solid rgba(201,168,76,0.22)",
          boxShadow: "0 0 80px -24px rgba(201,168,76,0.22), 0 24px 60px -16px rgba(0,0,0,0.7)",
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <img
            src="/HF_LOGO.png"
            alt="HIGH FOCUS"
            className="h-20 w-auto object-contain"
            style={{ filter: "invert(1) sepia(1) saturate(1.6) hue-rotate(5deg) brightness(0.92)" }}
          />
          <h1
            className="text-center text-[1.5rem] font-semibold tracking-tight text-white"
            style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}
          >
            {isBuyer ? "Start Browsing Free" : "Start Your Free Trial"}
          </h1>
          <p className="text-center text-[13px] text-slate-400">
            {isBuyer
              ? "🛍️ Unlimited Amazon browsing — no credit card required"
              : "25 analyses · 14 days · No credit card required"}
          </p>
        </div>

        {isBuyer ? <BuyerRegisterForm /> : <FreeRegisterForm />}
      </div>

      <Link
        href="/"
        className="relative z-[1] mt-5 text-[12px] font-medium text-slate-600 transition hover:text-slate-400"
      >
        ← Back to home
      </Link>
    </div>
  );
}
