/**
 * Repeating HF logo watermark behind UI. Does not cover cards/modals (they sit above in z-order).
 */
export function BrandBackdrop({
  variant,
  opacity,
}: {
  variant: "onDark" | "onLight";
  /** Override default opacity (0–1). */
  opacity?: number;
}) {
  const filter =
    variant === "onDark" ? "brightness(0) invert(1)" : "brightness(0)";
  const defaultOpacity =
    variant === "onDark" ? 0.075 : 0.06;
  const resolvedOpacity = opacity ?? defaultOpacity;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute inset-[-20%]"
        style={{
          backgroundImage: "url(/HF_LOGO.png)",
          backgroundRepeat: "repeat",
          backgroundSize: "clamp(104px, 22vw, 168px) auto",
          backgroundPosition: "center",
          filter,
          opacity: resolvedOpacity,
        }}
      />
    </div>
  );
}
