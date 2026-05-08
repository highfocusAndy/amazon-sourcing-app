import { auth } from "@/auth";
import { isAppOwnerEmail } from "@/lib/billing/appOwner";
import { redirect } from "next/navigation";
import { AdminShell } from "./AdminShell";

export const metadata = { title: "Admin — HIGH FOCUS" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isAppOwnerEmail(session.user.email)) redirect("/");
  return <AdminShell>{children}</AdminShell>;
}
