"use client";

import type { BuyerCatalogItem } from "@/lib/paApiClient";
import { StarRating } from "./StarRating";

const PARTNER_TAG = "cherenfantand-20";

function affiliateUrl(asin: string, given: string | null | undefined): string {
  if (given) return given;
  return `https://www.amazon.com/dp/${asin}?tag=${PARTNER_TAG}`;
}

export function BuyerProductCard({ item }: { item: BuyerCatalogItem }) {
  const starValue = item.starRating != null ? Math.max(0, Math.min(5, item.starRating)) : null;

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

      {/* Info */}
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
          <div className="flex min-h-[2.75rem] flex-wrap items-center gap-2">
            {item.price != null ? (
              <span className="buyer-card-price text-[15px] font-bold">${item.price.toFixed(2)}</span>
            ) : (
              <span className="text-[12px] italic text-slate-500">See price on Amazon</span>
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
        </div>
      </div>
    </div>
  );
}
