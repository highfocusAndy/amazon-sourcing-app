/** Derive a human-readable quantity label: "Single", "Pack of 4", "Bundle", etc. */
export function getListingTypeFromTitle(title: string): string {
  if (!title || typeof title !== "string") return "—";
  const t = title.trim();
  if (!t) return "—";

  const lower = t.toLowerCase();

  const pack = (n: number | string) => `Pack of ${n}`;

  // Explicit single-unit markers
  if (/\bsingle\b|\b1\s*[-]?pack\b|\(\s*1\s*pack\s*\)|\bpack\s+of\s+1\b/i.test(lower)) return "Single";

  // "Pack of N" style — e.g. "(Pack of 2)", "Pack of 4"
  const packOfMatch = lower.match(/pack\s+of\s+(\d{1,3})/);
  if (packOfMatch) {
    const n = parseInt(packOfMatch[1], 10);
    if (n === 1) return "Single";
    if (n >= 2) return pack(n);
  }

  // "N-pack" / "N pack" style — e.g. "2-Pack", "4 Pack"
  const packMatch = lower.match(/\b(\d{1,3})\s*[-]?pack\b/);
  if (packMatch) {
    const n = parseInt(packMatch[1], 10);
    if (n === 1) return "Single";
    if (n >= 2) return pack(n);
  }

  // "x 3 pack" / "(3 pack)" style
  const xPackMatch = lower.match(/(?:x\s*|[\(\[])(\d{1,3})\s*pack[\)\]]?/);
  if (xPackMatch) {
    const n = parseInt(xPackMatch[1], 10);
    if (n >= 2) return pack(n);
  }

  if (/\btwin\s*pack\b/i.test(lower)) return pack(2);

  // "2pc" / "3pc" / "2-piece" / "2pcs" style
  const pcMatch = lower.match(/\b(\d{1,3})\s*[-]?p(?:c|cs|iece|ieces)\b/);
  if (pcMatch) {
    const n = parseInt(pcMatch[1], 10);
    if (n === 1) return "Single";
    if (n >= 2) return pack(n);
  }

  if (/\bbundle\b/i.test(lower)) return "Bundle";

  // Count / ct patterns: "6 count", "12ct"
  const countMatch = lower.match(/\b(\d{1,3})\s*[-]?(?:count|ct)\b/);
  if (countMatch) {
    const n = parseInt(countMatch[1], 10);
    if (n === 1) return "Single";
    if (n >= 2) return pack(n);
  }

  // "3 oz x 2" style
  const ozXMatch = lower.match(/\d+\s*(?:fl\.?\s*)?oz\.?\s*x\s*(\d+)/);
  if (ozXMatch) {
    const n = parseInt(ozXMatch[1], 10);
    if (n >= 2) return pack(n);
  }

  return "Single";
}
