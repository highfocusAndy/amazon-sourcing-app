import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }
  redirect("/get-access");
}
