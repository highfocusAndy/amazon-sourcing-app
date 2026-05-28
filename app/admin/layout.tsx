import { auth } from "@/auth";
import { isAppOwnerEmail } from "@/lib/billing/appOwner";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import { AdminPasswordGate } from "./AdminPasswordGate";
import { AdminShell } from "./AdminShell";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin — HIGH FOCUS" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isAppOwnerEmail(session.user.email)) redirect("/");

  if (!(await isAdminAuthenticated(session))) {
    return (
      <AdminShell>
        <AdminPasswordGate />
      </AdminShell>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
