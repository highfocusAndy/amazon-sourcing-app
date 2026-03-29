type Props = {
  email: string;
  /** `light` for white cards; `dark` for slate subscribe shell */
  tone?: "light" | "dark";
};

export function SupportContactHint({ email, tone = "light" }: Props) {
  const wrap =
    tone === "dark" ? "mt-6 text-center text-sm text-slate-400" : "mt-4 text-center text-xs text-slate-500";
  const linkClass =
    tone === "dark"
      ? "font-medium text-teal-400 underline decoration-teal-500/50 underline-offset-2 hover:text-teal-300"
      : "font-semibold text-teal-600 hover:text-teal-500 hover:underline";

  return (
    <p className={wrap}>
      Problems with signup or payment? Email{" "}
      <a href={`mailto:${email}`} className={linkClass}>
        {email}
      </a>
      .
    </p>
  );
}
