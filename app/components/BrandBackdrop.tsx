/**
 * Repeating HF logo watermark behind UI. Does not cover cards/modals (they sit above in z-order).
 */
export function BrandBackdrop({ variant }: { variant: "onDark" | "onLight" }) {
  const filter =
    variant === "onDark" ? "brightness(0) invert(1)" : "brightness(0)";
  const opacityClass =
    variant === "onDark"
      ? "opacity-[0.035] sm:opacity-[0.05]"
      : "opacity-[0.04] sm:opacity-[0.055]";

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
          backgroundSize: "clamp(72px, 14vw, 112px) auto",
          backgroundPosition: "center",
          filter,
        }}
      />
    </div>
  );
}
