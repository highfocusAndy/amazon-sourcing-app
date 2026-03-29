import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { auth } from "@/auth";
import { verifyCheckoutResumeToken } from "@/lib/billing/checkoutResumeToken";
import { redirect } from "next/navigation";
import { CompleteRecoveryForm } from "./CompleteRecoveryForm";

type Search = Record<string, string | string[] | undefined>;

export default async function CompleteRecoveryPage({
  searchParams,
}: {
  searchParams?: Promise<Search> | Search;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const sp = searchParams != null ? await Promise.resolve(searchParams) : {};
  const raw = sp.token;
  const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  const trimmed = token?.trim() ?? "";

  if (!trimmed) {
    redirect("/signup/recover");
  }

  const payload = verifyCheckoutResumeToken(trimmed);
  if (!payload) {
    redirect("/signup/recover?error=expired");
  }

  return (
    <div className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/30 p-6">
      <BrandBackdrop variant="onLight" />
      <div className="relative z-[1] w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50">
        <h1 className="text-center text-xl font-bold tracking-tight text-slate-900">Set your password</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Your subscription is already in Stripe. Create a password to finish your account.
        </p>
        <CompleteRecoveryForm token={trimmed} email={payload.email} />
      </div>
    </div>
  );
}
