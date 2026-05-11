/** Shared install / OG / manifest labels (override with NEXT_PUBLIC_* in env). */
export const appDisplayName =
  process.env.NEXT_PUBLIC_APP_TITLE?.trim() || "HIGH FOCUS Sourcing App";

/** Home screen / launcher label (keep short; full title uses appDisplayName). */
export const appShortName = process.env.NEXT_PUBLIC_APP_SHORT_NAME?.trim() || "Sourcing";

/** Navbar / dashboard header — primary wordmark. Set NEXT_PUBLIC_APP_HEADER_LABEL to override. */
export const appHeaderCompact =
  process.env.NEXT_PUBLIC_APP_HEADER_LABEL?.trim() || "HIGH FOCUS";

/** Shown after the primary wordmark (typically “Sourcing App”). Set NEXT_PUBLIC_APP_HEADER_SUFFIX to override. */
export const appHeaderSuffix =
  process.env.NEXT_PUBLIC_APP_HEADER_SUFFIX?.trim() || "Sourcing App";
