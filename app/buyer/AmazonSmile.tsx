/**
 * Tiny Amazon-style smile/arrow glyph (SVG). Sized to flow inline with text.
 * Pure decorative — no Amazon trademarks are used; this is an abstract reference
 * to Amazon's signature curved arrow shape allowed for affiliate context.
 */
export function AmazonSmile({
  className = "h-3 w-3",
  color = "#FF9900",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 14c4 4 14 4 18 0" />
      <path d="M19 14l1.5 3" />
    </svg>
  );
}
