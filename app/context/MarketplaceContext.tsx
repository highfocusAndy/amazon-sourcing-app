"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MARKETPLACE_IDS } from "@/lib/marketplaces";
import { getCategoriesForMarketplace, getMarketplaceDomain } from "@/lib/catalogCategories";

type MarketplaceContextValue = {
  marketplaceId: string;
  marketplaceDomain: string;
  categories: string[];
  /** Call this after the user saves a new marketplace in Settings so all consumers update. */
  setMarketplaceId: (id: string) => void;
};

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [marketplaceId, setMarketplaceIdState] = useState<string>(MARKETPLACE_IDS.USA);

  useEffect(() => {
    fetch("/api/settings/preferences", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { marketplace_id?: string | null }) => {
        if (data.marketplace_id) setMarketplaceIdState(data.marketplace_id);
      })
      .catch(() => {});
  }, []);

  function setMarketplaceId(id: string) {
    setMarketplaceIdState(id);
  }

  return (
    <MarketplaceContext.Provider
      value={{
        marketplaceId,
        marketplaceDomain: getMarketplaceDomain(marketplaceId),
        categories: getCategoriesForMarketplace(marketplaceId),
        setMarketplaceId,
      }}
    >
      {children}
    </MarketplaceContext.Provider>
  );
}

export function useMarketplace(): MarketplaceContextValue {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) throw new Error("useMarketplace must be used within MarketplaceProvider");
  return ctx;
}
