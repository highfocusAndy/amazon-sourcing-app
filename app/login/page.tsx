/* eslint-disable @next/next/no-img-element */
import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { auth } from "@/auth";
import { supportContactEmail } from "@/lib/supportContact";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

type Search = Record<string, string | string[] | undefined>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Search> | Search;
}) {
  const session = await auth();
  const sp = searchParams != null ? await Promise.resolve(searchParams) : {};
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
    redirect(safeCallback ?? "/");
  }
  return (
    <div className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/30 px-4 py-4 sm:px-6 sm:py-5">
      <BrandBackdrop variant="onLight" />
      <div className="relative z-[1] w-full max-w-lg rounded-2xl border border-slate-200/80 bg-white px-8 py-7 shadow-xl shadow-slate-200/50 sm:max-w-xl sm:px-10 sm:py-8">
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <img
            src="/HF_LOGO.png"
            alt="HIGH FOCUS Professional"
            className="h-28 w-auto max-w-[min(100%,15rem)] object-contain sm:h-32 sm:max-w-[17rem] md:h-36 md:max-w-[19rem]"
          />
          <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem] md:text-3xl">
            HIGH FOCUS Sourcing App
          </h1>
        </div>
        <p className="mt-1.5 text-center text-base text-slate-600">
          Sign in to your account
        </p>
        {registerMessage === "already-registered" ? (
          <p className="mt-3 rounded-lg bg-teal-50 px-4 py-2.5 text-center text-base leading-snug text-teal-900">
            That purchase is already linked to an account. Sign in with the email you used at checkout.
          </p>
        ) : null}
        <LoginForm supportEmail={supportContactEmail()} />
        <p className="mt-3 text-center text-base text-slate-500 sm:mt-4">
          <Link href="/reset-password" className="font-semibold text-teal-600 hover:text-teal-500 hover:underline">
            Reset password
          </Link>
          {" · "}
          <Link href="/signup/recover" className="font-semibold text-teal-600 hover:text-teal-500 hover:underline">
            Finish paid signup
          </Link>
        </p>
      </div>
    </div>
  );
}
