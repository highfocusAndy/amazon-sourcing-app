import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AmazonOAuthAlerts } from "./AmazonOAuthAlerts";
import { SettingsContent } from "./SettingsContent";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // If Amazon OAuth redirected here, immediately return to the dashboard.
  // This avoids forcing the user to click "Back to dashboard".
  const amazonConnected = searchParams?.amazon_connected;
  const amazonError = searchParams?.amazon_error;
  if (amazonConnected === "1") {
    redirect("/?amazon_connected=1");
  }
  if (typeof amazonError === "string" && amazonError) {
    redirect(`/?amazon_error=${amazonError}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-teal-50/20">
      <header className="shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold text-teal-600 hover:text-teal-500 hover:underline"
          >
            ← Back to dashboard
          </Link>
          <span className="text-sm text-slate-500">{session.user.email}</span>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-slate-200 bg-white/60 px-6 py-3">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Settings
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Explorer filters, analysis preferences, marketplace, and app preferences.
          </p>
        </div>
        <Suspense fallback={null}>
          <AmazonOAuthAlerts />
        </Suspense>
        <SettingsContent />
      </main>
    </div>
  );
}
