import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { auth } from "@/auth";
import { checkoutSessionEmail } from "@/lib/billing/checkoutSessionEmail";
import { getStripe } from "@/lib/billing/stripeClient";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { CompleteSignupForm } from "./CompleteSignupForm";

type Search = Record<string, string | string[] | undefined>;

export default async function SignupCompletePage({
  searchParams,
}: {
  searchParams?: Promise<Search> | Search;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const sp = searchParams != null ? await Promise.resolve(searchParams) : {};
  const rawId = sp.session_id;
  const sessionId = (typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "")?.trim();
  if (!sessionId) {
    redirect("/get-access");
  }

  const stripe = getStripe();
  if (!stripe) {
    redirect("/get-access?error=stripe");
  }

  let cs: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>;
  try {
    cs = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });
  } catch {
    redirect("/get-access?error=session");
  }

  if (cs.status !== "complete" || cs.mode !== "subscription") {
    redirect("/get-access?error=incomplete");
  }

  const customerId = typeof cs.customer === "string" ? cs.customer : cs.customer?.id;
  if (customerId) {
    const taken = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    if (taken) {
      redirect("/login?message=already-registered");
    }
  }

  const email = checkoutSessionEmail(cs);
  if (!email) {
    redirect("/get-access?error=no-email");
  }

  return (
    <div className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/30 p-6">
      <BrandBackdrop variant="onLight" />
      <div className="relative z-[1] w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50">
        <h1 className="text-center text-xl font-bold tracking-tight text-slate-900">Finish your account</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Choose a password for your new account. Your subscription from checkout is already linked.
        </p>
        <CompleteSignupForm sessionId={sessionId} email={email} />
      </div>
    </div>
  );
}
