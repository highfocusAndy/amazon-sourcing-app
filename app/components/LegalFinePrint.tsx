import Link from "next/link";

/** Compact Terms + Privacy links for auth and checkout surfaces. */
export function LegalFinePrint({
  className = "",
  variant = "light",
}: {
  className?: string;
  variant?: "light" | "dark";
}) {
  const link =
    variant === "dark"
      ? "font-medium text-teal-400/95 underline-offset-4 hover:text-teal-300 hover:underline"
      : "font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline";

  return (
    <nav aria-label="Legal" className={`text-center text-xs leading-relaxed text-slate-500 ${className}`}>
      <Link href="/terms" className={link}>
        Terms of Service
      </Link>
      <span aria-hidden className="mx-1.5 opacity-60">
        ·
      </span>
      <Link href="/privacy" className={link}>
        Privacy Policy
      </Link>
    </nav>
  );
}
