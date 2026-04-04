/**
 * Repeating HF logo watermark behind UI. Does not cover cards/modals (they sit above in z-order).
 */
export function BrandBackdrop({ variant }: { variant: "onDark" | "onLight" }) {
  const filter =
    variant === "onDark" ? "brightness(0) invert(1)" : "brightness(0)";
  const opacityClass =
    variant === "onDark"
      ? "opacity-[0.065] sm:opacity-[0.09]"
      : "opacity-[0.06] sm:opacity-[0.085]";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div
        className={`absolute inset-[-20%] ${opacityClass}`}
        style={{
          backgroundImage: "url(/HF_LOGO.png)",
          backgroundRepeat: "repeat",
          backgroundSize: "clamp(104px, 22vw, 168px) auto",
          backgroundPosition: "center",
          filter,
        }}
      />
    </div>
  );
}
