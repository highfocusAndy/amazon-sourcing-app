/**
 * 5-star rating strip with per-star fractional fill (e.g. 4.3 → 4 full + 30% of the 5th).
 * Pure SVG, no external dependencies, scales cleanly with text.
 */
import { useId } from "react";

export function StarRating({
  value,
  size = 12,
  color = "#F5B400",
  emptyColor = "rgba(148,163,184,0.25)",
}: {
  value: number;
  size?: number;
  color?: string;
  emptyColor?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const baseId = useId();

  return (
    <span className="inline-flex items-center" aria-label={`${clamped.toFixed(1)} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fillPct = Math.max(0, Math.min(1, clamped - i));
        const gradId = `${baseId}-star-${i}`;
        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={{ marginRight: i === 4 ? 0 : 1 }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
                <stop offset={`${fillPct * 100}%`} stopColor={color} />
                <stop offset={`${fillPct * 100}%`} stopColor={emptyColor} />
              </linearGradient>
            </defs>
            <path
              d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.77 6.1 20.78l1.13-6.58L2.45 9.54l6.6-.96L12 2.6z"
              fill={`url(#${gradId})`}
            />
          </svg>
        );
      })}
    </span>
  );
}
