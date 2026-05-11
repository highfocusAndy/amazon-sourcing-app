/**
 * App theming system — two axes that stay in sync:
 *
 *   THEME   one of 8 colour palettes (7 dark + 1 light)
 *     Selecting a theme automatically applies its bundled mode.
 *
 *   MODE    "dark" | "light"  (can be manually overridden after theme selection)
 *     Dark  → full themed dark look (sidebar + body tinted to accent)
 *     Light → only #app-main-content is inverted; sidebar stays dark.
 *
 * All CSS variables set by applyTheme():
 *   --accent, --accent-hover, --accent-2, --border-accent
 *   --gradient-accent, --shadow-glow, --accent-muted
 *   --row-selected  ← drives the product table selected-row highlight
 *   --bg-sidebar-top, --bg-sidebar-mid
 *   --bg-body-base, --bg-body-elevated
 */

// ─── Mode ────────────────────────────────────────────────────────────────────

export type AppMode = "dark" | "light";
export const MODE_STORAGE_KEY = "hf-app-mode";
export const DEFAULT_MODE: AppMode = "dark";

export function applyMode(mode: AppMode): void {
  if (mode === "light") {
    document.documentElement.setAttribute("data-mode", "light");
  } else {
    document.documentElement.removeAttribute("data-mode");
  }
}

// ─── Themes ──────────────────────────────────────────────────────────────────
// rowSelected  → RGB triple used for the table's selected-row background
//                (set as --row-selected CSS variable)
// mode         → "dark" | "light" automatically applied when this theme is selected

