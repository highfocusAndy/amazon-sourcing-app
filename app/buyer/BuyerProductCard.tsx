"use client";

import type { BuyerCatalogItem } from "@/lib/paApiClient";
import { StarRating } from "./StarRating";

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
  const starValue = item.starRating != null ? Math.max(0, Math.min(5, item.starRating)) : null;

  const primary =
    priceSource === "lowest"
      ? ext.lowestPrice ?? item.price ?? ext.buyBoxPrice ?? null
      : ext.buyBoxPrice ?? item.price ?? ext.lowestPrice ?? null;

  const secondary =
    priceSource === "lowest" ? ext.buyBoxPrice ?? null : ext.lowestPrice ?? null;

  // Sanity: Lowest must be <= Buy Box. If the data is inconsistent
  // (different condition classes leaked in), suppress the secondary
  // line rather than display impossible combos like "Buy Box $5 / Lowest $29".
  const sane =
    primary == null ||
    secondary == null ||
    (priceSource === "lowest" ? primary <= secondary : secondary <= primary);
  const showSecondary =
    sane &&
    primary != null &&
    secondary != null &&
    Math.abs(primary - secondary) > 0.01 &&
    Math.abs(primary - secondary) / primary > 0.01;

  const offerCount = ext.offerCount ?? 0;

  return (
    <div className="buyer-product-card group flex h-full flex-col rounded-2xl transition-all duration-300 ease-out will-change-transform hover:-translate-y-0.5">
      {/* Image — fixed aspect */}
      <div className="buyer-card-image aspect-square w-full shrink-0 overflow-hidden rounded-t-2xl">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.title}
            className="h-full w-full object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-slate-600">
            📦
          </div>
        )}
      </div>

      {/* Info — flex column fills card; footer pinned to bottom for aligned CTAs */}
      <div className="buyer-product-card__body flex min-h-0 flex-1 flex-col gap-1.5 p-3">
        <p
          className="line-clamp-2 min-h-[2.5rem] shrink-0 text-[13px] font-medium leading-snug text-slate-200"
          title={item.title}
        >
          {item.title}
        </p>

        <div className="buyer-product-card__meta flex min-h-0 flex-col gap-1">
          {item.salesRank != null && (
            <p className="text-[11px] leading-snug text-slate-500">
              #{item.salesRank.toLocaleString()}
              {item.salesRankCategory ? (
                <span className="text-slate-600"> in {item.salesRankCategory}</span>
              ) : null}
            </p>
          )}

          {item.brand && (
            <p className="truncate text-[11px] text-slate-500" title={item.brand}>
              {item.brand}
            </p>
          )}

          {starValue != null && (
            <div className="flex items-center gap-1.5">
              <StarRating value={starValue} size={12} />
              <span className="text-[11px] font-medium text-slate-300">{starValue.toFixed(1)}</span>
              {item.reviewCount != null && (
                <span className="text-[11px] text-slate-500">({item.reviewCount.toLocaleString()})</span>
              )}
            </div>
          )}
        </div>

        <div className="buyer-product-card__footer mt-auto flex flex-col gap-1.5 pt-0.5">
          {/* Price + Prime */}
          <div className="flex min-h-[2.75rem] flex-wrap items-center gap-2">
            {primary != null ? (
              <span className="buyer-card-price text-[15px] font-bold">${primary.toFixed(2)}</span>
            ) : (
              <span className="text-[12px] italic text-slate-500">See price on Amazon</span>
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

          <a
            href={affiliateUrl(item.asin, item.affiliateUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="buyer-amazon-cta"
          >
            View on Amazon →
          </a>

          <div className="min-h-[1.125rem]">
            {offerCount > 0 && (
              <a
                href={offerListingUrl(item.asin)}
                target="_blank"
                rel="noopener noreferrer"
                className="buyer-sellers-link block pt-0.5 text-center text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
              >
                {offerCount} {offerCount === 1 ? "seller" : "sellers"} on Amazon →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
