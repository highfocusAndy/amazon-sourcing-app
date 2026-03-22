/**
 * Derive a short listing type from product title (e.g. "Single", "2-Pack", "3-Pack", "Bundle")
 * to match how Amazon Seller shows variations.
 */
export function getListingTypeFromTitle(title: string): string {
  if (!title || typeof title !== "string") return "—";
  const t = title.trim();
  if (!t) return "—";

  const lower = t.toLowerCase();

  // Multi-pack patterns (order matters: match longer first)
  if (/\b(12|24|36|48|72)\s*[-]?pack\b/i.test(lower)) {
    const m = t.match(/\b(12|24|36|48|72)\s*[-]?pack\b/i);
    return m ? `${m[1]}-Pack` : "Multi-Pack";
  }
  if (/\b(4|5|6|8|10)\s*[-]?pack\b/i.test(lower)) {
    const m = t.match(/\b(4|5|6|8|10)\s*[-]?pack\b/i);
    return m ? `${m[1]}-Pack` : "Multi-Pack";
  }
  if (/\b3\s*[-]?pack\b|\(\s*3\s*pack\s*\)|x\s*3\s*pack/i.test(lower)) return "3-Pack";
  if (/\b2\s*[-]?pack\b|\(\s*2\s*pack\s*\)|x\s*2\s*pack|2\s*[-]?pack/i.test(lower)) return "2-Pack";
  if (/\bbundle\b/i.test(lower)) return "Bundle";
  if (/\btwin\s*pack\b|2\s*[-]?count\b/i.test(lower)) return "2-Pack";
  if (/\bsingle\b|\b1\s*[-]?pack\b|\(\s*1\s*pack\s*\)/i.test(lower)) return "Single";

  // "3 oz x 2" = 2-pack
  const ozMatch = lower.match(/(\d+)\s*(?:fl\.?\s*)?oz\.?\s*x\s*(\d+)/);
  if (ozMatch) {
    const count = parseInt(ozMatch[2], 10);
    if (count >= 2) return `${count}-Pack`;
  }

  return "Single";
}
