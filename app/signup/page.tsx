import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }
  redirect("/get-access");
}
