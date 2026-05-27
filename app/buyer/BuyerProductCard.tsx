"use client";

import type { BuyerCatalogItem } from "@/lib/paApiClient";

// Catalog item may carry both buy box and lowest prices from SP-API (set by the buyer search route).
type ExtendedItem = BuyerCatalogItem & {
  buyBoxPrice?: number | null;
  lowestPrice?: number | null;
};

export function BuyerProductCard({
  item,
  priceSource = "buybox",
}: {
  item: BuyerCatalogItem;
  priceSource?: "buybox" | "lowest";
}) {
  const ext = item as ExtendedItem;
  const stars = item.starRating != null ? Math.round(item.starRating * 2) / 2 : null;
  const starsStr = stars != null ? "★".repeat(Math.floor(stars)) + (stars % 1 ? "½" : "") : null;

  const primary =
    priceSource === "lowest"
      ? ext.lowestPrice ?? item.price ?? ext.buyBoxPrice ?? null
      : ext.buyBoxPrice ?? item.price ?? ext.lowestPrice ?? null;

  // Show the secondary price too when it's meaningfully different (>1% delta).
  const secondary =
    priceSource === "lowest" ? ext.buyBoxPrice ?? null : ext.lowestPrice ?? null;
  const showSecondary =
    primary != null &&
    secondary != null &&
    Math.abs(primary - secondary) > 0.01 &&
    Math.abs(primary - secondary) / primary > 0.01;

  return (
    <div
      className="group flex flex-col rounded-2xl overflow-hidden transition"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Image */}
      <div className="aspect-square w-full overflow-hidden bg-slate-800/60">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.title}
            className="h-full w-full object-contain p-3 transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-slate-600">
            📦
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-200" title={item.title}>
          {item.title}
        </p>

        {item.brand && (
          <p className="text-[11px] text-slate-500 truncate" title={item.brand}>
            {item.brand}
          </p>
        )}

        {/* Rating */}
        {starsStr && (
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-amber-400">{starsStr}</span>
            {item.reviewCount != null && (
              <span className="text-[11px] text-slate-500">({item.reviewCount.toLocaleString()})</span>
            )}
          </div>
        )}

        {/* BSR */}
        {item.salesRank != null && (
          <p className="text-[11px] text-slate-500">
            #{item.salesRank.toLocaleString()}
            {item.salesRankCategory ? <span className="text-slate-600"> in {item.salesRankCategory}</span> : null}
          </p>
        )}

        {/* Price + Prime */}
        <div className="flex items-center gap-2 flex-wrap">
          {primary != null ? (
            <span className="text-[15px] font-bold text-white">${primary.toFixed(2)}</span>
          ) : (
            <span className="text-[12px] text-slate-500 italic">See price on Amazon</span>
          )}
          {showSecondary && secondary != null && (
            <span className="text-[11px] text-slate-500">
              {priceSource === "lowest" ? "Buy Box" : "Lowest"} ${secondary.toFixed(2)}
            </span>
          )}
          {item.isPrime && (
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
              style={{ background: "#00A8E0" }}
            >
              Prime
            </span>
          )}
        </div>

        {/* CTA */}
        <a
          href={item.affiliateUrl ?? `https://www.amazon.com/dp/${item.asin}?tag=cherenfantand-20`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto block w-full rounded-xl py-2.5 text-center text-[12px] font-bold transition hover:opacity-90"
          style={{ background: "#C9A84C", color: "#0a0800" }}
        >
          View on Amazon →
        </a>
      </div>
    </div>
  );
}
