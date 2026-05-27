"use client";

import type { BuyerCatalogItem } from "@/lib/paApiClient";

// Catalog item may carry extra fields from the SP-API enrichment path.
type ExtendedItem = BuyerCatalogItem & {
  buyBoxPrice?: number | null;
  lowestPrice?: number | null;
  offerCount?: number;
};

const PARTNER_TAG = "cherenfantand-20";

function affiliateUrl(asin: string, given: string | null | undefined): string {
  if (given) return given;
  return `https://www.amazon.com/dp/${asin}?tag=${PARTNER_TAG}`;
}

/** Amazon's "Other sellers on Amazon" listing page for the ASIN — Associate-tagged. */
function offerListingUrl(asin: string): string {
  return `https://www.amazon.com/gp/offer-listing/${asin}?ie=UTF8&condition=new&tag=${PARTNER_TAG}`;
}

export function BuyerProductCard({
  item,
  priceSource = "lowest",
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

  const secondary =
    priceSource === "lowest" ? ext.buyBoxPrice ?? null : ext.lowestPrice ?? null;
  const showSecondary =
    primary != null &&
    secondary != null &&
    Math.abs(primary - secondary) > 0.01 &&
    Math.abs(primary - secondary) / primary > 0.01;

  const offerCount = ext.offerCount ?? 0;

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
          href={affiliateUrl(item.asin, item.affiliateUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto block w-full rounded-xl py-2.5 text-center text-[12px] font-bold transition hover:opacity-90"
          style={{ background: "#C9A84C", color: "#0a0800" }}
        >
          View on Amazon →
        </a>

        {/* Sellers link — opens Amazon's "Other sellers" listing for this ASIN */}
        {offerCount > 0 && (
          <a
            href={offerListingUrl(item.asin)}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center text-[11px] text-slate-400 underline-offset-2 hover:underline hover:text-slate-200"
          >
            {offerCount} {offerCount === 1 ? "seller" : "sellers"} on Amazon →
          </a>
        )}
      </div>
    </div>
  );
}
