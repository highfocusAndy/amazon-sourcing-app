"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ExplorerCategoryContextValue = {
  categoriesOpen: boolean;
  setCategoriesOpen: (v: boolean) => void;
  expandedCategory: string | null;
  setExpandedCategory: (v: string | null) => void;
  selectedCategory: string | null;
  setSelectedCategory: (v: string | null) => void;
  selectedSubcategory: string | null;
  setSelectedSubcategory: (v: string | null) => void;
  clearCategorySelection: () => void;
};

const ExplorerCategoryContext = createContext<ExplorerCategoryContextValue | null>(null);

export function ExplorerCategoryProvider({ children }: { children: React.ReactNode }) {
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  const clearCategorySelection = useCallback(() => {
    setSelectedCategory(null);
    setSelectedSubcategory(null);
  }, []);

  return (
    <ExplorerCategoryContext.Provider
      value={{
        categoriesOpen,
        setCategoriesOpen,
        expandedCategory,
        setExpandedCategory,
        selectedCategory,
        setSelectedCategory,
        selectedSubcategory,
        setSelectedSubcategory,
        clearCategorySelection,
      }}
    >
      {children}
    </ExplorerCategoryContext.Provider>
  );
}

export function useExplorerCategory() {
  const ctx = useContext(ExplorerCategoryContext);
  if (!ctx) throw new Error("useExplorerCategory must be used within ExplorerCategoryProvider");
  return ctx;
}

export function useExplorerCategoryOptional() {
  return useContext(ExplorerCategoryContext);
}
