/* eslint-disable @next/next/no-img-element */
import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { LegalFinePrint } from "@/app/components/LegalFinePrint";
import { auth } from "@/auth";
import { supportContactEmail } from "@/lib/supportContact";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

type Search = Record<string, string | string[] | undefined>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
}) {
  const session = await auth();
  const sp = searchParams != null ? await searchParams : {};
  const rawCb = sp.callbackUrl;
  const rawMsg = sp.message;
  const registerMessage =
    typeof rawMsg === "string" ? rawMsg : Array.isArray(rawMsg) ? rawMsg[0] : undefined;
  const callbackUrl =
    typeof rawCb === "string" ? rawCb : Array.isArray(rawCb) ? rawCb[0] : undefined;
  const safeCallback =
    callbackUrl &&
    callbackUrl.startsWith("/") &&
    !callbackUrl.startsWith("//") &&
    !callbackUrl.includes("\\")
      ? callbackUrl
      : undefined;

  if (session?.user) {
    redirect(safeCallback ?? "/dashboard");
  }

  return (
    <div
      className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-center px-4 py-8 sm:px-6"
      style={{ background: "#020202" }}
    >
      {/* Grid pattern — same as landing page */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(201,168,76,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.04) 1px, transparent 1px)",
          backgroundSize: "58px 58px",
        }}
        aria-hidden
      />

      {/* Floating orbs */}
      <div
        className="pointer-events-none fixed left-[5%] top-[10%] h-[500px] w-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(201,168,76,0.14) 0%, transparent 68%)",
          filter: "blur(52px)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed bottom-[5%] right-[5%] h-[380px] w-[380px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(201,168,76,0.10) 0%, transparent 65%)",
          filter: "blur(60px)",
        }}
        aria-hidden
      />

      <BrandBackdrop variant="onDark" />

      {/* Card */}
      <div
        className="relative z-[1] w-full max-w-lg rounded-2xl px-8 py-8 sm:max-w-xl sm:px-10 sm:py-9"
        style={{
          background: "linear-gradient(160deg, rgba(201,168,76,0.07) 0%, rgba(201,168,76,0.02) 100%)",
          border: "1px solid rgba(201,168,76,0.22)",
          boxShadow: "0 0 80px -24px rgba(201,168,76,0.22), 0 24px 60px -16px rgba(0,0,0,0.7)",
        }}
      >
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-3">
          <img
            src="/HF_LOGO.png"
            alt="HIGH FOCUS Professional"
            className="h-24 w-auto max-w-[min(100%,13rem)] object-contain sm:h-28"
            style={{ filter: "invert(1) sepia(1) saturate(1.6) hue-rotate(5deg) brightness(0.92)" }}
          />
          <h1
            className="text-center text-[1.6rem] font-semibold tracking-tight text-white sm:text-[1.85rem]"
            style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}
          >
            HIGH FOCUS Sourcing
          </h1>
          <p className="text-center text-[14px] text-slate-400">
            Sign in to your account
          </p>
        </div>

        {registerMessage === "already-registered" && (
          <p
            className="mt-4 rounded-xl px-4 py-3 text-center text-[13px] leading-snug text-slate-200"
            style={{
              background: "rgba(201,168,76,0.08)",
              border: "1px solid rgba(201,168,76,0.22)",
            }}
          >
            That purchase is already linked to an account. Sign in with the email you used at checkout.
          </p>
        )}

        <LoginForm supportEmail={supportContactEmail()} />

        <p className="mt-4 text-center text-[13px] text-slate-500">
          <Link
            href="/reset-password"
            className="font-semibold transition hover:text-slate-300"
            style={{ color: "#C9A84C" }}
          >
            Reset password
          </Link>
          <span className="mx-2 text-slate-600">·</span>
          <Link
            href="/signup/recover"
            className="font-semibold transition hover:text-slate-300"
            style={{ color: "#C9A84C" }}
          >
            Finish paid signup
          </Link>
        </p>
      </div>

      {/* Back to home */}
      <Link
        href="/"
        className="relative z-[1] mt-5 text-[12px] font-medium text-slate-600 transition hover:text-slate-400"
      >
        ← Back to home
      </Link>

      <LegalFinePrint className="relative z-[1] mt-4 max-w-lg sm:max-w-xl" variant="dark" />
    </div>
  );
}
