"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  normalizeCompetitionThresholds,
  type CompetitionThresholds,
} from "@/lib/competitionThresholds";

const CompetitionThresholdsContext = createContext<CompetitionThresholds | null>(null);

/** Fired after the user saves analysis preferences (seller competition sliders). */
export const COMPETITION_THRESHOLDS_CHANGED_EVENT = "hf-competition-thresholds-changed";

export function CompetitionThresholdsProvider({ children }: { children: ReactNode }) {
  const [thresholds, setThresholds] = useState<CompetitionThresholds>(() =>
    normalizeCompetitionThresholds(null),
  );

  useEffect(() => {
    let cancelled = false;

    function loadFromApi(): void {
      void fetch("/api/settings/preferences", { credentials: "same-origin" })
        .then((res) => res.json())
        .then((data: Record<string, unknown>) => {
          if (cancelled) return;
          setThresholds(
            normalizeCompetitionThresholds({
              lowMaxOffers: data.competition_low_max_offers as number | undefined,
              moderateMaxOffers: data.competition_moderate_max_offers as number | undefined,
              saturatedMinOffers: data.competition_saturated_min_offers as number | undefined,
            }),
          );
        })
        .catch(() => {
          if (!cancelled) setThresholds(normalizeCompetitionThresholds(null));
        });
    }

    loadFromApi();
    function onPrefsSaved() {
      loadFromApi();
    }
    window.addEventListener(COMPETITION_THRESHOLDS_CHANGED_EVENT, onPrefsSaved);
    return () => {
      cancelled = true;
      window.removeEventListener(COMPETITION_THRESHOLDS_CHANGED_EVENT, onPrefsSaved);
    };
  }, []);

  return (
    <CompetitionThresholdsContext.Provider value={thresholds}>{children}</CompetitionThresholdsContext.Provider>
  );
}

/** Returns saved thresholds when inside the dashboard provider, otherwise sensible defaults. */
export function useCompetitionThresholds(): CompetitionThresholds {
  const ctx = useContext(CompetitionThresholdsContext);
  return ctx ?? normalizeCompetitionThresholds(null);
}
