import { auth } from "@/auth";
import { userHasAppAccess } from "@/lib/billing/access";
import { isAppOwnerEmail } from "@/lib/billing/appOwner";
import { isBuyerModeEnabled } from "@/lib/featureFlags";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { DashboardShell } from "./DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!(await userHasAppAccess(session.user.id, session.user.email))) {
    redirect("/subscribe");
  }
  const isOwner = isAppOwnerEmail(session.user.email);
  const buyerModeEnabled = await isBuyerModeEnabled();
  const userMode = buyerModeEnabled
    ? ((await prisma.user.findUnique({ where: { id: session.user.id }, select: { userMode: true } }))?.userMode ?? null)
    : null;
  return <DashboardShell isOwner={isOwner} buyerModeEnabled={buyerModeEnabled} userMode={userMode}>{children}</DashboardShell>;
}
