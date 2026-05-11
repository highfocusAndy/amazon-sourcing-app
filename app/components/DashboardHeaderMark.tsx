/* eslint-disable @next/next/no-img-element */
/**
 * Full lockup asset with wordmark cropped off — only the HF mark stays visible.
 * Use `compact` in the mobile top bar; `toolbar` in md+ dashboard headers when the title stays on one line;
 * `default` for standalone brand marks needing the larger silhouette.
 */
export function DashboardHeaderMark({ variant = "default" }: { variant?: "default" | "compact" | "toolbar" }) {
  if (variant === "toolbar") {
    return (
      <div className="flex h-14 w-auto shrink-0 overflow-hidden sm:h-[3.75rem] md:h-[4.5rem] lg:h-[5rem]">
        <img
          src="/HF_LOGO.png"
          alt=""
          aria-hidden
          className="h-[185%] w-auto max-w-[8.25rem] object-left object-top brightness-0 invert sm:max-w-[9.5rem] md:max-w-[11rem] lg:max-w-[12.25rem]"
        />
      </div>
    );
  }

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
