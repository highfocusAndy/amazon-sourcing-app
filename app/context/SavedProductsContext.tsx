"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProductAnalysis } from "@/lib/types";

const STORAGE_KEY = "saved-products";

function loadFromStorage(): ProductAnalysis[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProductAnalysis[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(products: ProductAnalysis[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch {
    // ignore
  }
}

type SavedProductsContextValue = {
  products: ProductAnalysis[];
  addProduct: (product: ProductAnalysis) => void;
  addProducts: (productList: ProductAnalysis[]) => void;
  getByAsin: (asin: string) => ProductAnalysis | null;
  getById: (id: string) => ProductAnalysis | null;
  remove: (id: string) => void;
  removeByAsin: (asin: string) => void;
  clearAll: () => void;
};

const SavedProductsContext = createContext<SavedProductsContextValue | null>(null);

export function SavedProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductAnalysis[]>([]);

  useEffect(() => {
    setProducts(loadFromStorage());
  }, []);

  const addProduct = useCallback((product: ProductAnalysis) => {
    setProducts((prev) => {
      const key = product.asin || product.id;
      const next = prev.filter((p) => (p.asin || p.id) !== key);
      next.unshift(product);
      saveToStorage(next);
      return next;
    });
  }, []);

  const addProducts = useCallback((productList: ProductAnalysis[]) => {
    if (productList.length === 0) return;
    setProducts((prev) => {
      const byKey = new Map<string, ProductAnalysis>();
      for (const p of prev) {
        const k = p.asin || p.id;
        if (k) byKey.set(k, p);
      }
      for (let i = productList.length - 1; i >= 0; i--) {
        const p = productList[i];
        const k = p.asin || p.id;
        if (k) byKey.set(k, p);
      }
      const next = Array.from(byKey.values());
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => saveToStorage(next), { timeout: 2000 });
      } else {
        setTimeout(() => saveToStorage(next), 0);
      }
      return next;
    });
  }, []);

  const getByAsin = useCallback(
    (asin: string) => {
      const normalized = asin?.trim().toUpperCase();
      if (!normalized) return null;
      return products.find((p) => p.asin?.toUpperCase() === normalized) ?? null;
    },
    [products]
  );

  const getById = useCallback(
    (id: string) => products.find((p) => p.id === id) ?? null,
    [products]
  );

  const remove = useCallback((id: string) => {
    setProducts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveToStorage(next);
      return next;
    });
  }, []);

  const removeByAsin = useCallback((asin: string) => {
    const normalized = asin?.trim().toUpperCase();
    if (!normalized) return;
    setProducts((prev) => {
      const next = prev.filter((p) => p.asin?.toUpperCase() !== normalized);
      saveToStorage(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setProducts([]);
    saveToStorage([]);
  }, []);

  const value = useMemo(
    () => ({
      products,
      addProduct,
      addProducts,
      getByAsin,
      getById,
      remove,
      removeByAsin,
      clearAll,
    }),
    [products, addProduct, addProducts, getByAsin, getById, remove, removeByAsin, clearAll]
  );

  return (
    <SavedProductsContext.Provider value={value}>
      {children}
    </SavedProductsContext.Provider>
  );
}

export function useSavedProducts(): SavedProductsContextValue {
  const ctx = useContext(SavedProductsContext);
  if (!ctx) {
    throw new Error("useSavedProducts must be used within SavedProductsProvider");
  }
  return ctx;
}
