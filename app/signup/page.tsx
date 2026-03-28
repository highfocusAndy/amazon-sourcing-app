import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/30 p-6">
      <BrandBackdrop variant="onLight" />
      <div className="relative z-[1] w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50">
        <h1 className="text-center text-xl font-bold tracking-tight text-slate-900">
          Create account
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Sign up for Amazon Sourcing App. You can connect your Amazon seller account after.
        </p>
        <SignupForm />
        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-teal-600 hover:text-teal-500 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
