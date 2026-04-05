/** Shared install / OG / manifest labels (override with NEXT_PUBLIC_* in env). */
export const appDisplayName =
  process.env.NEXT_PUBLIC_APP_TITLE?.trim() || "HIGH FOCUS Sourcing App";

export const appShortName = process.env.NEXT_PUBLIC_APP_SHORT_NAME?.trim() || "HIGH FOCUS";