export const THEMES = [
  {
    id: "teal",
    label: "High Focus Green",
    color: "#14b8a6",
    mode: "dark",
    accent: "20 184 166",
    accentHover: "45 212 191",
    accent2: "6 182 212",
    gradient: "linear-gradient(135deg, rgb(20 184 166) 0%, rgb(6 182 212) 100%)",
    glow: "rgb(20 184 166 / 0.3)",
    rowSelected: "20 184 166",
    // Sidebar: visible dark teal; body: neutral charcoal
    sidebarTop: "10 26 28",
    sidebarMid: "13 32 35",
    bodyBase: "12 12 15",
    bodyElevated: "16 16 20",
  },
  {
    id: "blue",
    label: "Ocean Blue",
    color: "#2563eb",
    mode: "dark",
    accent: "37 99 235",
    accentHover: "96 165 250",
    accent2: "79 70 229",
    gradient: "linear-gradient(135deg, rgb(37 99 235) 0%, rgb(79 70 229) 100%)",
    glow: "rgb(37 99 235 / 0.3)",
    rowSelected: "37 99 235",
    // Sidebar: visible dark blue; body: neutral charcoal
    sidebarTop: "11 14 38",
    sidebarMid: "14 18 48",
    bodyBase: "12 12 15",
    bodyElevated: "16 16 20",
  },
  {
    id: "violet",
    label: "Purple Tech",
    color: "#7c3aed",
    mode: "dark",
    accent: "124 58 237",
    accentHover: "167 139 250",
    accent2: "147 51 234",
    gradient: "linear-gradient(135deg, rgb(124 58 237) 0%, rgb(147 51 234) 100%)",
    glow: "rgb(124 58 237 / 0.3)",
    rowSelected: "124 58 237",
    // Sidebar: visible dark violet; body: neutral charcoal
    sidebarTop: "18 11 38",
    sidebarMid: "24 14 48",
    bodyBase: "12 12 15",
    bodyElevated: "16 16 20",
  },
  {
    id: "slate",
    label: "Dark Pro",
    color: "#475569",
    mode: "dark",
    accent: "71 85 105",
    accentHover: "100 116 139",
    accent2: "51 65 85",
    gradient: "linear-gradient(135deg, rgb(71 85 105) 0%, rgb(100 116 139) 100%)",
    glow: "rgb(71 85 105 / 0.25)",
    rowSelected: "100 116 139",
    // Pure neutral — cool gray, no hue tint
    sidebarTop: "16 18 22",
    sidebarMid: "20 22 28",
    bodyBase: "11 11 14",
    bodyElevated: "15 15 19",
  },
  {
    id: "amber",
    label: "Graphite",
    color: "#d97706",
    mode: "dark",
    accent: "217 119 6",
    accentHover: "251 191 36",
    accent2: "180 83 9",
    gradient: "linear-gradient(135deg, rgb(217 119 6) 0%, rgb(180 83 9) 100%)",
    glow: "rgb(217 119 6 / 0.3)",
    rowSelected: "217 119 6",
    // Sidebar: visible warm amber-brown; body: neutral charcoal
    sidebarTop: "30 18 8",
    sidebarMid: "38 22 10",
    bodyBase: "12 12 15",
    bodyElevated: "16 16 20",
  },
  {
    id: "rose",
    label: "Crimson",
    color: "#e11d48",
    mode: "dark",
    accent: "225 29 72",
    accentHover: "251 113 133",
    accent2: "190 18 60",
    gradient: "linear-gradient(135deg, rgb(225 29 72) 0%, rgb(190 18 60) 100%)",
    glow: "rgb(225 29 72 / 0.3)",
    rowSelected: "225 29 72",
    // Sidebar: visible dark crimson-red; body: neutral charcoal
    sidebarTop: "34 11 16",
    sidebarMid: "42 14 20",
    bodyBase: "12 12 15",
    bodyElevated: "16 16 20",
  },
  {
    id: "emerald",
    label: "Forest",
    color: "#059669",
    mode: "dark",
    accent: "5 150 105",
    accentHover: "52 211 153",
    accent2: "13 148 136",
    gradient: "linear-gradient(135deg, rgb(5 150 105) 0%, rgb(13 148 136) 100%)",
    glow: "rgb(5 150 105 / 0.3)",
    rowSelected: "5 150 105",
    // Sidebar: visible dark forest-green; body: neutral charcoal
    sidebarTop: "10 28 18",
    sidebarMid: "12 36 22",
    bodyBase: "12 12 15",
    bodyElevated: "16 16 20",
  },
  {
    id: "light",
    label: "Light Clean",
    color: "#0ea5e9",
    mode: "light",
    accent: "14 165 233",
    accentHover: "56 189 248",
    accent2: "6 182 212",
    gradient: "linear-gradient(135deg, rgb(14 165 233) 0%, rgb(6 182 212) 100%)",
    glow: "rgb(14 165 233 / 0.3)",
    rowSelected: "14 165 233",
    // Sidebar stays dark teal in light mode
    sidebarTop: "10 26 28",
    sidebarMid: "13 32 35",
    bodyBase: "12 12 15",
    bodyElevated: "16 16 20",
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME_ID: ThemeId = "teal";
export const THEME_STORAGE_KEY = "hf-accent-theme";
export const DENSITY_STORAGE_KEY = "hf-table-density";
export type TableDensity = "comfortable" | "compact";

export function applyTheme(themeId: string, animate = false): void {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-switching");
    setTimeout(() => root.classList.remove("theme-switching"), 450);
  }
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-hover", theme.accentHover);
  root.style.setProperty("--accent-2", theme.accent2);
  root.style.setProperty("--border-accent", theme.accent);
  root.style.setProperty("--gradient-accent", theme.gradient);
  root.style.setProperty("--shadow-glow", `0 0 20px -5px ${theme.glow}`);
  root.style.setProperty("--accent-muted", `${theme.accent} / 0.15`);
  root.style.setProperty("--row-selected", theme.rowSelected);
  root.style.setProperty("--bg-sidebar-top", theme.sidebarTop);
  root.style.setProperty("--bg-sidebar-mid", theme.sidebarMid);
  root.style.setProperty("--bg-body-base", theme.bodyBase);
  root.style.setProperty("--bg-body-elevated", theme.bodyElevated);
  // Apply the mode bundled with this theme
  applyMode(theme.mode as AppMode);
}

export function applyDensity(density: TableDensity): void {
  document.documentElement.setAttribute("data-density", density);
}

export function initAppearance(): void {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme) {
    applyTheme(savedTheme); // also applies the theme's bundled mode
  }

  // Manual mode override takes priority over the theme's default mode.
  // This lets users keep a dark theme but switch to light manually.
  const savedMode = localStorage.getItem(MODE_STORAGE_KEY) as AppMode | null;
  if (savedMode) applyMode(savedMode);

  const savedDensity = localStorage.getItem(DENSITY_STORAGE_KEY) as TableDensity | null;
  if (savedDensity) applyDensity(savedDensity);

  persistAppearanceCookies();
}

/** Mirrors appearance localStorage keys to cookies so top-level OAuth redirects restore prefs if storage is partitioned. */
const APPEARANCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export function persistAppearanceCookies(): void {
  if (typeof document === "undefined") return;
  const seg = `; path=/; max-age=${APPEARANCE_COOKIE_MAX_AGE}; SameSite=Lax`;
  const write = (key: string) => {
    const v = localStorage.getItem(key);
    if (v != null && v !== "") {
      document.cookie = `${key}=${encodeURIComponent(v)}${seg}`;
    }
  };
  write(THEME_STORAGE_KEY);
  write(MODE_STORAGE_KEY);
  write(DENSITY_STORAGE_KEY);
}
