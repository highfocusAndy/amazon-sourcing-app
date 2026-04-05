"use client";

import { createContext, useContext, type ReactNode } from "react";

const OpenDashboardSettingsContext = createContext<(() => void) | null>(null);

export function DashboardSettingsProvider({
  openSettings,
  children,
}: {
  openSettings: () => void;
  children: ReactNode;
}) {
  return (
    <OpenDashboardSettingsContext.Provider value={openSettings}>{children}</OpenDashboardSettingsContext.Provider>
  );
}

export function useOpenDashboardSettings(): () => void {
  const open = useContext(OpenDashboardSettingsContext);
  return open ?? (() => {});
}
