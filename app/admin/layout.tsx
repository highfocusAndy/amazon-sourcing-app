import { auth } from "@/auth";
import { isAppOwnerEmail } from "@/lib/billing/appOwner";
import {
  ADMIN_AUTH_COOKIE,
  isAdminPasswordRequired,
  validateAdminSessionToken,
} from "@/lib/adminAuth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminPasswordGate } from "./AdminPasswordGate";
import { AdminShell } from "./AdminShell";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin — HIGH FOCUS" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isAppOwnerEmail(session.user.email)) redirect("/");

  if (isAdminPasswordRequired()) {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_AUTH_COOKIE)?.value ?? "";
    if (!validateAdminSessionToken(token, session.user.id)) {
      return (
        <AdminShell>
          <AdminPasswordGate />
        </AdminShell>
      );
    }
  }

  return <AdminShell>{children}</AdminShell>;
}
