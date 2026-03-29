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
    <div className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/30 p-6">
      <BrandBackdrop variant="onLight" />
      <div className="relative z-[1] w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/HF_LOGO.png"
            alt="HIGH FOCUS Professional"
            className="h-14 w-auto"
          />
          <h1 className="text-center text-xl font-bold tracking-tight text-slate-900">
            HIGH FOCUS Sourcing App
          </h1>
        </div>
        <p className="mt-2 text-center text-sm text-slate-600">
          Sign in to your account
        </p>
        {registerMessage === "already-registered" ? (
          <p className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-center text-sm text-teal-900">
            That purchase is already linked to an account. Sign in with the email you used at checkout.
          </p>
        ) : null}
        <LoginForm supportEmail={supportContactEmail()} />
        <p className="mt-4 text-center text-sm text-slate-500">
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
