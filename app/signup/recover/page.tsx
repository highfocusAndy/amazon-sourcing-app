import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { RecoverCheckoutForm } from "./RecoverCheckoutForm";

type Search = Record<string, string | string[] | undefined>;

export default async function RecoverCheckoutPage({
  searchParams,
}: {
  searchParams?: Promise<Search> | Search;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const sp = searchParams != null ? await Promise.resolve(searchParams) : {};
  const rawErr = sp.error;
  const showExpired =
    rawErr === "expired" || (Array.isArray(rawErr) && rawErr[0] === "expired");

  return (
    <div className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/30 p-6">
      <BrandBackdrop variant="onLight" />
      <div className="relative z-[1] w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50">
        {showExpired ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950">
            That recovery link expired. Enter your checkout email again and we will send you a fresh link.
          </p>
        ) : null}
        <h1 className="text-center text-xl font-bold tracking-tight text-slate-900">Finish paid signup</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          If you <strong className="font-medium text-slate-800">completed payment</strong> in Stripe but did not set a
          password yet, enter the <strong className="font-medium text-slate-800">same email</strong> you used at
          checkout. We will send you to create your password.
        </p>
        <RecoverCheckoutForm />
        <p className="mt-6 text-center text-xs text-slate-500">
          No charge is made here — you already paid in checkout. This only creates your app login.
        </p>
      </div>
    </div>
  );
}
