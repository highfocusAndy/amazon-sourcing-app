import { auth } from "@/auth";
import { isBuyerModeEnabled } from "@/lib/featureFlags";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { BuyerShell } from "./BuyerShell";
import { AuthSessionProvider } from "@/app/components/AuthSessionProvider";

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/buyer");
  }
  if (!(await isBuyerModeEnabled())) {
    redirect("/dashboard");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { userMode: true },
  });
  const userMode = user?.userMode ?? null;
  const userDisplayName = session.user.name || session.user.email || "User";
  return (
    <AuthSessionProvider>
      <BuyerShell userMode={userMode} userDisplayName={userDisplayName}>
        {children}
      </BuyerShell>
    </AuthSessionProvider>
  );
}
