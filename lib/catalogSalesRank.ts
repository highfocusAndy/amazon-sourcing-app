/** Shared SP-API catalog sales-rank parsing — matches Seller Central main category rank. */

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export type ParsedCatalogSalesRank = {
  salesRank: number | null;
  salesRankCategory: string | null;
};

/**
 * SP-API returns multiple ranks (subcategory + main). Seller Central shows the main
 * category rank — the highest (worst) numeric rank across all returned groups.
 */
export function parseSalesRankFromSpApiCatalogItem(item: unknown): ParsedCatalogSalesRank {
  const itemObj = asObject(item);
  if (!itemObj) return { salesRank: null, salesRankCategory: null };

  const salesRanks = asArray(itemObj.salesRanks);
  const allRanks: Array<{ rank: number; category: string | null }> = [];

  for (const rankGroupRaw of salesRanks) {
    const rankGroup = asObject(rankGroupRaw);
    if (!rankGroup) continue;
    const groupedRanks = asArray(rankGroup.classificationRanks).concat(asArray(rankGroup.displayGroupRanks));
    for (const rankRaw of groupedRanks) {
      const rankObj = asObject(rankRaw);
      const parsedRank = readNumber(rankObj?.rank);
      if (parsedRank !== null && parsedRank >= 1) {
        allRanks.push({
          rank: parsedRank,
          category: readString(rankObj?.title) ?? readString(rankObj?.displayName) ?? null,
        });
      }
    }
  }

  if (allRanks.length === 0) return { salesRank: null, salesRankCategory: null };

  const best = allRanks.reduce((a, b) => (b.rank > a.rank ? b : a));
  return { salesRank: best.rank, salesRankCategory: best.category };
}
