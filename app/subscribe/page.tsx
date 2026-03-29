import { auth } from "@/auth";
import { BrandBackdrop } from "@/app/components/BrandBackdrop";
import { getBillingOverview } from "@/lib/billing/access";
import { supportContactEmail } from "@/lib/supportContact";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SubscribeContent } from "./SubscribeContent";

export default async function SubscribePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const initial = await getBillingOverview(session.user.id, session.user.email);

  return (
    <div className="relative min-h-screen min-h-[100dvh] w-full bg-slate-900">
      <BrandBackdrop variant="onDark" />
      <div className="relative z-[1] mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-12">
        <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
          <SubscribeContent initial={initial} supportEmail={supportContactEmail()} />
        </Suspense>
      </div>
    </div>
  );
}
