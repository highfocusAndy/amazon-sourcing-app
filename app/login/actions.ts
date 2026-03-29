"use server";

import { signIn } from "@/auth";
import { redirect } from "next/navigation";

export type LoginResult = { error?: string };

export async function loginAction(prevState: LoginResult, formData: FormData): Promise<LoginResult> {
  const email = formData.get("email")?.toString()?.trim()?.toLowerCase() ?? "";
  const password = formData.get("password")?.toString()?.trim() ?? "";
  const callbackUrl = formData.get("callbackUrl")?.toString() || "/";

  console.error("[Login] loginAction called", { email: email ? `${email.slice(0, 3)}...` : "(empty)", hasPassword: !!password });

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
  } catch (e) {
    if (e && typeof e === "object" && "url" in e) {
      redirect((e as { url: string }).url);
    }
    if (e && typeof e === "object" && "type" in e && (e as { type: string }).type === "CallbackRouteHandlerError") {
      return { error: "Invalid email or password." };
    }
    if (e && typeof e === "object" && "message" in e && String((e as { message: string }).message).toLowerCase().includes("credential")) {
      return { error: "Invalid email or password." };
    }
    return { error: "Sign in failed. Try again." };
  }

  redirect(callbackUrl);
}
