import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { auth } from "@/auth";
import { defaultTrialDays, isSubscriptionsPaused, subscriptionsPausedMessage } from "@/lib/billing/access";
import { supportContactEmail } from "@/lib/supportContact";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GetAccessContent } from "./GetAccessContent";

export default async function GetAccessPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const subscriptionTrialDays = defaultTrialDays();
  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRICE_ID?.trim(),
  );
  const priceDisplay = process.env.BILLING_PRICE_DISPLAY?.trim() || "$19.95/month";
  const subscriptionsPaused = isSubscriptionsPaused();
  const pausedMessage = subscriptionsPausedMessage();

  return (
    <div className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/30 p-6">
      <BrandBackdrop variant="onLight" />
      <Suspense fallback={<div className="relative z-[1] text-slate-600">Loading…</div>}>
        <GetAccessContent
          subscriptionTrialDays={subscriptionTrialDays}
          stripeConfigured={stripeConfigured}
          priceDisplay={priceDisplay}
          subscriptionsPaused={subscriptionsPaused}
          subscriptionsPausedMessage={pausedMessage}
          supportEmail={supportContactEmail()}
        />
      </Suspense>
    </div>
  );
}
