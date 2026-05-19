import { redirect } from "next/navigation";

/** Root `/` now hosts the public landing page (app/page.tsx). Logged-in users land on /dashboard. */
export default function RootRedirect() {
  redirect("/dashboard");
}
