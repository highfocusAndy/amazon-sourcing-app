import { auth } from "@/auth";
import { userHasAppAccess } from "@/lib/billing/access";
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
  return <DashboardShell>{children}</DashboardShell>;
}
