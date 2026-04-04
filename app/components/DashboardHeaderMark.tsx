/**
 * Full lockup asset with wordmark cropped off — only the HF mark stays visible.
 * Use `compact` in the mobile top bar; `default` in Explorer / Analyzer headers (md+).
 */
export function DashboardHeaderMark({ variant = "default" }: { variant?: "default" | "compact" }) {
  if (variant === "compact") {
    return (
      <div className="flex h-11 w-auto shrink-0 overflow-hidden sm:h-12">
        <img
          src="/HF_LOGO.png"
          alt=""
          aria-hidden
          className="h-[185%] w-auto max-w-[8.5rem] object-left object-top brightness-0 invert mix-blend-lighten sm:max-w-[9.5rem]"
        />
      </div>
    );
  }

  return (
    <div className="flex h-[4.75rem] w-auto shrink-0 overflow-hidden sm:h-[5.25rem] md:h-24 lg:h-[6.25rem] xl:h-28">
      <img
        src="/HF_LOGO.png"
        alt=""
        aria-hidden
        className="h-[185%] w-auto max-w-[13rem] object-left object-top brightness-0 invert sm:max-w-[14rem] md:max-w-[15.5rem] lg:max-w-[17rem] xl:max-w-[18.5rem]"
      />
    </div>
  );
}
